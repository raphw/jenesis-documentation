---
order: 4
title: How the catalogue is produced
description: A short, non-code overview for trust — how Maven Central is scanned, how each artifact's module name is read, and how current and complete the catalogue is.
---

You do not need any of this to use the service — the [resolving](/modules/resolving/) and
[reports](/modules/reports/) chapters are the whole user story. This chapter is background for **trust**:
where the catalogue's numbers come from, how fresh they are, and why a resolved answer is the right one.

The catalogue is built by a **crawler** that scans Maven Central and, for every modularised artifact, records
the Java module name it produces. Everything the service redirects to is derived from that record. The crawler
and its live progress live in the [`raphw/jenesis-modules`](https://github.com/raphw/jenesis-modules)
repository.

## Reading each artifact's real module name

The crawler does not guess a module name from coordinates or a POM — it opens the actual jar and reads the
name the publisher shipped. For each artifact it looks, in order, for:

1. a `module-info.class` at the jar root → the artifact is a **named** module;
2. the highest-versioned `module-info.class` inside a multi-release jar (`META-INF/versions/<N>/…`) → also
   **named**;
3. an `Automatic-Module-Name` entry in the manifest → an **automatic** module.

An artifact that has none of these carries no stable module name and is simply not added to the catalogue.

This is why the [reports](/modules/reports/) can distinguish **named** from **automatic** with confidence:
the split reflects what is really inside each jar, not a heuristic.

## How current it is

The crawler runs on a schedule — **twice a day** — and appends only what is new since the last run, so the
catalogue tracks Maven Central continuously. Each report (the summary, the top-modules lists, the drift
report) is regenerated daily and stamped with an *as of* date.

<div class="warning">
  Maven Central's own index lags behind freshly published artifacts by <strong>up to a week</strong>, so a
  release from the last few days may not have been scanned yet. If a very recent version does not resolve,
  it has usually not reached the index the crawler reads — not that it is missing from the catalogue.
</div>

You can watch the crawl in real time: [`data/STATUS.md`](https://github.com/raphw/jenesis-modules/blob/main/data/STATUS.md)
is rewritten at every checkpoint with the current position, throughput, and sync mode, and the repository's
build and crawl badges reflect the most recent outcomes.

## How it stays complete and self-heals

Scanning ~100 million index records is not a clean, one-shot job, so the crawler is built to converge on a
complete picture rather than trust a single pass:

- **Every artifact is scanned once and remembered.** Maven Central coordinates are immutable, so once a jar
  has been read it is never fetched again; a scan that is interrupted resumes exactly where it left off
  without losing or double-counting anything.
- **Transient failures are retried automatically.** A network blip or a temporary server error leaves the
  coordinate un-recorded, so the next run tries it again. Only genuinely broken artifacts (a malformed jar, a
  deleted coordinate) are recorded as permanent and skipped.
- **Gaps in Maven Central's index are recovered.** The index the crawler streams can omit brand-new releases
  or occasionally misreport an artifact. The catalogue reconciles these against Maven Central's authoritative
  per-artifact metadata, filling in versions the index missed so the history for a module stays whole.
- **A rebuilt upstream index does not lose data.** If Maven Central republishes its index from scratch, the
  crawler re-sweeps automatically; the already-scanned record is preserved, so the re-sweep mostly re-reads
  the index without re-downloading jars.

## Why the resolved answer is trustworthy

A module name is not owned by anyone on Maven Central — it is just a string a jar carries, and unrelated
publishers routinely declare the same one (the collisions covered in the
[resolving chapter](/modules/resolving/)). When the catalogue has to pick a single authoritative publisher
for a name, it awards it to **whoever published that name first**, which keeps shaded copies and later
name-grabs out of the resolved view.

That rule is only as good as the publication dates behind it, so the crawler is careful about them: it takes
each artifact's real upload time from Maven Central's storage layer rather than the index's own timestamp,
because the index occasionally re-stamps older releases and that would distort who was really first. The
result is a first-owner decision you can rely on — and where the heuristic is wrong (a legitimate group
rename, say), an operator can override it with an explicit ownership policy without ever rewriting the
underlying history.
