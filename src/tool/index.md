---
order: 1
title: Introduction
description: What Jenesis is, the problem it solves, and how these docs are organised.
---

**Jenesis is a build tool for Java, written in Java.** A build is an ordinary Java program — you
configure it by writing code against a small API, not by learning a new markup language, and you run it
with the JDK you already have. There is no plugin ecosystem to install: a build is composed from steps
that are just objects you can read, extend, and test.

This section also covers **jpx**, a companion command that resolves and runs a published module's main
class the way `npx` runs a package — it ships in the same distribution.

## Why another build tool

Two convictions shape everything here:

- **Configuration is code.** A build is expressed in `Project.java`, a normal Java file the JDK launches
  directly. You get types, an IDE, and refactoring for your build the same as for your application.
- **The module system is a feature, not a footnote.** `module-info.java` drives the build: Jenesis reads
  your declared modules, resolves the module path, and carries a real module graph all the way through to
  packaging — instead of flattening it into a class path and hoping.

<div class="tip">
  New to Jenesis? Read this page, then <strong>Getting started</strong> to install it and run your first
  build. Every later chapter assumes only what came before it.
</div>

## What's in this section

The chapters build up from zero knowledge:

1. **Introduction** — you are here.
2. **Getting started** — install via SDKMAN, build an example, and read the `Project.java` model.
3. **Core concepts** — build steps, the build graph, and layouts.
4. **Configuration** — `jenesis.properties`, per-module configuration, and profiles.
5. **Building & running** — compile, test, package, `Execute`, and watch mode.
6. **Dependencies** — resolution, strict pinning, and how module names are looked up.
7. **Packaging** — jlink images, jpackage installers, native images, and launcher jars.
8. **Running in Docker** — building or launching inside a container.
9. **jpx** — running a published module's main class.
10. **Reference** — the command line, configuration keys, and the built-in steps.
