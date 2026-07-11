---
order: 3
title: Architecture
description: The plug-in model, ServiceLoader discovery, the content-addressed store, and the path an upload takes from bytes to a served artifact.
---

The [previous chapter](/repository/getting-started/) got a server running and moving artifacts. This one
explains the shape underneath it: a **thin core** that knows a handful of seams but names no
implementation, a set of **plug-ins** discovered at startup, one **content-addressed store** they all
persist through, and a single **publication path** every upload follows. Everything later in this section
is one of those seams in detail; this is the map.

## Everything is a plug-in

Jenesis Repository has almost no fixed behaviour of its own. Each capability - a package format, a storage
backend, a compliance screen, an auth mechanism, an importer, a console panel - is a **module on the
server's path**, and the core knows only the *seam* it plugs into (its SPI, or service provider interface),
never the module behind it.

A seam is the shortest statement of what a capability does and what you are choosing between. For example:

- A **format** owns the wire protocol of one client ecosystem - it recognises the request paths it handles
  and serves or accepts them. Maven, the Jenesis module layout, OCI/Docker and a raw layout are formats;
  another ecosystem is one more module.
- A **storage backend** turns the store's read/write primitives into calls against a real medium - a disk,
  an S3 bucket, an Azure container.
- A **publication screen** inspects an upload as it commits and returns a verdict - accept, quarantine, or
  reject.

You do not write these to run a repository - the built-ins ship in the box. What matters here is that they
are **swappable and discoverable**: the server finds whichever ones are on its module path at startup and
uses exactly those. There is no central table of formats to edit and no core to fork.

## The two rules that keep it honest

Two conventions make the plug-in model something you can reason about from the outside.

**The server names no plug-in.** The server module declares only that it *uses* each seam; it never
*requires* a concrete format, backend, or screen. So a deployment runs a **plain server with exactly the
modules on its path** - nothing more, nothing hidden. Adding a capability is putting its module on the
path; removing one is leaving it off. In a Jenesis build you select the modules you want alongside
`source+server`:

```bash
# a server with only the S3 backend and its dependencies
java build/jenesis/Project.java +source+store+s3 build
```

A server with **no format at all** is still a valid, fully wired repository - every request simply returns
`404` until a format is on the path to answer it.

**A module is named after the seam it plugs into.** A format lives under
`build.jenesis.repository.format.<name>`; a storage backend under `build.jenesis.repository.store.<name>`.
The module name states the extension point, so the set of modules on a deployment's path *is* the list of
what it can do - you read the capabilities off the names.

<div class="note">
  This is why the section is written seam-first. Each remaining chapter opens with the capability - what it
  does and that it is a discovered, optional plug-in point - then the implementations you can choose, then
  the settings that turn them on. Read the capability part even if you only mean to run a built-in: it is the
  shortest explanation of what you are choosing between.
</div>

## Discovery: `resolve()` and `installed()`

At startup the server discovers the installed modules with the JDK's `ServiceLoader`. For most seams that
is the whole story - the dispatcher loads every installed **format** and routes each request to the one that
handles its path. For a seam where exactly one implementation applies, or where a capability may be absent
entirely, each SPI has a small home that answers two questions:

- **`resolve()` - which implementation applies?** The storage seam's home picks the backend you selected and
  **falls back to the filesystem** when you named none, so a server with no store setting still runs.
- **`installed()` - is the capability present at all?** The tenant seam's home reports whether a tenant
  directory is on the path; the console and API offer tenant management only when it says yes.

This is what lets **optional modules degrade gracefully**. A capability that is not installed is simply not
there - the surface that needed it reports so, and the rest keeps working:

| Capability | If its module is absent |
|------------|-------------------------|
| Upstream fetcher (`source/proxy`) | the server serves local content only and refuses imports |
| Tenant directory | the directory is exactly the one configured tenant; no tenant management is offered |
| Credential-usage tracking (`source/usage`) | nothing records last-use, and the worker reports as off |
| Rate limiting (`source/ratelimit`) | nothing is limited |
| Token exchange (`source/oidc`) | a CI job cannot trade its identity token for a short-lived credential |

