---
order: 12
title: Extending the build
description: Write your own build step, add it to the stock pipeline through a custom assembler, or wire the whole graph by hand - and the serialized-state rule a custom step must respect.
---

Every chapter so far drove the stock pipeline: a layout auto-detects your modules, the default assembler
wires the conventional compile/jar/test flow, and you configure it by choosing among the options it offers.
This chapter is for the build that needs something the templates *do not* model - a preprocessing pass, a
code-generation step, a bespoke packaging step, an unusual dependency wiring.

There are three levels of control, from least to most custom. All three share one primitive - the build
step - so start there.

## Writing a build step

A **build step** is the unit of work introduced in *[Core concepts](/tool/core-concepts/)*: it reads one or
more input folders and writes into one fresh output folder. When you write your own, that is the shape you
implement - a function handed its inputs and an output folder to fill:

```java
CompletionStage<BuildStepResult> apply(Executor executor,
                                       BuildStepContext context,
                                       SequencedMap<String, BuildStepArgument> arguments);
```

The `context` gives you three folder slots:

- **`next`** - the folder this run writes into. It is created fresh every time; your step writes here and
  nowhere else.
- **`previous`** - the same step's output from the prior run, or `null` on a first run. You may *read* it to
  hard-link or copy unchanged files instead of regenerating them, but never write into it.
- **`supplement`** - scratch space for intermediate files you don't want to publish in `next`.

The `arguments` map carries one entry per predecessor you wired in. Each exposes the folder to read
(`argument.folder()`) and a per-file change status - `ADDED`, `ALTERED`, `REMOVED`, or `RETAINED` - computed
against the previous run. The default behaviour re-runs your step whenever any input changed; override
`shouldRun(...)` if you want finer control.

<div class="note">
  Treat a step as a <strong>pure function of its input folders</strong>: read from the argument folders, write
  to <code>next</code>, reach outside neither. That is what makes its output cacheable and safe to share
  between builds - the incremental engine relies on it.
</div>

### Talk through folders, not step names

Steps compose by **file and folder conventions**, not by knowing who wired them. A step discovers what to
read by looking for well-known paths inside each input folder - `sources/` for Java sources, `classes/` for
compiled output, `artifacts/` for jars - and writes its output under names its consumers look up the same
way. Don't inspect the *names* of your predecessors to guess which input is which; read the folders. This is
what lets you splice a custom step between two stock ones without either noticing.

## The serialized-state rule

*Core concepts* flagged that a step re-runs when its **serialized state** changes, and left the details here.
This is the one rule a custom step must get right.

Jenesis content-hashes each step's serialized form and folds that hash into its cache key. So a step re-runs
when its inputs change **or when its own configuration changes** - and "configuration" means *the values of
its serialized fields*. The practical rule follows directly:

> **Put every knob that should trigger a rebuild into a serialized field.** A greeting to substitute, a flag,
> a target version - if changing it should re-run the step, it has to be a (non-`transient`) field, because
> that field's value is exactly what the cache hashes.

<div class="warning">
  The flip side is the trap. Change detection keys off the step's <strong>serialized state, not its
  bytecode</strong>. If you change a step's <em>logic</em> - rewrite the body of its <code>apply</code>, fix a
  bug in a helper - without changing any serialized field, its hash is identical and Jenesis <strong>reuses
  the stale output</strong>. Example: a <code>preprocess</code> step whose substitution string lives in a
  field re-runs the moment you edit that string; but if you instead hard-code the string in the method body
  and edit it there, nothing re-runs until an input changes. Keep behaviour-affecting values in fields, or
  force a rebuild by hand.
</div>

### State must be serializable

Because the step is serialized to be hashed, **all of its state must be serializable** - this is checked on
the first run, at hash time, not lazily. Two conveniences make the common cases work:

- A captured **lambda or function** field is made serializable for you: Jenesis substitutes serializable
  functional types at the constructor, so a lambda that closes over, say, a `Path` serializes cleanly.
- A **`Path`** field is hashed by its string form, even though the JDK's `Path` is not itself `Serializable`.
  So `Path`-typed configuration is first-class.

Genuinely non-serializable state - an open socket, a database handle, a live `Context` object - throws
`NotSerializableException` at hash time, **on the first run**. That is deliberate: the error surfaces the bug
immediately rather than silently breaking cache invalidation. If you see it, the fix is to hold the
serializable *description* of the resource (a URL, a path, coordinates) as the field and open the resource
inside `apply`, or mark truly incidental state `transient` so it never reaches the digest.

<div class="warning">
  Do <strong>not</strong> pin an explicit <code>serialVersionUID</code> on a build step unless you know you
  need cross-JVM stream stability. The auto-computed UID is the cache's only handle on structural change; once
  you pin a value, a step whose method signatures or superclass shift then hashes identically to the old one,
  and you become responsible for bumping the UID by hand on every behaviour-affecting change. The default,
  implicit UID catches more accidental drift - rely on it.
</div>

