---
order: 1
title: Introduction
description: What jpx is and why it exists - run any published module or Maven artifact with one command.
---

**jpx runs an already-published module or Maven artifact with one command.** Point it at a target and it
resolves the dependency closure, installs it once under your home directory, and launches the main entry
point. It is `npx` for the module path - a way to run a released tool without cloning, building, or
wiring up its paths by hand.

```bash
jpx org.junit.platform.console --version
```

That resolves the JUnit console launcher and its dependencies, installs them, and runs the tool - passing
`--version` straight through to the launched program.

jpx is a command of its own, installed separately from the [Jenesis build tool](/tool/). In a project
that embeds Jenesis as source, it also runs with nothing but a JDK: `java build/jenesis/Jpx.java
<target>`.

## What's in this section

1. **Introduction** - you are here.
2. **Choosing a target** - the target grammar: a module name or Maven coordinate, a version, an entry
   point.
3. **Installation & caching** - where installs live, and what makes an install safe to reuse.
4. **Isolation & verification** - running the launched program in a container and pinning it to a
   trusted digest.
5. **Reference** - every flag and the usage screen.
