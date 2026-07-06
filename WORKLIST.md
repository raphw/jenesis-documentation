# Documentation worklist — writing the chapters

The skeleton (landing page, layout, navigation, styling, deploy pipeline) is in place, and each tool's
**Introduction** chapter is written. This file lists the remaining chapters. Each is **one Markdown file**
in a section folder (see [`README.md`](README.md#writing-a-chapter)); adding the file makes it appear in the
menu automatically.

Work them **top to bottom within a tool**: every chapter assumes only what came before it. Do the four
tools' **Getting started** chapters first (they are what a new reader reaches for), then go deeper.

## Writing conventions

- **Source every chapter from the project's README and its demos — lose nothing.** This documentation is
  becoming the single home of end-user information: the projects' `README.md` files are being shortened to a
  short intro plus genuinely technical/internal detail, and **all end-user content moves here.** So before
  and while writing any chapter, read the relevant project `README.md` in full (and, for the tool section,
  the `demo/*/README.md` files) and pull every piece of end-user information into the chapters. When a topic
  has a chapter, nothing user-facing about it should remain only in a README. Two rules make this safe:
  (1) migrate *end-user* information (how to use, configure, run, the caveats a user hits) — leave
  developer/internal material (implementation internals, contribution notes) in the README; (2) **demos are
  retained**, never migrated — cross-link them. After a section is drafted, do a **completeness pass**: read
  the README top to bottom and confirm every end-user statement now has a home in a chapter (or is
  deliberately technical-only). This is how nothing is lost as the READMEs shrink.
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

The chapter set covers every topic the demos exercise; the demo each chapter should cross-link is noted in
`(demo …)`. Set each chapter's `order` front matter to its number here; Demos stays at `order: 99`.

- [x] **T2 · Getting started** — install with SDKMAN (`sdk install jenesis`); the
  `java build/jenesis/Project.java build` invocation; build the bundled example end to end and read its
  output; a first tour of the `Project.java` record (root, target, layout, steps). *(demo-01…04)*
- [x] **T3 · Core concepts** — the `BuildStep` (input folders → a fresh output folder); the build graph
  (`BuildExecutor`, steps and modules, selectors); layouts (`auto`, `maven`, `modular`, `modular_to_maven`);
  and the **module-system specifics**: multi-release jars, module classifiers, platform guards, and internal
  vs. external build modules. Introduce **incremental change detection** here: a step re-runs when its input
  checksums change *or* its own configuration changes — because the cache content-hashes each step's
  **serialized form**, not just its inputs. Flag the consequence plainly (detailed in *Extending the build*):
  what invalidates a step is its serialized *state*, so editing a step's configuration re-runs it, but that
  is the exact mechanism a custom step must respect. *(demo-02/04/08/27/28/29/30/33/34)*
- [x] **T4 · Configuration** — `jenesis.properties` (global `~/.jenesis` and the project file); per-module
  configuration under `META-INF/build.jenesis/`; profiles; the precedence order. *(demo-15)*
- [x] **T5 · Building & running** — compile / test / jar / javadoc; **compiler arguments** and **annotation
  processing**; running a module's `main` with `Execute.java` (implicit vs. explicit main); watch mode.
  *(demo-05/06/09/10)*
- [x] **T6 · Dependencies** — resolution over Maven and module repositories; **strict pinning** (SHA-256 pins
  in `module-info.java`); how `requires` names are looked up (link to Jenesis Modules); **Maven exclusions**;
  version negotiation. *(demo-26)*
- [x] **T7 · Code quality & testing** *(new topic — the demos cover it, the outline did not)* — formatting and
  static analysis; code coverage; **test selection** (run only the tests a change affects); **mutation
  testing** (pitest). *(demo-11/23/24/25)*
- [x] **T8 · Other JVM languages** *(new)* — Kotlin, Scala, and Groovy: alone and mixed with Java, with their
  code-quality checks, and enabling a Kotlin compiler plugin. *(demo-16…22)*
- [x] **T9 · Supply-chain features** *(new)* — build-time supply-chain support: generating an **SBOM**,
  checking **dependency licences** against policy, and **vulnerability scanning**; the combined
  supply-chain-security setup. (Distinct from the repository's serving-side gate — this is your own build.)
  *(demo-12/13/14/39)*
- [x] **T10 · Packaging & distribution** — executables, `bundle` archives, **launcher jars** (link to the
  Launcher section), jlink runtime images, jpackage installers, native images, publishing, and a BOM.
  *(demo-05/06/07/32/40/41/43)*
- [x] **T11 · Build performance & isolation** — building/launching inside a container
  (`jenesis.project.docker.*` / `jenesis.execute.docker.*`, what is mounted) and sharing outputs through the
  **build cache**. *(demo-38/42)*
- [x] **T12 · Extending the build** — writing your own `BuildStep`, plus custom assemblers and fully custom
  Maven / modular / build definitions. **Custom-step best practices, and the change-detection limitation
  (do not omit these — they are in the README and easy to get wrong):**
  - A step is a **pure function of its input folders** → a fresh output folder; treat it as such.
  - Change detection keys off the step's **serialized state, not its bytecode.** So putting the knobs that
    should invalidate the step into **serialized fields** is what makes editing them re-run it — and,
    conversely, changing a step's *logic* without changing its serialized fields will **not** invalidate the
    cache. Call this trade-off out explicitly with an example.
  - A step must hold only **serializable** state; a captured lambda/function must be declared `Serializable`
    (Jenesis substitutes serializable functional types at the constructor so a captured `Path` works).
    Genuinely non-serializable state throws `NotSerializableException` at hash time, on the first run, rather
    than silently breaking invalidation — mention this so authors read the error correctly.
  *(demo-31/35/36/37)*
- [x] **T13 · jpx** — the module runner: `jpx <module|groupId:artifactId>[@version][/main-class] [args…]`;
  the `--modular`, `--docker`, and `--hash` options; the install layout under `~/.jenesis/jpx/`.
- [x] **T14 · Reference** — the command line and selectors; a configuration-key table; the built-in steps.

  Every demo topic now maps to a chapter (the `(demo …)` tags above). When writing a chapter, add a small
  `tip` linking its demos. The demo list lives in `src/_data/demos.js`; keep it in sync with `demo/` in
  raphw/jenesis when demos are added or renamed.

## Jenesis Launcher (`src/launcher/`)

- [x] **L2 · How it works** — `ModuleLayer` reconstruction via an in-memory module finder; the single loader
  hosting named + unnamed modules; the exploded `modulepath/` and `classpath/` subfolders; on-demand
  `ZipFile` reads; the `application.properties` descriptor.
- [x] **L3 · Producing a launcher jar** — the build-tool packaging option that emits a launcher jar; the jar
  layout; the `Main-Class` manifest wiring.
- [x] **L4 · Running & troubleshooting** — start-up flow; the single-loader consequences (automatic modules
  read the class path, named modules do not; package shadowing follows the JDK's rules); common pitfalls.
- [x] **L5 · Comparison with a fat jar** — module-info collisions, hand-merged `META-INF/services`, and the
  lost module graph — each contrasted with the launcher's subfolder approach.
- [x] **L6 · Reference** — the manifest entries the launcher reads and its own configuration.

## Jenesis Modules (`src/modules/`) — user-facing: how you resolve modules through repo.jenesis.build

- [x] **M2 · Resolving through repo.jenesis.build** — the HTTP service is the product, and this is the
  chapter that matters most. Mine the module README's repository section in full and cover, explicitly:
  - **It is a module-name-addressable mirror of Maven Central.** Every response is a 302 redirect to the jar
    (or POM, or metadata) on Maven Central; the service is a thin wrapper over the resolved TSVs.
  - **The four route modes**, and the version each is keyed by:
    - `artifact` — `/artifact/<name>[/<mavenVersion>]/<file>`, keyed by the **Maven coordinate version**. A
      **transparent Maven proxy**: the request extension passes through verbatim, so it is a **drop-in Maven
      `<repository>` URL**.
    - `module` — `/module/<name>[/<moduleVersion>]/<file>.jar`, keyed by the **module-info version**
      (publisher-declared; falls back to the Maven version). `.jar` only.
    - `sources` and `documentation` — like `module`, but the redirect appends `-sources` / `-javadoc`.
  - **How POMs and other files are read**: because `artifact` mode is extension-transparent, `<name>.pom`,
    `<name>.pom.sha256`, `<name>.module` (Gradle metadata), etc. all resolve — show the worked examples.
  - **How classifiers work**: a `-<classifier>` on the filename flips the lookup to the classifier-scoped
    TSV (`artifacts-<classifier>.tsv` / `modules-<classifier>.tsv`) and becomes the Maven classifier on the
    resulting filename.
  - Following it with `curl -L`; how the Jenesis build tool points here by default; reading the TSVs
    directly (raw GitHub) for your own resolver; and pointing at a mirror that serves the same shapes.
- [x] **M3 · The catalogue & reports** — reading the coverage summary, the per-year "top modules" reports
  (`/top/<year>`) and the current-state bleeding-edge report, and the drift report — as a *user* browsing
  what is modular, not as data files to parse.
- [x] **M4 · How the catalogue is produced** — a short, non-code overview for trust: Maven Central is scanned
  regularly, each artifact's real module name is read, named vs. automatic modules are distinguished, and the
  catalogue self-heals missing entries. Keep it to *what* happens and *how current* it is — not the crawler's
  internals, which are out of scope for user documentation.

## Jenesis Repository (`src/repository/`) — SPI → implementations → settings in every chapter

- [x] **R2 · Getting started** — run the server; publish a Maven artifact and consume it with `mvn`; point it
  at a filesystem store; open the console.
- [x] **R3 · Architecture** — the plug-in model and `ServiceLoader` discovery through each SPI home's
  `resolve()` / `installed()`; the store abstraction at a glance; the publication path (content-addressed
  blob → gate screening → pointer link → after-commit observers).
- [x] **R4 · Storage** — SPI: `ArtifactStore` (streaming read/write, `writeBlob` content addressing,
  `writeVersioned` compare-and-set, `scope`, `list`). Implementations: filesystem, S3, Azure — and how each
  maps the primitives. Settings: store selection, credentials, quota.
- [x] **R5 · Formats** — SPI: `RepositoryFormat` / `ProxyFormat` / `ArtifactLayout`. Implementations: the
  built-in ecosystems (Maven, npm, PyPI, OCI/Docker, NuGet, Gem, Cargo, Conda, Conan, Composer, Go, Debian,
  RPM, …), grouped by shape. Settings: per-format upstreams.
- [x] **R6 · Proxying & groups** — SPI: the fetcher provider. Implementations: pull-through caching and group
  repositories over it; routing. Settings: proxy toggle, upstreams, negative-cache.
- [x] **R7 · The compliance gate** — SPIs: the publication interceptor, gate policy, quality inspector, and
  advisory source. Implementations: licence policy, the vulnerability feeds (OSV, GHSA, EPSS, KEV), malware.
  Settings: `license-allowed`/`-denied`, `vulnerability-threshold`, `malware-action`, `deny-list`.
- [x] **R8 · Provenance** — SPI: the provenance signer. Implementations: keyless Sigstore signing (Fulcio +
  Rekor) and DSSE attestation. Settings: the signing/token configuration.
- [x] **R9 · Search & inventory** — SPI: the search-query provider. Implementations: the Lucene index and the
  licence inventory; the published incremental index. Settings: index enablement and intervals.
- [x] **R10 · Maintenance** — SPI: the maintenance task and its lease. Implementations: cleanup, retention,
  vulnerability re-scan, dependents index, reclamation. Settings: `scheduled-cleanup`, intervals,
  `keep-last`, `max-age`.
- [x] **R11 · Multi-tenancy & authentication** — SPIs: the tenants directory and the auth mechanisms.
  Implementations: routing, key auth, OIDC token exchange, SAML, SCIM; roles and memberships. Settings:
  tenancy mode, default tenant, trusts.
- [x] **R12 · Publish-through forwarding** — SPI: the forward transport. Implementations: the Central Portal
  transport and same-protocol replay over the store-backed outbox. Settings: targets and credentials.
- [x] **R13 · Migration & import** — SPI: the import source. Implementations: the Nexus, Artifactory, and
  Jenesis importers, the generic Maven tree-walk, and format-native enumeration; the `/api/assets` export
  surface. Settings: import triggers and source configuration.
- [ ] **R14 · Observability** — the Micrometer metric convention, the Prometheus endpoint, and OTLP tracing.
  Settings: exposure and tracing toggles.
- [ ] **R15 · The console** — using the web UI: navigating repositories and artifacts, the settings and
  installed-modules screens, and the tenant-scoped view (implicit when there is one tenant). What an operator
  can see and do — not how the console is extended in code.
- [ ] **R16 · Configuration reference** — every setting in one place, grouped by chapter, with defaults.

## Final pass (after all chapters are written)

- [ ] **Mobile-friendliness walkthrough** — once the chapters are done, walk the whole site on a narrow
  (phone-width) viewport and fix anything that overflows or is hard to use: the landing project grid and the
  release/version strip; each tool's chapter menu collapsed behind the "Menu" button (open/close, current
  item); every chapter's prose measure; **code blocks and tables scrolling within their own container with no
  horizontal page overflow**; the demos list; admonitions; the theme toggle and footer. Check both light and
  dark. `npm run serve` with the browser devtools device toolbar (e.g. 360px wide). This is the last item.

---

## Done

- [x] Site skeleton — landing page, `base`/`docs` layouts, sidebar navigation, brand + console styling,
  dark/light theme, mobile layout, the build-validate-deploy pipeline, and `CNAME` for jenesis.build.
- [x] **T1 / L1 / M1 / R1** — each tool's Introduction chapter.
- [x] **Demos page** — `src/tool/demos.njk`, driven by `src/_data/demos.js`, linking every demo in
  raphw/jenesis to its folder on GitHub, grouped and linked from the tool introduction.
