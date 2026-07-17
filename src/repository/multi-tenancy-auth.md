---
order: 11
title: Multi-tenancy & authentication
description: One server, many isolated tenants, and every request identified by a key. The tenant-directory and authentication capabilities, the fixed- vs. multi-tenant routing and the key/OIDC/SAML/SCIM mechanisms that implement them, the deployment-wide read-only mode, and the settings that switch enforcement on.
---

Everything so far assumed a single, open repository. A real deployment serves **many teams from one server**,
keeps their artifacts apart, and lets in only requests that carry a valid credential. Both of those -
**who a request belongs to** and **whether it is allowed** - are capabilities the repository discovers, so a
plain free server runs open and single-tenant, and a larger deployment adds tenancy and enforcement without a
different binary.

By default a fresh server is **open**: no key is required and every request is allowed. Turning on
enforcement (`jenesis.repository.auth=true`) flips it to **deny-by-default** - the machine-to-machine artifact
API is keyed by a header, with no browser session, no CSRF and no HTTP Basic in the way.

<div class="warning">
  Until you set <code>jenesis.repository.auth=true</code>, the server accepts <strong>every</strong> request,
  keyed or not. That is the right default for a laptop or a trusted network, and the wrong one for anything
  reachable. Enable enforcement before you expose the server.
</div>

## The capabilities

### The tenant directory

A **tenant** is a top-level owner of artifact spaces. Every object the repository stores lives under a
`<tenant>/<repository>/…` scope (introduced in [Storage](/repository/storage/)), so isolating one team from
another is just a different top-level scope - no separate database, no second deployment.

**Which tenants exist, and the lifecycle to add one, is a discovered capability.** With no tenant-directory
module installed, the directory is exactly the **one configured tenant** (`jenesis.repository.tenant`,
`default` unless set) and it cannot grow. A multi-tenant edition installs a directory backed by the store,
whose tenants are the top-level scopes themselves, and can create new ones on demand.

The server reports whether the capability is present, so a console or API offers **tenant management only when
a directory module is installed** - a plain server never shows a control it cannot honour. The important
consequence is that both shapes share **one store layout**: switching a deployment between single- and
multi-tenant is a configuration change, and the data is found where it was left.

### The authentication seam

Enforcement runs one **credential model** - a key on a request, checked against stored grants - behind a
composition seam. Two things plug into that seam:

- **Token exchange** - a discovered mechanism that trades a workload's identity token for a short-lived key,
  so a CI job never stores a static secret. With none installed, the exchange endpoint reports the feature is
  not installed rather than failing closed.
- **Richer sign-in and directory mechanisms** - a multi-tenant edition layers console **OIDC/SAML** login and
  **SCIM** user/group provisioning over the same baseline chain, reusing the key model and rate limiter rather
  than forking them.

So the always-present mechanism is **key authentication**; the others are capabilities a deployment adds. The
sections below take each in turn.

## Implementations

### Fixed-tenant vs. multi-tenant routing

Every request is resolved to a `(tenant, repository)` space by a **routing** the deployment picks:

- **Fixed-tenant routing** (the free default) sends every request to the one configured space -
  `jenesis.repository.tenant` / `jenesis.repository.repository`, each `default`. Artifacts are served under
  the `/repository/…` prefix (stripped so a format sees its own `/maven/`, `/raw/` … path); the OCI `/v2/`
  registry stays at the host root where the Docker protocol pins it.
- **Multi-tenant routing** (an edition) reads the **tenant from the request's key** - the key carries its own
  tenant, so resolution stays stateless - and the **repository from the first path segment**, then strips that
  segment from the path a format sees.

Both address the same `<tenant>/<repository>/…` layout, which is why the switch is configuration only.

### Key authentication

An enforcing request carries its credential in the **`Jenesis-Repository-Key`** header (and, where the route
does not already name it, the target repository in `Jenesis-Repository-Name`). A GET or HEAD needs
`repository:read`; any other method needs `repository:write`.

A key is minted in a **scannable, self-describing** form:

```
jenk_<tenant>.<secret><checksum>
```

