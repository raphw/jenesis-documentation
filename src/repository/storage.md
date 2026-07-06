---
order: 4
title: Storage
description: The one store every plug-in writes through — its content-addressed primitives, the filesystem, S3, and Azure backends, and the settings that select and cap them.
---

The [Architecture](/repository/architecture/) chapter established that the store is the server's **only
durable state** — there is no database. Every byte the repository owns (a jar, a generated POM, a checksum,
an index, a compare-and-set pointer, a config document) is an object written through **one storage seam**.
This chapter is that seam: what it does, the backends that implement it, and how you point a deployment at
one.

## The storage seam

The storage backend is a discovered plug-in like every other capability. The core names no backend; it asks
the seam which one applies and writes everything through it. The seam is small on purpose — a backend is
just these primitives over an object namespace:

- **Streaming read and write.** `write(key, InputStream)` copies a stream into an object; `read(key,
  OutputStream)` copies it back out. Bytes move from the network straight to storage and back — never held
  whole in memory, so a 4 KB POM and a 4 GB image layer cost the same fixed heap.
- **Content addressing — `writeBlob`.** `writeBlob(InputStream)` digests a stream *as it writes* and keys
  the result by its own hash: `blobs/<sha256>`. Identical bytes therefore land once. A re-deploy of
  unchanged content needs no new space, and because an OCI digest already *is* a `sha256:`, a Docker layer
  dedupes against everything else for free.
- **Compare-and-set — `writeVersioned`.** A conditional write that only succeeds if the object is unchanged
  since you read it. This is how several stateless server instances agree on a pointer with **no lock
  service** — the store itself is the coordination point.
- **Scoping and listing.** Every object lives under a `<tenant>/<repository>/…` **scope**; a backend
  resolves a key within the active scope, and `list` walks a prefix one level at a time so a browse or a
  cleanup never scans a whole tree. `exists`, `size`, and `delete` round out the set.

That is the whole contract. Because it is this narrow, the same content-addressed publication path,
multi-tenancy, and console work identically whether the bytes land on a disk or in a cloud bucket — the
layers above the store never learn which backend answered.

<div class="note">
  A backend is chosen once, at startup, for the whole deployment. You do not mix backends within one server;
  you point the server at the medium you want and everything flows there.
</div>

## The backends

Three backends ship in the box. Each maps the primitives above onto a real medium; you select one with a
single setting (below) and supply its credentials.

### Filesystem — the default

The filesystem backend keeps blobs under a mounted root directory. It is the backend the server **falls
back to when you name none**, so the getting-started run needed no selection at all — only a path:

```bash
JENESIS_STORE_ROOT=/var/lib/jenesis-repository \
  java -Djenesis.execute.module=source+server build/jenesis/Execute.java
```

Point `JENESIS_STORE_ROOT` at durable, backed-up storage — a mounted volume, an NFS share — and the server
is complete. It is the right choice for a single instance or a local run; the cloud backends are what you
reach for to run stateless and horizontally scaled.

### S3 — and GCS, MinIO, Ceph

The S3 backend (AWS SDK v2) stores every object in an S3-compatible bucket. Selecting it makes the server
**stateless**: an instance can die and lose nothing, and you can run several behind a load balancer or
serverless, because the durable state lives in the bucket, not the instance.

```bash
-Djenesis.repository.store=s3            # select the backend
JENESIS_AWS_BUCKET=my-artifacts          # the bucket to use
```

The same backend serves any S3-compatible store — **Google Cloud Storage, MinIO, Ceph** — by pointing it at
a custom endpoint:

```bash
JENESIS_AWS_ENDPOINT=https://storage.googleapis.com   # or a self-hosted MinIO/Ceph URL
```

The object **ETag is the version token**, so `writeVersioned` becomes a true cross-node compare-and-set over
S3's `If-None-Match` / `If-Match` conditional writes — the coordination is the bucket's, with no separate
lock service. And because `PutObject` needs the object length up front, a streamed upload of unknown length
spills to a temp file rather than to the heap, preserving the fixed-memory guarantee.

### Azure Blob

The Azure backend (azure-storage-blob SDK) stores objects in an Azure Blob container and behaves exactly
like the S3 backend for scaling and coordination — the blob **ETag is the version token**, so
`writeVersioned` is a cross-node compare-and-set over Azure's `If-None-Match` / `If-Match` conditional
writes.

```bash
-Djenesis.repository.store=azure-blob
JENESIS_AZURE_CONNECTION_STRING=...      # the account connection string
```

## Settings

### Selecting a backend

One setting picks the backend; leaving it unset uses the filesystem.

| `-Djenesis.repository.store=` | Backend | Also set |
|-------------------------------|---------|----------|
| *(unset)* | Filesystem *(default)* | `JENESIS_STORE_ROOT` |
| `s3` | S3 / GCS / MinIO / Ceph | `JENESIS_AWS_BUCKET` (+ `JENESIS_AWS_ENDPOINT` for non-AWS) |
| `azure-blob` | Azure Blob | `JENESIS_AZURE_CONNECTION_STRING` (+ optional `JENESIS_AZURE_CONTAINER`) |

### Credentials

The filesystem backend needs no credentials — file permissions on the root are the access control.

The **S3 backend** takes credentials from the standard AWS chain by default: environment variables, a shared
profile, or an instance/role identity, so a server on AWS with an instance role needs no keys in
configuration at all. To supply keys explicitly — the path a self-hosted MinIO or Ceph takes — set **both**
of:

```bash
JENESIS_AWS_ACCESS_KEY_ID=...
JENESIS_AWS_SECRET_ACCESS_KEY=...
```

The **Azure backend** authenticates with the connection string in `JENESIS_AZURE_CONNECTION_STRING`.

### Quota

A repository-wide storage cap is optional. It refuses a new artifact once stored content reaches the limit,
answering `507 Insufficient Storage`:

```bash
-Djenesis.repository.quota=10GB          # a byte count, or a K/M/G/T suffix
```

Only **content blobs** count toward the cap. Because storage is content-addressed, a deduped re-deploy of
bytes already stored needs no new space and is never refused — the quota measures what is actually held, not
what was uploaded.

<div class="warning">
  <strong>Upgrading a pre-scope deployment.</strong> Every artifact now lives under a
  <code>&lt;tenant&gt;/&lt;repository&gt;/…</code> scope (both default to <code>default</code>, so a fresh
  server writes under <code>default/default/</code>). A deployment whose data predates this layout keeps its
  <code>blobs/</code>, <code>publish/</code> and <code>oci/</code> trees (and <code>imports/</code> job
  state, if any) directly under the store root; move them once into the default scope. On the filesystem
  backend:
  <pre><code>cd "$JENESIS_STORE_ROOT" &amp;&amp; mkdir -p default/default &amp;&amp; mv blobs publish oci imports default/default/</code></pre>
  On S3 or Azure, do the equivalent server-side per-prefix move. Credentials under <code>auth/</code> are
  deployment-wide, not artifact data, and stay at the store root.
</div>

The store is the floor of the stack — every capability in the rest of this section writes through it. The
next chapter, **Formats**, is the other end: the wire protocols that turn these stored blobs into artifacts
a Maven, npm, or Docker client can resolve.
