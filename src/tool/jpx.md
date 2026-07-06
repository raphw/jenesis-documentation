---
order: 13
title: jpx
description: Run an already-published module or Maven artifact with one command - jpx resolves its dependency closure, installs it once, and launches its main entry point.
---

`Execute.java` builds and runs *your* project. **jpx** runs someone else's: point it at a published module
or Maven artifact and it resolves the dependency closure, installs it once under your home directory, and
launches the main entry point. It is `npx` for the module path - a way to run a released tool without
cloning, building, or writing a class path by hand.

```bash
java build/jenesis/Jpx.java org.junit.platform.console --version
```

That resolves the JUnit console launcher and its dependencies, installs them, and runs the tool - passing
`--version` straight through to the launched program.

<div class="tip">
  Once you have installed Jenesis through SDKMAN (see <a href="/tool/getting-started/">Getting started</a>),
  jpx is also on your <code>PATH</code> as a plain <code>jpx</code> command - <code>jpx
  org.junit.platform.console --version</code> is the same thing without the <code>java
  build/jenesis/Jpx.java</code> prefix. The examples below use the <code>jpx</code> form.
</div>

## The target grammar

The first argument names what to run. Its full form is:

```
<name>[@<version>][/<main-class>]
```

Only the name is required. The three parts each answer one question: *what*, *which version*, and *which
entry point*.

### The name - module or Maven coordinate

The name is resolved one of two ways, and jpx tells them apart by a single rule: **a module name can never
contain a colon.**

- **A Java module name** - e.g. `org.junit.platform.console`. jpx discovers its Maven coordinates as a POM
  through [repo.jenesis.build](/modules/) and reads the dependency graph from Maven metadata, exactly as the
  `modular_to_maven` layout does when it resolves a `requires` name.
- **A `<groupId>:<artifactId>` pair** - e.g. `org.apache.commons:commons-lang3`. The colon marks it as Maven
  coordinates, resolved directly.

```bash
jpx org.junit.platform.console            # by module name
jpx org.junit.platform:junit-platform-console  # by Maven coordinate
```

### The version - which release

Append `@<version>` to pin a release:

```bash
jpx org.junit.platform.console@1.11.0
```

Without a version, jpx prefers the **most recently installed** version of that target; failing that, it
resolves the **latest release**. So the first run pulls the current release and later runs reuse it until you
ask for a newer one.

### The main class - which entry point

By default jpx launches the jar's **module main class** or its `Main-Class` manifest attribute. Append
`/<main-class>` to choose a different entry point:

```bash
jpx com.example.tool/com.example.tool.alt.Cli
```

This works exactly like `java -m <module>/<main-class>`, which also means a jar that declares **no** entry
point at all is still runnable - just name the class yourself.

## Options

The remaining flags mirror the rest of the tool.

| Flag | What it does |
| --- | --- |
| `--modular` | Resolve purely over module descriptors, walking `requires` clauses like the `modular` layout - every module must be explicitly named. |
| `--docker[=<image>]` | Run the launched process in a container while resolution and installation stay on the host. |
| `--hash=<prefix>` | Verify the installed jars against a known digest before launching (see below). |

### Running in a container

`--docker` isolates only the launched program, not the resolution and installation, which stay on the host:

```bash
jpx --docker org.junit.platform.console --version
```

The installation folder and the host's Java home are mounted **read-only**, so the containerized run needs no
network and no credentials of its own. Pass `--docker=<image>` to choose the image; with none, a minimal
hardened image is used. This is the same launch-side isolation that `Execute.java` offers for your own
project - see *[Build performance & isolation](/tool/build-performance-and-isolation/)*.

### Verifying the installation

`--hash=<prefix>` re-checks the installed jars against a digest you already trust, before every launch:

```bash
jpx --hash=3f9a1c… org.junit.platform.console --version
```

The prefix must be **at least 32 hex characters** of the target's SHA-256 digest (see below). A mismatch aborts
the launch, catching both a tampered download and a tampered installation on disk.

## Where installs live

Each resolved target installs to:

```
~/.jenesis/jpx/<name>@<version>/
```

The folder holds the closure's jars in one flat directory beside a `jpx.properties` descriptor that records
the module path, the class path, the entry point, and a deterministic **SHA-256 digest over all the jars** -
the same digest `--hash` checks against.

The descriptor is written **last**, on purpose: a download that crashes mid-way leaves no descriptor, so jpx
recognizes the install as incomplete and redoes it rather than launching a half-populated folder. Two
processes installing the same target coordinate through a **file lock**, so concurrent `jpx` invocations do
not collide.

## Usage

Running `jpx` with no arguments - or with `--help` - prints the usage screen:

```bash
jpx --help
```