Each of these has its own chapter. The point here is the mechanism: the core asks the seam, and the seam
answers from what is on the path.

## The store underneath it all

Every plug-in persists through **one storage abstraction**, and the store is the *only* durable state - the
server has **no database**. A blob, a generated POM, a checksum, an index, a compare-and-set pointer, a
config document: all of them are objects written through the same seam.

Two properties of the store shape everything above it:

- **Content addressing.** The store's `writeBlob` digests a stream as it writes and keys the result by its
  own hash - `blobs/<sha256>`. Identical bytes are therefore stored once. A re-deploy of unchanged content
  needs no new space, and - because an OCI digest *is* a `sha256:` - a Docker layer dedupes against
  everything else for free.
- **Streaming, never buffering.** The primitives take an `InputStream` in and an `OutputStream` out and copy
  through. An artifact moves from the network straight to storage and back; it is never held whole in memory.
  A 4 KB POM and a 4 GB image layer cost the same fixed heap.

Every artifact lives under a `<tenant>/<repository>/…` space (both default to `default`, so a fresh server
writes under `default/default/`). The **Storage** chapter covers the seam's primitives and the filesystem,
S3, and Azure backends; for now, know that there is exactly one store and everything goes through it.

## The publication path

The one flow worth learning in full is what happens when an upload commits - because the compliance gate,
provenance, forwarding, and observability all hang off it. An accepted publish takes four steps, in order:

1. **The blob is stored, content-addressed, first.** The request body streams through the digest into
   `blobs/<sha256>`. At this point the bytes exist but nothing points at them - the artifact is not yet
   visible under any path.
2. **The gate screens it.** An ordered chain of screens reads the **neutral descriptor** the format emits
   (its coordinate, version, and metadata - never the format's own layout) and each returns a verdict:
   **`ACCEPT`**, **`QUARANTINE`**, or **`REJECT`**. The publish is routed by the strongest disposition any
   screen returned.
3. **The pointer is linked.** On accept, a pointer links the request path to the stored blob. *Now* the
   artifact is served. A quarantined or rejected publish never gets this link, so its bytes are never served.
4. **After-commit observers run.** Only once an accepted artifact is linked and serving are the observer
   hooks notified - the seam that forwarding, webhooks, replication, and scan hand-offs ride. An observer has
   **no say in the verdict** and its failure is logged and contained, so it can never fail the upload.

<div class="note">
  Screening also has a <strong>read side</strong>: a screen can <em>withhold</em> an
  already-published path on read, for a verdict that changes after the fact - the serving lookup asks the
  same screens whether a path is currently withheld before serving it.
</div>

Because screens and observers are plug-ins, **the core ships neither** - so out of the box every upload is
accepted and served exactly as it arrives. A deployment that wants a compliance gate or a forwarder plugs it
in at these two seams. The **compliance gate** and **provenance** chapters are entirely about step 2 and
step 4.

## The map

Every capability in this section is one of these seams. This is where each plugs in:

| Seam | Chapter |
|------|---------|
| Storage backend | Storage |
| Package format (Maven, module, OCI, npm, …) | Formats |
| Pull-through proxying and group repositories | Proxying & groups |
| Publication screening and gate policy | The compliance gate |
| Provenance signing and attestation | Provenance |
| Search index and licence inventory | Search & inventory |
| Background maintenance tasks | Maintenance |
| Tenant directory and auth mechanisms | Multi-tenancy & authentication |
| Rate limiter and usage tracker | Rate limiting & usage tracking |
| Publish-through forwarding | Publish-through forwarding |
| Import sources and importers | Migration & import |
| Console panels | The console |

Each opens with the capability, then its implementations, then its settings. The next chapter, **Storage**,
starts at the bottom of the stack - the store every one of these seams writes through.
