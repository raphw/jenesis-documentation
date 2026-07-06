---
order: 7
title: The compliance gate
description: The screen every publish and every proxy fetch passes before an artifact is stored or served — its four plug-in points (publication screen, quality inspector, gate policy, advisory source), the licence, vulnerability, malware, known-exploited, deny-list and version-floor dimensions, the advisory feeds behind them, and the settings that tune each verdict.
---

The [Architecture](/repository/architecture/) chapter established a seam on the publication path: a
**publication screen** that reads an upload as it commits and returns **`ACCEPT`**, **`QUARANTINE`**, or
**`REJECT`**, and can also **withhold** an already-served path on read. The core ships no screen, so out of
the box every upload is accepted. This chapter is the screen a deployment installs there — the **compliance
gate**: what it decides, the dimensions it decides on, the advisory feeds behind them, and the settings that
tune each verdict.

## The gate — one screen over four plug-in points

The gate is not a monolith. It is a small composition of **four discovered capabilities**, each a swappable
plug-in point an operator turns on and configures — so a deployment gates on exactly the dimensions whose
modules are on its path, and nothing else.

- **The publication screen** — the seam from the Architecture chapter. The gate rides it as one discovered
  screen, so it needs no special wiring: the same store-then-screen flow that governs every publish is what
  runs the gate.
- **The quality inspector** — a **per-format** reader that turns an artifact into what the gate can judge: a
  *subject* carrying its coordinate and its declared licences (and, on a publish, its resolvable
  dependencies). Reading a coordinate and its licences out of a Maven POM, an npm `package.json`, a NuGet
  `.nuspec`, or a Go `go.mod` is format-specific, so each ecosystem supplies its own inspector. An artifact
  no inspector claims — a checksum, a metadata file — is simply **not gated**.
- **The gate policy** — one **dimension** of the verdict: the licence policy, the known-exploited check, the
  version floor. Each is a discovered module; the gate folds every dimension's findings into a single verdict,
  and a deployment without a dimension's module never gates on it.
- **The advisory source** — supplies the **known vulnerabilities** affecting a coordinate, looked up by its
  ecosystem and canonical name. The gate is blind to where they come from; every enabled feed merges into one
  de-duplicated source.

The gate does a **single advisory lookup per subject** and shares it across every dimension, so adding a
dimension costs no extra network round-trips.

### The verdict

Every dimension returns findings; the gate keeps the **strongest verdict** any of them raised, order
independently:

| Verdict | What happens |
|---------|--------------|
| `ALLOW` | The artifact is stored and served normally. |
| `QUARANTINE` | It is held under a `/quarantine` view that **does not resolve** — stored for review, never served. |
| `REJECT` | Nothing is stored; the orphaned blob is reclaimed by the usual garbage collection. |

Because the screen also has a **read side**, a verdict can change *after the fact*: a new advisory against a
coordinate that has served for months **withholds** it from serving until it is reviewed. Everything held or
refused is recorded with its coordinate, verdict, and reasons, and a reviewer works the queue — releasing a
hold into the layout or discarding it — through the console's per-repository **Quarantine** panel.

### It screens both legs

The same dimensions run on **two paths**, so a proxied third-party artifact is screened exactly like a
first-party upload:

- **On publish** — a first-party upload is screened before its pointer is linked.
- **On a proxy fetch** — an artifact a [pull-through proxy](/repository/proxying/) pulls from an upstream is
  screened before it is cached and served, so a known-bad dependency **never reaches the build that requested
  it.**

The proxy leg screens each artifact by **its own coordinate** rather than resolving a proxied POM's whole
dependency closure on every read — needless, because each dependency is itself proxied and gated as it flows
through. One dimension softens on this path: an **unknown licence is allowed** through a proxy fetch, because
a proxied jar's sibling POM is often not yet cached, while a *known-bad* licence is still caught.

## The dimensions

Each dimension is a gate-policy module you enable. Turn on the ones a deployment needs; the rest never run.

### Licence policy

An **allow/deny** policy over licence tokens. A token matches a licence by its **SPDX id, its name, its URL,
or a category** — so `apache` clears `Apache-2.0`, and a `copyleft` deny-token forbids every copyleft licence
at once. The **deny-list wins** over the allow-list: an explicit "never this" beats a general "these are
fine". A licence the inspector cannot identify gets its own verdict (quarantine by default), so an
undeclared or unreadable licence does not slip through unjudged.

### Vulnerability threshold

A **CVSS band** over the advisory feeds. Each finding is scored from the advisory's CVSS vector, and a score
**at or above** the configured threshold fails the artifact. Where the feed records a **fixed version**, the
verdict names it — so the finding carries its own remediation. Setting the threshold to `NONE` disables the
check.

### Malicious-package check

A separate dimension for **deliberately harmful publications** (typosquats, hijacked releases), not flaws in
legitimate software. A malicious advisory carries no meaningful CVSS score, so it is gated on the feed's
**malicious flag**, not the threshold — a malicious package is held (or rejected) regardless of any number.

### Known-exploited

A hold for a CVE on **CISA's Known Exploited Vulnerabilities (KEV)** catalogue, applied **regardless of its
CVSS band** — because the question is no longer whether it *could* be exploited but that it *is*, in the wild,
now.

