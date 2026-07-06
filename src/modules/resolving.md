---
order: 2
title: Resolving through repo.jenesis.build
description: The URL shapes that turn a module name into a Maven Central download - the four route modes, versions, POMs and metadata, classifiers, the 302 contract, and pointing at a mirror.
---

The catalogue is served as an HTTP service at **[repo.jenesis.build](https://repo.jenesis.build/)**. You
ask it for a module name - with an optional version and classifier - and it answers with a **302 redirect**
to the real file on Maven Central. Nothing is re-hosted; the service only decides *which* Maven artifact a
module name maps to and points you at it.

The whole contract is a small, stable set of URL shapes. Anything that can follow a redirect is a client:
`curl -L`, a browser, a Maven or Gradle resolver, the Jenesis build tool. Each redirect is derivable from a
single row of one of the catalogue's resolved-view files, so the service is a thin wrapper - if you would
rather resolve yourself, you can [read those files directly](#reading-the-catalogue-directly).

## The four route modes

The path segment immediately before the module name selects the mode. The mode decides which version space
you are addressing and which underlying file the row comes from:

| Mode | URL shape | Version segment is… |
| --- | --- | --- |
| `artifact` | `/artifact/<module>[/<mavenVersion>]/<file>` | The **Maven coordinate version**. The file extension passes through verbatim - a transparent Maven proxy. |
| `module` | `/module/<module>[/<moduleVersion>]/<file>.jar` | The **module-info version** the publisher declared (falls back to the Maven version when none was declared). |
| `sources` | `/sources/<module>[/<moduleVersion>]/<file>.jar` | The module-info version; the redirect appends `-sources` to the Maven filename. |
| `documentation` | `/documentation/<module>[/<moduleVersion>]/<file>.jar` | The module-info version; the redirect appends `-javadoc` to the Maven filename. |

Two version spaces are in play. `/artifact/` is keyed by the **Maven version** - the number you see in a POM.
`/module/`, `/sources/`, and `/documentation/` are keyed by the **module-info version** - the string the
publisher embedded in `module-info.class`. They are usually the same number, but not always; pick the mode
that matches the version you are holding.

The `<file>` is the trailing path segment. Its name must start with the module name (the segment just before
it); everything after that - after a `.`, or after `-<classifier>.` - is the extension. `/module/`,
`/sources/`, and `/documentation/` accept **`.jar` only**; `/artifact/` accepts any extension.

## Versions are optional

The version segment can always be omitted. Leave it out and the service returns the **highest** version - the
first row of the underlying file, which is sorted descending:

```bash
# Highest Maven version of org.slf4j
curl -L https://repo.jenesis.build/artifact/org.slf4j/org.slf4j.jar

# A specific version, pinned
curl -L https://repo.jenesis.build/artifact/org.slf4j/2.0.9/org.slf4j.jar
```

With the segment present, the service matches the first column of the row **exactly** - there is no
semantic-version range matching and no normalisation. Ask for `2.0.9`, get the row whose version is literally
`2.0.9`, or a `404` if there is none.

## `artifact` mode: a drop-in Maven repository

In `artifact` mode the extension is opaque: whatever you put after the module name becomes the suffix of the
Maven filename. Because the extension passes straight through, the same route serves the jar, the POM, its
checksums and signatures, and Gradle module metadata - everything a Maven client asks for:

```
# The jar
GET /artifact/org.slf4j/org.slf4j.jar
→ 302 …/org/slf4j/slf4j-api/2.0.10/slf4j-api-2.0.10.jar

# The POM of a specific version
GET /artifact/org.slf4j/2.0.9/org.slf4j.pom
→ 302 …/org/slf4j/slf4j-api/2.0.9/slf4j-api-2.0.9.pom

# A checksum, or a signature - same pattern
GET /artifact/org.slf4j/2.0.9/org.slf4j.pom.sha256
→ 302 …/org/slf4j/slf4j-api/2.0.9/slf4j-api-2.0.9.pom.sha256

# Gradle module metadata, if the publisher provides it
GET /artifact/org.slf4j/2.0.9/org.slf4j.module
→ 302 …/org/slf4j/slf4j-api/2.0.9/slf4j-api-2.0.9.module
```

Because it answers for every file a Maven client needs, the `/artifact/` route is a **drop-in Maven
`<repository>` URL** - point a build at it and it resolves modules by name without any custom resolver.

## `module`, `sources`, and `documentation` modes

These three are keyed by the module-info version and accept only `.jar`. They map to the main jar, the
sources jar, and the javadoc jar of the same artifact:

```
GET /module/org.slf4j/2.0.9/org.slf4j.jar
→ 302 …/org/slf4j/slf4j-api/2.0.9/slf4j-api-2.0.9.jar

GET /sources/org.slf4j/2.0.9/org.slf4j.jar
→ 302 …/org/slf4j/slf4j-api/2.0.9/slf4j-api-2.0.9-sources.jar

GET /documentation/org.slf4j/2.0.9/org.slf4j.jar
→ 302 …/org/slf4j/slf4j-api/2.0.9/slf4j-api-2.0.9-javadoc.jar
```

## Classifiers

A classifier on the filename - the part between the first hyphen and the next dot - flips the lookup to the
matching classifier-scoped view of the catalogue, and then becomes the standard Maven classifier on the
redirect target:

```
GET /artifact/com.fasterxml.jackson.core/com.fasterxml.jackson.core-no_aopalliance.pom
→ resolves against the "no_aopalliance" view,
  redirects to …/jackson-core-<version>-no_aopalliance.pom
```

The same works in every mode: `<module>-<classifier>.jar` under `/module/` resolves the classifier's jar.

## The 302 response

A successful response is an empty-bodied HTTP `302` whose `Location` points at the Maven URL, cached with
`Cache-Control: public, max-age=<REDIRECT_TTL>, stale-while-revalidate=86400`.

The resolved coordinate is also echoed back as response headers, so a client can record exactly what it
fetched without parsing the `Location`:

| Header | When | Value |
| --- | --- | --- |
| `X-Jenesis-GroupId` | always | Maven `groupId` of the resolved row. |
| `X-Jenesis-ArtifactId` | always | Maven `artifactId`. |
| `X-Jenesis-MavenVersion` | always | Maven coordinate version. |
| `X-Jenesis-ModuleVersion` | `/module/`, `/sources/`, `/documentation/` | The publisher-declared module-info version. Omitted in `artifact` mode, where the lookup key is already the Maven version. |

### When a request fails

| Status | Meaning |
| --- | --- |
| `404` | The path is not a supported shape, the module-name segment does not match the filename prefix, the filename has no extension, a `.jar`-only mode got a non-`.jar` file, the requested version has no row, or the module has no resolved owner in this view. The body names what was missing. |
| `405` | The request was not `GET` or `HEAD`. |
| `502` | The upstream catalogue is temporarily unhealthy. |

## Stability guarantee

The service makes one promise you can build on: **`(module, moduleVersion)` always resolves to the same Maven
artifact, and that artifact's Maven version is the same number as the module version.** Pin a module version
in your build and every later rebuild resolves to the identical jar, even though Maven itself does not enforce
unique module versions. The `/artifact/` lookup is equally stable, because Maven coordinates are immutable on
Central - the resolution only ever shifts if an operator deliberately re-points the catalogue's ownership for
that name.

<div class="note">
  A module resolves only if some artifact on Maven Central declared that module name. If you get a
  <code>404</code> for a name you expected, the artifact may ship neither a <code>module-info</code> nor an
  <code>Automatic-Module-Name</code> - the <a href="/modules/">reports</a> show what is and is not covered.
</div>

## Using it from the build tool

The Jenesis build tool points at `repo.jenesis.build` out of the box. When your `module-info.java` declares a
`requires`, the build resolves the name here automatically - you rarely call the service by hand. From the
command line, `curl -L` is all a manual lookup needs:

```bash
# Follow the redirect and save the jar
curl -L -O https://repo.jenesis.build/module/com.fasterxml.jackson.databind/com.fasterxml.jackson.databind.jar

# Inspect only - see the redirect target and the coordinate headers
curl -I https://repo.jenesis.build/module/com.fasterxml.jackson.databind
```

## Pointing at a mirror

The URL shapes *are* the contract, so any deployment that serves the same shapes is a drop-in replacement.
The reference deployment is a small worker that reads three optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATA_BASE` | the catalogue on `raw.githubusercontent.com` | Where the resolved-view files are read from. Point it at a fork or mirror to serve a different catalogue. |
| `ARTIFACT_BASE` | `https://repo.maven.apache.org/maven2/` | The base URL the 302 redirects target. Point it at a Maven mirror or proxy. |
| `REDIRECT_TTL` | `3600` (seconds) | The `max-age` on the 302, and the edge-cache TTL for the upstream reads. |

Any number of path segments *before* the mode marker are ignored, so the same service works whether it is
mounted at `/`, `/mod/`, or `/jenesis/v1/` - no configuration needed.

## Reading the catalogue directly

You do not have to go through the service at all. Each redirect comes from one row of a **resolved-view** file
in the catalogue, and those files are plain tab-separated text you can read over `raw.githubusercontent.com`
or any mirror - enough to build your own resolver. Each module has a directory whose path mirrors its
dot-separated name (`com.fasterxml.jackson.core` → `com/fasterxml/jackson/core/`) holding two views:

**`artifacts.tsv`** - keyed by the Maven version. Four columns, sorted version-descending:

```
2.0.10  named      org.slf4j  slf4j-api
2.0.9   named      org.slf4j  slf4j-api
1.7.36  automatic  org.slf4j  slf4j-api
```

The columns are `version`, `type` (`named` or `automatic`), `groupId`, `artifactId`. This is what `/artifact/`
reads: find the row whose first column is your version and fetch `<artifactId>-<version>` from Maven Central.

**`modules.tsv`** - keyed by the module-info version. Four columns, sorted module-version-descending:

```
2.0.10  org.slf4j  slf4j-api  2.0.10
2.0.9   org.slf4j  slf4j-api  2.0.9
1.7.36  org.slf4j  slf4j-api  1.7.36
```

The columns are `moduleVersion`, `groupId`, `artifactId`, `mavenVersion`. This is what `/module/` reads:
match the first column, then fetch the coordinate named by the last three. Classifier-scoped variants live
alongside as `artifacts-<classifier>.tsv` and `modules-<classifier>.tsv`.

<div class="warning">
  A module name is <strong>not</strong> a namespaced or authoritative identifier - it is just a string a jar
  carries, and unrelated artifacts can and do declare the same one. These resolved views already pick a single
  owner per name for you; the audit log behind them, and how ownership is decided, is covered in
  <a href="/modules/">the catalogue chapter</a>. If you resolve directly, pin the
  <code>(groupId, artifactId)</code> you expect rather than trusting a name on its own.
</div>
