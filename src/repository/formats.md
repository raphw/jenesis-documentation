---
order: 5
title: Formats
description: The format seam every client ecosystem plugs into - the RepositoryFormat SPI and its ProxyFormat/ArtifactLayout options, the built-in Maven, module, OCI/Docker and raw layouts, and the settings that point them upstream.
---

The [Storage](/repository/storage/) chapter was the bottom of the stack - the one store every capability
writes through. This chapter is the top: the **wire protocols** that turn those stored blobs into artifacts
a Maven, Gradle, Docker, or Jenesis client can resolve. A *format* is the plug-in that speaks one client
ecosystem's protocol, and - like every capability in this section - it is discovered, swappable, and
optional.

## The format seam

A **format owns the wire protocol of one client ecosystem.** It recognises the request paths that belong to
it and either serves them or accepts an upload on them. That is the whole job, and it is the shortest
statement of what you are choosing between: which ecosystems a deployment speaks is exactly the set of format
modules on its path.

The seam is deliberately narrow. A format answers three questions: what is its **name** (`maven`, `oci`,
`module`), does it **handle** a given request path, and how does it **serve or accept** that request against
the store. The dispatcher discovers every installed format at startup and routes each request to the one
that claims its path - so formats plug in without the core naming any of them.

<div class="note">
  A server with <strong>no format at all</strong> is still a valid, fully wired repository - it just
  answers <code>404</code> until a format is on the path to serve a request. You read a deployment's
  capabilities off its module set: the formats present <em>are</em> the ecosystems it speaks.
</div>

### Two optional powers a format may take

Beyond serving requests, a format can opt into either of two extra capabilities. A format that has no use
for one is simply unaffected - the core detects the capability's presence, so nothing is forced on a plain
format.

- **Pull-through proxying (`ProxyFormat`).** The format can serve a local miss from an upstream registry -
  fetch it, verify it, store it, and re-serve it. The OCI format uses this to mirror Docker Hub; the Maven
  layout uses it to mirror Maven Central. The mechanics are the subject of the **Proxying & groups** chapter;
  here it is enough to know the capability lives on the format.
- **Coordinate exposure (`ArtifactLayout`).** The format can expose the **neutral coordinate** behind a
  request path - its `{ecosystem, coordinate, version}`, whether the version is a prerelease, and the set of
  paths a version occupies. This lets inventory, search, and cleanup key on the coordinate a format supplies
  rather than each having to parse the format's own path layout.

## The built-in formats

A standard build puts four formats on the path. They fall into three shapes.

### JVM coordinate layouts - Maven and the module layout

The repository is **dual-layout**: it serves the same JVM artifacts under both the Maven coordinate layout
and the Jenesis module layout, so a single upload feeds both ecosystems.

- **The Maven layout** is served under `/repository/maven/` and is a drop-in Maven `<repository>` URL for
  publishing and resolving alike. It stores the uploaded jar and **computes the POM** when you publish a
  module, so the artifact is consumable even if you never uploaded one. A published `maven-metadata.xml` is
  stored and served back **verbatim** by default. And it **proxies Maven Central**, so the one URL resolves
  both your own artifacts and everything upstream.
- **The Jenesis module layout** is served under `/repository/module/` and `/repository/artifact/`, and
  resolves artifacts **by module name** rather than by Maven coordinate. Its route shapes mirror the public
  [repo.jenesis.build](/modules/resolving/) service, so a Jenesis `modular` build resolves against your own
  server exactly the way it resolves against the hosted one.

The two layouts are bridged in one direction: when you publish a **modular jar** to the Maven layout, the
server reads the jar's module name back from the just-stored blob and **cross-publishes** it into the module
layout, so a `modular` build resolves it with no extra step. A module published directly to the module layout
stays there - the bridge does not mirror back to Maven.

<div class="tip">
  This is the point of publishing once: <code>mvn deploy</code> a modular jar and it resolves both by Maven
  coordinate <em>and</em> by module name, from the same server, with no second upload.
</div>

### Registry protocol - OCI / Docker

The **OCI format** implements the `/v2/` Distribution API end to end, so `docker push` and `docker pull`
talk to the server directly, with no plugin or sidecar:

```bash
docker tag my-app repo.example.com/my-app:1.0
docker push repo.example.com/my-app:1.0
docker pull repo.example.com/my-app:1.0
```

It supports monolithic **and** chunked blob uploads, manifests addressed by tag or by digest (the media type
kept in a sidecar so a pull returns it verbatim), `tags/list`, and `HEAD` existence checks. The fit is
unusually clean because an OCI blob is addressed by its `sha256:` digest - **exactly the content-addressed
`blobs/<hex>` key** the store already uses - so image layers, configs, and manifests dedupe against
everything else and inherit the same multi-tenancy, authorization, storage, and console as a Maven artifact,
for free. It can also run as a pull-through mirror of an upstream registry (see **Proxying & groups**).

### Generic files - raw

The **raw format** is served under `/repository/raw/`: a plain content-addressed file store - `PUT` stores a
file, `GET` serves it back, over the same store primitives as everything else. Use it for artifacts that
have no ecosystem of their own. It also carries an importer, so raw assets migrate in alongside Maven and
OCI (see **Migration & import**).

### Another ecosystem is one more format

Because a format is just a discovered module over the shared store, extending the server to a new ecosystem -
npm, PyPI, NuGet, Cargo, Gem, and the rest - is **adding one more format module to the path**, grouped by the
same three shapes above (a coordinate layout, a registry protocol, or a generic file store). It inherits the
content-addressed storage, multi-tenancy, authorization, and console untouched. There is no central table of
formats to edit and no core to fork; the set of format modules on a deployment's path is the full list of
what it speaks.

## Settings

### Enabling a format

A format is enabled by being **on the module path** - there is no on/off setting. A standard build already
includes the Maven, module, OCI, and raw formats, so the getting-started run served all of them. To build a
single format and its dependencies you name its module, the same way you would a storage backend:

```bash
java build/jenesis/Project.java +source+format+maven build   # the Maven layout and its dependencies
```

You then select the formats you want alongside `source+server` when you launch. The distribution's module
set chooses which ecosystems a deployment speaks; the core stays generic.

### Per-format upstreams

A proxy-capable format serves a local miss from an upstream you point it at, keyed by the format's name:

```bash
-Djenesis.repository.proxy.maven=https://repo1.maven.org/maven2/   # the Maven layout's upstream
-Djenesis.repository.proxy.oci=https://registry-1.docker.io/       # the OCI format's upstream
```

The Maven layout defaults to **Maven Central** (`https://repo1.maven.org/maven2/`) with no configuration.
How a miss is fetched, verified, cached, and re-served - and how group repositories fan out over several
upstreams - is the **Proxying & groups** chapter; this key is just where you name the upstream.

### `maven-metadata.xml` computation

By default the Maven layout stores and serves a published `maven-metadata.xml` **verbatim** - it hands back
exactly the bytes a client uploaded. Opt into computing it on read instead, derived from the stored version
folders, with:

```bash
-Djenesis.repository.maven-metadata-compute=true   # default off
```

Leave it off unless you want the server to be the source of truth for artifact-level metadata; the verbatim
default is faithful to what was published.

The next chapter, **Proxying & groups**, picks up the pull-through capability introduced here - how a format
mirrors an upstream, and how group repositories serve many upstreams behind one URL.
