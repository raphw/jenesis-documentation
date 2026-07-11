---
order: 9
title: Search & inventory
description: Finding an artifact without knowing its exact path, rolling a repository's declared licences up into facet counts, and publishing a resumable index a downstream tool can sync - the search-query capability, its Lucene and licence-inventory implementations, the published incremental index, and the settings that turn each on.
---

[Browse](/repository/console/) walks a repository one prefix at a time - good when you know
roughly where a coordinate lives. **Search** answers the other question: *find me everything matching a
term*, without knowing the path. Around it grows an **inventory**: what licences the repository holds, and
a compact index a downstream tool can pull to mirror the repository's contents.

Everything here reads the **same object store** the repository already keeps - there is no separate database
or search service to run, back up, or scale. That constraint shapes every implementation below.

## The capability - a search-query provider

**Search is a discovered capability.** The repository always answers `GET /api/search` - but *how* it answers
depends on what is installed. With no search module on the path, it runs a **live substring scan** over the
published coordinates on each request: correct, and fine for a small repository, but it reads the pointer list
every time. Drop the search-index module on the path and enable it, and the same endpoint is served from a
prebuilt index instead - faster, and richer (it can filter by licence).

Like every capability in the repository, the search index is one **swappable plug-in point**: the server only
*uses* it, and picks up whichever provider is on its module path at start-up. A deployment can check what it
got at `GET /api/capabilities`, which reports each module's installed and enabled state.

### The search surface

Two read-only endpoints, both scoped to one repository and authorised like any other read:

| Endpoint | Serves |
|----------|--------|
| `GET /api/search?repo=&q=` | The coordinates matching `q`, sorted. An empty `q` returns every coordinate - the browse-everything case. |
| `GET /api/licenses?repo=` | The repository's **licence inventory**: how many coordinates fall under each licence category and each SPDX id. |

The CLI wraps both:

```
jenesis-repo search my-repo guava       # coordinates whose segments match "guava"
jenesis-repo search my-repo             # every coordinate in the repository
jenesis-repo licenses my-repo           # the licence facet counts
```

<div class="note">
  The response shape is the <em>same</em> whether an index is installed or the live scan answered - the same
  sorted <code>coordinate:version</code> strings. Installing the index changes the speed and the available
  filters, never the contract, so a client never has to know which path served it.
</div>

## Implementations

### The Lucene index

The `search/lucene` module makes search index-backed. It is a pure-Java, **embedded** library - an index held
in memory, not a service beside the repository - so it keeps the no-extra-infrastructure promise.

A **background sweep**, off until you enable it, does the building. Each pass walks the repository's
published-coordinate pointers - **metadata only, never opening a blob** - builds a Lucene index of them in
memory, and writes it out as a **single snapshot object** in the store, committing a pointer to the new
generation. On the read side, each repository keeps a small reader that loads the current snapshot and, behind
a short time-to-live, re-checks whether the sweep has cut a newer generation - so a fresh build becomes
visible within a query or two without re-downloading an unchanged one.

Coordinates are tokenised the way coordinates are actually written: split on `:`, `.`, `/`, `-`, `@`, `+` and
whitespace, then lower-cased. So `com.google.guava:guava`, `@angular/core` and `spring-boot-starter` each
match on any of their segments however you cased or punctuated the query - a search box works as a reader
expects, which a naive whole-string index would not.

<div class="tip">
  If the module is installed but that repository's index has not been built yet - the sweep has not run, or a
  brand-new repository - search silently falls back to the live scan for that repository, so the endpoint is
  never blank while the first sweep is pending.
</div>

### The licence inventory

The same index makes a repository's **declared licences queryable**, so you can ask "how much of this
repository is copyleft?" without scanning every artifact.

The raw material comes from the [compliance gate](/repository/compliance-gate/): as it screens each accepted
publish, its quality inspector already reads the artifact's declared licences, and it records them as a small
per-coordinate **licence sidecar** in the store. The search sweep folds each release's **SPDX id** and its
**category** (permissive, weak-copyleft, strong-copyleft, network-copyleft, or unknown) into the index -
preferring the sidecar, and backfilling an artifact published before the gate existed by re-reading its stored
metadata through the same inspectors (a small metadata parse, still never the blob).

Two things follow:

- **Filter tokens on search.** A query may mix `license:<spdx>` and `category:<class>` tokens with free-text
  terms, each an extra constraint - `q=guava license:Apache-2.0`, or `q=category:strong-copyleft` to list
  every strongly-copylefted coordinate.
- **Facet counts on `/api/licenses`.** The inventory rolls the whole repository up into a count per category
  and per SPDX id, each drilling down through `/api/search?q=category:<value>` (or `license:<value>`) to the
  coordinates behind it. The console presents the same view.

<div class="warning">
  The licence filters and the inventory need the index. A deployment running only the live scan still
  searches by coordinate, but reports no licence facets - <code>jenesis-repo licenses</code> tells you so
  rather than returning an empty set. Enable <code>search-index</code> to light them up.
</div>

### The published incremental index

The third piece points outward. A **published index** lets a downstream tool - a mirror, a security scanner,
your own resolver - sync a repository's contents without crawling it, the way Maven Central's index works.

A separate opt-in sweep maintains it. Each pass writes an **incremental chunk** of only the publications past
a durable high-water mark, so a repeat pass is cheap. A chunk is NDJSON of **pointer metadata only** - path,
size, SHA-256, coordinate, publish time; no blob is opened - compressed as **Zstandard seekable frames**, so a
consumer can resume a partial download by HTTP `Range` and decompress from a frame boundary. A **descriptor**
names the chain of chunks; a consumer's sync is therefore *fetch the descriptor, diff against what it has,
fetch only the chunks it is missing*. Periodically a **full-snapshot rebase** collapses the chain into one
fresh baseline for new consumers and garbage-collects the superseded chunks after a grace period.

| Endpoint | Serves |
|----------|--------|
| `GET /api/index?repo=` | The chain **descriptor** - the current generation, high-water mark, and the list of chunks. Revalidated, since the chain grows. |
| `GET /api/index/chunks/{id}?repo=` | One **immutable** chunk, its `ETag` its SHA-256, cacheable forever. |

`jenesis-repo index my-repo` prints the descriptor at a glance - the generation, watermark, chunk count,
record count and compressed size.

## Settings

Each capability is off until you enable it. Every key below is a repository setting - pin it from above the
store with an environment variable or a `-Djenesis.repository.<key>=` system property, or set it on the
settings screen when its module is installed.

| Key | Default | Meaning |
|-----|---------|---------|
| `search-index` | `false` | Build the background Lucene index of published coordinates. Off keeps the live substring scan and no licence facets. |
| `search-index-interval` | `PT10M` | How often the search sweep rebuilds the index. |
| `index` | `false` | Publish the incremental, resumable index (chunks + descriptor) on the background sweep. |
| `index-interval` | `P1D` | How often a new incremental index chunk is published. |
| `index-max-chunk` | `8388608` | Maximum compressed size, in bytes, of one chunk before it rotates (8 MiB). |
| `index-rebase-interval` | `P7D` | How often the full-snapshot rebase resets the chunk chain for fresh consumers. |

Interval values are ISO-8601 durations (`PT10M` is ten minutes, `P1D` a day, `P7D` a week). Both sweeps take
a lease so that, in a replicated deployment, only one instance builds at a time. Because both indexes live
only in the scoped object store, there is nothing extra to back up: delete a snapshot and the next sweep
rebuilds it.
