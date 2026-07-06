---
order: 2
title: Getting started
description: Install Jenesis, build an example project end to end, and take a first tour of the Project.java model.
---

This chapter takes you from nothing to a built project. You install Jenesis, run the canonical build
command against a bundled example, read what it printed, and then meet the `Project.java` file that every
build runs through. Everything later in this section assumes only what is here.

## Prerequisites

Jenesis needs **a JDK, version 25 or newer, and nothing else** — no daemon, no wrapper, no plugin tree to
download. A build is an ordinary Java program that the JDK launches directly, so if `java --version` reports
25 or above, you are ready.

```bash
java --version
```

## Installing

A Jenesis build lives *with* your project: its engine ships as plain Java source under `build/jenesis/`, and
you launch it with the JVM's single-file source mode. Installing is really just populating that
`build/jenesis/` folder. There are three equivalent ways to do it — all land at the same on-disk state, so
the canonical `java build/jenesis/Project.java` command works identically afterwards. Pick by how you prefer
to manage versions.

### SDKMAN (recommended)

Best when you would rather manage the tool version globally than vendor its sources into every project.
Install once, then initialise each project from the installed SDK:

```bash
sdk install jenesis
jenesis-init                       # run from your project root
java build/jenesis/Project.java    # or just 'jenesis', equivalent
```

`jenesis-init` writes `build/jenesis/` into the current directory (pass one or more paths to initialise
several projects at once). Once the SDK is installed you also get a `jenesis` command that is a thin
launcher around the same engine: `jenesis +sources` is exactly `java build/jenesis/Project.java +sources`
run from a project root.

<div class="tip">
  You can skip embedding entirely and run <code>jenesis</code> from a project root with no
  <code>build/jenesis/</code> at all — the SDK's own copy builds the current directory. That is handy for a
  quick trial or for building an untrusted project while keeping Jenesis itself the trusted, SDK-installed
  copy. In that mode you can only tune the build through system properties, not custom build code.
</div>

The SDK also ships companion scripts: `jenesis-version` and `jenesis-validate` check that a project's
embedded `build/jenesis/` matches the installed version, and `jenesis-switch` moves the current shell to the
version a project records.

### curl bootstrap

Fastest, with no prerequisite beyond a JDK and `curl`. Run from your project root:

```bash
curl -fsSL https://get.jenesis.build | bash
java build/jenesis/Project.java
```

Set `JENESIS_VERSION=X.Y.Z` to pin a release, or pass a git ref to install an arbitrary tag, commit, or
branch: `curl -fsSL https://get.jenesis.build | bash -s -- main`.

### Git submodule

Most explicit, and the most reproducible: the pinned submodule commit is the anchor, so a fresh clone plus
`git submodule update --init` is the entire setup, with no separate install step.

```bash
git submodule add https://github.com/raphw/jenesis.git .jenesis
ln -s ../.jenesis/sources/build/jenesis build/jenesis
java build/jenesis/Project.java
```

On a platform without symlinks, replace the `ln -s` with `cp -r .jenesis/sources/build/jenesis
build/jenesis` and refresh the copy after each submodule update.

## Building an example end to end

The Jenesis repository ships a runnable example for every feature under `demo/`. Clone it and build the
simplest one — a single-module Java project in the classic Maven layout:

```bash
git clone https://github.com/raphw/jenesis.git
cd jenesis/demo/demo-01-java-pom
java build/jenesis/Project.java
```

There is no build script to write. The project is just a `pom.xml` and a source file that uses Apache
Commons Lang. Pointed at that directory, Jenesis:

1. **auto-detects the layout** — a `pom.xml` at the root selects the `MAVEN` layout;
2. **resolves and downloads** the declared `commons-lang3` dependency from Maven Central (or your local
   `~/.m2`);
3. **compiles** the sources against it with the JDK's `javac`; and
4. **packages** a jar under `target/`.

Because every step is content-hashed, the first run does the work and a second run reuses it — nothing
recompiles until an input actually changes.

### Reading what it resolved

To see exactly what the build pulled in, ask for the dependency graph instead of a build. Run the
`dependencies` selector:

```bash
java build/jenesis/Project.java dependencies
```

```
main/compile (module)
maven/org.apache.commons/commons-lang3 3.14.0 [compile] (module org.apache.commons.lang3) {Apache-2.0}
```

Each line shows the resolution key, the resolved version, the Maven scope, the resolved **Java module name**,
and the declared **licence** — Jenesis reads a real module graph, not a flat class path. The `commons-lang3`
version here is fixed to an exact release and content checksum, because this demo ships *pinned*;
dependencies and pinning have their own chapter later.

<div class="tip">
  Want the same project in a modular shape, or spread across several modules? The four foundational
  layouts — Java with a <code>pom.xml</code>, Java as a real <code>module-info.java</code> module, and the
  multi-module version of each — are <a href="/tool/demos/">demo-01 through demo-04</a>. Start there and
  read each demo's own README alongside these chapters.
</div>

## The Project.java model

Everything you ran above went through one file: `build/jenesis/Project.java`. It is a normal Java source
file, and `Project` itself is a small Java **record** — so a build is configured as code, not markup. You
almost never edit it; instead you either flip system properties on the command line or, for code-level
control, write a tiny launcher of your own next to it (covered in *Extending the build*).

Four fields carry the knobs you reach for first. Each has a `jenesis.project.*` system property that sets it
before the build starts, and a matching in-code method (a "wither") for a custom launcher.

| Field | Property | Default | What it is |
| --- | --- | --- | --- |
| `root` | `jenesis.project.root` | `.` | The directory Jenesis scans for `module-info.java` / `pom.xml`. |
| `target` | `jenesis.project.target` | `target` | Where every build output is written. Safe to delete for a clean build. |
| `layout` | `jenesis.project.layout` | `auto` | How the project is shaped and how dependencies resolve. |
| `defaultTarget` | *(none)* | `build` | What runs when you pass no selector. |

A property always comes **before** the source file on the command line — anything after it is read as a
selector:

```bash
java -Djenesis.test.skip=true \
     -Djenesis.project.layout=maven \
     build/jenesis/Project.java
```

### Layout: how your project is shaped

`layout` is `auto` by default, which inspects the root and picks:

- **`maven`** — a `pom.xml` at the root. Jenesis reads the declarative parts of the POM (coordinates,
  dependencies, source folders) and builds one module per POM.
- **`modular_to_maven`** — a `module-info.java` and no root `pom.xml`. Jenesis builds real Java modules but
  also emits a generated `pom.xml`, so each artifact stays Maven-publishable. This is what `auto` resolves
  to for a modular project.
- **`modular`** — the same, but resolving dependencies purely by Java module name and emitting no `pom.xml`
  at all. It is opt-in (`-Djenesis.project.layout=modular`), for artifacts consumed only as Java modules.

### Selectors: choosing what to run

Positional arguments after the source file are **selectors** — they choose what part of the build to run.
With none, `Project` runs its `defaultTarget`, which out of the box is `build`: compile, test, and package
every discovered module. The other targets the shipped layouts register:

| Selector | What it does |
| --- | --- |
| `build` | Compile, test, and jar every module *(the default)*. |
| `stage` | The full release recipe — build, then lay out a publishable tree under `target/stage/`. |
| `export` | Publish the staged tree into your local Maven / module repository. |
| `pin` | Rewrite every `pom.xml` / `module-info.java` to pin the full resolved dependency closure. |
| `dependencies` | Print each module's resolved dependency graph with licences (shown above). |
| `ide` | Generate IntelliJ IDEA, VS Code, and Eclipse project metadata. |
| `help` | Print the usage screen. |

A `+<module>` selector builds just one module's subtree — `+greeter` builds the `greeter` module and
whatever it depends on, without touching unrelated siblings. Selectors and the build graph they walk are the
subject of the next chapter.

<div class="note">
  Under the hood a build is a graph of <strong>steps</strong> — each takes input folders and produces a
  fresh output folder — and a selector names a point in that graph. You do not need the full mechanics yet;
  <strong>Core concepts</strong> introduces build steps, the build graph, and layouts in depth.
</div>
