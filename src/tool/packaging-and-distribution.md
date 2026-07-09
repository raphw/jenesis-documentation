---
order: 10
title: Packaging & distribution
description: Turn a project into something you can ship and run - application images, jlink runtimes, bundles, launcher jars, native images - then publish it, with a shared bill of materials.
---

A plain build stops at jars. **Packaging** turns those jars into something a user can run without a Java
project in front of them: a self-contained application image, a trimmed runtime, a zip to drop onto a JRE, a
single executable jar, or an ahead-of-time-compiled native binary. **Distribution** is the last mile -
staging a correct release bundle, publishing it, and sharing pinned versions through a bill of materials.

Every packaging feature is **opt-in** and driven by convention, not a build script. You enable one by dropping
a `packaging.properties` file in the [configuration location](/tool/configuration/) - a module's
`build.jenesis/` folder (`META-INF/build.jenesis/` in a modular layout), falling back to the project-wide
directory; the first match wins, so a module-local file packages one module while a project-wide one packages
them all. Each feature you switch on wires a step into the **package phase**, the cross-module stage that runs
after every module has built. Packaging only ever runs for a module that declares a main class - the rest are
skipped.

| Key in `packaging.properties` | Produces |
| --- | --- |
| `jpackage=app-image` \| `deb` \| `rpm` \| `dmg` \| `pkg` \| `exe` \| `msi` | a self-contained application image or a native installer |
| `jlink=true` | a custom runtime image (modular only) |
| `jmod=true` | a `.jmod` module file (modular only) |
| `bundle=true` | a `bundle.zip` to drop onto a stock JRE |
| `launcher=true` | a single executable jar |
| `native=true` | a GraalVM native binary |

## Declaring the entry point

Before anything can be packaged, the build has to know which class holds `main`. In a modular project you
declare it with a `@jenesis.main` Javadoc tag on `module-info.java`:

```java
/**
 * @jenesis.release 25
 * @jenesis.main sample.Sample
 */
module demo.modular.executable {
    exports sample;
}
```

A Maven-layout project has no `module-info.java`, so its equivalent is a `<mainClass>` property in the POM:

```xml
<properties>
    <mainClass>sample.Sample</mainClass>
</properties>
```

Either way, the build records `main=sample.Sample` in the module's `module.properties`. That single field is
what every packaging step - and the [`Execute` launcher](/tool/building-and-running/) - keys off to treat the
module as runnable.

## The application image

`jpackage=app-image` produces a **self-contained application image**: a native launcher with its own bundled
Java runtime, so a user runs it without installing a JDK. It is the only jpackage type that needs no
platform-native tooling, which makes it the CI-friendly choice.

```properties
# build.jenesis/packaging.properties
jpackage=app-image
```

```bash
java build/jenesis/Project.java stage
```

The `--name`, `--main-jar`/`--main-class` (or `--module`) arguments are derived automatically from the
module's coordinate and main class. The `stage` target collects each produced image into `stage/packages/`,
the staging analogue of `stage/maven` and `stage/modular`:

