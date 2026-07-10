---
order: 3
title: Installation & caching
description: Where resolved targets install, what the descriptor records, and how an install stays consistent under crashes and concurrency.
---

jpx installs every resolved target once and reuses it across runs. Each target lives under:

```
~/.jenesis/jpx/<name>@<version>/
```

The folder holds the closure's jars in one flat directory beside a `jpx.properties` descriptor that records
the module path, the class path, the entry point, and a deterministic **SHA-256 digest over all the jars** -
the same digest [`--hash`](/jpx/isolation-and-verification/) checks against.

This is also what makes an unpinned target fast: the most recently installed version is preferred over a
fresh resolution, so only the first run pays for a download - see
[Choosing a target](/jpx/targets/).

## An incomplete install never launches

The descriptor is written **last**, on purpose: a download that crashes mid-way leaves no descriptor, so jpx
recognizes the install as incomplete and redoes it rather than launching a half-populated folder. Two
processes installing the same target coordinate through a **file lock**, so concurrent `jpx` invocations do
not collide.
