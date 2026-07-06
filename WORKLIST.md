# Documentation worklist — writing the chapters

The skeleton (landing page, layout, navigation, styling, deploy pipeline) is in place, and each tool's
**Introduction** chapter is written. This file lists the remaining chapters. Each is **one Markdown file**
in a section folder (see [`README.md`](README.md#writing-a-chapter)); adding the file makes it appear in the
menu automatically.

Work them **top to bottom within a tool**: every chapter assumes only what came before it. Do the four
tools' **Getting started** chapters first (they are what a new reader reaches for), then go deeper.

## Writing conventions

- **Audience: users and operators, not developers.** This is user documentation — how to *use* and *run*
  the tools. Write for the person building with Jenesis, running a repository, or resolving a module — not
  for someone modifying Jenesis itself. No internals tours, no "how to contribute", no code-level walk of a
  class. The repository's SPI-first chapters (below) are still user-facing: the SPI is presented as *what a
  capability does and that it is a swappable, discoverable plug-in point an operator chooses and configures*
  — never as an interface to implement in code.
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
- **Repository chapters follow a fixed order** (below): the **capability (its SPI)** first — what it does and
  that it is a discovered, swappable plug-in point — then the **implementations** you can choose, then the
  **settings** that configure them. Frame the SPI as the shortest statement of what the capability *does* and
  what you are choosing between, not as an interface to implement.

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

## Jenesis Modules (`src/modules/`) — user-facing: how you resolve modules through repo.jenesis.build

- [ ] **M2 · Resolving through repo.jenesis.build** — the HTTP service is the product. Document the URL
  shapes (`/module/<name>[/<version>]`, `/artifact/<…>`), the 302-redirect-to-Maven-Central contract, how
  versions and classifiers are requested, following it with `curl -L`, how the Jenesis build tool uses it by
  default, and pointing at a mirror that serves the same shapes. This is the chapter that matters most.
- [ ] **M3 · The catalogue & reports** — reading the coverage summary, the per-year "top modules" reports
  (`/top/<year>`) and the current-state bleeding-edge report, and the drift report — as a *user* browsing
  what is modular, not as data files to parse.
- [ ] **M4 · How the catalogue is produced** — a short, non-code overview for trust: Maven Central is scanned
  regularly, each artifact's real module name is read, named vs. automatic modules are distinguished, and the
  catalogue self-heals missing entries. Keep it to *what* happens and *how current* it is — not the crawler's
  internals, which are out of scope for user documentation.

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
- [ ] **R15 · The console** — using the web UI: navigating repositories and artifacts, the settings and
  installed-modules screens, and the tenant-scoped view (implicit when there is one tenant). What an operator
  can see and do — not how the console is extended in code.
- [ ] **R16 · Configuration reference** — every setting in one place, grouped by chapter, with defaults.

---

## Done

- [x] Site skeleton — landing page, `base`/`docs` layouts, sidebar navigation, brand + console styling,
  dark/light theme, mobile layout, the build-validate-deploy pipeline, and `CNAME` for jenesis.build.
- [x] **T1 / L1 / M1 / R1** — each tool's Introduction chapter.
