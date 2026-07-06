---
order: 8
title: Other JVM languages
description: Compiling Kotlin, Scala and Groovy — alone or mixed with Java in one module — the compile order that decides which packages you can export, the standard-library dependency each needs, their code-quality tools, and enabling a Kotlin or Scala compiler plugin.
---

Jenesis is not a Java-only build tool. Drop `.kt`, `.scala` or `.groovy` sources into a module and it resolves
the matching compiler and builds them, mixed freely with Java, into one modular jar and its generated POM — with
**no build script to write**. You do not turn a language on; Jenesis detects it from the file extensions present
and wires the right compiler into the same step graph *Core concepts* described.

This chapter covers what changes when a module holds more than Java: how two compilers share one module, the one
rule that decides which packages you can export, the standard-library dependency each language needs, their
code-quality tools, and how to run a compiler plugin.

## One module, two compilers

A mixed module is compiled by **two compilers in sequence**, not one. Jenesis runs the other-language compiler
and `javac` in a fixed order over the same sources, each producing its own classes into the module. Because both
write into one module, the exported jar looks exactly like a single-language one — a consumer never sees the
seam.

The order is not arbitrary, and it differs by language:

| Language | Order | Why |
| --- | --- | --- |
| Kotlin | `kotlinc`, then `javac` | `kotlinc` reads `.java` as source for symbol resolution but emits only Kotlin classes |
| Scala | `scalac`, then `javac` | `scalac` reads `.java` as source for symbol resolution but emits only Scala classes |
| Groovy | `javac`, then `groovyc` | `groovyc` cannot read `.java` as source; it resolves Java from the compiled class path |

For Kotlin and Scala, the language compiler runs **first**: it reads your `.java` files only to resolve symbols
(so `Sample.kt` can call a Java `Greeter`) but leaves the Java output to `javac`, which compiles the `.java`
sources and `module-info.java` afterwards. For Groovy it is the mirror image: `javac` runs **first** and owns all
Java output, then `groovyc` compiles the `.groovy` sources, reaching Java types through the classes `javac`
already produced.

<div class="note">
  <strong>Scala and <code>module-info.java</code>.</strong> <code>scalac</code>'s Java parser cannot read a
  module declaration — it trips over the dotted module name — so Jenesis withholds <code>module-info.java</code>
  from <code>scalac</code> and lets <code>javac</code> own it. <code>scalac</code> still receives your other
  <code>.java</code> sources for resolution.
</div>

## Which packages you can export

That order decides one thing you need to know: **whether a package holding only non-Java code can be exported.**

When `javac` validates an `exports <package>` directive, it checks that the package is populated in the module's
output. For **Kotlin and Scala** this just works: their compiler already ran, so `javac` sees the Kotlin or Scala
classes through `--patch-module` and accepts the export. You can export a package that contains a single Kotlin
(or Scala) class and no Java type at all.

For **Groovy** you cannot. `groovyc` runs *after* `javac`, so at export-check time the package's Groovy classes
do not exist yet and only Java types count. The rule is:

<div class="warning">
  A package named in an <code>exports</code> directive must contain <strong>at least one Java type</strong> when
  the module also uses Groovy. Add a Java type to a Groovy package you want to export, or keep the package
  internal (a <code>requires</code> with no <code>exports</code>). This is a permanent Groovy restriction, not a
  Jenesis one — it follows from <code>groovyc</code> resolving Java only from the compiled class path.
</div>

## The standard-library dependency

Each language needs its standard library on the module path. You declare it as a normal `requires` in
`module-info.java`, and Jenesis resolves it through Maven like any other dependency:

| Language | `requires` | Resolves to |
| --- | --- | --- |
| Kotlin | `requires kotlin.stdlib;` | `org.jetbrains.kotlin:kotlin-stdlib` (plus its transitives) |
| Scala | `requires scala.library;` | `org.scala-lang:scala-library` |
| Groovy | `requires org.apache.groovy;` | `org.apache.groovy:groovy` |

Groovy's jar carries an `Automatic-Module-Name`, so `org.apache.groovy` resolves as an automatic module. The
Scala standard library lives entirely in one module — `scala-library` — with `scala3-library_3` being an empty
aggregator, so nothing splits `package scala` across two modules and the Java module system accepts it on the
module path with no hand-written wiring.

## Pinning the compiler

Every language compiler resolves in **its own dependency group** — `kotlinc`, `scalac` or `groovyc` — kept
completely apart from your module's own `main`-group dependencies. That separation matters: the running compiler
is locked independently of the standard library your module ships against, so pinning a different `kotlin-stdlib`
for your code can never downgrade the `kotlinc` that compiles it.

