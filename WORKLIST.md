# Documentation worklist — writing the chapters

The skeleton (landing page, layout, navigation, styling, deploy pipeline) is in place, and each tool's
**Introduction** chapter is written. This file lists the remaining chapters. Each is **one Markdown file**
in a section folder (see [`README.md`](README.md#writing-a-chapter)); adding the file makes it appear in the
menu automatically.

Work them **top to bottom within a tool**: every chapter assumes only what came before it. Do the four
tools' **Getting started** chapters first (they are what a new reader reaches for), then go deeper.

## Writing conventions

- **Build from zero knowledge.** The first chapters assume nothing; later ones assume the earlier ones.
  Never forward-reference a concept you have not introduced.
- **Stay focused — no wall of text.** Short sections under clear `##`/`###` headings. If a section runs past
  a screen or two, it is probably two sections. Prefer a small runnable example to three paragraphs.
- **Use the reading aids.** Code blocks for anything runnable; a `note` / `tip` / `warning` admonition for a
  caveat or a shortcut (not on every page — only where it earns its place); a short table for a set of keys
  or options. These are already styled and mobile-friendly.
- **One idea per paragraph**, active voice, second person ("you run", not "one runs").
- **End meatier chapters** with a one-line "next" pointer only if it is not obvious; the prev/next pager is
  automatic.
- **Repository chapters follow a fixed order** (below): the **SPI** first (the interface and its contract),
  then the **implementations**, then the **settings** that tune them. Read a chapter's SPI even to use a
  built-in — it is the shortest statement of what the capability does.

Verify while writing: `npm run check` builds and link-checks; open `npm run serve` and read the page on a
narrow viewport to confirm it stays readable.

> **Not yet:** a fifth product, **Jenesis Depot**, will get its own section later, documented in the same
> style as the repository (SPI → implementations → settings). Do **not** add it or mention it anywhere in the
> site yet — the logo and route are deliberately left out.

---

## Jenesis — the build tool (`src/tool/`)

- [ ] **T2 · Getting started** — install with SDKMAN (`sdk install jenesis`); the
  `java build/jenesis/Project.java build` invocation; build the bundled example end to end and read its
  output; a first tour of the `Project.java` record (root, target, layout, steps) — enough to recognise, not
  yet to master.
- [ ] **T3 · Core concepts** — the `BuildStep` (input folders → a fresh output folder, and how caching
  keys off inputs); the build graph (`BuildExecutor`, steps and modules, selectors with `/`, `:`, `::`);
  layouts (`auto`, `maven`, `modular`, `modular_to_maven`) and what each emits.
- [ ] **T4 · Configuration** — `jenesis.properties` (the global `~/.jenesis` file and the project file);
  per-module configuration under `META-INF/build.jenesis/`; profiles; the precedence order of the config
  channels.
- [ ] **T5 · Building & running** — the compile / test / jar / javadoc steps; running a module's `main` with
  `Execute.java` (implicit vs. explicit main selection); watch mode.
- [ ] **T6 · Dependencies** — resolution over Maven and module repositories; **strict pinning** (the
  SHA-256 pins in `module-info.java` and why); how `requires` names are looked up (link to Jenesis Modules);
  version negotiation.
- [ ] **T7 · Packaging & distribution** — jlink runtime images, jpackage installers, native images, `bundle`
  archives, and **launcher jars** (link to the Launcher section); the JReleaser handoff and SDKMAN
  publication.
- [ ] **T8 · Running in Docker** — `jenesis.project.docker.*` to build inside a container, and
  `jenesis.execute.docker.*` to launch inside one; what is mounted and why.
- [ ] **T9 · jpx** — the module runner: `jpx <module|groupId:artifactId>[@version][/main-class] [args…]`;
  the `--modular`, `--docker`, and `--hash` options; the install layout under `~/.jenesis/jpx/`; how it
  resolves and caches.
- [ ] **T10 · Reference** — the command line and selectors; a configuration-key table; the built-in steps.

## Jenesis Launcher (`src/launcher/`)

- [ ] **L2 · How it works** — `ModuleLayer` reconstruction via an in-memory module finder; the single loader
  hosting named + unnamed modules; the exploded `modulepath/` and `classpath/` subfolders; on-demand
  `ZipFile` reads; the `application.properties` descriptor.
- [ ] **L3 · Producing a launcher jar** — the build-tool packaging option that emits a launcher jar; the jar
  layout; the `Main-Class` manifest wiring.
- [ ] **L4 · Running & troubleshooting** — start-up flow; the single-loader consequences (automatic modules
  read the class path, named modules do not; package shadowing follows the JDK's rules); common pitfalls.
- [ ] **L5 · Comparison with a fat jar** — module-info collisions, hand-merged `META-INF/services`, and the
  lost module graph — each contrasted with the launcher's subfolder approach.
- [ ] **L6 · Reference** — the manifest entries the launcher reads and its own configuration.

## Jenesis Modules (`src/modules/`)

- [ ] **M2 · Using the catalogue** — the `data/modules/<dotted-name>/` layout (`modules.tsv`,
  `artifacts.tsv`, `versions.tsv`); looking a module name up to a Maven coordinate; the aggregated
  `module-maven.properties`; consuming the mapping from a build.
- [ ] **M3 · How it is built** — the Maven Central Nexus index walk (the streaming reader); the scanner's
  module-name extraction (root vs. multi-release `module-info`, `Automatic-Module-Name`); the named vs.
  automatic distinction; the classifier-less "masked main jar" problem and how it is handled.
- [ ] **M4 · The published data** — `SUMMARY.md`; the per-year "top modules" reports (`data/top/<year>.md`)
  and the current-state `BLEEDING.md`; `DRIFTERS.md`.
- [ ] **M5 · Companion tools** — `ReconcileMetadata` (versions missing from the index), `LoadCoordinates`
  (seed a coordinate the index has not caught up to), `RetryFailed`, `IndexProbe`, `Regenerate`, `ModuleMaven`.
- [ ] **M6 · Reference** — the TSV column formats; the crawler's configuration keys; the scheduled workflows.

## Jenesis Repository (`src/repository/`) — SPI → implementations → settings in every chapter

- [ ] **R2 · Getting started** — run the server; publish a Maven artifact and consume it with `mvn`; point it
  at a filesystem store; open the console.
- [ ] **R3 · Architecture** — the plug-in model and `ServiceLoader` discovery through each SPI home's
  `resolve()` / `installed()`; the store abstraction at a glance; the publication path (content-addressed
  blob → gate screening → pointer link → after-commit observers).
- [ ] **R4 · Storage** — SPI: `ArtifactStore` (streaming read/write, `writeBlob` content addressing,
  `writeVersioned` compare-and-set, `scope`, `list`). Implementations: filesystem, S3, Azure — and how each
  maps the primitives. Settings: store selection, credentials, quota.
- [ ] **R5 · Formats** — SPI: `RepositoryFormat` / `ProxyFormat` / `ArtifactLayout`. Implementations: the
  built-in ecosystems (Maven, npm, PyPI, OCI/Docker, NuGet, Gem, Cargo, Conda, Conan, Composer, Go, Debian,
  RPM, …), grouped by shape. Settings: per-format upstreams.
- [ ] **R6 · Proxying & groups** — SPI: the fetcher provider. Implementations: pull-through caching and group
  repositories over it; routing. Settings: proxy toggle, upstreams, negative-cache.
- [ ] **R7 · The compliance gate** — SPIs: the publication interceptor, gate policy, quality inspector, and
  advisory source. Implementations: licence policy, the vulnerability feeds (OSV, GHSA, EPSS, KEV), malware.
  Settings: `license-allowed`/`-denied`, `vulnerability-threshold`, `malware-action`, `deny-list`.
- [ ] **R8 · Provenance** — SPI: the provenance signer. Implementations: keyless Sigstore signing (Fulcio +
  Rekor) and DSSE attestation. Settings: the signing/token configuration.
- [ ] **R9 · Search & inventory** — SPI: the search-query provider. Implementations: the Lucene index and the
  licence inventory; the published incremental index. Settings: index enablement and intervals.
- [ ] **R10 · Maintenance** — SPI: the maintenance task and its lease. Implementations: cleanup, retention,
  vulnerability re-scan, dependents index, reclamation. Settings: `scheduled-cleanup`, intervals,
  `keep-last`, `max-age`.
- [ ] **R11 · Multi-tenancy & authentication** — SPIs: the tenants directory and the auth mechanisms.
  Implementations: routing, key auth, OIDC token exchange, SAML, SCIM; roles and memberships. Settings:
  tenancy mode, default tenant, trusts.
- [ ] **R12 · Publish-through forwarding** — SPI: the forward transport. Implementations: the Central Portal
  transport and same-protocol replay over the store-backed outbox. Settings: targets and credentials.
- [ ] **R13 · Migration & import** — SPI: the import source. Implementations: the Nexus, Artifactory, and
  Jenesis importers, the generic Maven tree-walk, and format-native enumeration; the `/api/assets` export
  surface. Settings: import triggers and source configuration.
- [ ] **R14 · Observability** — the Micrometer metric convention, the Prometheus endpoint, and OTLP tracing.
  Settings: exposure and tracing toggles.
- [ ] **R15 · The console** — the web UI; the `ServerModuleProvider` and `ConsoleModuleProvider` contribution
  seams; the settings and modules screens; the tenant-scoped view.
- [ ] **R16 · Configuration reference** — every setting in one place, grouped by chapter, with defaults.

---

## Done

- [x] Site skeleton — landing page, `base`/`docs` layouts, sidebar navigation, brand + console styling,
  dark/light theme, mobile layout, the build-validate-deploy pipeline, and `CNAME` for jenesis.build.
- [x] **T1 / L1 / M1 / R1** — each tool's Introduction chapter.
