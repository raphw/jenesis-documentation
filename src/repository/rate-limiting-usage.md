---
order: 12
title: Rate limiting & usage tracking
description: Pacing and watching the traffic the credential model lets in - the rate-limiter capability that sheds a tenant's excess requests with 429 before they reach the repository and its in-memory token-bucket implementation, the usage-tracking capability that stamps each credential's last use and count off the request path and its batching worker, and the deployment default, per-tenant ceiling and switch that tune them.
---

[Multi-tenancy & authentication](/repository/multi-tenancy-auth/) established *who* a request is: an
enforcing deployment reads every request's credential, and the key carries its own tenant. This chapter is
about the two dials that watch that traffic. **Rate limiting** paces it - a tenant over its ceiling is shed
with `429` before the request costs any other tenant anything. **Usage tracking** records it - each
credential carries its last use and a running count, so you can tell a live key from a stale one before you
rotate or revoke it. Both follow the [architecture](/repository/architecture/)'s pattern: a seam in the
server, a discovered module implementing it, and graceful absence - without the one nothing is limited,
without the other nothing records.

## Rate limiting

A shared repository is one misconfigured client away from a flood: a CI farm re-resolving in a tight loop,
a mirror crawling every path, a runaway script holding a valid key. The rate limiter sheds that load
**before the request reaches the repository**: each request is metered against its tenant's ceiling, and
one that exhausts it is answered **`429 Too Many Requests`** with a `Retry-After` header instead of queueing
into everyone else's latency.

Because it runs on every request, the metering is deliberately cheap:

- The tenant is read **straight off the key** - the `Jenesis-Repository-Key` header carries its tenant, so
  deciding whom to meter costs no store read. A keyless request meters against one shared **`anonymous`**
  bucket.
- The effective ceiling is **cached briefly** (ten seconds) per tenant, so what sits on the hot path is the
  limiter, not a store read. A changed ceiling applies within that window.
- The Actuator endpoints are **never limited**, so an aggressive ceiling cannot make your orchestrator's
  probes or your metrics scrape look like an outage - see [Observability](/repository/observability/).

### The capability - a rate-limiter provider

The server owns the seam: a **rate limiter** consumes one permit for a key at a given ceiling and answers
whether the request may pass. *How* permits are metered is the implementation's part, supplied by a
`RateLimiterProvider` module discovered at start-up. With no module installed **nothing is ever limited** -
the filter stands down, and the management surface's ceiling endpoints answer `501`, because a ceiling
would meter nothing. A ceiling of zero (nothing configured) never limits either: limiting is opt-in twice
over, once by installing the module and once by setting a number.

### The implementation - the token bucket

The `source/ratelimit` module provides the classic **in-memory token bucket**. Each bucket refills
continuously at the ceiling rate and holds one minute's worth of burst, so a client may catch up after a
quiet spell without ever exceeding the sustained rate. The ceiling is passed to the bucket **on every
request rather than fixed at construction**, so raising or clearing a tenant's limit takes effect on the
next request - nothing is rebuilt; the bucket simply refills toward the new cap.

The bucket is **per process**. In a replicated deployment each node meters independently, so the effective
ceiling is the configured rate times the node count - the usual, cheap trade for keeping a coordination
service off the hot path. A front door that pins a tenant to one node keeps the number exact; a
coordinated limiter for exact global metering would be another module behind the same seam.

### The ceiling

Two levels set the number, and the more specific wins:

- The **deployment default** - the `jenesis.repository.rate-limit` startup property, in permits per
  minute, covering every tenant (and the anonymous bucket) that has no ceiling of its own. Unset means no
  limit.
- A **per-tenant ceiling** - per-tenant data held in the store, like the tenant's quota: set through the
  management surface, not a startup property.

| Endpoint | Does |
|----------|------|
| `GET /api/rate-limit` | The calling tenant's own ceiling in permits per minute; `0` means it falls back to the deployment default. |
| `PUT /api/rate-limit` | Set (`{"permitsPerMinute": 600}`) or clear (`{"permitsPerMinute": 0}`) the tenant's ceiling. The change is recorded to the audit trail as `rate-limit.set`. |

<div class="tip">
  Watch <code>jenesis.ratelimit.rejected</code> - a counter of requests shed with <code>429</code>, tagged
  by the tenant whose bucket they metered against (<code>anonymous</code> for keyless traffic). A flood
  shows up already attributed, and a persistent trickle usually means one client deserves a ceiling - or a
  tenant - of its own.
</div>

## Usage tracking

Of all the keys you have minted, which are still in use? Before rotating or revoking a credential you want
to know whether anything would notice. With usage tracking on, every allowed request stamps its credential:
the **time of last use**, the **source address** it came from, and a **running count**. The credential
listing shows all three beside the key's creation and expiry, so a stale key is visible before it is cut.

Usage is an **informational signal, not an audit log**: recording never blocks and never fails the request
it observes, and under pressure it sheds rather than queueing into the request path.

### The capability - a usage-tracker provider

The seam mirrors the limiter's: the server offers each allowed request's tenant, key hash and source
address to a **usage tracker**, and how hits are batched and persisted is the implementation's part,
supplied by a `KeyUsageTrackerProvider` module discovered at start-up. With no module installed nothing
records, and the health surface reports the worker as **off** - absence is visible, not silent.

Only the key's **SHA-256 hash** travels through the tracker - consistent with the credential model, which
[never stores a secret](/repository/multi-tenancy-auth/), only its hash.

### The implementation - the batching worker

The `source/usage` module provides a **batching tracker** that keeps every store write off the request
path. An allowed request offers its hit to a bounded in-memory queue - non-blocking, and when the queue is
saturated the hit is **dropped and counted** rather than slowing anyone down. A worker thread drains the
queue into a per-credential accumulator, and flushes each credential through the authorization store **at
most once per day**, writing the delta accumulated since the last flush.

The persisted count therefore lags but **converges**: no hit observed within the process's lifetime is
lost, the store sees at most one write per credential per day however hot the key is, and a crash forfeits
only the unflushed tail - which an informational counter can bear. A clean shutdown flushes what remains.

<div class="note">
  The worker reports itself on <code>/actuator/health</code> under the <code>workers</code> contributor:
  <code>enabled</code>, <code>alive</code>, and <code>droppedEvents</code>. An enabled worker whose thread
  has died turns health <code>DOWN</code> - a silent worker death is the failure worth paging on - while
  queue drops stay a detail and a meter (<code>jenesis.worker.dropped</code>, tagged
  <code>worker=key-usage</code>): back-pressure, not an outage.
</div>

## Settings

Both startup properties, read once when the server boots:

| Key | Default | Meaning |
|-----|---------|---------|
| `jenesis.repository.rate-limit` | *(unset - no limit)* | Deployment-default request ceiling in permits per minute, metered per tenant; excess sheds with `429` and a `Retry-After`. Actuator probes are never throttled. |
| `jenesis.repository.track-key-usage` | `false` | Record each credential's last use, source address and use count on the batching worker. |

A tenant's own ceiling is per-tenant data set through `PUT /api/rate-limit` above, not a startup property -
the same pattern as its quota in
[Multi-tenancy & authentication](/repository/multi-tenancy-auth/). And as everywhere, absence degrades
gracefully: a deployment without the rate-limiting module never limits, and one without the usage module
records nothing and says so on health.
