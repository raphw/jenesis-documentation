---
order: 3
title: Core concepts
description: Build steps, the build graph, the four layouts, the module-system specifics, and how Jenesis decides what to rebuild.
---

*Getting started* ran a build and toured `Project.java`. This chapter opens the box: what a build actually
*is*, how Jenesis shapes your project into one, the module-system details it handles for you, and the rule
that decides — on every run — what recompiles and what is reused. Everything here is machinery you rely on
rather than write; the chapters after this one put it to work.

## A build is a graph of steps

Under the hood a Jenesis build is nothing more than a **graph of steps**. Each step takes one or more input
folders and produces one fresh output folder; a step downstream reads the folders its predecessors produced.
Compiling, packaging a jar, generating docs, resolving dependencies — each is a step, and the edges between
them are "this step's output is that step's input".

That is the whole model. There is no phase lifecycle to memorise and no plugin to bind into it: a build is
just steps wired to steps, and the engine walks them in dependency order.

### The build step

A single step is a **pure function of its input folders**. It reads files at well-known paths inside each
input — `sources/` for Java sources, `classes/` for compiled output, `artifacts/` for produced jars — and
writes its own output into one new folder. It never edits an input in place and never reaches outside the
folders it was handed.

Those folder names are conventions the built-in steps share, so steps compose without knowing how they were
wired together. A `Javac` step, for example, reads each predecessor's `sources/` and writes `classes/`; a
`Jar` step then reads `classes/` and writes `artifacts/classes.jar`. You will meet the individual steps in
later chapters — here the point is only their shape: **folders in, a fresh folder out.**

<div class="note">
  Because every step writes a <em>new</em> output folder rather than mutating its inputs, the whole build tree
  is reproducible and safe to cache — the property the incremental engine at the end of this chapter is built
  on.
</div>

### The build graph and modules

Real projects have more than one line of steps, so the graph is organised into **modules**. A module is a
named subgraph — typically one compilable unit: its compile, test, jar, and documentation steps grouped under
one name. A multi-module project is a graph of these subgraphs, and Jenesis builds them in dependency order,
so a library module is built before the application module that depends on it.

The engine that owns and walks the graph is the **build executor**. It collects every registered step and
module, works out the order from their declared inputs, and runs each one — reusing a cached output when it
can (the last section of this chapter). The same executor drives one level of the graph and each nested
module, so a build of one module and a build of fifty are the same machinery at different scales.

### Selectors: choosing what to run

*Getting started* showed that a positional argument after `Project.java` is a **selector**, and that with none
the default target (`build`) runs. A selector is really a path through the graph. Two things make that precise:

- A `+<module>` selector builds one module's subtree. `+greeter` builds the `greeter` module and whatever it
  depends on, and nothing unrelated. In a modular project the tests live in a separate `@jenesis.test` module,
  so `+greeter` runs *no* tests — you select the test module itself with `+greeter-test`.
- Under the hood every selector is a slash-delimited path of `module/step` identities, with two wildcards:
  `:` matches a single path segment, and `::` matches any depth. So `::/jar` runs the `jar` step of every
  module wherever it sits in the tree.

```bash
java build/jenesis/Project.java +greeter        # one module's subtree
java build/jenesis/Project.java '::/test'        # the test step of every module
```

Wildcards are **lenient**: a branch that does not match is silently skipped. A *literal* path that does not
resolve fails the build with `Unknown selector: …`, so a typo in a name you spelled out is caught rather than
quietly doing nothing. Prefer literal paths when you know them.

## Layouts: how your project is shaped

A **layout** is what turns *your* directory of sources into that graph. It decides how modules are discovered,
how their dependencies resolve, and what artifacts come out. You met it as the `layout` field; here are the
four values in full.

`auto` (the default) inspects the project root and picks one of the concrete layouts for you:

| Layout | Input | Dependency resolution | Output |
| --- | --- | --- | --- |
| `maven` | a root `pom.xml` | Maven coordinates, from the POM | classic jar **+ `pom.xml`** |
| `modular_to_maven` | a `module-info.java`, no root `pom.xml` | each `requires` translated to a Maven coordinate | modular jar **+ generated `pom.xml`** |
| `modular` | a `module-info.java` (opt-in only) | purely by Java module name | modular jar, **no `pom.xml`** |

`auto` resolves to `maven` when it finds a root `pom.xml`, and otherwise to `modular_to_maven` when it finds a
`module-info.java`. It never chooses `modular` for you — you ask for it explicitly.

### maven vs. the two modular layouts

`maven` is the classic path: Jenesis reads the declarative parts of your `pom.xml` (coordinates, dependencies,
source folders) and builds one module per POM, emitting an ordinary jar plus its POM.

