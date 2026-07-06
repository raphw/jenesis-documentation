---
order: 8
title: Provenance
description: Signing an accepted artifact as it is published so a consumer can prove where it came from — the provenance-signer capability, its keyed and keyless (Sigstore Fulcio + Rekor) implementations, the DSSE attestation surface, and the settings that turn it on.
---

The [compliance gate](/repository/compliance-gate/) decides *what may enter and be served*. Provenance is
the other half of a trustworthy supply chain: proving *where an accepted artifact came from*. A consumer
that fetches a jar wants to know it is exactly the one this repository vouches for, not a tampered
substitute — and provenance gives them a signature they can check to be sure.

## The capability — a provenance signer

**Signing is a discovered capability**, off until a deployment configures it. When it is on, the repository
serves, next to every artifact, a **signed attestation** naming the artifact and its SHA-256. A consumer
verifies that attestation against a published key; if the bytes were swapped, verification fails.

Like every capability in the repository, the signer is one **swappable plug-in point**. A deployment may
have more than one signer module on its path — a keyed signer and a keyless one — and picks which one runs
with the `provenance-signer` setting. With **no signer configured, the provenance endpoints answer `404`**
rather than the feature half-existing, so a plain deployment simply does not offer attestations.

### What it produces

Every signer emits the same shape, so a consumer verifies the same way regardless of which one signed:

- an **in-toto Statement** — a small JSON document naming the artifact as its *subject* and carrying its
  SHA-256 digest;
- wrapped in a **DSSE envelope** (the Dead Simple Signing Envelope that cosign and the in-toto tooling
  speak) and signed over the envelope's pre-authentication encoding, so a swapped payload — or even a
  swapped payload *type* — fails verification.

### The attestation surface

The signer answers a small read-only API. Everything here is public — a downstream consumer needs no
credential to verify what it just downloaded.

| Endpoint | Serves |
|----------|--------|
| `GET /api/provenance?repo=&path=` | The bare DSSE envelope for one artifact. |
| `GET /api/provenance?repo=&path=&material=true` | The envelope **plus** the material needed to verify it — the signing certificate chain and the transparency-log entry (keyless only). |
| `GET /api/provenance/key` | The signer's public key. |
| `GET /api/provenance/certificate` | The signing certificate chain, leaf-first PEM (keyless only; `404` on a keyed deployment). |

A `jenesis-repo provenance <repo> <path>` CLI command fetches one for you.

## Implementations

### Keyed signing

The straightforward setup: configure a **PEM-encoded RSA private key** with `signing-key-path`, and the
repository signs each attestation with the JDK's own RSA and SHA-256. The matching public half is derived
from the private key's CRT parameters — so **one PEM file suffices**, and it is published at
`/api/provenance/key`. A consumer verifies an envelope against that key with any DSSE verifier.

This is the simplest way to turn provenance on. Its one operational cost is the usual one of a long-lived
key: you guard it, and you rotate it when you must.

### Keyless signing (Sigstore / Fulcio)

Instead of guarding a long-lived key, a deployment can sign the **Sigstore** way, with a short-lived
certificate minted per signing session. The keyless signer module:

1. takes an **OIDC identity token** (see the settings below for where it comes from);
2. exchanges it at a configured **Fulcio** certificate authority (`keyless-fulcio-url`) for a **~10-minute
   certificate** over a freshly generated P-256 key;
3. signs the same DSSE envelope with that ephemeral key;
4. publishes the certificate chain at `/api/provenance/certificate`.

The certificate is reused across attestations until it nears expiry, then re-minted. `keyless-fulcio-url`
can point at a self-hosted Sigstore stack backed by your own identity provider — the enterprise deployment
story — or at a public instance such as `sigstage.dev`.

<div class="note">
  There is no long-lived signing key to protect: the private key lives only for the few minutes its
  certificate is valid, and the certificate binds the signature to the identity that requested it (the
  email or subject in the OIDC token).
</div>

### Transparency log (Rekor)

Set `keyless-rekor-url` and every keyless attestation is also published to a **Rekor transparency log** —
an append-only public record that a signing certificate can never be quietly used off the record. Two
guarantees follow:

- **Served only once logged.** The repository serves an attestation **only after** Rekor returns an RFC 9162
  Merkle inclusion proof that recomputes the log's signed root. If the log is unreachable or the proof does
  not verify, the attestation is **refused rather than served unlogged.**
- **Material travels with the envelope.** Because a keyless certificate rotates every few minutes, a
  consumer cannot re-fetch the certificate that signed an old envelope. So
  `GET /api/provenance?repo=&path=&material=true` returns the envelope **together with** the certificate
  chain and the transparency-log entry (its UUID, log index, integration time, the log's signed receipt,
  and the inclusion proof with its checkpoint) — everything needed to verify offline, later.

## Verifying an attestation

The attestation is meant to be checked by whoever consumes the artifact, with tools they already trust — not
just taken on the repository's word:

- **cosign.** `cosign verify-blob-attestation` accepts the envelope. For a keyed signer, pass the published
  public key; for a keyless signer, pass the certificate (`--certificate`) and your pinned Fulcio root, and
  cosign checks the Rekor log for real. With `--check-claims` it also binds the in-toto subject digest to
  the blob you have in hand.
- **Any DSSE verifier** that holds the public key.
- **The signer's own `verify`**, shipped in the module — for keyless, it PKIX-validates the chain to the
  pinned Fulcio root, verifies the envelope against the certified leaf key, recomputes the inclusion proof
  offline, and checks the log's signed entry timestamp against its published key.

## Settings

Provenance is off until you name a signer. Each key below is a repository setting — pin it from above the
store with an environment variable or a `-Djenesis.repository.<key>=` system property.

| Key | Default | Meaning |
|-----|---------|---------|
| `provenance-signer` | *(auto)* | Which signer runs when more than one module is configured (`keyless`, or the keyed signer). One configured signer is selected automatically. |
| `signing-key-path` | *(none)* | Path to a PEM-encoded RSA private key for **keyed** signing; unset means no keyed signer. |
| `keyless-fulcio-url` | *(none)* | The Fulcio CA to mint short-lived certificates from; enables **keyless** signing. |
| `keyless-identity-token` | *(none)* | A static OIDC identity token for the Fulcio exchange. |
| `keyless-identity-token-path` | *(none)* | A file holding the OIDC token, re-read on each exchange. |
| `keyless-identity-token-env` | *(none)* | An environment variable holding the OIDC token — the ambient-CI path (e.g. a job's injected token). |
| `keyless-rekor-url` | *(none)* | The Rekor transparency log to publish keyless attestations to; unset serves keyless attestations without a log entry. |

<div class="tip">
  In CI, the keyless path needs no stored secret at all: the job's OIDC token (from
  <code>keyless-identity-token-env</code>) is exchanged for a certificate at sign time, and the signature is
  recorded in a public log — provenance with nothing to leak.
</div>
