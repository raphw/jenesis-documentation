---
order: 1
title: Introduction
description: What Jenesis Repository is, the principles behind it, and how these docs are organised.
---

**Jenesis Repository is an artifact repository built from discovered plug-ins over a thin core.** It hosts
and proxies many package formats (Maven, npm, PyPI, Docker/OCI, and more), screens what passes through a
supply-chain gate, and persists everything through a single storage abstraction — with **no database**: the
store (a filesystem, S3, or Azure) is the only durable state.

## The principles

Five convictions run through the whole system. They are worth knowing up front because every chapter comes
back to them:

- **Stream, never buffer.** An artifact is never fully read into memory on an upload, download, or proxy
  path — only small metadata is ever parsed whole.
- **Persist only through the store.** Every durable thing — a blob, an index, a counter, a config document —
  is an object written through the storage abstraction. There is no second database.
- **A thin core with pluggable SPIs.** Each capability (a format, a storage backend, a gate policy, an auth
  mechanism) is a `ServiceLoader`-discovered module. The core knows the seam, not the implementation.
- **Optional modules degrade gracefully.** A capability that is not installed simply isn't there; the surface
  that needed it reports so, and the rest keeps working.
- **Read-first, libraries over hand-rolled.** Work is pre-computed on write or in a background sweep so reads
  are cheap, and a maintained library is preferred to a bespoke algorithm.

## How these docs are organised

Because the system *is* its seams, each capability chapter is written the same way, in this order:

1. **The SPI** — the interface the core discovers, what it is handed, and what it must return.
2. **The implementations** — the modules that provide it (for example, the storage chapter's filesystem, S3,
   and Azure backends), and how they differ.
3. **The settings** — the configuration keys that tune that capability.

<div class="tip">
  Read the SPI first even if you only mean to use a built-in implementation: it is the shortest explanation of
  what the capability actually does, and it tells you exactly what a replacement would have to satisfy.
</div>

## What's in this section

1. **Introduction** — you are here.
2. **Getting started** — run the server, publish and consume an artifact, point it at a store.
3. **Architecture** — the plug-in model, `ServiceLoader` discovery, and the publication path.
4. **Storage** — the `ArtifactStore` SPI, then the filesystem, S3, and Azure backends.
5. **Formats** — the format SPIs, then the built-in ecosystems (Maven, npm, PyPI, OCI, …).
6. **Proxying & groups** — the fetcher SPI, pull-through caching, and group repositories.
7. **The compliance gate** — the publication-interceptor and policy SPIs, then licence, vulnerability, and
   malware screening.
8. **Provenance** — the signer SPI, then keyless (Sigstore) signing and attestation.
9. **Search & inventory** — the search SPI, then the index and licence inventory.
10. **Maintenance** — the sweep SPI, then cleanup, retention, scanning, and reclamation.
11. **Multi-tenancy & authentication** — the tenants and auth SPIs, then key, OIDC, SAML, and SCIM.
12. **Publish-through forwarding** — the transport SPI and its implementations.
13. **Migration & import** — the import-source SPI, then the Nexus, Artifactory, and Jenesis importers.
14. **Observability** — metrics and tracing.
15. **The console** — the web UI and its contribution seams.
16. **Configuration reference** — every setting in one place.