The two modular layouts both take a `module-info.java` and both produce a genuine modular jar. They differ in
how a `requires` is satisfied:

- **`modular_to_maven`** translates each `requires` into the declaring module's **Maven coordinate**, then
  resolves the transitive closure through Maven — nearest-wins versions and Maven scopes, exactly as if your
  project had listed those coordinates in a `pom.xml`. It emits the modular jar **plus a generated `pom.xml`**,
  so the artifact is publishable to Maven Central and consumable by Maven projects. Because it reaches
  dependencies by coordinate, it can also pull in plain-classpath and *automatic*-module libraries.
- **`modular`** resolves dependencies **purely by Java module name** against the Jenesis module repository, with
  no Maven coordinates anywhere, and emits **only the modular jar — no `pom.xml`**. Every dependency resolved
  this way is a named module, so the closure is provably consumable on the module path.

The trade-off is what makes `modular` opt-in: resolving by module name restricts you to libraries published as
proper **named** modules. A library that ships only as an *automatic* module (a plain jar whose module name is
inferred from its filename or `Automatic-Module-Name`) has no stable name to resolve against, so it cannot be
`requires`d under `modular` — though it works fine under `modular_to_maven`, which reaches it by coordinate.
That is exactly why `auto` never selects `modular` for you.

<div class="tip">
  Reach for <code>modular</code> when your artifacts are only ever consumed as Java modules and you want a
  build that is provably module-path-clean and free of Maven. Keep the default <code>modular_to_maven</code>
  when you also want a <code>pom.xml</code> — to publish to Maven Central, or to depend on libraries available
  only as Maven coordinates or automatic modules.
</div>

You can force a layout for one run with a system property, or record it in a project file (covered in
*Configuration*):

```bash
java -Djenesis.project.layout=modular build/jenesis/Project.java
```

The property accepts `auto`, `maven`, `modular`, and `modular_to_maven`.

### Seeing the difference

The `dependencies` selector prints each module's resolved graph, and it makes the layout choice concrete. The
same `requires org.slf4j` shows up two ways. Under `modular` it is a Java module name resolved from the module
repository:

```
main/compile (module-sources)
module/org.slf4j 2.0.16 (module org.slf4j)
```

Under `modular_to_maven` it is translated to a Maven coordinate and resolved through Maven, so it carries a
Maven scope and expands the full nearest-wins Maven closure:

```
main/compile (module-sources)
maven/org.slf4j/slf4j-api 2.0.16 [compile] (module org.slf4j)
```

## Module-system specifics

Because Jenesis carries a real module graph rather than a flattened class path, it understands several
module-system features directly. You enable each with a small marker in source; the build does the rest.

### Multi-release jars

One jar can carry different bytecode for different Java versions, and the JVM loads the copy matching its own
version at launch. Jenesis builds this from a source convention: anything under
`sources/META-INF/versions/<N>/` is a **version overlay**, compiled in its own pass with `--release <N>` and
written to `META-INF/versions/<N>/` inside the jar. When an overlay is produced, the jar's manifest is marked
`Multi-Release: true` — the flag that tells the JVM to consult the versioned directory.

```
sources/
├── module-info.java                           @jenesis.release 21
├── sample/Platform.java                        the Java 21 baseline
└── META-INF/versions/25/sample/Platform.java   the Java 25 override
```

Here the `@jenesis.release 21` tag pins the main compile to Java 21, and the overlay class is compiled a second
time at release 25. The resulting jar runs the baseline on a Java 21 runtime and the overridden class on Java 25
— one artifact, two implementations, selected by the JVM.

### Module classifiers

Some artifacts publish several jars under one coordinate, distinguished by a *classifier*: same module name,
different bytes. On the module path a module name has exactly one artifact, so Jenesis treats the classifier as
a **value on the pin**, not part of the coordinate — selected with a leading-colon qualifier
`:<classifier>[:<version>]`:

```java
/**
 * @jenesis.pin mutiny.zero :jdk-flow:0.4.3 SHA-256/0556f076...
 */
module demo.classifier {
    requires mutiny.zero;
}
```

The pin stays keyed by the bare module name, so it applies wherever the module appears in the closure —
directly or transitively — and only one variant of a module name can ever be present, mirroring the module
path's own uniqueness rule. The module repository serves the variant under a fused filename
(`mutiny.zero/0.4.3/mutiny.zero-jdk-flow.jar`), redirecting to the classified Maven artifact.

<div class="warning">
  Classifier pins resolve through the <strong>module</strong> repository only, so they need the
  <code>modular</code> layout. The <code>modular_to_maven</code> layout translates modules into Maven
  coordinates and rejects them, because a classified artifact shares its coordinate's POM — there is no
  per-classifier POM to translate through.
</div>

### Platform guards

