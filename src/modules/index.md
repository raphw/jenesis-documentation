---
order: 1
title: Introduction
description: What Jenesis Modules is and why a module-name catalogue is needed.
---

**Jenesis Modules is a catalogue that maps Maven artifacts to stable JPMS module names.** When a
`module-info.java` says `requires com.fasterxml.jackson.databind`, something has to translate that module
name into the Maven coordinate `com.fasterxml.jackson.core:jackson-databind` to fetch it. That mapping is
what this project maintains, crawled from Maven Central and published as data anyone can consume.

## Why it exists

The Java module system identifies a dependency by its **module name**, but Maven identifies it by
**group and artifact**. There is no authoritative registry connecting the two, and a jar may carry a real
`module-info`, only an `Automatic-Module-Name`, or neither. Jenesis Modules resolves this by scanning the
whole of Maven Central, reading each artifact's actual module name, and recording the mapping — so a build
tool (Jenesis, but the data is not Jenesis-specific) can resolve `requires` names to coordinates reliably.

<div class="note">
  A dependency can only be referenced by module name if its jar carries a stable module name. Artifacts that
  ship neither a <code>module-info</code> nor an <code>Automatic-Module-Name</code> cannot be adopted this
  way — the catalogue records that fact too.
</div>

## What's in this section

1. **Introduction** — you are here.
2. **Using the catalogue** — the data layout and looking a module name up to a coordinate.
3. **How it is built** — the Maven Central index walk, the scanner, and the module vs. automatic distinction.
4. **The published data** — the summaries, the per-year "top modules" reports, and the drift reports.
5. **Companion tools** — reconciling missing versions and seeding coordinates the index has not caught up to.
6. **Reference** — the file formats and the crawler's configuration.
