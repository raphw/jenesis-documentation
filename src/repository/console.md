---
order: 16
title: The console
description: Using the web console - signing in, browsing repositories and artifacts, reading a repository's settings, the installed-capabilities view, the theme switch, and how the console scopes itself to a tenant.
---

Everything the repository does is reachable over HTTP, but you rarely want to read a namespace with
`curl`. The server ships a small **web console** so an operator can sign in, see what is published,
read how each repository is configured, and confirm which capabilities the deployment is actually
running - all in a browser. This chapter is a tour of what you can see and do there.

The console is served at **`/console`**, and the bare host redirects to it, so pointing a browser at
the server lands you on the console.

## Signing in

The console is deny-by-default: every page requires an authenticated session. How you sign in depends
on how the deployment is set up.

- **A real deployment** authenticates over **OAuth2 / OIDC**. The sign-in page shows one button per
  configured identity provider; you pick yours and complete the login with your organisation's
  account. Configuring those providers is the subject of the
  [Multi-tenancy & authentication](/repository/multi-tenancy-auth/) chapter.
- **A local run** can use the built-in `dev` profile, which swaps in an `admin` / `admin` form login
  so you can open the console without wiring up an identity provider first:

```bash
SPRING_PROFILES_ACTIVE=dev JENESIS_STORE_ROOT=/var/lib/jenesis-repository \
  java -Djenesis.execute.module=source+server build/jenesis/Execute.java
```

<div class="warning">
  The <code>dev</code> profile and its <code>admin</code>/<code>admin</code> account are for local use
  only. Never expose a <code>dev</code>-profile server - a production deployment signs in over OIDC.
</div>

A **Sign out** button sits in the top navigation on every page; using it returns you to the sign-in
page with a confirmation.

## The console page

The console is a single page built from **panels**. Each capability the deployment runs contributes
its own panel - a labelled entry in the top navigation and a card of content below it - and the page
stitches whichever panels are present into one tabbed view. The core server always ships the **browse**
panel; other panels appear as their capabilities are installed.

That is the first useful thing the console tells you: **it shows only what is actually installed.** A
format, a storage backend, or an authentication mechanism that is not on this server's module path
contributes no panel, so the set of panels you see is a live picture of what this deployment can do -
you never have to read the startup log to find out. If a server is running with no panels at all, the
page says so plainly rather than showing a blank screen.

The console also reflects the deployment's mode. On a server running in
[read-only mode](/repository/multi-tenancy-auth/), every console page carries a **read-only banner**, so
nobody wonders why a write was refused - the page itself says the deployment does not accept them.

## Browsing repositories and artifacts

The **browse** view - reachable from its panel and directly at **`/browse`** - is a generic file
browser over any repository's published namespace. It works the same way for every format, because it
reads the repository's own listing rather than knowing about Maven, npm, or OCI layouts.

- It shows the **logical request paths** artifacts are published under (for example
  `maven/org/apache/commons/…`), not the internal content-addressed storage - so what you see is what
  a client would request.
- Each row is either a **folder** or an **artifact**, and artifacts carry a human-readable **size**.
- A **breadcrumb trail** runs across the top: click any segment to jump back up the tree.
- The tree is **lazy**. Each level lists only its immediate children, and a folder's contents are
  fetched only when you open it. A browse never scans or downloads a whole repository, so it stays fast
  over a namespace with millions of entries.
- A **Download asset listing** action streams the repository's full inventory - every published path with
  its size and SHA-256, read straight from the pointer tree. It is the console face of the `GET /api/assets`
  export covered in [Migration & import](/repository/migration-import/), so getting your data out is one
  click, never the paid feature.

<div class="note">
  Because browse reads the published pointer tree and never opens a stored blob, it is cheap even on a
  very large repository, and it can never be steered outside a repository's own namespace - the path is
  guarded against <code>..</code> traversal.
</div>

Browse shows **exactly what a `GET` would serve** - no more. The review subtree where the
[compliance gate](/repository/compliance-gate/) holds quarantined artifacts is never listed and never
navigable, so a reader with browse access cannot enumerate the paths or sizes of withheld artifacts; the
**Download asset listing** export honours the same rule.

## Reading a repository's settings

The console lets you **view a repository and its configuration** - which format it serves, its
upstreams, its quota, and the compliance and other settings that apply to it. Each setting is shown
with its current value and a short inline explanation, so you can read how a repository behaves without
cross-referencing a settings table.

Two cues on the settings view are worth knowing:

- A setting notes whether changing it takes effect **live** or needs a **restart**, so you know before
  you change something whether it applies immediately.
- A setting that has been **changed from its default** is marked as such, so the values you have
  deliberately set stand out from the ones left at their defaults.

Status is shown the same way throughout the console: an artifact carries a badge such as **passed**,
**quarantined**, or **signed**, and - because colour is never the only signal - the badge always spells
the state out in words as well. Those states come from the
[compliance gate](/repository/compliance-gate/) and [provenance](/repository/provenance/) chapters.

## The installed-capabilities view

Alongside the per-repository settings, the console surfaces **what the server itself is running**:
which formats, storage backend, compliance screens, importers, and authentication mechanisms are
installed on this deployment. This is the operator's answer to "is the OSV feed actually on?" or "does
this server have the S3 backend?" - read straight from the running process rather than inferred from
configuration files.

The view is organised the way the server itself is: an **SPI catalog**, grouped by the *seam* - the
plug-in point from [Architecture](/repository/architecture/) - with the installed implementations that
provide each listed beneath it. It is pure discovery over the running process's Java Module System graph,
the same `provides` declarations the server loads plug-ins from, so what you read here is what the
dispatcher actually discovered - and it reads no artifact data to say so.

It is the same principle as the panels: a capability that is not installed simply does not appear.
Confirming a capability here is the quickest way to check that an intended module made it onto the
deployment's module path.

## The tenant-scoped view

Everything the console shows is scoped to **one tenant at a time**. On a single-tenant server - the
default - that scoping is invisible: there is exactly one tenant, so every repository, artifact, and
setting you see already belongs to it, and there is no tenant to choose.

When the deployment has a **tenant directory** installed, the console additionally offers
**tenant management** - the screens to see and administer tenants - and the views become explicitly
scoped to the tenant you are working in. A server without a tenant directory offers no such screens at
all; the capability simply is not there. Tenancy modes and how tenants are administered are covered in
the [Multi-tenancy & authentication](/repository/multi-tenancy-auth/) chapter.

## Theme and accessibility

A compact **theme switch** in the navigation offers **Auto**, **Light**, and **Dark**. Your choice is
remembered in the browser - it is a per-browser presentation preference, not a server setting, so it
never affects anyone else - and **Auto** follows your operating system's light/dark preference.

The console is built to an accessibility baseline you can rely on: a "skip to content" link as the
first stop, every control reachable and operable from the keyboard with a visible focus ring, status
never conveyed by colour alone, and AA-level contrast in both the light and dark themes.
