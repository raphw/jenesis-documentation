// The Jenesis build-tool demos, grouped for the Demos page. Each demo is a self-contained project in the
// jenesis repository under demo/<slug>; `repo` builds the link to its folder on GitHub.
//
// Keep this in sync with the demo/ directory of raphw/jenesis (the list is stable and numbered). It is a
// committed data file rather than a build-time fetch so the docs build stays offline and can never be
// broken by a GitHub API hiccup.

export default {
  repo: "https://github.com/raphw/jenesis/tree/main/demo",
  groups: [
    {
      title: "Getting started",
      blurb: "The four foundational project shapes — start here.",
      demos: [
        { slug: "demo-01-java-pom", name: "Java (Maven layout)", blurb: "A single-module Java project in the classic Maven layout." },
        { slug: "demo-02-java-modular", name: "Java (modular layout)", blurb: "The same, as a real JPMS module with a module-info." },
        { slug: "demo-03-java-pom-multi", name: "Multi-module (Maven)", blurb: "Several Maven-layout modules built together." },
        { slug: "demo-04-java-modular-multi", name: "Multi-module (modular)", blurb: "A multi-module modular project and its module graph." },
      ],
    },
    {
      title: "Executables & packaging",
      blurb: "Turning a project into something you can ship and run.",
      demos: [
        { slug: "demo-05-java-pom-executable", name: "Executable (Maven)", blurb: "A runnable application from a Maven-layout project." },
        { slug: "demo-06-java-modular-executable", name: "Executable (modular)", blurb: "A runnable modular application." },
        { slug: "demo-07-bundle", name: "Bundle", blurb: "A self-contained bundle archive of an application." },
        { slug: "demo-32-custom-jmod", name: "jlink & jpackage", blurb: "A custom jmod, a jlink runtime image, and a jpackage installer." },
        { slug: "demo-41-native-image", name: "Native image", blurb: "A GraalVM native image built end to end." },
        { slug: "demo-40-publishing", name: "Publishing", blurb: "Publishing artifacts to a repository." },
        { slug: "demo-43-bom", name: "Bill of materials", blurb: "Producing a BOM for downstream consumers." },
      ],
    },
    {
      title: "JVM languages",
      blurb: "Kotlin, Scala and Groovy — alone, mixed with Java, and with quality tooling.",
      demos: [
        { slug: "demo-16-kotlin", name: "Kotlin", blurb: "A Kotlin (and mixed Java/Kotlin) project." },
        { slug: "demo-17-kotlin-quality", name: "Kotlin quality", blurb: "Kotlin with formatting and static-analysis checks." },
        { slug: "demo-18-kotlin-plugin", name: "Kotlin compiler plugin", blurb: "Enabling a Kotlin compiler plugin." },
        { slug: "demo-19-scala", name: "Scala", blurb: "A Scala (and mixed Java/Scala) project." },
        { slug: "demo-20-scala-quality", name: "Scala quality", blurb: "Scala with code-quality checks." },
        { slug: "demo-21-groovy", name: "Groovy", blurb: "A Groovy (and mixed Java/Groovy) project." },
        { slug: "demo-22-groovy-quality", name: "Groovy quality", blurb: "Groovy with code-quality checks." },
      ],
    },
    {
      title: "Quality & testing",
      blurb: "Keeping a codebase healthy and tests fast.",
      demos: [
        { slug: "demo-11-java-quality", name: "Code quality", blurb: "Formatting and static analysis for Java." },
        { slug: "demo-23-code-coverage", name: "Code coverage", blurb: "Measuring test coverage." },
        { slug: "demo-24-test-selection", name: "Test selection", blurb: "Running only the tests a change can affect." },
        { slug: "demo-25-pitest", name: "Mutation testing", blurb: "Mutation testing with pitest, discovered from config." },
      ],
    },
    {
      title: "Supply chain & security",
      blurb: "Knowing and governing what your build depends on.",
      demos: [
        { slug: "demo-12-sbom", name: "SBOM", blurb: "Generating a software bill of materials." },
        { slug: "demo-13-compliance", name: "Dependency licensing", blurb: "Checking dependency licences against policy." },
        { slug: "demo-14-vulnerabilities", name: "Vulnerabilities", blurb: "Scanning dependencies for known vulnerabilities." },
        { slug: "demo-39-supply-chain-security", name: "Supply-chain security", blurb: "The supply-chain hardening features together." },
      ],
    },
    {
      title: "The module system",
      blurb: "Working with JPMS in earnest.",
      demos: [
        { slug: "demo-08-java-multi-release", name: "Multi-release JAR", blurb: "A multi-release jar with a versioned module-info." },
        { slug: "demo-27-module-layout", name: "Pure modular layout", blurb: "A strictly modular source layout." },
        { slug: "demo-28-module-classifier", name: "Module classifier", blurb: "Publishing a classified module artifact." },
        { slug: "demo-29-platform-guard", name: "Platform guard", blurb: "Guarding platform-specific code paths." },
        { slug: "demo-30-platform-guard-pom", name: "Platform guard (Maven)", blurb: "The platform guard in a Maven layout." },
        { slug: "demo-33-internal-module", name: "Internal module", blurb: "An internal, non-exported build module." },
        { slug: "demo-34-external-module", name: "External module", blurb: "Loading an external build module." },
      ],
    },
    {
      title: "Build customization",
      blurb: "Reaching past the defaults.",
      demos: [
        { slug: "demo-09-javac-arguments", name: "Compiler arguments", blurb: "Passing custom arguments to javac." },
        { slug: "demo-10-annotations", name: "Annotation processing", blurb: "Running an annotation processor." },
        { slug: "demo-15-profiles", name: "Build profiles", blurb: "Switching configuration with profiles." },
        { slug: "demo-26-maven-exclusions", name: "Maven exclusions", blurb: "Excluding transitive Maven dependencies." },
        { slug: "demo-31-custom-assembler", name: "Custom assembler", blurb: "A custom assembly step." },
        { slug: "demo-35-custom-maven", name: "Custom Maven build", blurb: "Customising a Maven-layout build." },
        { slug: "demo-36-custom-modular", name: "Custom modular build", blurb: "Customising a modular build." },
        { slug: "demo-37-custom-build", name: "Custom build", blurb: "A fully custom build definition." },
        { slug: "demo-38-docker-isolation", name: "Docker isolation", blurb: "Running the build isolated in a container." },
        { slug: "demo-42-build-cache", name: "Build cache", blurb: "Sharing build outputs through a cache." },
      ],
    },
  ],
};
