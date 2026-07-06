---
order: 10
title: Maintenance
description: The background passes that keep a repository healthy - trimming old versions, re-checking what you already hold against fresh advisories, indexing who depends on what, and reclaiming disk. The maintenance-task capability and its single-writer lease, the cleanup, re-scan and dependents implementations, and the settings that turn each on.
---

A repository does more than serve what you push to it. Over time it accumulates old versions you no
longer resolve, it holds artifacts that were clean when admitted but have since had a CVE disclosed against
them, and it grows a web of dependencies worth being able to query. **Maintenance** is the set of background
passes that keep it in shape - and, like everything else in the repository, each pass is an optional plug-in
an operator turns on, reading and writing only the [object store](/repository/storage/), with no database or
extra service to run.

## The capability - a maintenance task and its lease

**A maintenance task is a discovered capability.** The server hosts one **neutral scheduler** that owns the
worker thread, walks every tenant and repository, holds the single-writer lease, and collects the gauges. A
task itself only says *what to do per repository* (and, optionally, tenant-wide work afterwards). So a new
background pass is a drop-in module - the scheduler names no task, and picks up whichever ones are on its
module path at start-up.

Each task reads its **own enablement and interval** from configuration. With no task enabled the scheduler
sits idle; with none installed the deployment simply has no background maintenance. A deployment can check
what it got at `GET /api/capabilities`, which reports each pass's installed and enabled state, and the
super-admin **Modules** console lists the same.

### The single-writer lease

