---
order: 6
title: Dependencies
description: Declaring dependencies in each layout; how they resolve over the Maven and module repositories; version negotiation; Maven exclusions; and strict pinning with SHA-256 checksums in your sources.
---

Every non-trivial build pulls in libraries. This chapter is about where you declare them, how Jenesis turns
each declaration into a downloaded jar, and — because a build is only as trustworthy as the bytes it pulls —
how to **pin** every one of those jars to an exact version *and* checksum, recorded in your own sources.

## Declaring a dependency

You never add a dependency in a build script. You declare it the same way the ecosystem already does, and the
place depends on your layout (see *Core concepts*):

- A **`pom.xml`** project lists a dependency the normal Maven way, in `<dependencies>`:

  ```xml
  <dependency>
      <groupId>org.apache.commons</groupId>
      <artifactId>commons-text</artifactId>
      <version>1.12.0</version>
  </dependency>
  ```

- A **modular** project (`module-info.java`) declares a `requires`, and nothing else — the module name *is*
  the dependency:

  ```java
  module demo.app {
      requires com.fasterxml.jackson.databind;
  }
  ```

That is the whole surface. Jenesis reads these existing files, resolves the transitive closure, and puts the
result on the compile and runtime paths.

## The two repositories

Jenesis resolves through two named repositories, one per kind of coordinate:

- **`maven`** — Maven coordinates (`groupId:artifactId:version`). Fetched over HTTP from Maven Central
  (`https://repo1.maven.org/maven2/`) and hardlinked into your **local Maven repository** (`~/.m2/repository`),
  exactly where `mvn` keeps them.
- **`module`** — Java module names. Resolved through **[repo.jenesis.build](/modules/)**, the module-name
  index that maps a name like `com.fasterxml.jackson.databind` to its artifact and 302-redirects to the file
  on Maven Central.

Which one a dependency uses follows from the layout. A `pom.xml` declares Maven coordinates, so it resolves
through `maven`. A `requires` names a module, so it resolves through `module` — and this is the step that turns
a module name into something downloadable. The **[Jenesis Modules](/modules/)** section documents that lookup
in full; the short version is that it is a thin, module-name-addressable mirror of Maven Central.

<div class="note">
  Under the default <code>modular_to_maven</code> layout, a <code>requires</code> is resolved to the declaring
  module's <em>Maven coordinate</em> (its POM is fetched through the module index), and transitive resolution
  then proceeds through Maven — so a module project reaches automatic-module and plain-classpath libraries too.
  The strict <code>modular</code> layout resolves purely by module name. <em>Core concepts</em> covers the
  difference; the <code>dependencies</code> selector below shows it concretely.
</div>

### Pointing at a different repository

To resolve through a corporate mirror or a private repository instead of the public defaults, set an
environment variable before the build — no project change required:

| Variable | What it overrides |
| --- | --- |
| `MAVEN_REPOSITORY_URI` | The Maven upstream. Accepts a comma-separated list, queried left to right; an entry may append `\|`-separated group ids to serve only those groups, and a bare `@` splices the default chain back in (`https://nexus.corp/,@`). |
| `MAVEN_REPOSITORY_TOKEN` | Sent verbatim as the `Authorization` header on every Maven fetch (e.g. `Bearer …` or `Basic …`). |
| `MAVEN_REPOSITORY_LOCAL` | The local Maven repository directory (default `~/.m2/repository`). |
| `JENESIS_REPOSITORY_URI` | The module-index base URL (default `https://repo.jenesis.build/`), with the same list/filter/`@` grammar. |
| `JENESIS_REPOSITORY_TOKEN` | The `Authorization` header for module-index fetches. |

<div class="warning">
  Fetches are refused over plaintext <code>http</code> — only <code>https</code> and <code>file</code> are
  allowed. A build that must pull from an internal <code>http</code> mirror has to opt in explicitly with
  <code>-Djenesis.repository.insecure=true</code>. A credential token is dropped before any redirect to a
  different host, so it never leaks to a redirect target.
</div>

## Seeing what resolved

The `dependencies` selector prints each module's resolved tree, the way `mvn dependency:tree` does:

```bash
java build/jenesis/Project.java dependencies
```

Each node shows the version every parent requested, the **negotiated** version inline when it differs
(`[1,2] -> 2`), the scope, and the dependency's licence (`{Apache-2.0}`). A per-module *Resolved dependencies*
list and a licence summary follow the tree. It is the fastest way to answer "why is this version on my class
path?" before you pin anything.

## Version negotiation

When two paths through the graph ask for different versions of the same library, Jenesis picks one. The rule
matches the repository:

- **Maven** coordinates use Maven's own **nearest-wins** conflict resolution, and understand version ranges
  and the `LATEST`/`RELEASE` selectors — the same behaviour `mvn` gives you.
- **Module** names use **first-parent-wins**: the first requirer reached in the resolution walk fixes the
  version, and a later, deeper requirer asking for a different version is ignored.

