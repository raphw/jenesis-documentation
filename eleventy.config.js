// Eleventy configuration for the Jenesis documentation site.
//
// Content model: every documentation page carries front matter { section, order, title }.
// `section` is one of tool | launcher | modules | repository and groups the page into that
// tool's left-hand menu; `order` sorts it within the menu. A new chapter is a single Markdown
// file with that front matter - it appears in the menu automatically, so adding a chapter never
// has to touch navigation.

export default function (eleventy) {
  // Static assets pass through untouched (CSS, JS, logos, fonts, the CNAME).
  eleventy.addPassthroughCopy({ "src/assets": "assets" });
  eleventy.addPassthroughCopy({ "src/CNAME": "CNAME" });

  // One collection per tool section, sorted by the page's `order`, so the sidebar and the
  // prev/next links are derived from the files that actually exist.
  for (const section of ["tool", "launcher", "modules", "repository"]) {
    eleventy.addCollection(section, (api) =>
      api
        .getFilteredByGlob(`src/${section}/**/*.md`)
        .sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0))
    );
  }

  // The four sections as an ordered list, for the landing page and the top navigation.
  eleventy.addGlobalData("sections", () => [
    { key: "tool", url: "/tool/", logo: "jenesis-tool", repo: "https://github.com/raphw/jenesis", title: "Jenesis", tagline: "The Java-native build tool." },
    { key: "jpx", url: "/jpx/", logo: "jenesis-jpx", repo: "https://github.com/raphw/jenesis", title: "Jenesis JPX", tagline: "Runs any published module with a single command - npx for the module path." },
    { key: "launcher", url: "/launcher/", logo: "jenesis-launcher", repo: "https://github.com/raphw/jenesis-launcher", title: "Jenesis Launcher", tagline: "Executable jars that keep real Java modularity - no fat-jar merge." },
    { key: "modules", url: "/modules/", logo: "jenesis-modules", repo: "https://github.com/raphw/jenesis-modules", title: "Jenesis Modules", tagline: "A catalogue mapping Maven artifacts to stable module names for the Java Module System." },
    { key: "repository", url: "/repository/", logo: "jenesis-repository", repo: "https://github.com/raphw/jenesis-repository", title: "Jenesis Repository", tagline: "A modular, database-free artifact repository with a supply-chain gate." },
  ]);

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
