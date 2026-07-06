---
order: 3
title: The catalogue & reports
description: Browsing what is modular - the coverage summary, the per-year and bleeding-edge "top modules" reports, and the ownership drift report.
---

The service in the [previous chapter](/modules/resolving/) answers one name at a time. Alongside it, the
catalogue publishes a handful of **human-readable reports** so you can browse the whole picture instead:
how much of Maven Central is modular, which of the most-used libraries ship a module, and where a module
name is claimed by more than one publisher.

The reports live in the [`raphw/jenesis-modules`](https://github.com/raphw/jenesis-modules) repository under
`data/`, are regenerated **once a day**, and each carries an *as of* date so you always know how fresh the
numbers are. The front door is the **module summary**; every other report is linked from it.

<div class="tip">
  Start at the <a href="https://github.com/raphw/jenesis-modules/blob/main/data/SUMMARY.md">module
  summary</a>. It opens with catalogue-wide totals and links straight to the per-year and bleeding-edge
  reports.
</div>

## The module summary

[`SUMMARY.md`](https://github.com/raphw/jenesis-modules/blob/main/data/SUMMARY.md) is the coverage report
for all of Maven Central. Its opening **Totals** table is the headline: in a recent crawl it counted about
**17.7 million** artifacts scanned, of which **1.6 million** are modular - **342 737** named and **1.26
million** automatic - spread across **40 118** distinct module names and **5 134** publishing groupIds.

Two terms recur throughout, and the split matters:

- A **named** module carries a real `module-info.class` - the publisher wrote a `module-info.java`.
- An **automatic** module only sets `Automatic-Module-Name` in its manifest - a name, but no module
  descriptor.

Below the totals the summary breaks the catalogue down further: the resolved catalogue size, named-vs-automatic
counts, how often a declared `module-info` version agrees with the Maven version, monthly publication
activity, naming patterns, and top-N tables (modules by version count, groupIds by module count, and so on).

<div class="note">
  Unless a section is explicitly labelled <em>audit</em> or <em>history</em>, every number in the summary
  describes the <strong>canonical</strong> view - the resolved owner of each name. Shaded copies and other
  non-authoritative claims on a name (see <a href="/modules/resolving/">the previous chapter</a>) do not
  inflate the counts.
</div>

## Top modules by year

Coverage across the whole catalogue understates what you actually meet in practice: most of Maven Central is
a very long tail of artifacts almost nothing depends on. The **top-modules** reports fix that by ranking the
~1000 **most depended-on** artifacts of a given year and showing how many of them ship a module. There is one
report per year - [2019](https://github.com/raphw/jenesis-modules/blob/main/data/top/2019.md) through
[2024](https://github.com/raphw/jenesis-modules/blob/main/data/top/2024.md) - so you can watch adoption move
over time.

Each report opens with two summary tables - **by artifact** and **by groupId** - counted in three columns:

| Column | Covers |
| --- | --- |
| **All listed** | All 1000 ranked artifacts. |
| **Libraries** | Excludes rows that cannot reflect module adoption - Maven's own build tooling, POM-only parents/BOMs, and hand-listed placeholders. |
| **Maintained** | The libraries that also had a release in the report window (drops the dormant and deserted ones). |

Then comes the per-artifact detail table: one row per ranked artifact, giving its rank, coordinate, the
**module it carries** (name plus a kind symbol), the last publication date, the artifact's and module's ages
in years, the latest artifact and module versions, and release counts. A blank module cell means the
artifact's latest version carries no module, even if an older one did.

The symbols in that table:

| Symbol | Meaning |
| --- | --- |
| ⚙️ | An **automatic** module (manifest name only). |
| 🏷️ | A **named** module with no declared `module-info` version. |
| ✳️ | A **named** module that declares a `module-info` version. |
| ⚠️ | **Dormant** - no release in the report window, but within the last three years. |
| 🚩 | **Deserted** - no release in the last three years. |
| ~~struck through~~ | A row excluded from the *Libraries* column (build tooling, a POM-only aggregator, or a placeholder). |

## The bleeding-edge report

[`BLEEDING.md`](https://github.com/raphw/jenesis-modules/blob/main/data/top/BLEEDING.md) is the same report,
but pointed at **now** rather than a past year end. It takes the most recent popularity list and assesses it
against current data, uncropped to any year: the module columns describe each artifact's latest version as it
stands today, and the ⚠️ / 🚩 activity flags use rolling 12- and 36-month windows. Read the per-year reports
for the trend; read this one for where modularization stands **right now**.

## The drift report

A module name is not owned by anyone on Maven Central - it is just a string a JAR carries, and unrelated
artifacts routinely declare the same one (the collisions and injection covered
[in the previous chapter](/modules/resolving/)). The
[**drift report**](https://github.com/raphw/jenesis-modules/blob/main/data/DRIFTERS.md) lists every module
name published by **more than one groupId** whose ownership has not yet been fully decided.

It opens with a table counting the drifters by category - for example `migration` (a groupId rename or
relocation), `fork` (a cross-org coordinate publishing alongside a still-active original), `republisher` and
`shaded` (a repackaged jar carrying someone else's name), and `unclassified`. Each category then lists its
modules with a per-groupId timeline: whether that groupId is `allowed`, `rejected`, or still undecided, which
one is the **current owner**, and each publisher's version range and activity.

For an operator curating the catalogue, this is the to-do list - each undecided name is resolved by naming
its publishers with an ownership policy. As a **consumer**, read it the other way: a name on this list is one
where more than one party is in play, so it is exactly the kind of dependency worth pinning by its full
coordinate.

<div class="warning">
  A module name alone is never an authoritative identifier. When a name appears in the drift report - or any
  time you resolve directly against the catalogue - pin the <code>(groupId, artifactId)</code> you expect
  rather than trusting the name on its own.
</div>
