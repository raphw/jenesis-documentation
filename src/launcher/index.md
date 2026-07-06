---
order: 1
title: Introduction
description: What the Jenesis Launcher is and why it exists.
---

**The Jenesis Launcher turns a modular application into a single executable jar - without giving up its
module graph.** Run `java -jar app.jar` and the launcher reconstructs, in process, exactly what
`java -p modulepath -cp classpath -m module/main` would have done: modular dependencies become real named
modules in a fresh `ModuleLayer`, non-modular ones become the unnamed module of the same loader.

## The problem it solves

The classic "fat jar" (Maven Shade and friends) unpacks every dependency and **merges** their classes into
one flat jar. That destroys the things Jenesis cares about: `module-info.class` files collide, `META-INF/services`
files have to be merged by hand, and there is no module graph left to reconstruct at runtime.

The launcher explodes each dependency into **its own subfolder** of the outer jar instead of merging -
`modulepath/<module>/…` and `classpath/<dep>/…` - so nothing collides. Each dependency keeps its own module
descriptor, service files, and resources, and the module graph is rebuilt from those subfolders at startup.
Because every class is then a direct entry of the outer jar, the launcher reads it on demand with a plain
`ZipFile`; the dependencies' bytes never sit in the heap or spill to disk.

<div class="note">
  The launcher is produced by the Jenesis build tool's packaging step. If you have not read the build tool's
  <a href="/tool/">Packaging chapter</a> yet, start there - this section explains what the resulting jar does
  and how it does it.
</div>

## What's in this section

1. **Introduction** - you are here.
2. **How it works** - module-layer reconstruction, exploded subfolders, and on-demand reads.
3. **Producing a launcher jar** - the build-tool packaging option and the jar layout.
4. **Running & troubleshooting** - start-up, the single-loader model, and common pitfalls.
5. **Comparison** - how it differs from a shaded fat jar, point by point.
6. **Reference** - the manifest entries and the launcher's own configuration.