### Deny-list

An operator's explicit block-list of coordinates, **always refused**. An entry is a `group:artifact`, a
pinned `group:artifact:version`, or a `group:*` prefix for a whole group.

### Version floor

A deterministic "never below this version" for a known-bad range — a `GatePolicyProvider` that rejects a
coordinate published or proxied under a configured minimum, enforced identically on both legs:

```
org.apache.logging.log4j:log4j-core >= 2.17.0
com.example:* >= 1.0.0
```

### Immaturity hold (proxy only)

A supply-chain defence against a freshly-published malicious release **before any feed knows of it**: on the
proxy path, a version the upstream published within the last *N* days is held. This dimension applies only
to pulled-through artifacts, and is off (`0` days) by default.

<div class="tip">
  A known-bad, deny-listed, vulnerable, actively-exploited, or too-fresh dependency is stopped by whichever
  dimension catches it first — the strongest verdict wins, so the dimensions compose without knowing of one
  another. This is the artifact firewall an incumbent sells as a separate product.
</div>

## The advisory feeds

The vulnerability, malicious-package, and known-exploited dimensions all read from **advisory feeds**. Each
feed is a discovered module, **off until you enable it**, and several may run together — the gate merges every
enabled feed into one de-duplicated source. A deployment with no feed enabled gates on **licences and the
deny-list only**.

| Feed | Enable with | Supplies | Default endpoint |
|------|-------------|----------|------------------|
| **OSV** (osv.dev) | `osv` | CVSS-scored vulnerabilities and `MAL-` malicious-package advisories | `https://api.osv.dev` |
| **GitHub Advisory Database** (GHSA) | `github` | vulnerabilities from GHSA (optional `github-token` for a higher rate limit) | `https://api.github.com` |
| **OpenSSF malicious-packages** | `openssf` | the curated malicious-package dataset only — screen for malware without adopting the whole OSV feed | `https://api.osv.dev` |
| **CISA KEV** | `kev` | the known-exploited catalogue | the catalogue on cisa.gov |
| **FIRST EPSS** | `epss` | a per-CVE **exploitation probability**, used to rank reports | `https://api.first.org/data/v1/epss` |

Each feed's endpoint is overridable (`osv-endpoint`, `github-endpoint`, and so on) so a deployment can point
at a mirror or an internal proxy. **EPSS** and **KEV** double as report signals: they order a repository's
vulnerability report so the actively-exploited and most-likely-exploited coordinates sort to the top. (That
proactive re-scan of what you *already hold* is covered under **Maintenance**; this chapter is the gate's
decision at the moment of publish or proxy.)

## Settings

The gate's dials are **runtime settings**: edit them live through the console or the settings API and the
change takes effect on the next request, no redeploy. Each also has a file/env default — pin one from above
the store with an environment variable or a `-Djenesis.repository.<key>=` system property, and the pinned
value wins over any stored edit. The verdict knobs and deny-list are **tenant-overridable**, so a tenant can
tighten its own gate without touching the deployment-wide policy.

### Licence

| Key | Default | Meaning |
|-----|---------|---------|
| `license-allowed` | *(empty)* | Comma-separated allowed tokens; empty allows any identified licence. |
| `license-denied` | *(empty)* | Comma-separated forbidden tokens; a match is rejected outright. |
| `license-unknown` | `QUARANTINE` | Verdict for an unidentifiable or undeclared licence (`ALLOW` / `QUARANTINE` / `REJECT`). |

### Vulnerabilities & malware

| Key | Default | Meaning |
|-----|---------|---------|
| `vulnerability-threshold` | `NONE` | Fail at or above this CVSS band: `NONE` (off) / `LOW` / `MEDIUM` / `HIGH` / `CRITICAL`. |
| `malware-action` | `QUARANTINE` | Verdict for a package a feed marks malicious (`ALLOW` / `QUARANTINE` / `REJECT`). |
| `kev-action` | `QUARANTINE` | Verdict for a known-exploited CVE, applied regardless of CVSS band. |
| `osv` / `github` / `openssf` / `kev` / `epss` | `false` | Enable each advisory feed (with its `*-endpoint` override, and `github-token` for GHSA). |

### Deny-list & version floor

| Key | Default | Meaning |
|-----|---------|---------|
| `deny-list` | *(empty)* | Comma-separated coordinates always refused (`group:artifact`, `group:artifact:version`, or `group:*`). |
| `version-floor` | *(empty)* | Minimum-version rules, one per coordinate or `group:*`. |
| `version-floor-action` | `REJECT` | Verdict for a coordinate below its floor. |

### Immaturity hold (proxy)

| Key | Default | Meaning |
|-----|---------|---------|
| `immaturity-hold-days` | `0` | Quarantine proxied artifacts the upstream published within this many days; `0` disables. |

<div class="note">
  A value that will not parse — a bad severity band, a malformed duration or URL — is refused before it is
  stored, and a live edit that fails additionally rolls back atomically, so a typo can neither persist nor
  wedge the running gate: the last good policy keeps serving.
</div>

The gate decides *what may enter and be served*. The next chapter, **Provenance**, is the other half of a
trustworthy supply chain: proving *where an accepted artifact came from* by signing it as it is published.
