---
order: 7
title: Code quality & testing
description: The linters, formatters, coverage, test selection and mutation testing Jenesis runs for you - each turned on by dropping its config file in place, no build script and no plugin to register.
---

A healthy codebase runs more than a compiler over its sources. Jenesis wires in the usual quality tools -
static analysis, formatters, coverage, mutation testing - and a faster inner test loop, and it does so the
same way it does everything else: **there is no plugin to register**. A tool turns itself on when its
configuration file is present, and stays off when it is not. This chapter is the set of tools and how each
one behaves.

Every file below lives in a **configuration folder** (`build.jenesis/` by default). *Configuration* covers
where those folders sit and how per-module and profile overrides work; here we only care about which file
switches on which tool.

## Static analysis

Drop a tool's conventional configuration file into the configuration folder and the tool runs on the next
build. Nothing else is needed - the file's presence is the switch, and its contents are the tool's own rules.

| File | Tool | Inspects |
| --- | --- | --- |
| `checkstyle.xml` | Checkstyle | source files |
| `pmd.xml` | PMD | source files |
| `spotbugs-exclude.xml` (or `spotbugs.xml`) | SpotBugs | compiled classes |
| `detekt.yml` | detekt (Kotlin) | source files |
| `.editorconfig` | ktlint (Kotlin) | source files |
| `scalastyle-config.xml` | Scalastyle | source files |
| `.scalafmt.conf` | scalafmt (as a linter) | source files |
| `codenarc.xml` | CodeNarc (Groovy) | source files |

