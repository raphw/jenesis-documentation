---
order: 14
title: Reference
description: A lookup for the command line — targets and selectors — a grouped table of every configuration key with its default, and the built-in steps a selector can name.
---

The earlier chapters built up Jenesis one topic at a time. This one is the flat reference you come back to:
how to invoke the build, the target and selector grammar, every `jenesis.*` configuration key with its
default, and the vocabulary of built-in steps a selector can name. Each entry links to the chapter that
explains it in full.

## Invoking the build

Every project ships its build as source under `build/jenesis/Project.java`. The canonical invocation
recompiles that engine and runs it:

```bash
java build/jenesis/Project.java [selectors…]
```

Three faster launch forms produce the same result — see *[Getting started](/tool/getting-started/)* and
*[Build performance &amp; isolation](/tool/build-performance-and-isolation/)*:

| Form | Invocation | Notes |
| --- | --- | --- |
| Source | `java build/jenesis/Project.java` | The canonical form; recompiles the engine each run. |
| Compiled | `java -cp .jenesis/launcher build.jenesis.Project` | Skips the recompile once the engine is cached. |
| SDKMAN | `jenesis` | The wrapper installed by `sdk install jenesis`, equivalent to the source form. |
| Native | `./jenesis` | A precompiled native launcher, the fastest start-up. |

<div class="note">
  How the JDK tool steps launch is set by <code>-Djenesis.process.factory=tool|fork</code>:
  <code>tool</code> (the default) runs <code>javac</code>/<code>jar</code> in-process; <code>fork</code> runs
  them as separate processes for stricter sandboxes. A GraalVM native image defaults to <code>fork</code>,
  since it has no in-process JDK tools.
</div>

## Targets

Positional arguments are **selectors**. With none, the build runs its **default target**, `build`, which
compiles and packages every module. `Project.defaultTarget(...)` changes the default (there is no matching
property). The top-level targets the shipped layouts register:

| Target | What it runs |
| --- | --- |
| `build` | Compile, check, test, and package every module (the default). |
| `stage` | Materialise the release tree under `target/stage/…` (see *[Packaging &amp; distribution](/tool/packaging-and-distribution/)*). |
| `export` | Publish the staged tree — into the local Maven repository (`maven`), the local module repository (`modular`), or both. |
| `pin` | Rewrite every `pom.xml` / `module-info.java` so the transitive closure is pinned at source (see *[Dependencies](/tool/dependencies/)*). |
| `dependencies` | Print each module's resolved dependency graph with licences. |
| `ide` | Generate IntelliJ IDEA, VS Code, and Eclipse project metadata at the project root. |
| `help` | Print the human usage screen. |
| `skill` | Print an agent-oriented briefing of the same material. |
| `metadata` | Refresh the metadata module outputs without building artifacts. |

## Selectors

A selector picks part of the build graph. Three shapes exist.

**Module selectors** start with `+`: the active layout rewrites `+<name>` into that module's path, so one
module builds without dragging in its siblings. `+` alone names the multi-module root (the Maven root POM);
a pure modular project has no such root.

```bash
java build/jenesis/Project.java +mymodule      # build just this module's subgraph
```

**Path selectors** are a slash-delimited path of `module/step` identities matched against the graph, with two
wildcards:

- `:` matches a single segment — `build/:/test` matches the `test` step of every direct child of `build`.
- `::` matches any depth — `::/sign` matches every `sign` step anywhere in the tree.

Wildcards are **lenient**: a branch that fails to match is silently skipped. A **literal** path that does not
resolve throws `Unknown selector: …`. Once a step is matched, its predecessors run unconditionally, so its
inputs are always real folders.

| Invocation | What runs |
| --- | --- |
| `java build/jenesis/Project.java` | The whole graph. On a warm cache, every step is `[SKIPPED]`. |
| `java build/jenesis/Project.java ::/test` | Every `test` step at any depth, plus its predecessors. |
| `java build/jenesis/Project.java build/::/test` | The same, anchored under the top-level `build` module. |
| `java build/jenesis/Project.java +mymodule` | Only the named module's subgraph. |

