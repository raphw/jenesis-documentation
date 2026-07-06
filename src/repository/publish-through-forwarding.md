---
order: 12
title: Publish-through forwarding
description: Publishing to your repository and having it forward each accepted artifact on to another registry — the forward-transport capability, its same-protocol replay and Sonatype Central Portal implementations, the store-backed outbox and single-writer drain behind them, and the settings that point them at a target.
---

Sometimes a repository is not the last stop for an artifact. You publish to your own server — so a build
resolves from one front door and the [compliance gate](/repository/compliance-gate/) screens what enters —
and you also want that artifact to land somewhere else: a staging registry, a corporate mirror, or a public
one like Maven Central. **Publish-through forwarding** does that leg for you. You keep publishing to one
place; the repository forwards each *accepted* publish onward, on its own time, in the background.

Forwarding is a **removable module**, off until you turn it on. A deployment without it forwards nothing;
adding it is dropping a module on the path.

## The capability — a forward transport

The pluggable piece is a **forward transport**: the swappable, discovered plug-in that knows how to hand one
already-published artifact to one kind of target. The built-in transport re-publishes over the artifact's own
protocol; another packages a whole deployment for a specific service. A deployment can carry more than one,
and each target names the transport it wants. Because the transport is the only ecosystem-specific part, the
machinery around it — queueing, retry, streaming — never learns any registry's shape.

That machinery is three moving parts, all riding capabilities you have already met.

### It rides the after-commit seam

Forwarding hangs off the [after-commit observer](/repository/architecture/) — the hook the publication path
fires **only once an accepted artifact's pointer is linked and serving.** So a **quarantined or rejected
publish is never forwarded**: that guarantee is free, straight from which hook the observer uses. The
observer does almost nothing on the request thread — it leaves a note and returns, so a forward's latency
never slows a publish.

### The outbox

The note lands in the **outbox**: small objects in the same [object store](/repository/storage/), under a
`forwarding/outbox/` prefix, with **no database**. One entry per published path — its name is a digest of the
path, so re-publishing a path **replaces** its pending forward with the latest bytes rather than piling up
duplicates. An entry records only what a redelivery needs: the request path, the content-addressed hash the
bytes live at, the format's ecosystem and content type, and the delivery bookkeeping (which targets already
took it, the attempt count and next-eligible time, and any parked error). **The blob is never copied into the
outbox** — the drain re-opens `blobs/<hash>` from the same store and streams it.

### The drain

A background **drain** empties the outbox. It runs under the [maintenance scheduler](/repository/maintenance/)
and holds the same **single-writer lease**, so in a replicated deployment exactly one node forwards per
interval. For each repository it reads the queued entries, resolves that repository's configured targets, and
delivers each entry to each target through the target's transport — re-opening the blob and **streaming it,
never buffering**.

Delivery is **idempotent and at-least-once**:

- a fully delivered entry is dropped;
- a transient failure is retried with **exponential backoff**;
- a **terminal** failure is *parked* — kept, not retried — for you to see and re-drive;
- a repository with **no configured target** has its queued entries dropped, so publishing without
  forwarding never accumulates outbox state.

<div class="note">
  A missed note is a delay, not a loss. A watermark-guarded self-repair reconciles the outbox against the
  live publish tree at most once an hour, so a publish that linked but whose note never landed is still
  forwarded. It is <strong>non-retroactive</strong>: a newly enabled target's watermark starts at its
  configuration time, so turning forwarding on never back-fills artifacts published before it.
</div>

### The loop guard

Two repositories can forward to each other. To stop a publish bouncing between them forever, every forwarded
request carries a **loop-guard marker header** (`X-Jenesis-Forwarded`). A publish that *arrived* as a forward
is not forwarded again — so a mutual pair settles instead of looping.

## Implementations

### Replay (same-protocol, the default)

The built-in `replay` transport re-publishes an artifact **over its own protocol**: each already-published
item is re-`PUT` to the target's base URL **at its own request path, with its own bytes**, streamed straight
from the store. That covers Jenesis-to-Jenesis forwarding and any registry that speaks the format's own
hosted-publish protocol. A non-2xx answer counts as a failure, so the entry is retried and eventually parked.

