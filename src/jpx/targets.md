---
order: 2
title: Choosing a target
description: The target grammar - a module name or Maven coordinate, an optional version, and an optional entry point.
---

The first argument names what to run. Its full form is:

```
<name>[@<version>][/<main-class>]
```

Only the name is required. The three parts each answer one question: *what*, *which version*, and *which
entry point*.

## The name - module or Maven coordinate

You can name what to run in two ways, and jpx tells them apart by a single rule: **a module name can never
contain a colon.**

- **A Java module name** - e.g. `org.junit.platform.console`. jpx looks the module up in
  [Jenesis Modules](/modules/) and downloads it, and everything it depends on, from Maven Central. This is
  the everyday form: you name the module, nothing else.
- **A `<groupId>:<artifactId>` pair** - e.g. `org.junit.platform:junit-platform-console`. The colon marks
  it as a Maven coordinate, resolved from Maven Central directly. Reach for this when you want a specific
  artifact, or one that carries no module name.

Both of these run the very same tool - the JUnit console launcher - one by its module name, the other by
its coordinate:

```bash
jpx org.junit.platform.console                  # by module name
jpx org.junit.platform:junit-platform-console   # by Maven coordinate
```

With `--modular`, jpx resolves purely over module names, following each module's `requires` with no POM
involved at all - so every dependency must itself be a named module. For that reason it applies only to a
module name, not to a Maven coordinate.

## The version - which release

Append `@<version>` to pin a release:

```bash
jpx org.junit.platform.console@1.11.0
```

Without a version, jpx prefers the **most recently installed** version of that target; failing that, it
resolves the **latest release**. So the first run pulls the current release and later runs reuse it until you
ask for a newer one.

## The main class - which entry point

By default jpx launches the jar's **module main class** or its `Main-Class` manifest attribute. Append
`/<main-class>` to choose a different entry point:

```bash
jpx org.junit.platform.console/org.junit.platform.console.ConsoleLauncher
```

This works exactly like `java -m <module>/<main-class>`, which also means a jar that declares **no** entry
point at all is still runnable - just name the class yourself.