<div class="tip">
  Selectors are not part of the cache key — they only gate scheduling. A step run under a selector produces
  the same cached output a full build would, so a later unselected run hits the cache. See
  <em><a href="/tool/core-concepts/">Core concepts</a></em> for how change detection works.
</div>

## Configuration keys

Every knob is a system property, passed with `-D` or set in a `jenesis.properties` file — see
*[Configuration](/tool/configuration/)* for files, profiles, and precedence. Some also read an environment
variable as a fallback. Defaults apply when the key is unset.

### Project & layout

| Key | Default | Effect |
| --- | --- | --- |
| `jenesis.project.layout` | `auto` | The layout: `auto`, `maven`, `modular`, `modular_to_maven`. |
| `jenesis.project.root` | `.` | The directory scanned for `module-info.java` / `pom.xml`. Command-line only. |
| `jenesis.project.target` | `target` | The per-build output folder. Safe to delete for a clean build. |
| `jenesis.project.version` | *(unset)* | Stamps this version onto every artifact the build produces. |
| `jenesis.project.metadata` | *(unset)* | Path to a project-level POM metadata override file (conventionally `project.properties`). |
| `jenesis.project.sources` | `false` | Also assemble a per-module sources jar. |
| `jenesis.project.documentation` | `false` | Also assemble a per-module javadoc jar. |
| `jenesis.project.watch` | `false` | Keep the process alive and rebuild on every source change (see *[Building &amp; running](/tool/building-and-running/)*). |
| `jenesis.project.properties` | *(unset)* | Comma-separated **profile** names to activate. |
| `jenesis.project.global` | `$HOME` | Folder holding the user-global `jenesis.properties`; empty string disables it. |
| `jenesis.project.configuration` | `build.jenesis/` | Path-separated project-wide configuration directories. |
| `jenesis.project.boms` | *(unset)* | Path-separated list of imported BOM files. |
| `jenesis.project.artifacts` | `.jenesis/artifacts` | The module-jar artifact cache (the `modular` layout only). |

### Building & testing

| Key | Default | Effect |
| --- | --- | --- |
| `jenesis.test.skip` | *(off)* | Register no test steps, so no tests run. |
| `jenesis.test.filter` | *(unset)* | Comma-separated `<classRegex>[#<method>]` list; runs only matching tests. |
| `jenesis.test.tag` | *(unset)* | Comma-separated test tags / groups to include. |
| `jenesis.test.engine` | *(auto)* | Force the engine: `junit-platform`, `junit4`, or `testng`. |
| `jenesis.test.parallel` | `false` | Run tests in parallel where the framework supports it. |
| `jenesis.test.reporting` | `false` | Emit Open Test Reporting XML under `reports/tests/`. |
| `jenesis.test.incremental` | *(off)* | Run only the tests a change can reach; the value names the digest algorithm. |
| `jenesis.stage.tests` | `false` | Include test-variant artifacts when staging. |
| `jenesis.sbom.cyclonedx` | `true` | Emit a CycloneDX SBOM; set `false` to skip it. |
| `jenesis.compliance` | `true` | Run the licence and vulnerability checks; `false` skips both. |
| `jenesis.source.<tool>` | `true` | Per-linter switch (`checkstyle`, `pmd`, `detekt`, `ktlint`, `scalastyle`, `codenarc`). |
| `jenesis.validator.spotbugs` | `true` | Run SpotBugs when its filter file is present. |
| `jenesis.format.java` / `.ktlint` / `.scalafmt` | `true` | Per-formatter switch. |
| `jenesis.format.rewrite` | `false` | Rewrite sources in place instead of verifying. |
| `jenesis.observe.jacoco` | `true` | Run JaCoCo coverage when its file is present. |
| `jenesis.observe.native` | `true` | Run the GraalVM tracing agent when its file is present. |
| `jenesis.mutate.pitest` | `true` | Run PiTest mutation testing when its file is present. |

