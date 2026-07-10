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

With `--modular`, resolution runs purely over module descriptors instead, walking `requires` clauses like
the `modular` layout - every module must be explicitly named.

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
jpx com.example.tool/com.example.tool.alt.Cli
```

This works exactly like `java -m <module>/<main-class>`, which also means a jar that declares **no** entry
point at all is still runnable - just name the class yourself.
