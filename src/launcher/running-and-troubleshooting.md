---
order: 4
title: Running & troubleshooting
description: How to start a launcher jar, the consequences of its single class loader, and the handful of pitfalls to know before you bundle an application.
---

A launcher jar runs like any other executable jar — but because it reconstructs the module graph in
process rather than merging everything flat, a few of its behaviours differ from a plain application on a
real class path and module path. This chapter shows how to start one, what the single loader means for your
code, and the pitfalls worth knowing before you ship a bundle.

## Running a launcher jar

The jar names the launcher as its `Main-Class`, so you start it exactly as you would any executable jar:

```
java -jar foo.jar [args...]
```

The launcher finds itself, reads `application.properties`, rebuilds the loader and module layer, and invokes
your real main class — the sequence covered in [*How it works*](/launcher/how-it-works/). Your arguments pass
straight through to `main`.

A bundle that declares **no** `mainClass` is not an application but a self-contained Java agent. You attach it
to a *host* application instead of running it directly:

```
java -javaagent:foo.jar=args -jar your-app.jar
```

The agent and its dependencies stay in the bundle's own isolated loader, off the host's class path. The full
agent story — bundled `agentClass` agents, the manifest attributes that capture an `Instrumentation`, and
running several agent bundles in one JVM — is covered in the *Reference* chapter.

## What the single loader means for your code

The launcher hosts both the named modules and the class path on **one** loader, exactly as `java -p
modulepath -cp classpath` does. That fidelity is deliberate, and it carries the JDK's own rules — which
occasionally surprise people migrating from a fat jar:

- **An automatic module can read the class path; a strict named module cannot.** A dependency with a real
  `module-info` sees only what it `requires`. If it needs a type that lives on the class path (an
  unnamed-module dependency), that read does not exist — just as it would not under a real module path.
- **A package owned by a module shadows the same package on the class path.** When a bundled module and a
  class-path jar both contain package `com.foo`, the module's classes win and the class-path copy is hidden.
  Split packages resolve the JDK's way, not first-jar-wins.

<div class="note">
  These are not launcher quirks — they are what a faithful <code>java -p … -cp …</code> launch does. If your
  application relies on a strict module reaching class-path code, or on a split package resolving by class-path
  order, it was relying on fat-jar behaviour that a real module path never had.
</div>

## Start-up failures

The most common failure is visible immediately, at start-up, before your `main` runs.

**A bundled module `requires` a JDK module that is not resolved by default.** The child layer is bound
against the boot layer, and the boot layer only contains the modules the JVM resolves by default —
`jdk.incubator.*`, or a module reachable only through qualified exports, is not among them. A bundled module
that requires one fails to resolve at start-up. The fix is to augment the boot layer from the command line,
which the child layer then reads:

```
java --add-modules jdk.incubator.vector -jar foo.jar
```

<div class="warning">
  There is no in-bundle way to pull in a JDK module that is not resolved by default. Adding an
  <code>--add-modules</code> flag at launch is the only way, because the boot layer is immutable and the
  bundle's module graph is fixed to the bundled modules plus the default boot modules.
</div>

## Runtime pitfalls

The rest of the launcher's boundaries surface only at run time, and only for applications that do specific
things. Most bundles never touch them.

### Native libraries

A JNI library cannot be loaded straight from a jar, so the launcher extracts a requested library to a temp
file on demand and loads it from there. Two consequences follow:

- The temp file is deleted on a **normal** exit, but **leaks on an abrupt kill** (`kill -9`, a crash).
- A library that finds a *sibling* library by co-location — rather than through `java.library.path` — will
  not find it, because each library lands in its own temp file. Keep multi-file native bundles
  self-contained.

If the same library name is bundled in more than one module, the first module by jar name wins.

### "Open my own jar file"

A class the launcher loads is defined with a `CodeSource` whose location points **inside** the outer jar
(for example `jar:file:/…/foo.jar!/classpath/dep.jar/`) — so `Package.getImplementationVersion`, sealed
packages, and `getProtectionDomain().getCodeSource()` all report correctly. But a dependency is *not* a
standalone jar on disk, so the "open my own jar file and read its entries" idiom fails. Code that walks its
own jar as a file needs another approach.

### Resources in a non-open module package

A resource inside a **non-open package of a bundled module** stays encapsulated: it is not on the flat
`getResource` / `getResources` API. `contextClassLoader.getResourceAsStream("some/module/internal.txt")`
finds it only if that package is opened — exactly as a real `java -p … -cp …` launch would encapsulate it.
Resources in no package (top-level entries, anything under `META-INF/`) and automatic-module resources are
always served.

### Directory entries are not resources

Only file entries are indexed, so `getResource("com/foo/")` for a package or directory returns `null`, where
a real exploded-directory class loader would hand back a directory URL. Class loading and file-resource
lookups are unaffected — this only bites code that enumerates a directory URL.

### The jar stays open

Reading on demand means the outer jar (a `ZipFile`), plus a cached `JarFile` once resource URLs are opened,
stays **open for the application's lifetime** — the trade-off for never holding the dependencies' bytes in
the heap. Under `java -jar` that is exactly right and needs no action. It matters only for an embedder that
builds and discards loaders programmatically: the launcher's loader is `Closeable` (like `URLClassLoader`),
so close it to release the handles deterministically.

<div class="tip">
  JAR signatures are <strong>not cryptographically re-verified</strong> — a signed dependency's signature
  files are exploded as ordinary entries. The bundler can reconstruct a class-path dependency's signer
  <em>identity</em> so <code>CodeSource.getCodeSigners</code> reports it, but that attests rather than
  re-verifies; see the <em>Reference</em> chapter for the descriptor key that turns it on.
</div>