## Adding a step to the stock pipeline

The lightest way to extend a build is to keep the whole stock toolchain and **wrap the assembler** - the
callback that wires each module's compile/jar/test sub-graph. You drop a `.java` file next to `Project.java`
and pass your wrapper to `Project`. This one interposes a `sign` step after the stock build:

```java
MultiProjectAssembler<ProjectModuleDescriptor> base = new InferredMultiProjectAssembler();
MultiProjectAssembler<ProjectModuleDescriptor> withSign = (descriptor, repos, resolvers) ->
        base.apply(descriptor, repos, resolvers).mapBuild(delegate -> (sub, inherited) -> {
            sub.addModule("assemble", delegate, inherited.sequencedKeySet().stream());
            sub.addStep("sign", new Sign(), "assemble"); // Sign is your BuildStep
        });

Project.builder().assembler(withSign).build(args);
```

`apply` returns the module's build description; `mapBuild` decorates only its build phase - here registering
the stock output under `assemble` and chaining a `sign` step onto it. Wrappers compose freely: stack several
(sign, stamp licence headers, emit checksums) without ever reimplementing the Java toolchain.

### Redirecting a module's inputs

A wrapper can also change *what* the stock steps consume, because the module descriptor is immutable with a
**wither per property**. Every reference accessor (`sources`, `resources`, `manifests`, `dependencies`,
`artifacts`, `content`, `coordinates`) returns a `SequencedSet<String>`, so you can add or replace inputs in
one line:

```java
descriptor.sources("preprocess")   // stock compile now reads the preprocess step's output, not sources/
```

That is the whole trick behind a preprocessing assembler: add a `preprocess` step that reads the module's
`sources/`, rewrites it into its own output, then hand the stock assembler a descriptor whose `sources()`
points at `preprocess`. `javac`, the jar step, and the tests all consume the transformed tree, and the rest
of the build is untouched. Any pass that produces a `sources/` tree - template expansion, code generation,
licence-header stamping - fits the same shape.

## Reusing the toolchain from your own launcher

When you want your own `main` but still the stock compile/jar/test flow, skip `Project` and call the
convenience factory `MavenProject.make` (or `ModularProject.make` for a JPMS project). It discovers the
modules under a root, fills in sane defaults - a Maven Central repository, the right resolver, a digest - and
leaves only the assembler for you to supply:

```java
BuildExecutor root = BuildExecutor.of(Path.of("target"));
root.addModule("maven", MavenProject.make(Path.of("."),
        (descriptor, repositories, resolvers) -> new InferredMultiProjectAssembler().apply(
                new ProjectModuleDescriptor(descriptor, new LinkedHashSet<>(List.of(Path.of("."))),
                        true, false, false, null, PathPlacement.CLASS_PATH),
                repositories, resolvers)));
root.execute(args);
```

This is the "custom but not so custom" build: no layout, no goals, no `Project` - yet you didn't wire every
step by hand either. `ModularProject.make` is the modular counterpart; its convenience form builds pure
modules (a modular jar, no generated POM). For full control - a custom repository, strict pinning, a
different digest, or emitting a POM as well - switch to the longer `make(...)` overload that `Project` itself
uses.

## Wiring the graph by hand

When auto-detection is the wrong starting point entirely - a non-Java pipeline, code generation, a wildly
custom graph - drop to the `BuildExecutor` primitives and build exactly the graph you want:

```java
BuildExecutor root = BuildExecutor.of(Path.of("target"));
root.addSource("sources", Bind.asSources(), Path.of("sources"));
root.addStep("generate", new GenerateSource(), "sources"); // writes sources/sample/Generated.java
root.addStep("classes", new Javac(ProcessHandler.Factory.of()), "sources", "generate");
root.addStep("artifacts", new Jar(ProcessHandler.Factory.of(), Jar.Sort.CLASSES), "classes");
root.execute(args);
```

`BuildExecutor.of(...)` is the root and writes everything under `target/`. `addSource` binds a directory so
changes to it invalidate downstream caches; `addStep(name, step, predecessors…)` chains a step whose
arguments come from the named predecessors; `execute` runs the graph (or a selector's subtree), reusing
cached outputs whose inputs are unchanged. The `generate` step above synthesizes a Java source on the fly and
`Javac` - which reads the `sources/` of *every* predecessor - compiles it next to the hand-written ones.
There is no phase lifecycle to fit into: a build is just steps wired to steps, and here you wire them
yourself.

<div class="tip">
  Four runnable projects cover this chapter:
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-31-custom-assembler">demo-31</a> wraps the
  assembler to preprocess sources before they compile,
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-35-custom-maven">demo-35</a> and
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-36-custom-modular">demo-36</a> drive a
  multi-module Maven and modular build from a convenience <code>make</code>, and
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-37-custom-build">demo-37</a> wires a
  code-generating graph entirely by hand on the <code>BuildExecutor</code> API. See
  <a href="/tool/demos/">Demos</a>.
</div>
