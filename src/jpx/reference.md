---
order: 5
title: Reference
description: Every jpx flag and the usage screen.
---

The whole surface of jpx is one target and a handful of flags. The target grammar is covered in
[Choosing a target](/jpx/targets/); the flags are these:

| Flag | What it does |
| --- | --- |
| `--modular` | Resolve purely over module descriptors, walking `requires` clauses like the `modular` layout - every module must be explicitly named. |
| `--docker[=<image>]` | Run the launched process in a container while resolution and installation stay on the host. |
| `--hash=<prefix>` | Verify the installed jars against a known digest before launching. |

`--docker` and `--hash` are covered in depth under
[Isolation & verification](/jpx/isolation-and-verification/).

## Usage

Running `jpx` with no arguments - or with `--help` - prints the usage screen:

```bash
jpx --help
```
