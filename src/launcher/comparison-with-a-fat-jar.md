---
order: 5
title: Comparison with a fat jar
description: What flattening every dependency into one jar destroys — colliding module-info files, hand-merged service files, and the lost module graph — each set against the launcher's subfolder approach.
---

The usual way to ship a single runnable jar is a **fat jar** (or *uber jar*): a tool such as Maven Shade
unpacks every dependency and merges all their class files into one **flat** jar. It runs with `java -jar`,
which is the appeal — but the flattening throws away exactly what Jenesis treats as a feature. This chapter
sets the two approaches side by side, so you can see what a launcher jar keeps that a fat jar loses.

Both approaches explode their dependencies. The difference is *where the bytes land*: a fat jar merges them
into one namespace; a launcher jar gives each dependency [its own
subfolder](/launcher/producing-a-launcher-jar/). Three things follow from that single choice.

## `module-info` files collide

Every modular dependency carries a `module-info.class` at its jar root. Merge two of them into one flat jar
and they land at the **same path** — `module-info.class` can only exist once. The shading tool's only
options are to drop all but one, or to rename them into something the module system no longer reads. Either
way the modules stop being modules: their descriptors are gone, so nothing at run time knows what each one
`requires`, `exports`, or `opens`.

A launcher jar never merges. Each dependency keeps its own `module-info.class` inside its own
`modulepath/<name>/` subfolder, so every descriptor survives intact and is read back at startup.

## `META-INF/services` must be merged by hand

Service files are the other casualty of a flat namespace. Two dependencies that each provide, say, a
`java.sql.Driver` both ship `META-INF/services/java.sql.Driver` — again the *same path*. A naive merge keeps
one file and silently drops the other's providers, so a `ServiceLoader` lookup that used to find both now
finds one. Fat-jar tooling works around this with **hand-configured transformers** (Shade's
`ServicesResourceTransformer` and friends) that concatenate the colliding files — a step you have to know to
add, and one that only covers the collisions the tool was told about.

Because a launcher jar keeps each dependency in its own subfolder, no two service files share a path. Nothing
is merged, nothing is dropped, and there is no transformer to configure — every provider file stays where its
dependency put it, and `ServiceLoader` sees them all.

## The module graph is lost

The deepest loss is the one you cannot patch with a transformer. Once every class sits in one flat namespace
with the descriptors gone, there is **no way to reconstruct a module graph at run time**. A fat jar runs as
one big class path: encapsulation is gone, `requires` edges are gone, strong module boundaries are gone.
Modular libraries silently degrade to running as unnamed-module code.

A launcher jar rebuilds the graph instead. At startup it resolves the `modulepath/` subfolders into a fresh
[`ModuleLayer`](/launcher/how-it-works/), so the modules come back as **real named modules** with their
`requires` and `exports` edges enforced — the faithful equivalent of a real `-p modulepath`. Non-modular
dependencies become the unnamed module of the same loader, the analogue of `-cp classpath`.

## Side by side

The two jars run the same way — `java -jar app.jar` — but rebuild very different worlds:

| | Fat jar (flat merge) | Launcher jar (subfolders) |
| --- | --- | --- |
| Dependency layout | merged into one namespace | each in its own `classpath/` or `modulepath/` subfolder |
| `module-info.class` | collides — all but one dropped or renamed | kept, one per module subfolder |
| `META-INF/services` | collides — needs a merge transformer | kept, no merge needed |
| Module graph at run time | gone; everything is one class path | reconstructed into a real `ModuleLayer` |
| Class reads | from a rewritten flat jar | on demand, straight from the outer jar |

<div class="note">
  A launcher jar is not a fat jar with the rough edges filed off — it is a different reconstruction. Where a
  fat jar destroys the module system to fit one namespace, the launcher preserves each dependency whole and
  rebuilds, in process, exactly what <code>java -p modulepath -cp classpath -m module/main</code> would have
  done. See <a href="/launcher/how-it-works/"><em>How it works</em></a> for that reconstruction in detail.
</div>

Choosing a launcher jar is therefore the right call precisely when your application — or any library it
depends on — is modular and you want it to *stay* modular in the shipped artifact. If nothing you bundle is
modular, a fat jar and a launcher jar behave alike; the launcher only starts to matter once a real module
graph is worth keeping.