The quality and packaging *files* these keys gate (`checkstyle.xml`, `packaging.properties`, and the like)
are covered in *[Code quality &amp; testing](/tool/code-quality-and-testing/)*, *[Supply-chain
features](/tool/supply-chain/)*, and *[Packaging &amp; distribution](/tool/packaging-and-distribution/)*.

### Dependencies & pinning

| Key | Default | Effect |
| --- | --- | --- |
| `jenesis.dependency.pin` | *(lenient)* | Pinning mode: `strict`, `versions`, or `ignore`. |
| `jenesis.pin.bom` | `keep` | Whether the `pin` step keeps (`keep`) or flattens (`flatten`) BOM references. |
| `jenesis.pin.checksum` | `true` | Whether `pin` writes SHA checksums alongside versions. |
| `jenesis.platform.<token>` | *(detected)* | Add (`=true`) or remove (`=false`) a platform token used to select guarded pins. |
| `jenesis.project.digest` | `SHA-256` | Digest algorithm the `pin` step uses to checksum artifacts. |

### Repositories

| Key (env fallback) | Default | Effect |
| --- | --- | --- |
| `jenesis.maven.uri` (`MAVEN_REPOSITORY_URI`) | Maven Central | Upstream Maven repository URL(s); supports filters and references. |
| `jenesis.maven.local` (`MAVEN_REPOSITORY_LOCAL`) | `~/.m2/repository` | Local Maven repository for reads and `export`. |
| `jenesis.maven.token` (`MAVEN_REPOSITORY_TOKEN`) | *(unset)* | `Authorization` header sent to the Maven upstream. |
| `jenesis.module.uri` (`JENESIS_REPOSITORY_URI`) | `repo.jenesis.build` | Upstream module repository URL(s). |
| `jenesis.module.local` (`JENESIS_REPOSITORY_LOCAL`) | `~/.jenesis` | Local module repository for reads and `export`. |
| `jenesis.module.token` (`JENESIS_REPOSITORY_TOKEN`) | *(unset)* | `Authorization` header sent to the module upstream. |
| `jenesis.repository.insecure` | `false` | Permit plaintext (`http://`) fetches. |
| `jenesis.repository.retries` | `2` | Retries for a transient fetch failure (`0` disables). |
| `jenesis.repository.backoff` | `125` | Initial retry wait in milliseconds, doubling each attempt. |

### Caching

| Key (env fallback) | Default | Effect |
| --- | --- | --- |
| `jenesis.cache.uri` | *(none)* | Shared build cache: a `file://` or `http(s)://` URI (see *[Build performance &amp; isolation](/tool/build-performance-and-isolation/)*). |
| `jenesis.project.cache` | *(off)* | Project-local on-disk build cache (a path; empty enables `.jenesis/cache`). |
| `jenesis.cache.project` (`JENESIS_CACHE_PROJECT`) | *(unset)* | Project header sent to an HTTP cache. |
| `jenesis.cache.key` (`JENESIS_CACHE_KEY`) | *(unset)* | Auth key sent to an HTTP cache. |
| `jenesis.cache.timeout` | `PT1S` | HTTP cache connect timeout. |
| `jenesis.cache.insecure` | `false` | Permit the cache key over plaintext `http://`. |

### Running & containers

