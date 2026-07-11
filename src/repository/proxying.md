---
order: 6
title: Proxying & groups
description: The upstream-connectivity seam that lets a repository serve what it does not yet hold - the FetcherProvider SPI, pull-through caching and its revalidation and negative cache, group repositories and routing over it, and the settings that point them upstream.
---

The [Formats](/repository/formats/) chapter introduced the optional **pull-through** power a format may take:
a `ProxyFormat` can serve a local miss from an upstream registry. This chapter is the machinery behind that
power - the seam that reaches an upstream, how a miss becomes a cached local hit, and how a deployment can
define whole repositories that are proxies or groups rather than plain stores.

## The upstream-connectivity seam

Every upstream request - a Maven miss fetched from Maven Central, a Docker layer pulled from Docker Hub, an
asset read during an import - goes through **one HTTP fetcher**, and that fetcher is a discovered plug-in
like every other capability. The seam is the shortest statement of what you are choosing: **whether the
deployment can talk to an upstream at all, and with what caching behaviour.**

A fetcher answers two calls: `fetch` a small body (a metadata document a proxy must inspect or rewrite) and
`download` a large one (an artifact copied straight to the store as a stream). The core names no transport;
it asks the seam for the installed fetcher and hands it to whichever format or importer needs the network.

<div class="note">
  <strong>Without the fetcher module on the path, the deployment serves local content only.</strong> A proxy
  upstream is never consulted and an import is refused - cleanly, by the core detecting that no fetcher is
  installed, not by requests failing one at a time. Upstream connectivity is a capability you add, exactly
  like a storage backend or a format.
</div>

The standard fetcher is the `http` module. It composes the raw HTTP client with the two caching behaviours
below, so a deployment that puts it on the path gets pull-through, revalidation, and a negative cache
together.

## Pull-through caching

Pull-through is the everyday shape: with a format pointed at an upstream - its canonical default, or one
you name - the repository becomes a build's **single front door**: it serves your own artifacts and mirrors
everything upstream, from one URL.

### A miss becomes a local hit

The loop is the same for every format. A `GET` (or `HEAD`) is served **locally first**. If that is a
`404`, the format's proxy adapter takes over: it maps the request to its upstream, fetches, and - for an
**immutable artifact** - stores the bytes content-addressed and serves them, so the *next* read is a plain
local hit that never touches the network again. The copy from upstream to the store is a **stream**, digest
and all, so a multi-hundred-megabyte layer is mirrored in a small, fixed heap.

A **mutable index** - a `maven-metadata.xml`, an npm packument, a version list - is never cached that way,
because it changes upstream. It is proxied **fresh** on each request (with upstream links rewritten back to
this repository where needed), so an artifact published upstream after you first looked shows through. To
avoid re-downloading an index that has *not* changed, the fetcher **revalidates** it: it remembers the
body's `ETag` / `Last-Modified` and sends a conditional request, and a `304 Not Modified` serves the
remembered bytes without them crossing the wire again. The upstream is still asked every time - only the
transfer is saved - so a revalidated index is never stale.

### The negative cache

A build tool makes a *flood* of requests for artifacts that are not upstream at all: a version range it
probes, a missing `SNAPSHOT`, an optional classifier, a `.sha256` a client guesses at. Re-asking the
upstream for each one multiplies load and risks tripping its rate limit. So a definite upstream **`404` is
remembered** for a short window and answered from memory instead of re-fetched.

Only a *definite* `404` is cached. A transport failure or an auth challenge (`401` / `403`) is not - it is
transient or resolvable - and any success passes through untouched. An entry expires after the configured
time-to-live, so a genuinely-published artifact is picked up within that window (a minute by default).

### The OCI pull-through mirror

The OCI format uses the same seam to mirror an upstream registry - **Docker Hub by default** - so
`docker pull` against your server transparently fetches an image you have not pushed. It follows the
Distribution **bearer-token handshake** the protocol requires, resolves **multi-arch image indexes**, and
**verifies each fetched blob by its digest** before storing it. Because an OCI `sha256:` digest *is* the
content-addressed store key, a mirrored layer dedupes against everything else the repository holds.

## Group repositories & routing

Pull-through above is configured **per format, deployment-wide**: the Maven format has one upstream, the OCI
format has one, and every repository the server exposes shares them. A larger deployment often wants
something finer - *this* repository is a pure proxy of one upstream, *that* one is a **group** that presents
several repositories behind a single URL. That is a second seam: **routing**.

A routing plug-in defines, per repository, whether it is a plain hosted store or a **routed** one:

- A **proxy repository** pulls through *its own* named upstream on a local miss and caches per its own
  definition - several independent proxies, each of a different upstream, rather than one shared per-format
  upstream.
- A **group repository** is a read-through view over an ordered list of member repositories. A read consults
  the members **in order, first hit wins**; a group never stores anything of its own, so it is a pure
  aggregating front door over its members (hosted and proxy alike).

Reads are routed; **writes are not** - a publish to a group lands in its designated push-target member, on
the normal write path. And routing changes *where* bytes come from, not *what* is allowed: a routed read
still passes through the compliance gate, so a withheld or policy-denied path stays
a `404` whether it was served directly, pulled through a proxy, or found in a group member.

<div class="note">
  The free single-tenant server binds the <strong>no-routing</strong> default: every repository is a plain
  hosted store, and cross-upstream serving is exactly the deployment-wide, per-format pull-through above.
  Named proxy and group repositories are what a <strong>multi-repository distribution</strong> adds by
  contributing a router over this same fetcher - the seam is here so it plugs in without the core changing.
</div>

## Settings

### Enabling upstream connectivity

There is no on/off flag - connectivity is the `http` fetcher module **being on the path**. A standard build
includes it; to confirm or to build it explicitly you name its module the way you would a storage backend or
a format:

```bash
java build/jenesis/Project.java +source+proxy build   # the HTTP fetcher and its dependencies
```

With no fetcher module present the server still runs - it just serves only what it holds and refuses
imports.

### Per-format upstreams

Pull-through is on out of the box. Each proxy-capable format declares its **canonical public upstream** -
Maven Central for the Maven layout, Docker Hub for OCI, the public registry for npm - and mirrors it with
nothing to configure. A format that declares no canonical upstream (one whose ecosystem has no single
public registry) is served hosted-only until you name one. Two properties adjust this:

```bash
-Djenesis.repository.proxy-enabled=false                           # serve every format hosted-only
-Djenesis.repository.proxy.maven=https://mirror.example.com/maven/ # override one format's upstream
```

`proxy-enabled` is the deployment-wide switch; the per-format `proxy.<format>` key, keyed by the format's
name, points a format at a different upstream - or gives one to a format that declares none.

### The negative-cache window

How long a definite upstream `404` is remembered is one setting; `0` disables the negative cache entirely:

```bash
-Djenesis.repository.proxy-miss-ttl=60s   # default one minute; PT90S / 5m / 0 also accepted
```

Leave it at the default unless an upstream publishes very frequently and you need a miss re-checked sooner -
lowering it trades a little more upstream traffic for faster pickup of a just-published artifact; raising it
shields a rate-limited upstream from a build tool's probing at the cost of a longer wait before a new
artifact is seen.

The next chapter, **The compliance gate**, is the screen every one of these paths passes through - including
the proxy leg - before an artifact is served or a publish is committed.