To override the negotiated result, declare the version you want directly — a `<version>` (or a
`<dependencyManagement>` entry) in Maven, or a **pin** in a modular project (below). A declared version always
beats what negotiation would have chosen.

## Excluding a transitive (Maven only)

A Maven dependency can drag in a transitive you do not want. Prune it with an `<exclusions>` block, exactly as
in Maven — the excluded artifact never reaches the class path, tests included:

```xml
<dependency>
    <groupId>org.apache.commons</groupId>
    <artifactId>commons-text</artifactId>
    <version>1.12.0</version>
    <exclusions>
        <exclusion>
            <groupId>org.apache.commons</groupId>
            <artifactId>commons-lang3</artifactId>
        </exclusion>
    </exclusions>
</dependency>
```

There is no modular equivalent, and there is nothing to add. A module only ever sees what its
`module-info.java` `requires`, so an unwanted transitive cannot silently appear on the module path in the first
place. Exclusions are therefore a Maven-layout feature only.

## Pinning: exact versions and checksums

By default a resolved version can still drift — a `RELEASE` selector or an unpinned range resolves to whatever
is newest today. **Pinning** freezes the entire transitive closure: every dependency records both an exact
version *and* the SHA-256 checksum of the jar, in your own committed sources. A later build that resolves a jar
whose bytes do not match the recorded checksum **fails** — so the build is resistant to a supply-chain swap at
the coordinate you already trusted.

### Recording the pins

You do not write pins by hand. The `pin` selector resolves the closure, hashes each jar, and rewrites your
sources with the result:

```bash
java build/jenesis/Project.java pin
```

`pin` is opt-in — it is not part of the default `build` — and it writes back into your project tree rather than
under `target/`. In a **modular** project it adds a `@jenesis.pin` tag per dependency on the module
declaration; in a **`pom.xml`** project it fills a `<dependencyManagement>` block, tagging each entry with a
`<!--Checksum/…-->` comment. Commit the result and the pin set travels with the project.

A pin in `module-info.java` reads:

```java
/**
 * @jenesis.pin com.fasterxml.jackson.databind 2.18.2 SHA-256/8f2b...c41
 */
module demo.app {
    requires com.fasterxml.jackson.databind;
}
```

The grammar is `@jenesis.pin <group>/<repository>/<coordinate> <version> [<algorithm>/<hash>]`, with two
shorthands for a project's own dependencies (the `main` group):

| You write | Means |
| --- | --- |
| `com.fasterxml.jackson.databind` | a module name — `main/module/…` |
| `org.slf4j/slf4j-api` | a Maven `groupId/artifactId` — `main/maven/…` |
| `main/maven/org.foo/bar/jar/native` | a coordinate with a type or classifier, written in full |

A module project can therefore pin a plain Maven transitive it pulls in (say a non-modular library behind a
named module) with the `groupId/artifactId` form, even though its own dependencies resolve through the module
repository. The same `@jenesis.pin` grammar — including a `:<classifier>` qualifier and a trailing `[<guard>]`
platform guard — is covered in *Core concepts*; here it is enough that `pin` writes and refreshes these lines
for you.

<div class="tip">
  Re-run <code>pin</code> whenever you change a dependency; it refreshes the versions and checksums from the
  new closure and drops entries that no longer resolve. To record versions without checksums, pass
  <code>-Djenesis.pin.checksum=false</code>. The digest defaults to SHA-256 and is set with
  <code>-Djenesis.project.digest=&lt;algorithm&gt;</code>.
</div>

### Enforcing the pins

How strictly the recorded pins are enforced is controlled by one property,
`-Djenesis.dependency.pin`:

| `-Djenesis.dependency.pin` | Versions | Checksums |
| --- | --- | --- |
| *(unset — the default)* | honoured where pinned | verified where a pin carries one; a dependency with no checksum is allowed |
| `strict` | honoured | **required** — any third-party dependency without a pinned checksum fails the build |
| `versions` | honoured | not verified |
| `ignore` | float freely | not verified |

The default already validates every checksum you have recorded — a mismatch always fails the build. **Strict**
mode goes further and refuses to build at all until *nothing* is left unpinned, which is what you want in CI
once a project is fully pinned: run `pin`, commit, then build under `-Djenesis.dependency.pin=strict` so no new
un-vetted artifact can slip in unnoticed.

<div class="note">
  First-party artifacts built within the project are exempt from the strict checksum requirement — only
  third-party jars pulled from a repository must be pinned. So a multi-module project's own modules never need
  a checksum to satisfy strict mode.
</div>

<div class="tip">
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-26-maven-exclusions">demo-26</a> excludes a
  transitive (<code>commons-lang3</code>) from a Maven dependency and ships <strong>already pinned</strong> —
  its <code>&lt;dependencyManagement&gt;</code> holds the resolved closure with SHA-256 checksums, and the
  excluded library is absent from it. It is a runnable project — see <a href="/tool/demos/">Demos</a>.
</div>