- the **`jenk_` prefix** and the trailing **CRC checksum** let a secret scanner recognise a leaked Jenesis key
  and validate it offline, and let the server reject a malformed or truncated key with **no store lookup**;
- the **tenant travels in the key**, so a multi-tenant deployment resolves the owner without a directory read;
- only the key's **SHA-256 hash is ever stored** - never the secret itself.

#### Grants: scopes and rights

A credential's rights are stored as a map of **scope → rights**:

- A **scope** is a repository name (`*` matches every repository), optionally narrowed to a path prefix as
  `<repo>:<prefix>` - a prefix grant covers a request only when its path lies **at or under** the prefix on a
  segment boundary. So one key can hold repository-wide and path-scoped rights at once.
- A **right** is a `<surface>:<verb>` token. The built-in surfaces are `repository`, `cache` and `manage`,
  each with a `read` and a `write` verb. A `<surface>:*` token grants every verb on that surface, and a bare
  `*` grants everything - an owner key.

| Right | Allows |
|-------|--------|
| `repository:read` / `repository:write` | resolve from / publish to a repository |
| `cache:read` / `cache:write` | read / populate the pull-through cache |
| `manage:read` / `manage:write` | view / change management surfaces |

Because a right names its surface, **one key can carry any mix** - repository, cache and management rights
together - which is how a single credential authorises a combined deployment. A grant check reads the stored
objects on **every request**, so revoking or narrowing a grant takes effect at once, and an **expired key is
rejected before its grants are even read**.

#### Lifetime, rotation, and containment

A minted key **expires by default** - 90 days unless a shorter one is requested - and a deployment or tenant
policy can set both a **default lifetime** and a **hard ceiling** no key may outlive. A key can be **rotated**:
a successor inherits the same label, grants and allowlist with a fresh lifetime, and the old key keeps working
for a short **overlap** (a week by default) so callers swap over with no downtime.

Two containment controls narrow a key further:

- a **source-IP allowlist** (CIDRs) refuses a key used from an unlisted address, so a stolen key is useless off
  its network - with `X-Forwarded-For` honoured only from a trusted proxy, so a client cannot spoof its own
  address;
- a leaked key can be **revoked immediately** by its raw value (the tenant and checksum are read straight off
  the key), and the credential-usage capability stamps each key's **last-use time, address and count** (batched
  off-request) so an unused or misused key is visible.

<div class="note">
  Provisioning, rotating, listing and revoking credentials - and editing roles, trusts and per-tenant policy -
  are done through the console or admin API of a deployment that installs the management capability. A plain
  free server enforces the same stored grants; it just has no built-in surface to edit them.
</div>

### Roles and memberships

Raw `<surface>:<verb>` tokens are precise but unfriendly, so a **role** bundles them under a name. Three
built-in roles form a hierarchy a console can offer directly:

| Role | Bundles |
|------|---------|
| `read-only` | `cache:read`, `repository:read` |
| `deploy` | adds `cache:write`, `repository:write` |
| `admin` | `*` - everything |

A tenant can define **custom roles** (and override a built-in name), so membership in a role is how you grant a
person or a CI identity a coherent set of rights without spelling out tokens.

### OIDC token exchange

A CI job already holds an identity token from its platform. **Token exchange** trades that token for a
short-lived Jenesis key, so the pipeline stores **no static secret at all**. Install the OIDC module
(`source/oidc`) and the exchange is live - there is nothing more to configure, because *which* issuers are
honoured is **per-tenant trust data**, not deployment configuration.

Each tenant keeps a set of named **trusts**. A presented token is admitted only when it matches one:

- its **issuer** must name a configured trust - a forged or foreign token matches nothing;
- its signature is verified by that issuer's published **JWKS** (via standard OIDC discovery, with key rotation
  and caching handled by the vetted Spring/Nimbus decoder - not hand-rolled crypto);
- the trust's **audience** and **subject** (a glob, blank for any) must match.

On a match, a fresh key is minted carrying the trust's **scope and rights**, expiring after the trust's **TTL**
(an hour by default). A trust therefore reads as: *a token from this issuer, for this audience and subject, is
worth this much, for this long.*