The server is **stateless and replicated** for availability, so a pass that *mutates* shared state - the
cleanup sweep, the dependents index - must run on **one node at a time**, or two nodes would sweep the same
store at once. A **lease** enforces that: a small `locks/<name>` object in the store, taken with a
compare-and-set write (a true cross-node CAS on an S3 or Azure backend, via the object's ETag). A crashed
holder's lease **expires and is reclaimed** with no coordinator, and a long pass **renews** its lease as it
runs so a rival is refused throughout.

<div class="note">
  A <strong>read-only</strong> pass takes no lease. The vulnerability re-scan, for instance, only refreshes
  each node's own gauges - every replica computes the same values, so there is nothing to serialise.
</div>

### Turning a pass on or off

Every pass is **off until you enable it**, and the scheduler **re-resolves its task list live**: flip a
pass's setting and it joins or drops out of the worker's next iteration - no restart. That is the general
rule for the mutating passes (cleanup, scan, dependents); the exact settings are in the table at the end.

## Implementations

### Retention and cleanup

Left alone, every version you ever published stays forever. A **retention policy** trims that back to what
you actually want to keep. It is a rule over the published versions of each coordinate, with four dials that
**compose** - a version is kept only if it satisfies *all* of the ones you set:

| Dial | Keeps a version when it is… |
|------|-----------------------------|
| `keep-last` | among the **N newest** of its coordinate (`0` disables the count cap). |
| `max-age` | published **within** this duration. |
| `prerelease-expiry` | a prerelease published **within** this duration (releases are unaffected). |
| `not-downloaded-for` | **downloaded within** this duration - the dial that evicts cold versions, which keeps a proxy cache lean. |

Two safety rules always hold: the **single newest version** of a coordinate is never evicted, so a cleanup
can never empty a coordinate; and a **pinned** version (below) is never evicted, whatever the rules say. A
policy is set **per repository**, or falls back to the deployment default.

The **cleanup sweep** (the `cleanup` task) applies it. Each pass reads each repository's policy, evicts the
versions it no longer keeps, **garbage-collects** the content blobs nothing points at any more, rolls up the
browse tree's cached folder sizes, and reconciles a quota'd tenant's usage counter. It is a mutating pass, so
it runs under the lease. Enable it with `scheduled-cleanup` and set its cadence with `cleanup-interval`.

You can also run it **on demand** - and **preview it first**. The admin surface (mirrored on the console's
per-repository maintenance screen, gated `repository:read`/`repository:write`) is:

```
GET  /repository/{repo}/admin/cleanup/plan    # what the current policy WOULD evict - nothing removed
POST /repository/{repo}/admin/cleanup         # run it: evict per policy, then GC unreferenced blobs
GET  /repository/{repo}/admin/retention       # read the policy
PUT  /repository/{repo}/admin/retention       # set keep-last / max-age / prerelease-expiry / not-downloaded-for
```

<div class="warning">
  Retention is itself a module. On a deployment without it, the cleanup and retention endpoints answer
  <code>501</code> - "retention is not installed" - rather than silently doing nothing.
</div>

#### Pins

A **pin** force-keeps one version, immune to every retention rule - the way you protect an LTS release or a
version a downstream build still resolves while a `max-age` sweep trims everything around it. Pin and unpin a
coordinate through `POST`/`DELETE …/admin/pin` (or the console's per-repository maintenance screen), and list
the current pins at `…/admin/pins`.

### Vulnerability re-scan

The [compliance gate](/repository/compliance-gate/) decides at the **moment of publish or proxy**. It cannot
answer the question that comes *later*: a CVE disclosed - or added to the known-exploited catalogue - **after**
an artifact was already admitted. The **re-scan** answers exactly that. It walks a repository's
already-published coordinates against the live advisory feed and reports each vulnerable one with its advisory
id, severity, fixed version, whether it is **known-exploited** (on CISA's KEV catalogue) and its **EPSS**
exploitation probability - ordering the report so a coordinate something in the repository actually
**depends on** (per the dependents index, below) sorts above one merely scored in the abstract, and the
known-exploited and high-probability ones sort to the top.

```
jenesis-repo vulnerabilities my-repo     # re-scan what you already hold
```

The same scan is served at `GET /api/vulnerabilities?repo=` and on a per-repository **Vulnerabilities**
console panel. So the answer arrives *without anyone asking*, a **scheduled re-scan** (`scheduled-scan`,
cadence `scan-interval-millis`) re-sweeps every repository on a timer and publishes per-repository counts as
Micrometer gauges - `jenesis_vulnerabilities_count` and `jenesis_vulnerabilities_known_exploited_count`,
tagged by tenant and repository - logging a warning for any repository holding a known-exploited artifact.
A dashboard alert on the known-exploited gauge then fires the moment a CVE you already hold lands on the KEV
catalogue, with no scan to remember to run. This pass is **read-only**, so it takes no lease; each node
refreshes its own gauges.

<div class="tip">
  Reporting is one thing, <strong>enforcement</strong> another. A second, exclusive pass
  (<code>kev-enforce</code>, on by default) quarantines an already-published artifact once its CVE lands on
  the known-exploited catalogue - the same <code>/quarantine</code> hold and review queue the gate writes,
  and an operator's release sticks. Only the actively-exploited set is ever auto-held; everything below KEV
  stays report-only, so a broad new CVE can never mass-hold a repository. (Its opt-in license counterpart,
  <code>license-retro-enforce</code>, is covered with the gate.)
</div>

### Dependents index

Search finds a coordinate; the **dependents index** answers the inverse - *who depends on X*, and therefore
the **blast radius** of a CVE. A parser reads the CycloneDX SBOM embedded in a stored artifact into a
dependency-edge model (streamed out of the jar, only the small BOM materialised), and a lease-guarded sweep
(the `dependents` task) **inverts** those edges into a sharded, compare-and-set index in the store - no
database, compacted each pass. A query surface reads it back without a scan:

```
jenesis-repo dependents my-repo com.acme:widget      # who pulls in this coordinate
jenesis-repo dependents my-repo                       # the coordinates the index holds
```

The same answers serve `GET /api/dependents` and a console panel. Enable the sweep with `dependents-index`
and set its cadence with `dependents-interval`. On a deployment without the module the surface degrades
cleanly - a `501` and a hidden panel - and the re-scan simply loses its reachability ordering.

### Volume reclamation

Retention trims by *policy*; **reclamation** is the operator's lever for **disk pressure**. A super-admin can
run a **volume-wide disk reclaim** across every tenant, deleting least-recently-used content until a
free-space target is met (`min-free-bytes` or `min-free-percent`). It is a cross-tenant, on-demand operation -
deliberately a super-admin concern rather than a per-tenant one - run from the console's instances screen.
Unlike the cleanup sweep, which removes only what a repository's own retention rules release, a reclaim is a
blunt free-space guarantee for when a bounded volume is filling up.

## Settings

Every maintenance pass is off until you enable it. Each key below is a repository setting - pin it from above
the store with an environment variable or a `-Djenesis.repository.<key>=` system property, or set it on the
settings screen when its module is installed.

| Key | Default | Meaning |
|-----|---------|---------|
| `scheduled-cleanup` | `false` | Run the retention/cleanup sweep in the background. The on-demand cleanup endpoint works either way. |
| `cleanup-interval` | `PT1H` | How often the cleanup sweep runs. |
| `keep-last` | `0` | Deployment-default retention: keep the N newest versions per coordinate (`0` = no count cap). |
| `max-age` | *(none)* | Deployment-default retention: evict versions older than this duration. |
| `prerelease-expiry` | *(none)* | Deployment-default retention: expire prereleases older than this duration. |
| `not-downloaded-for` | *(none)* | Deployment-default retention: evict versions not downloaded within this duration. |
| `scheduled-scan` | `false` | Re-scan every repository against the advisory feeds on a timer, publishing per-repository gauges. |
| `scan-interval-millis` | `3600000` | How often the scheduled re-scan runs, **in milliseconds** (one hour). |
| `kev-enforce` / `kev-auto-hold` | `true` | Retroactively quarantine an already-published artifact once its CVE reaches the known-exploited catalogue. |
| `dependents-index` | `false` | Build the reverse-dependency ("who depends on X") index in the background. |
| `dependents-interval` | `PT1H` | How often the dependents sweep runs. |
| `cleanup-lease` | `PT10M` | Time-to-live of the single-writer maintenance lease that keeps a mutating sweep on one node. |

Durations are ISO-8601 (`PT1H` is an hour, `P90D` ninety days, `P14D` a fortnight) - a blank retention
duration disables that rule. The one exception is `scan-interval-millis`, which is a plain millisecond count.
The volume-reclaim target is a **console** setting rather than a repository one: `jenesis.ui.min-free-bytes`
and `jenesis.ui.min-free-percent` set the free-space floor a super-admin's reclaim aims for.

Because every index and pointer these passes touch lives only in the scoped object store, there is nothing
extra to back up: delete a derived index and the next sweep rebuilds it.