```
target/stage/packages/output/demo.modular.executable/
|-- bin/demo.modular.executable   the launcher
`-- lib/                          app jars + bundled runtime
```

The image bundles the whole runtime *closure*, not just your own code - a dependency your app uses is bundled
next to the application jar. Because the image is self-contained, a deployable container needs no JDK, only a
minimal base:

```dockerfile
FROM debian:stable-slim
COPY target/stage/packages/output/demo.modular.executable /opt/app
ENTRYPOINT ["/opt/app/bin/demo.modular.executable"]
```

<div class="tip">
  jpackage links the bundled runtime from <strong>the very JDK that compiled the code and ran the tests</strong>,
  so the app ships on exactly the same JVM it was built and verified against - not whatever patch version a
  base image happens to provide.
</div>

### Modular images are smaller

How big the image is depends on the layout. A **modular** project lets jpackage run `jlink` internally and
trim the bundled runtime to just the modules the graph resolves; a **classpath** (Maven-layout) project cannot
be trimmed, so it ships a full runtime.

<div class="note">
  Measured with Temurin 25.0.3, a modular app-image is about 57&nbsp;MB against about 138&nbsp;MB for the
  classpath sibling - the gap is almost entirely the JVM. A full JDK is ~303&nbsp;MB and <code>java.base</code>
  alone links to ~60&nbsp;MB, so a modular runtime sits near that floor.
</div>

## Native installers

The other `jpackage` values build a **native installer** - the single artifact you hand a user to install,
rather than a directory to launch in place. The value is passed straight to `jpackage --type`:

| Value | Platform |
| --- | --- |
| `deb`, `rpm` | Linux |
| `exe`, `msi` | Windows |
| `dmg`, `pkg` | macOS |

An installer carries the whole bundled runtime, so it is tens of megabytes. Producing one needs the platform's
own packaging tooling on the `PATH` (Linux: `dpkg-deb`/`fakeroot` for `deb`, `rpmbuild` for `rpm`; Windows: the
WiX Toolset; macOS: the bundled `productbuild`/`hdiutil`). For that reason an installer is usually built
locally, while the tooling-free `app-image` covers the packaging path in CI.

## Runtime images and `.jmod` files

Two modular-only keys expose the lower-level artifacts that jpackage builds internally. Both need *modules*, so
a classpath project has nothing to link or pack.

`jlink=true` links a **custom runtime image** holding only the modules your app needs, staged under
`stage/runtime`. It runs straight from its own `bin/java` with no JDK installed:

```bash
target/stage/runtime/output/bin/java -m demo.modular.executable/sample.Sample Ada Lovelace
```

`jmod=true` packs the module into a **`.jmod`**, staged beside the modular jar in the module repository. Unlike
a jar, a `.jmod` can carry native libraries, commands, and config files - content `jlink` lays into the
produced runtime's `lib/`, `bin/`, and `conf/`. That is the one case where the `.jmod` form is worth more than
a jar: a config file packed into a `.jmod` rides through `jlink` into the runtime and through `jpackage` into
the shipped app, where the running program reads it back from `<java.home>/conf/`. Built from a jar instead, it
would be stranded inside the jar. All three steps chain - `jmod → jlink → jpackage` - so that extra content
flows all the way into the final image.

<div class="warning">
  <code>jlink</code> links <strong>explicit modules only</strong>. Every jar it links must carry a
  <code>module-info</code> (or be a <code>.jmod</code>); a plain, non-modular jar is rejected with "automatic
  modules cannot be used with jlink". If a dependency is not modularized, either modularize it (e.g.
  <code>jdeps --generate-module-info</code>) or keep it off the linked runtime. <code>jpackage</code>, which
  calls <code>jlink</code> under the hood, inherits the same rule.
</div>

## Bundles for a JRE base

`jpackage` bundles a runtime into every image. The lighter alternative is to ship **only your jars** onto an
off-the-shelf JRE base. `bundle=true` wires a step that writes one `bundle.zip` per runnable module:

```
bundle.zip
|-- application.properties     mainClass=sample.Sample, mainModule=demo.bundle, selfContainedModuleGraph=true
|-- modulepath/                jars that are modules (the app jar and its module dependencies)
`-- classpath/                 any non-modular (plain) jars
```

The zip carries exactly the runtime closure the `Execute` launcher would run, split the same way: real and
automatic modules under `modulepath/`, plain jars under `classpath/`. The `application.properties` describes
the launch - `mainClass` (always), `mainModule` (only for a modular launcher), and `selfContainedModuleGraph`.
Dropped onto a `-jre` base it needs no JDK and no jpackage:

```dockerfile
FROM eclipse-temurin:25-jre
COPY bundle/ /opt/app/
ENTRYPOINT ["java", "--module-path", "/opt/app/modulepath", "-m", "demo.bundle/sample.Sample"]
```

The trade against a self-contained app-image is the classic one: an app-image bundles its own trimmed runtime
(smallest and runtime-faithful per artifact, but each service duplicates the JVM), while a JRE-base bundle is
tiny and shares one content-addressed JVM layer across every image built on it - leaner in aggregate when you
run many distinct services, at the cost of coupling to that base's JVM version.

### Self-contained module graphs

The `selfContainedModuleGraph` flag reflects a rule that also governs jpackage and native images. A module
graph is **self-contained** when every jar on the module path is an explicit named module, so the launcher
resolves the whole path through the main module's `requires`. Two things break that - an **automatic module**
(a jar with an `Automatic-Module-Name` but no `module-info`, so it declares no `requires` of its own) and a
**plain jar** (turned into a filename-derived automatic module) - because a named module they use only
internally is never pulled into the graph and fails at run time with `NoClassDefFoundError`.