Where a classifier commits one variant, a **platform guard** declares several and lets the build pick one per
machine. Each pin line may end with a bracketed guard, and the line whose guard matches the active platform
wins:

```java
/**
 * @jenesis.pin org.openjfx.javafx.base :linux:21.0.3 SHA-256/...
 * @jenesis.pin org.openjfx.javafx.base :win:21.0.3 SHA-256/... [windows]
 * @jenesis.pin org.openjfx.javafx.base :mac-aarch64:21.0.3 SHA-256/... [macos,aarch64]
 */
```

The active platform is a set of **tokens** that starts from the detected operating system and chipset — one of
`windows`/`linux`/`macos` plus one of `x86_64`/`aarch64`. A `-Djenesis.platform.<token>=true` flag adds a
token and `-Djenesis.platform.<token>=false` removes a detected one, so
`-Djenesis.platform.linux=false -Djenesis.platform.windows=true` cross-resolves a Windows closure from a Linux
host, and free-form tokens (`fips`, `musl`) cover custom build flavours. A guard matches when *all* its tokens
are in the active set; the most specific match wins, an unguarded line is the fallback, two equally specific
matches fail the build, and an unmatched guard with no fallback leaves the module unpinned.

The same `[<guard>]` suffix works on the `<!--jenesis.pin ... -->` comment block in a `pom.xml`, where it
selects the version of a (typically transitive) coordinate per platform. Every variant stays committed in
source with its own checksum, so the build is reproducible from the repository alone on any machine — selection
only decides *which* checksum-validated line applies. Full pin grammar and strict pinning are covered in
*Dependencies*.

### Internal and external build modules

Sometimes the build itself needs an extra pass — a code generator, a source preprocessor — packaged as a
reusable plugin rather than inline steps. Jenesis loads such a plugin as a **build module**, obtained two ways:

- an **internal** build module is compiled from local source in its own project folder, and
- an **external** build module is resolved from a repository coordinate as a published artifact.

Both are the same plugin; only where it comes from differs. A build module is a named Java module that
`provides` a build-executor service, and Jenesis discovers it through that declaration — so **the plugin itself
must be a named (explicit) module.** Its own *dependencies* are not restricted that way: a module layer admits
automatic modules too, so a build module can depend on non-modular libraries resolved by Maven coordinate.

<div class="note">
  A build module brings its own copy of the Jenesis build API, usually a different version from the one running
  the build. Jenesis loads each build module into its own <code>ModuleLayer</code> with its own class loader and
  bridges calls across the boundary, so the two copies never clash and a plugin can pin a different Jenesis
  version — as long as the API it uses lines up. Wiring these plugins into a build is the subject of
  <em>Extending the build</em>.
</div>

## Incremental change detection

The last core concept is the one you feel on every run: Jenesis only redoes work that actually changed. In
*Getting started* a second build recompiled nothing. Here is the rule behind that.

Every step's output is cached, keyed by a content hash. A step is **reused** only when three things all match
what the previous run recorded:

1. its **input checksums** — the bytes its predecessors produced;
2. its own **output folder** — re-hashed, so a tampered-with output is detected; and
3. its **configuration hash** — a digest of the step's own *serialized form*.

That third point is the one to internalise. Jenesis content-hashes each step's **serialized state**, not just
its inputs. So a step re-runs when its inputs change **or when its own configuration changes** — editing a
knob on a step (say a test filter) alters its serialized form, its hash changes, and it re-runs, even though not
one input byte moved.

<div class="warning">
  The flip side is the same fact: what invalidates a step is its serialized <em>state</em>, so changing a
  step's <em>logic</em> without changing its serialized fields will <strong>not</strong> invalidate the cache.
  For the built-in steps this is invisible. It becomes a rule you must respect only when you write your own step
  — the knobs that should trigger a rebuild have to live in serialized fields. <em>Extending the build</em>
  covers that in full.
</div>

Selectors are deliberately *not* part of the hash — they only gate which steps get scheduled. So a step that
runs under a selector produces exactly the output a full build would have, and a later unselected run hits the
cache as expected.

<div class="tip">
  The core concepts here are exercised end to end by
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-02-java-modular">demo-02</a> and
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-04-java-modular-multi">demo-04</a> (modular
  layouts and the module graph),
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-27-module-layout">demo-27</a> (the pure
  <code>modular</code> layout),
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-08-java-multi-release">demo-08</a>
  (multi-release jars),
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-28-module-classifier">demo-28</a> (module
  classifiers),
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-29-platform-guard">demo-29</a> and
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-30-platform-guard-pom">demo-30</a> (platform
  guards), and
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-33-internal-module">demo-33</a> /
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-34-external-module">demo-34</a> (internal and
  external build modules). Each is a runnable project — see <a href="/tool/demos/">Demos</a>.
</div>
