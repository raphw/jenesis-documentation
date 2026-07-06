---
order: 2
title: How it works
description: Module-layer reconstruction from exploded subfolders, the single loader that hosts named and unnamed modules, and on-demand reads from the still-open jar.
---

The *Introduction* said the launcher reconstructs, in process, what `java -p modulepath -cp classpath -m
module/main` would have done. This chapter shows how: the shape of the jar it reads, the sequence it runs at
startup, the one class loader it builds, and how it serves classes and resources without ever holding their
bytes.

## The executable-jar layout

A launcher jar is an ordinary jar whose `Main-Class` is the launcher, plus a fixed set of entries the
launcher knows how to read:

```
foo.jar
├── META-INF/MANIFEST.MF          Main-Class: build.jenesis.launcher.Launcher
├── build/jenesis/launcher/…      the launcher's own classes (the unnamed module at run time)
├── application.properties        the descriptor: mainClass, mainModule, agentClass, …
├── classpath/
│   └── <dependency-jar-name>/…   a non-modular dependency, exploded into its own subfolder
└── modulepath/
    └── <module-jar-name>/…       a modular or automatic dependency, exploded into its own subfolder
```

Two things make this work where a flat "fat jar" cannot. Each dependency is **exploded into its own
subfolder** - `classpath/<dep>/…` or `modulepath/<mod>/…` - so nothing is merged: every dependency keeps its
own `module-info`, `META-INF/services` files, and resources. And because each class is then a **direct entry
of the outer jar**, the launcher can read it later with a plain `java.util.zip.ZipFile`, with no nested-jar
addressing.

The subfolder name is the dependency's original jar file name, so automatic-module naming - which the JDK
derives from that name - is unchanged.

### The descriptor

`application.properties` is the small text file that tells the launcher what to run. Its core keys are:

| Key | Meaning |
| --- | --- |
| `mainClass` | the fully qualified class whose `main` is invoked |
| `mainModule` | the module owning `mainClass`, when the application is modular |
| `agentClass` | bundled Java agents to run before `main`, if any |

`mainClass` is the only always-present key. A bundle that declares no `mainClass` is not an application at
all but a self-contained Java agent. The full set of descriptor keys - agents, module-access grants, and
signed-jar reconstruction - is the subject of the *Reference* chapter.

## How a launch proceeds

Running `java -jar foo.jar` starts the launcher's `main`, which then:

1. **finds itself** - it locates the running jar from its own `CodeSource` and opens it. A packaged jar and
   an exploded directory of the same layout both work.
2. **reads the descriptor and indexes entries** - it loads `application.properties` and records the *entry
   names* under each `classpath/<dep>/` and `modulepath/<mod>/` subfolder. Only names are read here; the
   bytes come later, on demand.
3. **builds one class loader** over the `classpath/` subfolders - this loader's unnamed module is the analogue
   of everything a `-cp` class path would carry. It holds no class bytes, only the index.
4. **reconstructs the module layer** - if there are `modulepath/` jars, an in-memory module finder resolves
   them and defines a **child `ModuleLayer`** against the boot layer, mapping every module to that *same*
   loader. When a `mainModule` is declared, the layer grants the launcher access to the main package, so
   `main` runs even if its package is not exported - exactly as `java -m module/Class` allows.
5. **invokes `main`** - it sets the thread context class loader, runs any bundled agents, and calls the main
   method.

<div class="note">
  Step 4 runs whenever there are module-path jars, even for a non-modular application. That is what lets a
  class-path application still reach module-path code - for example a Java agent placed on the module path.
</div>

## One loader, two kinds of module

The reconstruction rebuilds a real module graph, but it deliberately uses a **single class loader** for
everything - both the named modules in the child layer and the unnamed module over the class path. That is
exactly the arrangement one application loader has under `java -p modulepath -cp classpath`, and it makes the
launcher faithful to the JDK's own rules:

- an **automatic module can read the class path**, while a **strict named module cannot**;
- a package **owned by a module shadows** the same package on the class path.

An in-memory module finder builds a module descriptor for each `modulepath/` jar - read from its
`module-info.class`, or derived for an automatic module from its `Automatic-Module-Name` or jar file name,
with its `META-INF/services` providers scanned in. The boot layer is immutable, so a fresh child layer is the
only way to add these modules at run time, and the right one: they stay real named modules. What these rules
mean in practice - and the pitfalls they create - is the subject of *Running & troubleshooting*.

## Reading the bundle on demand

Because every class and resource is a direct entry of the outer jar, the launcher never merges anything into
memory or spills it to disk. It opens the outer jar once (a `ZipFile`) or the exploded directory, indexes the
entry names at startup, and reads each entry's bytes **only when first needed**, discarding them afterwards.
Heap use is therefore roughly the size of the entry-name index rather than the dependencies' bytes.

Two details make this transparent to the application:

- **Resources come back as ordinary URLs.** The loader hands out standard `jar:` and `file:` URLs for
  resources, so `ClassLoader.getResources` - and therefore `ServiceLoader` - works through the JDK's own
  handlers, with no custom URL scheme to configure.
- **Multi-release jars are honoured.** For a dependency shipping `META-INF/versions/<n>/` entries, the
  launcher serves the highest release the running JVM supports, just as the JDK does for a real jar.

<div class="tip">
  The one lasting cost of reading on demand is an open file handle for the process lifetime - the launcher's
  own <code>ZipFile</code> stays open while the application runs, as it must. That trade-off and the rest of
  the launcher's boundaries are covered in <em>Running &amp; troubleshooting</em>.
</div>
