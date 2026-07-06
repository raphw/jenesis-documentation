---
order: 6
title: Reference
description: Every application.properties descriptor key and every manifest attribute the launcher reads, in one place — including the full bundled-agent, module-access, and signer-reconstruction settings.
---

Two files drive a launcher jar: the `application.properties` **descriptor** that tells the launcher what to
run, and the jar **manifest** that tells the JVM to start the launcher. The build tool writes both when it
[produces the jar](/launcher/producing-a-launcher-jar/) — you never edit them by hand. This chapter is the
complete reference for both, for when you read, verify, or hand-craft a bundle.

## The descriptor: `application.properties`

A plain `key=value` properties file at the jar root. Every key is optional except `mainClass`, whose absence
turns the bundle into a [Java agent](#bundled-java-agents) rather than an application.

| Key | Value |
| --- | --- |
| `mainClass` | Fully qualified class whose `main` the launcher invokes. Absent → the bundle is an agent, not an application. |
| `mainModule` | The module owning `mainClass`, when the application is modular. |
| `classpath` | Comma-separated class-path dependency names, recording their original order. |
| `agentClass` | Comma-separated [bundled agents](#bundled-java-agents) to run before `main`. |
| `addExports` | [`--add-exports` grants](#relaxing-module-access) applied to the bundled modules. |
| `addOpens` | [`--add-opens` grants](#relaxing-module-access). |
| `addReads` | [`--add-reads` grants](#relaxing-module-access). |
| `signature.<dep>` | [Base64 PKCS#7 chain](#emulating-a-signed-jar) restoring a class-path dependency's signer identity. |

### Class-path order

A class path is **ordered** — when two jars carry the same class or resource, the first wins. Exploding the
dependencies into subfolders would lose that order, so the bundler records it:

```properties
mainClass=com.example.Main
classpath=dep1.jar,dep2.jar
```

The launcher orders its class path by this list; any class-path dependency the property does not name follows
in dependency-name order.

## Bundled Java agents

An executable jar can carry its own Java agents. `agentClass` is a comma-separated list of fully qualified
agent class names, each optionally followed by `=<arguments>` (mirroring `-javaagent:<jar>=<arguments>`; the
arguments run to the end of the entry):

```properties
mainClass=com.example.Main
agentClass=net.bytebuddy.agent.Installer,com.example.Tracing=verbose
```

The launcher invokes each agent's `premain` in declaration order **before the main class is loaded**, so a
`ClassFileTransformer` registered in `premain` still sees the main class being defined — exactly what
`-javaagent` guarantees. As the JVM does, it prefers `premain(String, Instrumentation)` and falls back to
`premain(String)`. Agents are loaded from the application's own runtime loader, so they may live on the class
path or the module path either way.

### Capturing an `Instrumentation`

There is a catch. `-javaagent:foo.jar` resolves a `Premain-Class` from the agent jar's *own* class path,
which never includes the bundled dependencies — so a bundled agent cannot obtain an `Instrumentation` that
way. The launcher instead ships one agent the JVM knows about, `build.jenesis.launcher.LauncherAgent`, and
referencing it from the manifest captures a real `Instrumentation` that the launcher hands to every bundled
agent.

<div class="warning">
  Without one of the manifest attributes below, no <code>Instrumentation</code> is captured, and only agents
  that declare <code>premain(String)</code> can run. When the descriptor carries an <code>agentClass</code>,
  the build tool adds <code>Launcher-Agent-Class</code> for you.
</div>

### Agent bundles

A bundle that declares **no** `mainClass` is itself a Java agent. Its manifest names `LauncherAgent` as a
`Premain-Class` (for `-javaagent:foo.jar`) and/or an `Agent-Class` (for dynamic attach), and you use it on a
*host* application:

```
java -javaagent:foo.jar=args -jar your-app.jar
```

The launcher builds the bundle's own loader and runs its `agentClass` agents against the host's
`Instrumentation`, so the agent and its dependencies stay in the bundle's isolated loader, off the host's
class path. The `=args` from the command line reach each agent that declares no `=<arguments>` of its own.

<div class="note">
  <strong>Several agent bundles in one JVM.</strong> The JVM loads a <code>Premain-Class</code> by binary
  name only once, so two bundles both naming <code>LauncherAgent</code> collide — the first wins and the rest
  are silently ignored. For bundles that must coexist, the Jenesis bundler gives each a
  <strong>uniquely named</strong> <code>Premain-Class</code> that delegates to the shared launcher, so any
  number can attach at once. This is generated for you; you never write it.
</div>

## Relaxing module access

A bundled module sometimes needs reflective access that a framework expects but its `module-info` does not
declare. Three keys grant it — the in-bundle equivalent of `--add-exports` / `--add-opens` / `--add-reads`,
applied to the bundled modules:

```properties
addExports=some.module/some.pkg=ALL-UNNAMED
addOpens=some.module/some.pkg=other.module,yet.another
addReads=some.module=java.sql
```

Directives within a property are separated by `;` and targets within a directive by `,`; a target is a module
name or `ALL-UNNAMED`. The **source must be one of the bundled modules** (only their encapsulation can be
broken this way); the targets may be bundled, boot, or the unnamed module.

## Emulating a signed jar

A dependency that shipped as a *signed* jar loses its signer identity when exploded — its signature files
(`META-INF/*.SF`, `*.RSA`/`*.DSA`/`*.EC`) become ordinary entries, so a class-path class would otherwise
define with a `CodeSource` that has no signers. A `signature.<dependency>` key restores it. The key suffix is
the exploded dependency's `classpath/<name>/` folder name; the value is Base64 of the signer's PKCS#7
certificate chain:

```properties
mainClass=com.example.Main
signature.guava.jar=MIIF...              # Base64 of the signer's certificate chain (PKCS#7)
```

For each such class-path dependency the launcher reconstructs a `CodeSigner` and attaches it to that
dependency's `CodeSource`, so `getCodeSigners()` and `getCertificates()` report the original signer.

<div class="warning">
  This <strong>attests</strong> the signer the bundler recorded at build time — it is <strong>not</strong> a
  cryptographic re-verification of the bundled bytes. It applies only to class-path dependencies; a
  module-path class carries no signers, as on a real module path. Dependencies without an entry are
  unaffected.
</div>

## Manifest attributes

The manifest is what connects `java -jar` (or `-javaagent:`) to the launcher. `Main-Class` is always present;
the rest appear only when the bundle carries agents.

| Attribute | Value | When it is used |
| --- | --- | --- |
| `Main-Class` | `build.jenesis.launcher.Launcher` | Always — makes `java -jar foo.jar` start the launcher. |
| `Launcher-Agent-Class` | `build.jenesis.launcher.LauncherAgent` | An application that bundles agents; captures an `Instrumentation` before `main` under `java -jar foo.jar`. |
| `Premain-Class` | `LauncherAgent` (or a unique trampoline) | An agent bundle attached with `java -javaagent:foo.jar`. |
| `Agent-Class` | `LauncherAgent` (or a unique trampoline) | An agent bundle attached dynamically at run time. |
| `Can-Redefine-Classes` | `true` | Grants the bundled agents class-redefinition capability. |
| `Can-Retransform-Classes` | `true` | Grants the bundled agents class-retransformation capability. |

Agent capabilities are read from this same manifest, so `Can-Redefine-Classes` / `Can-Retransform-Classes`
are added when a bundled agent needs them. The build tool sets whichever of these the bundle requires; the
table is here so you can recognise them when inspecting a produced jar.
