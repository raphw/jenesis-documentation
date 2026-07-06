---
order: 1
title: Introduction
description: What Jenesis Modules is, and how you resolve a module name through repo.jenesis.build.
---

**Jenesis Modules is a service that resolves a Java module name to the jar that carries it.** When a
`module-info.java` says `requires com.fasterxml.jackson.databind`, something has to turn that module name
into a downloadable artifact. Jenesis Modules answers that: it maps every module name published to Maven
Central to its coordinate and serves the mapping over HTTP at
**[repo.jenesis.build](https://repo.jenesis.build/)**.

## How you use it

The catalogue is an **HTTP service, not a file you download**. You ask it for a module name and it redirects
(HTTP 302) to the jar on Maven Central — so anything that can follow a redirect is a client:

```bash
# Resolve a module name to its jar (follow the redirect with -L):
curl -L https://repo.jenesis.build/module/com.fasterxml.jackson.databind

# Pin a version, or ask for a classifier:
curl -L https://repo.jenesis.build/module/com.fasterxml.jackson.databind/2.18.0
```

The Jenesis build tool points at `repo.jenesis.build` out of the box, so when your `module-info.java`
declares a `requires`, the build resolves it here automatically — you rarely call the service by hand. The
URL shapes are the whole contract, so a mirror that serves the same shapes is a drop-in replacement.

<div class="note">
  A module can only be resolved if its jar carries a stable name — a real <code>module-info</code> or an
  <code>Automatic-Module-Name</code>. Artifacts that ship neither cannot be requested by module name; the
  reports show how much of Maven Central is covered.
</div>

## What's in this section

1. **Introduction** — you are here.
2. **Resolving through repo.jenesis.build** — the URL shapes (`/module/…`, `/artifact/…`), versions and
   classifiers, the 302 contract, using it from the build tool and from `curl`, and pointing at a mirror.
3. **The catalogue & reports** — reading the coverage summary, the per-year "top modules" reports, and the
   drift report to see what is modular and what is not.
4. **How the catalogue is produced** — a short, non-code overview: Maven Central is scanned regularly, each
   artifact's real module name is read, and named vs. automatic modules are distinguished. Background, for
   trust — not required to use the service.
