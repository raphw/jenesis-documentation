# Jenesis documentation

The documentation site for the Jenesis product family, published at **[jenesis.build](https://jenesis.build)**.

It is a static site built with [Eleventy](https://www.11ty.dev/): the landing page presents the tools, and
each tool has its own documentation section with a left-hand menu of chapters. The visual style reuses the
Jenesis Repository console's design system (`app.css` over Pico) plus the Jenesis brand palette and font.

## Working on it

```bash
npm install
npm run serve      # local preview with live reload
npm run build      # produce _site/
npm run validate   # check internal links in _site/
npm run check      # build + validate (what CI runs)
```

Deployment is automatic: pushing to `main` builds the site, validates every internal link, and — only if
that passes — publishes to GitHub Pages. A broken link fails the deploy.

## How the site is structured

- `src/index.njk` — the landing page (the project grid).
- `src/<section>/` — one folder per tool: `tool`, `launcher`, `modules`, `repository`. Each folder's
  `<section>.json` sets the shared layout and menu title.
- `src/_includes/` — the page shell (`base.njk`) and the documentation layout with the sidebar
  (`docs.njk`).
- `src/assets/` — CSS (`pico.min.css`, `app.css`, `docs.css`), the logos and font, and the small theme /
  navigation scripts.

## Writing a chapter

A chapter is **one Markdown file** in a section folder with three lines of front matter:

```markdown
---
order: 3
title: Core concepts
description: Build steps, the build graph, and layouts.
---

Prose, `code`, and admonitions...
```

`order` places it in the left menu; nothing else needs touching — the menu and the previous/next links are
derived from the files that exist. Keep chapters focused: short sections under clear headings, a `<div
class="note">`, `class="tip">`, or `class="warning">` callout where it earns its place, and code blocks for
anything runnable. The list of chapters still to write is in [`WORKLIST.md`](WORKLIST.md).
