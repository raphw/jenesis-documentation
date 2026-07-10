---
order: 4
title: Isolation & verification
description: Launch-side hardening - run the program in a container with --docker, and pin the installation to a trusted digest with --hash.
---

A tool you run is code you trust. jpx keeps that trust cheap in both directions: the launched program can
be isolated in a container, and the installed jars can be verified against a digest you already know -
before every launch.

## Running in a container

`--docker` isolates only the launched program, not the resolution and installation, which stay on the host:

```bash
jpx --docker org.junit.platform.console --version
```

The installation folder and the host's Java home are mounted **read-only**, so the containerized run needs no
network and no credentials of its own. Pass `--docker=<image>` to choose the image; with none, a minimal
hardened image is used.

## Verifying the installation

`--hash=<prefix>` re-checks the installed jars against a digest you already trust, before every launch:

```bash
jpx --hash=3f9a1c… org.junit.platform.console --version
```

The prefix must be **at least 32 hex characters** of the target's SHA-256 digest - the digest recorded at
[installation](/jpx/installation/). A mismatch aborts the launch, catching both a tampered download and a
tampered installation on disk.