The source linters run **before compilation**, in parallel with `javac`; SpotBugs runs as a validator on the
`binary` step, once the classes exist. Each tool resolves in its own dependency group (named after the tool,
kept apart from your project's own dependencies), floats a `RELEASE` version, and runs in a forked JVM. A tool
whose language is not present simply skips itself - a stray `detekt.yml` in a pure-Java project does nothing.

### Report-only by default

By default every linter is **report-only**: it records its findings but never fails the build. That makes it
safe to turn a tool on across an existing codebase without an immediate red build. To make a finding a build
failure instead, wire the tool with `.strict(true)` when you configure it in code - a non-zero tool exit then
fails the build.

### Switching a tool off

To skip a discovered tool without deleting its configuration file, set its property to `false`. Every property
defaults to `true`, so file discovery alone normally decides; the property is an opt-out:

| Property | Covers |
| --- | --- |
| `jenesis.source.<tool>` | Checkstyle, PMD, detekt, ktlint, Scalastyle, scalafmt, CodeNarc |
| `jenesis.validator.spotbugs` | SpotBugs |

For example, `-Djenesis.source.checkstyle=false` keeps `checkstyle.xml` in place but skips Checkstyle, while
PMD and SpotBugs still run.

## Formatting

Formatters are the rewriting counterpart to the linters: where a linter reads your sources and writes a
report, a formatter reads them and can rewrite them in place. The Java formatter is selected by a
`javaformat.properties` file naming the formatter:

```properties
formatter=google
```

`formatter=palantir` selects the Palantir formatter instead; with no file, no Java formatter runs. Kotlin
formatting is `ktlint -F`, activated by the same `.editorconfig` that drives the ktlint linter, and Scala
formatting is `scalafmt`, activated by `.scalafmt.conf`. Each of the three switches off with
`jenesis.format.java`, `jenesis.format.ktlint` and `jenesis.format.scalafmt` (each defaulting to `true`).

### Verify mode, and how to reformat

Every formatter runs in **verify mode** by default, so a normal build never touches your sources. Instead it
**fails the build when a file is not already formatted**, which makes it a continuous-integration gate. Indent
a source file with a few spare spaces and rebuild: the `format` step fails.

To apply the formatter and rewrite your sources in place, run the build with the rewrite switch:

```bash
java -Djenesis.format.rewrite=true build/jenesis/Project.java
```

The switch flips the whole chain - the Java formatter, ktlint and scalafmt - from verifying to rewriting.
After a rewrite, a plain build passes the verify gate again.

<div class="note">
  Groovy formatting is not yet available: no suitable Maven-published formatter exists for it, so a Groovy
  project's <code>codenarc.xml</code> lints but nothing reformats.
</div>

## Where the reports land

Every tool writes its findings into a `reports/<kind>/` folder under its step's output - for example
`reports/checkstyle/checkstyle-report.xml`, `reports/pmd/`, `reports/spotbugs/`. You rarely need the exact
path, because a **`stage` build collects every report from every module into one place**, each kind in its own
subfolder:

```
target/stage/reports/<kind>/<module>/
```

So `target/stage/reports/checkstyle/sources/checkstyle-report.xml` is the Checkstyle report for the `sources`
module, and coverage reports land under `target/stage/reports/jacoco/<module>/` the same way.

## Code coverage

Coverage is a **test observation**: JaCoCo wraps the test run and records which code the tests touched. Turn
it on by placing a `jacoco.properties` file in the configuration folder - in the Maven layout that means
`src/test/build.jenesis/`, since coverage is a test-side concern.

With the file present, the test step is launched with the JaCoCo agent attached as a `-javaagent`; it
instruments the run without touching your sources, writes its execution data (`jacoco.exec`), and a downstream
report step renders an HTML and XML report under `reports/jacoco/`. Open the `index.html` to browse coverage
line by line. JaCoCo, like every tool here, resolves in its own group (`jacoco`) apart from your dependencies.

<div class="note">
  Coverage is <strong>reported, not enforced</strong>. A method your tests never reach shows up as uncovered
  in the report, but the build stays green - coverage tells you where you stand, it does not gate the build.
  Set <code>-Djenesis.observe.jacoco=false</code> to suppress it even when the file is present.
</div>

## Running only the tests a change affects

Jenesis already skips a module's whole test step when none of that module's inputs changed. **Test selection**
is the finer-grained companion: within a module that *did* change, it runs only the test classes the change
can actually reach and leaves the rest cached. Turn it on with `-Djenesis.test.incremental`:

```bash
java -Djenesis.project.watch=true -Djenesis.test.incremental build/jenesis/Project.java
```

The value names the digest algorithm used to detect changes; passing the flag bare picks `MD5`, and leaving
it unset disables selection. On each run the test step builds a class-to-test dependency graph from the
compiled bytecode, records a per-class content hash, and on the next run diffs the hashes, takes the classes
whose bytecode changed, walks the graph to the tests that reach them, and passes only those to the runner. A
change that reaches no test runs nothing; any non-class change (a resource, a dependency) falls back to the
full suite.

Test selection is meant mainly for **watching** a project (see *Building & running*), where the build re-runs
on every save and a narrowed test pass keeps the feedback loop tight.

<div class="warning">
  Test selection is a development-loop optimisation, <strong>not a correctness gate</strong>. Static selection
  cannot see reflection, resources or other indirect couplings, so continuous integration should keep running
  the whole suite - a plain <code>build</code> with selection off.
</div>

## Mutation testing

Coverage tells you which lines a test *executed*; mutation testing tells you which behaviours a test actually
*checks*. [PIT](https://pitest.org) (`pitest`) seeds small faults into your code - a `+` becomes a `-`, a
return value is replaced with a constant - re-runs the tests against each mutant, and reports which mutants the
tests **killed** and which **survived**. A surviving mutant is a change to the program that no test noticed.

Like the linters, PIT is discovered from a config file: a `pitest.properties` in a tested module wires a
`mutate` step alongside the normal test run, so the suite runs as usual *and* PIT then assesses how good it is.
Unlike a bare marker, this file carries real configuration - the options PIT needs:

```properties
targetClasses=calc.Calculator   # which classes to mutate
targetTests=calctest.*          # which tests to run against the mutants
outputFormats=XML,HTML          # report formats (an optional `mutators` key selects a mutator set)
```

PIT and its JUnit 5 plugin resolve in their own `pitest` group; the plugin's version is taken from the
project's own resolved `junit-platform`, so it always lines up with the test framework you use. The report
lands under `reports/pitest/`, and `-Djenesis.mutate.pitest=false` suppresses the run while keeping the file in
place.

## Pinning the tool chain

Every tool above floats a `RELEASE` version in its own dependency group, so the first build downloads the
latest and later builds reuse the cache. When you want a reproducible, checksum-verified tool chain, run
`java build/jenesis/Project.java pin` - it records each resolved tool jar with its SHA-256 exactly as it pins
your compilers and dependencies (see *Dependencies*). Some closures are large (PMD's CLI bundle alone pulls in
well over a hundred artifacts), which is why the demos leave them floating for readability.

<div class="tip">
  Four runnable demos exercise this chapter:
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-11-java-quality">demo-11</a> wires Checkstyle,
  PMD, SpotBugs and the Java formatter into one project;
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-23-code-coverage">demo-23</a> measures
  coverage with JaCoCo;
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-24-test-selection">demo-24</a> edits one class
  and re-runs only that class's test; and
  <a href="https://github.com/raphw/jenesis/tree/main/demo/demo-25-pitest">demo-25</a> runs pitest, killing
  both mutants of a covered method. See <a href="/tool/demos/">Demos</a>.
</div>