| Key | Default | Effect |
| --- | --- | --- |
| `jenesis.execute.module` | *(prompt)* | The module to run with `Execute.java`. |
| `jenesis.execute.mainClass` | *(inferred)* | The main class to run. |
| `jenesis.project.docker` | `false` | Build inside a throwaway container. |
| `jenesis.project.docker.image` | *(hardened)* | Image for the build container. |
| `jenesis.project.docker.mount` | *(none)* | `<host>[:<container>],…` read-only bind mounts. |
| `jenesis.project.docker.mountWritable` | *(none)* | Writable bind mounts. |
| `jenesis.project.docker.env` | *(none)* | `<name>[=<value>],…` environment forwarded into the container. |
| `jenesis.execute.docker` | `false` | Run the launched program in a container. |
| `jenesis.execute.docker.image` / `.mount` / `.env` | *(as above)* | The run-side equivalents. |

### Output & the execution engine

| Key | Default | Effect |
| --- | --- | --- |
| `jenesis.print.progress` | `true` | Per-step `[STARTED]`/`[SKIPPED]`/… lines; `false` runs silently. |
| `jenesis.print.docker` | `true` | Print the Docker image a step is wrapped in. |
| `jenesis.print.command` | `false` | Print each external tool's command line. |
| `jenesis.print.process` | `false` | Stream every external tool's output; `jenesis.print.<command>` targets one tool. |
| `jenesis.print.tests` | `false` | Stream the test JVM's command and output. |
| `jenesis.print.fetch` | `false` | Print a `[FETCHED]` line per downloaded artifact. |
| `jenesis.print.cache` | `false` | Print `[LOADED]`/`[STORED]` lines for the shared cache. |
| `jenesis.print.checksum` | `false` | Append input/output checksums under each `[EXECUTED]` line. |
| `jenesis.executor.digest` | `MD5` | Digest for the per-file content and per-step config hashes. |
| `jenesis.executor.timeout` | `PT0S` | ISO-8601 per-step timeout; `PT0S` disables it. |
| `jenesis.executor.rebuild` | `false` | Delete `target/` first, forcing a full rebuild. |
| `jenesis.process.factory` | `tool` | How JDK tool steps launch: `tool` (in-process) or `fork`. |
| `JAVA_HOME` (env) | *(from `java.home`)* | Locates the JDK binaries when the runtime is not a JDK. |

## Built-in steps

A selector names a **step** by its identity. The build is a tree of these; the identities below are the ones
you address on the command line. Each produces one output folder from its inputs, and its full behaviour is
in the linked chapter.

### Per module

| Step | Produces |
| --- | --- |
| `compiled` | Compiled classes from sources and the compile classpath (`javac`, or a language compiler). |
| `classes` | The version-stamped classes exposed to downstream consumers. |
| `artifacts` | The packaged jar. |
| `check` | Static-analysis findings (Checkstyle, PMD, detekt, …). |
| `format` | Formatting verification, or an in-place rewrite. |
| `binary` | Byte-code analysis (SpotBugs). |
| `dependencies` | The resolved, fetched dependency closure. |
| `test` (`executed`) | The test run and its reports. |
| `observed` | The coverage- or trace-wrapped test run. |
| `mutate` | The mutation-testing report (PiTest). |
| `compliance` | The licence and vulnerability check results. |
| `sbom` | The CycloneDX bill of materials. |
| `documentation` | The javadoc (or Dokka) output and its jar. |
| `pom` | The emitted `pom.xml`. |

### Packaging

Wired by keys in `packaging.properties` — see *[Packaging &amp; distribution](/tool/packaging-and-distribution/)*.

| Step | Produces |
| --- | --- |
| `jmod` | A `.jmod` link-time module. |
| `jlink` | A custom runtime image. |
| `jpackage` | A native installer or self-contained app image. |
| `bundle` | A self-contained `bundle.zip` of the application. |
| `launcher` | A single executable launcher jar (see *[Launcher](/launcher/)*). |
| `native-image` | A GraalVM native executable. |

### Top level

The `build`, `stage`, `export`, and `pin` modules are the top-level targets in the table above; each layout
wires the `maven` and/or `modular` staging and export sub-steps under them.

<div class="tip">
  Every feature named here has a runnable example. Browse the full set on the
  <a href="/tool/demos/">Demos</a> page.
</div>
