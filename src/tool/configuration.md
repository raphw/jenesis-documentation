---
order: 4
title: Configuration
description: Setting build properties in a project file, where per-module tool configuration lives, and how profiles and precedence let you switch a whole setup with one name.
---

Earlier chapters flipped knobs with `-Djenesis.*` flags on the command line. That is fine for a one-off, but
you do not want to type the same flags on every build, and different builds - development versus release -
need different sets. This chapter shows where configuration lives so a project carries its own defaults: the
`jenesis.properties` file, the folders that hold each tool's config, **profiles** that switch a named set of
both at once, and the precedence rule that decides who wins.

## System properties, in a file

Every knob you have met is a system property. `jenesis.project.layout`, `jenesis.test.skip`,
`jenesis.project.target` - anything you can pass with `-D`. The same properties can live in a
**`jenesis.properties`** file at the project root, so the project carries its own defaults without a wrapper
script:

```properties
# jenesis.properties  (project root)
jenesis.project.layout=modular_to_maven
jenesis.test.skip=false
```

The launcher reads this file *before* the build is configured, so it drives everything the command line does -
layout, target, pinning, every later decision. The file is optional. An explicit `-D` on the command line
always overrides a file entry, so you can still override the project's baseline for a single run:

```bash
java -Djenesis.test.skip=true build/jenesis/Project.java
```

## Where tool configuration lives

System properties are the small knobs. A tool like Checkstyle or jpackage needs its own configuration *file*,
and those live in dedicated folders. A build plug-in **activates on the presence of its file** - drop a
`checkstyle.xml` in and static analysis turns on; leave it out and it stays off - so the folder is both the
switch and the settings.

Every lookup walks one ordered list of folders and the **first folder that carries the file wins**. The list
runs from the most specific per-module location to the project-wide fallback:

| Location | Layout | Scope |
| --- | --- | --- |
| `META-INF/build.jenesis/` under a module's sources | `modular`, `modular_to_maven` | that one module |
| `src/main/build.jenesis/` or `src/test/build.jenesis/` under the pom root | `maven` | the pom's main or test module alone |
| `build.jenesis/` next to the `pom.xml` | `maven` | both of the pom's modules |
| the `jenesis.project.configuration` folders (default `build.jenesis/` at the project root) | all | project-wide |

What these folders can hold - presence activates, contents configure:

- **Code quality**: `checkstyle.xml`, `pmd.xml`, `spotbugs-exclude.xml`, `detekt.yml`, `codenarc.xml`,
  `scalastyle-config.xml`.
- **Formatting**: `javaformat.properties`, `.editorconfig`, `.scalafmt.conf`.
- **Packaging and output**: `packaging.properties`, `sbom.properties`, `bom.properties`.
- **Compliance**: `licensing.properties`, `vulnerability.properties`, `spdx.properties`.
- **Test observability**: `jacoco.properties`, `graal.properties`, `pitest.properties`.
- **Forked-tool arguments**: `process-<command>.properties` - extra flags for `javac`, `kotlinc`, `jar`, and
  the like (see *[Building & running](/tool/building-and-running/)*).

Each of these is the subject of a later chapter; here the point is only *where* they go and that a file's mere
presence switches its feature on.

<div class="warning">
  The bare project root is deliberately <strong>not</strong> a configuration location. A conventionally named
  file an editor or a teammate drops at the root - an <code>.editorconfig</code>, a <code>checkstyle.xml</code>
  for the IDE - must not silently change the build. Configuration activates only from an explicit
  <code>build.jenesis/</code> folder (or a location you opt into via <code>jenesis.project.configuration</code>).
</div>

## Profiles

A **profile** is a named set of configuration you switch on in one move - the development-versus-release split,
without repeating long `-D` lists. There is no registry and no plugin: a profile is just a name.

Select profiles with the `jenesis.project.properties` property - a comma-separated list of names. Each name
`<name>` designates two things, both optional:

- a **`jenesis-<name>.properties`** file (resolved next to the file that named it), whose entries feed the same
  `jenesis.*` system properties, and
- a **`<name>/` subfolder** inside each configuration location, searched *ahead of* the location itself - so a
  profile can carry its own `checkstyle.xml`, `packaging.properties`, and so on.

Profiles **chain**: any loaded file may itself set `jenesis.project.properties` to pull in more, transitively.
The [`profiles`](https://github.com/raphw/jenesis/tree/main/demo/demo-15-profiles) demo ships a `release`
profile that turns on source jars and chains to a `supply-chain` profile that enforces strict pinning:

```properties
# jenesis-release.properties
jenesis.project.sources=true
jenesis.project.properties=supply-chain

# jenesis-supply-chain.properties
jenesis.dependency.pin=strict
```

Selecting `release` therefore also applies `supply-chain` - one name switches on both:

```bash
java -Djenesis.project.properties=release build/jenesis/Project.java stage
```

A missing `jenesis-<name>.properties` is skipped, not an error, so a profile may contribute only a
configuration folder, only a properties file, or both.

## Precedence

With several layers in play, the rule is fixed. Configuration resolves in four tiers, **highest first**:

| Tier | Source |
| --- | --- |
| 1 | an explicit `-D` on the command line |
| 2 | the selected **profiles** |
| 3 | the project `jenesis.properties` |
| 4 | the user-global `jenesis.properties` |

So `-Djenesis.project.sources=false` on a release build switches the source jar back off (the command line
always wins), and selecting the `release` profile overrides whatever the project's base `jenesis.properties`
set. The folder search follows the same spirit: a profile's `<name>/` folder beats a plain folder, and a
module-local folder beats a project-wide one.

## User-global defaults

The weakest layer is a **user-global `jenesis.properties`**, read from `~/.jenesis/` and applied to *every*
project - your shared personal defaults. It is optional and ignored when absent, and it may declare its own
profiles, resolved relative to its `.jenesis` folder.

The `jenesis.project.global` property names the base folder (default `$HOME`) whose `.jenesis/` subfolder
holds that file - or, set to an empty string, switches the user-global layer off entirely.

<div class="tip">
  The <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-15-profiles">demo-15</a> project is a
  complete, runnable example of everything here - a base build with no extras, and a <code>release</code>
  profile that chains to <code>supply-chain</code> to add source jars and strict pinning without changing a
  single command-line flag. See <a href="/tool/demos/">Demos</a>.
</div>