<div class="tip">
  This is the recommended way to let CI publish. The build's OIDC token is exchanged at job start for a key
  scoped to exactly the repository it may write, and it expires on its own - nothing to store in the pipeline,
  nothing to rotate, nothing to leak.
</div>

### Console sign-in: OIDC, SAML and SCIM

The mechanisms above authenticate **machines**. **People** sign in to the [console](/repository/console/) over
OAuth2 / **OIDC** - or, in a multi-tenant edition, **SAML** - and a directory can push users and groups in over
**SCIM**, mapping group membership to the roles above. These sign-in and provisioning mechanisms are edition
capabilities that plug into the same authentication seam and resolve to the same credential model, so a
person's console rights and a token's API rights are one grant system.

<div class="note">
  For a <strong>local run</strong>, the <code>dev</code> profile
  (<code>SPRING_PROFILES_ACTIVE=dev</code>) swaps in a built-in <code>admin</code>/<code>admin</code> form
  login so you can open the console without an identity provider - see
  <a href="/repository/getting-started/">Getting started</a>. It is for local use only.
</div>

Whichever mechanism denies a request, the server records the failure by **mechanism** (`key`, `oidc` or
`saml`) and outcome, exposed as a metric so a dashboard can watch authentication health across all of them at
once.

## Read-only mode

Authentication decides *who* may write; a second, deployment-wide switch removes writing altogether.
**Read-only mode** (`jenesis.repository.read-only=true`, env `JENESIS_REPOSITORY_READ_ONLY`, off by default)
refuses **every** write with `403` - a hosted publish, an import, every mutating admin action - while browse,
download, search and all read APIs work normally.

The refusal is enforced at one low-level choke point: a decorator wraps the storage seam itself, so an
*internal* write - a pull-through proxy caching an upstream artifact, an import replaying assets - is refused
before any bytes are stored, and the write-producing background jobs are disabled. There is no path around
it, whatever credentials a request carries.

Two deployments want this:

- **A browsable-but-immutable demo or archive** - the contents are the point; changing them is not.
- **A public read-only mirror.** Pair one firewalled read-write instance that publishes into a shared store
  with public read-only instances serving reads from it - the public face cannot be made to write, not even
  through its own proxy caching.

A client or console does not have to probe for the mode: the server advertises it, together with whether the
wire is credential-gated, at a capability endpoint - `GET /api/capabilities` answers a small JSON map
(`readOnly`, `auth`) a distribution extends as it adds capabilities - and the
[console](/repository/console/) shows a read-only banner when the mode is on.

## Settings

Authentication and tenancy are pinned from above the store - an environment variable or a
`-Djenesis.repository.<key>=…` system property - since they decide how the wire is gated before any tenant
configuration is read.

| Key | Default | Meaning |
|-----|---------|---------|
| `auth` | `false` | Enforce the credential model. `false` leaves the server **open** - every request allowed. |
| `read-only` | `false` | Refuse every write - external or internal - with `403`, while all reads work normally. Advertised at `GET /api/capabilities`. |
| `tenant` | `default` | The tenant of the fixed artifact space a single-tenant deployment serves. A multi-tenant routing ignores it and reads the tenant from the key. |
| `repository` | `default` | The repository of that fixed space. A multi-tenant routing reads the repository from the request path instead. |

Beyond these, the finer-grained controls are **per-tenant data** held in the store - credential lifetime
**policy** (default and ceiling), OIDC **trusts**, custom **roles**, and a tenant's **quota** and
**[rate limit](/repository/rate-limiting-usage/)** - set through the management surface of a deployment
that installs it, not through a startup property.
Installing the OIDC module (`source/oidc`) enables token exchange; installing a tenant-directory module enables
more than the one configured tenant. A plain server without those runs enforcing, single-tenant, and
key-only - which is a complete, safe deployment on its own. Both are also configuration-switchable
where installed: `jenesis.repository.oidc=false` turns the token exchange off exactly like the
missing module (`/api/token` answers `501`), and the exclusive seams select by name -
`jenesis.repository.token-exchange=oidc`, `jenesis.repository.tenants=store-tenants` - per
[Feature toggles & implementation selection](/repository/configuration-reference/).
