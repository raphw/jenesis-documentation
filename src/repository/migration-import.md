---
order: 13
title: Migration & import
description: Moving a repository's contents in from an incumbent manager - the import-source capability that reads a foreign repository and the per-format importer that writes it, the Nexus, Artifactory and Jenesis connectors, the built-in Maven, OCI/Docker and raw importers, the /api/assets export that lets you leave again, and the settings that trigger and configure a migration.
---

You do not adopt a repository by hand-copying artifacts into it. When you move off an incumbent manager -
Sonatype Nexus, JFrog Artifactory, or another Jenesis instance - you point Jenesis at the old server and it
walks the source, streaming each artifact into its own store and regenerating its own indexes as it goes. And
because getting your data *out* is never the paid feature, the same store exposes a plain export surface that
another tool can drain - so a migration runs in both directions.

## The capability - two SPIs meet in the store

A migration is two halves that meet at the [content-addressed store](/repository/storage/), each a swappable,
discovered plug-in:

- **The read half - an import source.** A *source* connects to one incumbent and **enumerates its assets**,
  handing each one - its ecosystem format, its path within the repository, and a handle to its bytes - to a
  consumer. It is the only part that knows an incumbent's shape. A connector ships as its own module and is
  discovered with `ServiceLoader`, so the server supports another incumbent by gaining a module and names none
  of them itself.
- **The write half - a per-format importer.** An *importer* takes one asset of one ecosystem and writes it
  into the store **through that format's own publish path** - so the imported repository regenerates its own
  `maven-metadata.xml`, its own module index, its own manifests, rather than copying the source's stale
  metadata. There is one importer per format, discovered the same way, so **an import's format coverage is
  simply the set of importers on the module path.**

An orchestrator walks a source and routes each asset to the importer that handles its format. An asset whose
format has **no importer on the path is reported skipped** - and because content is read lazily, a skipped
asset is **never downloaded**, so an unsupported format costs no bandwidth.

<div class="note">
  Because an importer writes through the format's normal publish primitives, an imported artifact passes
  through the same publication pipeline as a fresh upload - so the <a
  href="/repository/compliance-gate/">compliance gate</a> screens what you migrate in, exactly as it screens
  what you publish.
</div>

<div class="warning">
  Both halves stream through the same HTTP fetcher the <a href="/repository/proxying/">pull-through
  proxy</a> uses - the discovered <code>source/proxy</code> module. Without a fetcher on the path a deployment
  serves only local content and <strong>refuses imports</strong>, so keep it installed when you plan a
  migration.
</div>

## Implementations - the connectors (read half)

Three source connectors ship, each keyed by a stable **source name** you pass when you trigger the import.

### Nexus

The `nexus` connector pages Sonatype Nexus 3's components REST API by continuation token. The **format is
reported per asset**, so a mixed repository - Maven jars and Docker images side by side - migrates in a single
pass with no format named up front.

### Artifactory

The `artifactory` connector reads JFrog Artifactory's storage listing. An Artifactory repository holds **one
package type**, so you name the ecosystem format when you start the migration.

<div class="note">
  Artifactory's fast, single-request deep listing (<code>GET /api/storage/&lt;repo&gt;?list&amp;deep=1</code>)
  is a Pro-only feature; a self-hosted OSS instance answers <code>400</code>. The connector detects this and
  falls back <strong>seamlessly</strong> to the OSS-available per-folder listing, recursed for the same files -
  more requests, checkpointing after each top-level subtree so an interrupted crawl resumes where it stopped.
  The same <code>artifactory</code> migration therefore works unchanged against both a Pro and a free
  Artifactory.
</div>

### Jenesis

The `jenesis` connector is the read half of the *exit* story, symmetric with the others: it walks another
Jenesis instance's `/api/assets` enumeration (below) by its opaque cursor, format reported
per asset. So one Jenesis repository migrates into another with no lock-in. Its credential is the target's
single opaque API key (taken from the request password).

## Implementations - the importers (write half)

The core ships three per-format importers; another ecosystem's importer is one more module.

| Importer | Handles | Notes |
|----------|---------|-------|
| **Maven** | `maven2` | Streams each file in; a modular jar is cross-published into the module layout over the same bridge a normal Maven publish uses. A source `maven-metadata.xml` is dropped and regenerated (derived from the imported version folders under the `maven-metadata-compute` opt-in). |
| **OCI / Docker** | `docker` | Layers, configs and manifests land in the content-addressed store and dedupe against everything else. |
| **Raw / generic** | `raw` | A plain file store - the raw layout provides its own importer so generic assets migrate alongside Maven and OCI. |

Every importer streams straight to storage: a plain blob copies through unbuffered, and only an importer that
must read a coordinate or manifest ever buffers, and only that small metadata.

<div class="tip">
  Imports are <strong>content-addressed and idempotent</strong>: re-importing an artifact whose bytes are
  already stored needs no new space and changes nothing, so a re-run after an interrupted or partial migration
  is always safe.
</div>

## The `/api/assets` export

The other direction is a read-only surface every server exposes - the free product's first `/api`:

```
GET /api/assets?repo=<repository>&cursor=<token>
```

It is a **flat, stably-ordered, cursor-paged walk** of a repository's publication pointers. Each entry reports
its path, size, and SHA-256 **straight from the pointer** (no blob is ever opened) plus its format and
coordinate from the owning layout, and a `cursor` for the next page (`null` at the end). It is read-authorised
like the rest of the wire.

That is exactly what the `jenesis` connector consumes, so one instance can be enumerated and drained by
another - but the format is plain enough for any tool of your own. Getting your data out is never the paid
feature.

## Triggering a migration

You start a migration on a running server with a single request; it runs in the **background** and returns a
job id you can poll. Starting it is a `repository:write` operation.

```bash
# start a job
curl -X POST http://repo.example.com/repository/admin/import -d \
  '{"source":"nexus","url":"https://nexus.example.com","repository":"maven-releases"}'
# {"job":"a1b2...","state":"running"}

# poll its state and running counts
curl http://repo.example.com/repository/admin/import/a1b2...
# {"state":"completed","imported":128,"skipped":0,"skippedFormats":[],"cursor":null}
```

The status reports how many assets were `imported`, how many were `skipped`, which `skippedFormats` had no
importer on the path, and the resume `cursor`. Because the job **persists that cursor**, a later request naming
a prior job continues the walk from where it stopped - so an interrupted crawl resumes rather than restarting.

## Settings - the migration request

A migration is configured per run, in the request body, not by a standing key. A provider reads the fields it
needs and ignores the rest.

| Field | Required | Meaning |
|-------|----------|---------|
| `source` | yes | The connector name - `nexus`, `artifactory`, or `jenesis`. |
| `url` | yes | The incumbent's base URL. |
| `repository` | yes | The source repository to walk. |
| `format` | for `artifactory` | The ecosystem format of a single-package-type source. A per-asset source (Nexus, Jenesis) reports it itself and needs none. |
| `username` / `password` | when the source needs auth | HTTP basic credentials; for a `jenesis` source the opaque API key travels as the password. |
| `resume` / `cursor` | to continue | A prior job's saved cursor, to pick up an interrupted walk instead of starting over. |

The set of `source` names you can pass is just the connectors on the module path, and the set of formats an
import can land is just the importers on the path - so what a deployment can migrate, in and out, is a
question of which modules it runs.
