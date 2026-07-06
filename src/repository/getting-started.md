---
order: 2
title: Getting started
description: Run a Jenesis Repository server on the filesystem, publish and consume a Maven artifact, and open the console.
---

This chapter takes you from nothing to a running repository. You build the server, start it against a
folder on disk, open its web console, and then publish a Maven artifact into it and resolve that artifact
back with plain `mvn`. Everything later in this section assumes only what is here.

The server has **no database**. Every durable thing it owns - artifacts, generated POMs, checksums,
indexes - lives in one **store**, and the simplest store is a directory on your disk. That is where we
start; cloud backends come later.

## Prerequisites

You need **a JDK, version 25 or newer**, and nothing else on the server side - the repository is itself a
Jenesis build, so it launches straight from source with the JVM, with no daemon or wrapper. To exercise it
you also want a `mvn` on your path.

```bash
java --version      # must report 25 or above
```

## Build the server

Clone the project and run its build. Like every Jenesis build, this is one command and produces every
module:

```bash
git clone https://github.com/raphw/jenesis-repository.git
cd jenesis-repository
java build/jenesis/Project.java build
```

<div class="note">
  The server is built with Jenesis the same way any project is - the same <code>Project.java</code>,
  selectors, and module syntax the <a href="/tool/getting-started/">tool section</a> covers. To build just
  one backend and its dependencies you name its module, for example
  <code>java build/jenesis/Project.java +source+store+s3 build</code>.
</div>

## Run it on the filesystem

Start the server and point it at a directory. The **filesystem backend is the default**, so you select
nothing - you just tell it where to keep its data with `JENESIS_STORE_ROOT`:

```bash
JENESIS_STORE_ROOT=/var/lib/jenesis-repository \
  java -Djenesis.execute.module=source+server build/jenesis/Execute.java
```

That is a complete, running repository. The server itself is **stateless and format-neutral**: it
discovers whichever layouts, storage backends, importers, and the console are on its module path at
startup and dispatches to them. A standard build puts the Maven layout, the Jenesis module layout, the
OCI/Docker registry, the filesystem store, and the web console on that path - so the command above already
serves all of them.

The server listens on **port 8080** by default. Everything below assumes `http://localhost:8080`.

### Where your data lands

Inside the store, every artifact lives under a `<tenant>/<repository>/…` space. Both default to `default`,
so a fresh deployment writes under `default/default/`:

```bash
-Djenesis.repository.tenant=default -Djenesis.repository.repository=default   # the defaults
```

Blobs are **content-addressed** - identical bytes are stored once, so a re-deploy of unchanged content
needs no new space. You never edit files under the root by hand.

<div class="tip">
  To run on a cloud object store instead - S3, GCS/MinIO, or Azure Blob - you select the backend and give
  it a bucket or connection string. That is the subject of the <strong>Storage</strong> chapter; the
  filesystem backend here needs no selection at all.
</div>

## Open the console

The web console is at **`/console`** - browse repositories and artifacts and view their configuration. A
generic, breadcrumbed file browser over any repository's namespace is at **`/browse`**.

Sign-in is OAuth2 / OIDC. For a **local run**, start with the `dev` profile, which swaps in a built-in
`admin` / `admin` form login so you can sign in without configuring an identity provider:

```bash
SPRING_PROFILES_ACTIVE=dev JENESIS_STORE_ROOT=/var/lib/jenesis-repository \
  java -Djenesis.execute.module=source+server build/jenesis/Execute.java
```

<div class="warning">
  The <code>dev</code> profile and its <code>admin</code>/<code>admin</code> login are for local use only.
  Real deployments authenticate over OIDC and per-tenant keys - covered in the
  <strong>Multi-tenancy &amp; authentication</strong> chapter.
</div>

## Publish a Maven artifact

The Maven layout is served under **`/repository/maven/`**, so that URL is a drop-in Maven repository for
both publishing and resolving. Point a project's `distributionManagement` at it:

```xml
<distributionManagement>
  <repository>
    <id>jenesis</id>
    <url>http://localhost:8080/repository/maven/</url>
  </repository>
</distributionManagement>
```

Supply credentials for that `id` in your `~/.m2/settings.xml` (for the local `dev` run above, the
built-in login):

```xml
<servers>
  <server>
    <id>jenesis</id>
    <username>admin</username>
    <password>admin</password>
  </server>
</servers>
```

Then deploy as usual:

```bash
mvn deploy
```

The server stores the uploaded jar and, when you publish a module, **computes its POM** so the artifact is
consumable even if you never uploaded one. A published `maven-metadata.xml` is stored and served back
**verbatim**. If the jar is a real Java module, it is also **cross-published into the module layout** by
module name, so a Jenesis `modular` build can resolve it without any extra step.

## Consume it with `mvn`

Resolving is the same URL as a `<repository>`. Any Maven, Gradle, or Jenesis Maven-mode build can now pull
your artifact:

```xml
<repository>
  <id>jenesis</id>
  <url>http://localhost:8080/repository/maven/</url>
</repository>
```

The Maven layout also **proxies Maven Central**, so this single URL serves both your own artifacts and
everything from Central - you can point a build's mirror at it and resolve the whole graph through one
endpoint.

## Point a Jenesis build at it

A Jenesis build needs no new client - it points at the running repository with the existing knobs:

```bash
-Djenesis.maven.uri=https://repo.example.com/repository/maven/
-Djenesis.module.uri=https://repo.example.com/repository/ \
  -Djenesis.module.token=jenk_<tenant>.<secret>
```

The Maven URI feeds Maven-mode resolution; the module URI and token feed module-name resolution against
the same server. See the tool section's [Dependencies](/tool/dependencies/) chapter for how those knobs
fit into a build.

You now have a working repository. The next chapter, **Architecture**, explains the plug-in model behind it -
why every layout, backend, and screen is a discovered module over one content-addressed store.