Every replay request carries two things: the loop-guard header, and the **per-host credential** so a private
target authenticates. The credential is *not* a forwarding setting — it comes from the deployment's per-host
upstream-credential store, keyed by the target URL's host: **the same store a private
[pull-through upstream](/repository/proxying/) authenticates through.**

### Central Portal (Sonatype)

The separate `forwarding-central` module adds the **`central-portal`** transport, for publishing on to
**Sonatype Central** (the successor to OSSRH). Instead of file-by-file PUTs it takes a single **bundle
upload**: it zips the already-published files exactly as they sit in the store — a repo-layout bundle,
streamed, never buffered — POSTs it to the Central Portal publisher API with the per-host Bearer credential,
then **tracks the deployment's state machine** (`PENDING` → `VALIDATING` → `VALIDATED` → `PUBLISHING` →
`PUBLISHED`) by polling until a terminal state.

Two consequences worth knowing:

- **Maven only.** Central publishes Maven artifacts, so a route in any other format is *declined* — counted as
  satisfied for that target, not sent.
- **The server patches nothing.** It creates no artifacts — no signing, no generated checksums, no
  gap-filling. So an incomplete set does not get quietly repaired: it parks with **Central's own validation
  error**, and you fix the publish. Completeness is the publisher's job; validation is Central's.

The publishing type chooses what "done" means: `automatic` releases the deployment once Central validates it;
`user-managed` stops at `VALIDATED` for a person to release by hand in the portal (the outbox entry is
considered delivered once validated).

## Watching and re-driving it

The forwarding module exposes a small status surface, so you can see the queue and re-try a parked forward:

- `GET /api/forwarding` — the queued entries for a repository, each with its path, ecosystem, attempt count,
  and whether it is parked.
- `POST /api/forwarding/retry` — unpark one parked entry to try again (a `404` if nothing parked sits at that
  path).

The CLI mirrors it: `forwarding <repo>` lists the outbox and `forwarding <repo> retry <path>` re-drives a
parked entry.

## Settings

Forwarding is off until you enable it and name at least one target. Each key is a repository setting — pin it
from above the store with an environment variable or a `-Djenesis.repository.<key>=` system property, or set
it on the settings screen when the module is installed. `forward-targets` is **tenant-overridable**, so a
tenant can forward its own artifact space differently from the deployment default.

| Key | Default | Meaning |
|-----|---------|---------|
| `forwarding` | `false` | Forward accepted publishes to the configured targets on the background drain. |
| `forward-targets` | *(empty)* | The targets, one per line or `;`-separated (see below). Empty means nothing forwards. |
| `forwarding-interval` | `PT1M` | How often the outbox is drained. |
| `forwarding-attempts` | `5` | How many times a failing forward is retried (with backoff) before it is parked. |
| `forwarding-marker` | `jenesis` | The value of the loop-guard header stamped on a forwarded publish. |

A target line is `<repository> <target-base-url> [transport]`: the repository the entry applies to (or `*`
for every repository), the base URL a publish is replayed against, and an optional transport name (defaults to
`replay`). An unparseable or incomplete line is skipped rather than derailing the rest.

```
# forward everything published to the "releases" repo to a staging Jenesis instance,
# and Maven artifacts on to Sonatype Central
releases  https://staging.example.com/repository/
releases  https://central.sonatype.com          central-portal
```

The Central Portal transport adds its own dials, surfaced only when `forwarding-central` is installed:

| Key | Default | Meaning |
|-----|---------|---------|
| `central-portal-publishing-type` | `automatic` | `automatic` releases once Central validates; `user-managed` stops at `VALIDATED` for a human to release. |
| `central-portal-poll-interval` | `PT5S` | How long the drain waits between polls of a deployment's state. |
| `central-portal-poll-timeout` | `PT10M` | How long one delivery waits for a terminal state before the drain retries it later. |

<div class="tip">
  A target's credential is never a forwarding setting. The <code>replay</code> and <code>central-portal</code>
  transports both look it up by the target URL's host in the deployment's upstream-credential store — the same
  place your private proxy upstreams keep theirs — so no secret ever travels in a settings export.
</div>
