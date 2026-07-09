# Jenesis documentation

The published documentation site for the Jenesis product family (`src/` → jenesis.build). See README.md
for how to build, preview, and validate the site.

## Editorial rules

- **Always write "Java Module System"; never "JPMS".** This applies everywhere reader-visible content
  lives: markdown chapters, `.njk` templates, and data files like `src/_data/demos.js` and the section
  taglines in `eleventy.config.js`. Capitalize the proper name ("the Java Module System", not "the Java
  module system"); generic back-references like "the module system" are fine.
- **The published docs never discuss this documentation project itself or how it is created.** No
  mentions of the site's tooling (Eleventy), the docs repo, authorship, or writing status (e.g.
  "already available", "coming soon", "this site"). Reader navigation is fine ("this chapter covers…",
  "What's in this section"); the docs as an artifact or project are not a topic. README.md is the only
  place that may describe the site and its build.