The compilers float a latest version by default. Run the `pin` step to record each resolved compiler jar with its
version and SHA-256, exactly as it pins your Java compilers and dependencies (see *Dependencies*):

```bash
java build/jenesis/Project.java pin
```

<div class="tip">
  For Scala and Groovy this is more than reproducibility. Their latest releases on Maven Central are often
  pre-release builds — a Scala <code>-RC</code> or a Groovy <code>-alpha</code> — so an unpinned build can drift
  onto one. Pinning keeps the module on a stable compiler while you upgrade deliberately.
</div>

## Code-quality tools per language

Each language brings its own linters and formatter, wired the same config-file-only way as the Java tools in
*Code quality & testing*: drop the tool's configuration file into a `build.jenesis/` folder and it runs on the
next build. A tool whose language is absent self-skips, so a stray config file in a Java-only project does
nothing.

| Language | Linter(s) | Trigger file | Formatter |
| --- | --- | --- | --- |
| Kotlin | detekt, ktlint | `detekt.yml`, `.editorconfig` | ktlint (`.editorconfig`) |
| Scala | Scalastyle, scalafmt | `scalastyle-config.xml`, `.scalafmt.conf` | scalafmt (`.scalafmt.conf`) |
| Groovy | CodeNarc | `codenarc.xml` | *(none)* |

As with the Java tools, the linters are **report-only by default** and the formatters run in **verify mode** —
a normal build fails if a source file is not already formatted but never rewrites it. Rewrite in place with the
same switch that drives `google-java-format`, `-Djenesis.format.rewrite=true`; it flips ktlint (to `ktlint -F`)
and scalafmt together with the Java formatter.

<div class="note">
  <strong>Groovy has no formatter.</strong> No suitable Maven-published Groovy formatter exists, so a Groovy
  project's <code>codenarc.xml</code> lints but nothing reformats. Everything else in <em>Code quality &amp;
  testing</em> — report-only defaults, <code>.strict(true)</code>, the per-tool opt-out properties, where reports
  land — applies to these tools unchanged.
</div>

## A compiler plugin

A Kotlin or Scala compiler plugin is declared exactly like a Java annotation processor (*Building & running*),
with one addition: **name the compiler first**, so the plugin resolves in that compiler's own group rather than
on `javac`'s processor path.

```java
/**
 * @jenesis.plugin kotlinc maven/org.jetbrains.kotlin/kotlin-serialization-compiler-plugin
 */
module demo.serialize {
    requires kotlinx.serialization.core;
}
```

Jenesis resolves the plugin under the `kotlinc` group, and the Kotlin compiler picks up the jar and self-loads it
through its `CompilerPluginRegistrar` — you never name an entry point. Above, the `kotlinx.serialization` plugin
generates a `@Serializable` class's `serializer()`, and the `requires` provides the annotation and the runtime
types the generated code references. The Scala path is identical: `@jenesis.plugin scalac <coordinate>` resolves
in the `scalac` group, and `scalac` loads the plugin the same way.

<div class="warning">
  A plugin runs <strong>only because it is declared</strong>. Delete the <code>@jenesis.plugin</code> line and
  the plugin is no longer handed to the compiler — the generated code is never produced and the build fails to
  compile whatever referenced it. Nothing on the class or module path is scanned for plugins implicitly.
</div>

The plugin's version is pinned the usual way, coordinated to the compiler — the `pin` step writes back its
`@jenesis.pin` line for you.

## API documentation

When you build documentation jars (`jenesis.project.documentation`, *Building & running*), each language uses its
own documentation tool — Dokka for Kotlin, `scaladoc` for Scala, `groovydoc` for Groovy, `javadoc` for Java. You
do not configure this; Jenesis scans the sources and picks tools to cover the languages present. When **one tool
can document every language in the module** it runs alone and renders a single document (Java + Kotlin is one
Dokka document, Java + Groovy one groovydoc document). Only an incompatible mix — Java + Scala, or three or more
languages — splits the output, with `javadoc` rendering the Java at the archive root and each remaining language
in its own subfolder. Either way the produced `-javadoc.jar` always has a root `index.html`, so it satisfies a
repository like Maven Central.

<div class="tip">
  Seven runnable demos exercise this chapter — a language mixed with Java, its quality tools, and a plugin:
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-16-kotlin">demo-16</a> and
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-17-kotlin-quality">demo-17</a> build and lint a
  Kotlin/Java module, and
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-18-kotlin-plugin">demo-18</a> runs a Kotlin
  compiler plugin (kotlinx.serialization);
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-19-scala">demo-19</a> and
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-20-scala-quality">demo-20</a> do the same for
  Scala; and
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-21-groovy">demo-21</a> and
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-22-groovy-quality">demo-22</a> for Groovy. See
  <a href="/tool/demos/">Demos</a>.
</div>