When the graph is not self-contained, the launcher is given `--add-modules ALL-MODULE-PATH` to root the entire
module path. jpackage adds it to the generated launcher, `native-image` adds it to the binary, and a `bundle`
records `selfContainedModuleGraph=false` so its consumer knows to add it. You never set this by hand - the
build detects it - but it explains why an app with automatic-module dependencies still resolves.

## A single executable jar

`launcher=true` produces a **single executable jar** you run with `java -jar app.jar`, without flattening
dependencies into a fat jar. The build shades the published Jenesis Launcher into the jar as its `Main-Class`
and explodes each dependency into its own `classpath/<jar>/` or `modulepath/<jar>/` subfolder. At run time the
launcher rebuilds the module graph from those subfolders in process, so `module-info`s and `META-INF/services`
never collide.

Unlike jpackage and bundle, this carries no JVM and no `jlink` runtime - it is a plain jar that runs on any
JDK 25, and unlike a bundle it needs no launch script. The shaded launcher is [pinned](/tool/dependencies/)
like any other dependency, in its own `launcher` group, so the exact bytes are verified and the build stays
reproducible.

<div class="tip">
  The launcher jar has its own section - see
  <a href="/launcher/">Jenesis Launcher</a> for how it reconstructs the module layer, the jar layout, and
  troubleshooting.
</div>

## Native images

`native=true` compiles the application ahead of time into a **single standalone native executable** with
GraalVM `native-image` - a binary that starts in milliseconds and carries no Java runtime, because the runtime
it needs is linked into the binary itself. The `stage` target collects it into `stage/native`, and you run it
directly, with no `java` in the command:

```bash
target/stage/native/output/demo.graal.image Ada
```

Native compilation needs GraalVM. The tool is located through `GRAALVM_HOME`, then the running JDK's own
`bin/`, then `PATH`, so either run the build on a GraalVM JDK or point `GRAALVM_HOME` at one:

```bash
GRAALVM_HOME=~/.sdkman/candidates/java/25.0.3-graal java build/jenesis/Project.java stage
```

### Reachability metadata, captured from tests

`native-image`'s closed-world analysis cannot see reflection, JNI, resources, or proxies, so it needs
**reachability metadata** for anything dynamic. Jenesis captures that automatically: drop a `graal.properties`
marker file in the configuration location and its presence attaches GraalVM's tracing agent to the test run.
The agent records every dynamic access the tests trigger, and the native build picks it up directly - so a
single build both captures the metadata and compiles the image, with no committed `META-INF/native-image/`
directory to maintain.

<div class="warning">
  The capture is only as complete as your tests. If a reflective path is never exercised, its metadata is
  never recorded and the binary fails at run time with <code>ClassNotFoundException</code>. You can still commit
  metadata by hand under <code>sources/META-INF/native-image/</code>, which <code>native-image</code> discovers
  inside every jar - the way to vet exactly what reflection is baked into a published artifact.
</div>

### native-image or jpackage?

Both turn a modular app into something a user runs without a JDK, but they differ in kind. **jpackage** ships
your bytecode plus a trimmed JVM - normal JVM startup, tens of megabytes, no extra build tooling.
**native-image** compiles the program *and* its runtime into machine code - near-instant startup and a small
binary, but it needs GraalVM, a slow closed-world compile, and complete reachability metadata. They are
alternatives, not a progression: reach for jpackage when you want a faithful, no-extra-tooling bundle of the
JVM you tested against, and native-image when startup latency and footprint matter more than build simplicity.

## Publishing

Publishing to Maven Central is two jobs - **produce a correct, complete bundle** and **upload it**. Jenesis
owns the first; the signed upload is deliberately left to a dedicated release tool.

The `stage` target materializes the full release tree in Maven repository layout under
`target/stage/maven/output/`: the main jar, the POM, and - when you ask for them - the `-sources.jar` and
`-javadoc.jar` that Central demands. You enable those and set the version either on the `Project` builder or
from the command line:

```bash
java -Djenesis.project.version=1.0.0 \
     -Djenesis.project.sources=true \
     -Djenesis.project.documentation=true \
     build/jenesis/Project.java stage
```

Central also requires the POM to carry `name`, `description`, `url`, `<licenses>`, `<developers>`, and
`<scm>`. Jenesis folds two channels into each POM: everything it can derive from the source (the coordinate and
description come from the module name and its Javadoc, or from the source `pom.xml`), plus a
`project.properties` file - pointed at with `-Djenesis.project.metadata=project.properties` - that carries only
what a module declaration cannot express:

```properties
# project.properties
url=https://github.com/raphw/jenesis
license.apache-2_0.name=Apache-2.0
license.apache-2_0.url=https://www.apache.org/licenses/LICENSE-2.0.txt
developer.raphw.name=Rafael Winterhalter
developer.raphw.email=rafael.wth@gmail.com
scm.connection=scm:git:https://github.com/raphw/jenesis.git
scm.url=https://github.com/raphw/jenesis
```

<div class="tip">
  A staged bundle is <strong>reproducible</strong>: jar entries carry a fixed timestamp and Javadoc is
  generated with <code>-notimestamp</code>, so two independent builds of the same sources hash bit-for-bit
  identically - a consumer can verify the bytes on Central were built from the published sources.
</div>

### From staged tree to release

Two targets take the staged bundle further:

- **`export`** is a genuine publish to a *local* repository. `java build/jenesis/Project.java export` copies
  the staged tree into your local Maven repository (and, on the modular layouts, the local Jenesis module
  repository), so a project on the same machine resolves it immediately.
- **The remote upload and GPG signing** are not Jenesis's job. Point
  **[JReleaser](https://jreleaser.org/)** at `target/stage/maven/output/` and it signs every artifact and
  uploads the bundle to Central. Jenesis stops at the unsigned, validated bundle, so credentials and signing
  keys never enter the build. Set `JRELEASER_PROJECT_VERSION` to the same value you passed as
  `jenesis.project.version` so both agree on the coordinate.

This split is deliberate. Most people building a project never release it - releasing is a rare, tightly
controlled job for CI or a hardened environment that holds the keys - and the way you release evolves
independently of how the build produces artifacts.

## A shared bill of materials

A **bill of materials (BOM)** shares a curated set of versions and checksums across modules and projects, so a
module declares only *what* it requires while the BOM says *which version* and *which bytes*. It is the
multi-module counterpart to the per-dependency [pinning](/tool/dependencies/) you already know.

A local BOM is a `bom-<name>.properties` file in the project's BOM location (by default the configuration
location). The `bom-` prefix and the dash - which can never appear in a Java module name - keep a file
reference structurally distinct from a module coordinate. Keys follow the pin token grammar minus the group:

```properties
# build.jenesis/bom-platform.properties
org.slf4j = 2.0.16
org.slf4j/slf4j-api = 2.0.16 SHA-256/a12578dde1ba00bd9b816d388a0b879928d00bab3c83c240f7013bf4196c579a
```

A module imports it with a `@jenesis.bom` tag, which mirrors `@jenesis.pin`:

```java
/**
 * @jenesis.bom bom-platform.properties
 */
module demo.bom {
    requires org.slf4j;
    exports sample;
}
```

The BOM's checksums count as pins, so a build backed by a complete BOM passes `-Djenesis.dependency.pin=strict`
without a single `@jenesis.pin` tag. Precedence is strictly local-first: an explicit `@jenesis.pin` always
overrides a BOM entry, and when two BOMs pin the same coordinate the first declared wins. You can also point
`@jenesis.bom` at a **repository BOM** published at a module's standard versioned path, fetched by version and
content-verified.

### Emitting a BOM

A module can also *publish* a BOM of its own resolved closure. A `bom.properties` build-configuration file (it
may be empty - presence is the switch, mirroring how `packaging.properties` gates `jpackage`) makes the modular
layouts emit the closure as a properties file, which `export` stages into the local Jenesis repository beside
the module jar:

```
~/.jenesis/demo.bom/1-SNAPSHOT/demo.bom.properties
```

Another project then consumes it with `@jenesis.bom demo.bom`, exactly the way this one consumes a hand-written
file. The `pin` target is BOM-aware too: by default it writes no `@jenesis.pin` for a coordinate a BOM already
supplies, and it pins versioned repository BOM references by content.

<div class="tip">
  Seven runnable projects cover this chapter:
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-05-java-pom-executable">demo-05</a> and
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-06-java-modular-executable">demo-06</a> ship
  jpackage app-images and native installers (classpath and modular),
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-07-bundle">demo-07</a> a JRE-base bundle,
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-32-custom-jmod">demo-32</a> a custom
  <code>.jmod</code> linked through jlink into a jpackage image,
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-41-native-image">demo-41</a> a GraalVM native
  image end to end,
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-40-publishing">demo-40</a> a Central-ready
  release bundle, and
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-43-bom">demo-43</a> a shared BOM. See
  <a href="/tool/demos/">Demos</a>.
</div>
