---
order: 3
title: Producing a launcher jar
description: The build-tool switch that emits a launcher jar, what the bundler assembles into it, and the manifest wiring that makes java -jar start the launcher.
---

You never assemble a launcher jar by hand. The Jenesis build tool produces it from a switch in
`packaging.properties`, shading the launcher into the jar and laying out your dependencies for it. This
chapter shows what that switch produces: the assembly the bundler performs, the resulting jar layout, and the
manifest entries that make `java -jar app.jar` start the launcher.

## Turning it on

The launcher jar is one of the build tool's [packaging options](/tool/packaging-and-distribution/). Enable it
by setting `launcher=true` in a `packaging.properties` file in the [configuration
location](/tool/configuration/):

```properties
# build.jenesis/packaging.properties
launcher=true
```

Like every packaging feature, it only runs for a module that declares a main class - the same
`@jenesis.main` tag (or `<mainClass>` POM property) the other packaging steps key off. The build then wires a
`launcher` step into the package phase and writes one executable jar per runnable module:

```
target/.../launcher/<name>.jar
```

## What the bundler assembles

The build resolves the published Jenesis Launcher artifact and produces the jar in four moves. Everything the
launcher needs at run time - the layout described in [*How it works*](/launcher/how-it-works/) - is put in
place here:

1. **Shade the launcher into the jar root.** The launcher's own `build/jenesis/launcher/*.class` files are
   copied to the jar root, with the launcher's `module-info` and manifest dropped, so at run time they are the
   unnamed module hosting your application.
2. **Explode each dependency into its own subfolder** - `classpath/<name>/` for a non-modular dependency,
   `modulepath/<name>/` for a modular or automatic one, using the *same* modular split the `Execute` launcher
   and a bundle use. `<name>` is the dependency's original jar file name,
   so automatic-module naming, which the JDK derives from that name, is unchanged.
3. **Set the manifest `Main-Class`** to `build.jenesis.launcher.Launcher`, so `java -jar` starts the launcher.
4. **Write `application.properties`** - the descriptor from *How it works*, carrying `mainClass`, `mainModule`
   when the application is modular, the class-path order, and (when present) `agentClass`.

<div class="note">
  This is the same content a <a href="/tool/packaging-and-distribution/">bundle</a> holds - the exploded
  <code>classpath/</code> and <code>modulepath/</code> subfolders and an <code>application.properties</code>.
  The launcher jar folds it into a single runnable jar with the launcher shaded in, so it needs no launch
  script; a bundle keeps the files separate for you to drop onto a JRE base.
</div>

## The produced jar layout

The result is an ordinary jar - every class and resource is a direct entry - with a fixed shape the launcher
knows how to read:

```
foo.jar
├── META-INF/MANIFEST.MF          Main-Class: build.jenesis.launcher.Launcher
├── build/jenesis/launcher/…      the shaded launcher classes
├── application.properties        mainClass, mainModule, classpath order, agentClass
├── classpath/
│   └── <dependency-jar-name>/…   a non-modular dependency, exploded
└── modulepath/
    └── <module-jar-name>/…       a modular or automatic dependency, exploded
```

Nothing is merged: each dependency keeps its own `module-info`, `META-INF/services` files, and resources in
its own subfolder. That is what lets the launcher rebuild the module graph at startup - see [*How it
works*](/launcher/how-it-works/) for how it reads this jar.

## The manifest wiring

Two manifest attributes are all that connect `java -jar` to the launcher.

`Main-Class` names the launcher, so the JVM invokes it and the launcher then finds and runs your real main
class from `application.properties`:

```
Main-Class: build.jenesis.launcher.Launcher
```

When the descriptor carries an `agentClass` - the application bundles its own Java agents - the bundler adds a
second attribute so the JVM hands the launcher a real `Instrumentation` before `main` runs:

```
Launcher-Agent-Class: build.jenesis.launcher.LauncherAgent
```

Without it, the JVM captures no `Instrumentation` and only agents that need none can run. The full set of
agent and access-control descriptor keys is covered in the [*Reference*](/launcher/reference/) chapter.

## Class-path order is preserved

A class path is **ordered**: when two jars carry the same class or resource, the first one wins. Exploding the
dependencies into subfolders would lose that order, so the bundler records it in a `classpath` property of
`application.properties`, and the launcher orders its class path by that list. You never write this by hand -
the build captures the resolved order for you; the key itself is documented in the
[*Reference*](/launcher/reference/) chapter.

## The launcher is pinned like any dependency

The Jenesis Launcher is resolved as a normal dependency, in its own `launcher` group, and is
[pinned](/tool/dependencies/) like every other artifact the build uses. The exact launcher bytes shaded into
your jar are therefore verified, and the produced jar stays reproducible - the same sources yield the same
bytes.

With the jar produced, the next chapter turns to running it: the start-up flow, the single-loader
consequences, and the pitfalls to watch for.
