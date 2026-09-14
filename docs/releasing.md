# Releasing

How versions are decided, how a release happens, and the one-time setup it needs.

**Contents**

1. [Two version numbers](#1-two-version-numbers)
2. [Why the packages move together](#2-why-the-packages-move-together)
3. [What counts as which bump](#3-what-counts-as-which-bump)
4. [The road to 1.0](#4-the-road-to-10)
5. [How a release runs](#5-how-a-release-runs)
6. [One-time setup](#6-one-time-setup)
7. [What gets published](#7-what-gets-published)
8. [Publishing by hand](#8-publishing-by-hand)
8b. [The bootstrap, and the passkey trap](#8b-the-bootstrap-and-the-passkey-trap)
9. [If a bad version ships](#9-if-a-bad-version-ships)

---

## 1. Two version numbers

Keeping these apart is most of what this document is for.

| | Contract version | Package version |
|---|---|---|
| Written in | `manifest.sdk`, `SDK_VERSION` | `packages/*/package.json` |
| Looks like | `1` | `0.3.2` |
| Answers | "which result shapes and input types may a tool use" | "which release of the code is this" |
| Moves | rarely, and only additively | every release |
| Breaks things | never, by policy | only on a major bump |
| Governed by | [versioning.md](versioning.md) | this document |

The compatibility promise lives entirely in the contract version. The package version is release
bookkeeping. A consequence worth stating plainly, because it is the thing people get wrong:

> **Raising `SDK_VERSION` is a minor package bump, never a major one.** Contract changes are additive by
> policy, so they cannot break a consumer. A major bump is for breaking the *package* API: renaming an
> export, changing a function signature, dropping an entry point.

## 2. Why the packages move together

`@toolbench/sdk` and `@toolbench/runtime` are a **fixed group** in `.changeset/config.json`. They always
share a version number. Bumping either bumps both.

The reason is that they are two halves of one thing. The SDK declares that `Output` may be a `series`;
the runtime is what draws it. Ship those independently and you get a compatibility matrix: sdk 0.4 works
with runtime 0.3 but not 0.5, except for the parts that do. Nobody maintains that matrix correctly,
including the people who built it.

Lockstep costs one thing: the SDK gets a version bump for a runtime-only fix, so consumers see a release
that changed nothing for them. That is a much smaller problem than a matrix, and the changelog says which
package actually changed.

`@toolbench/bench` is in `ignore`. It is the test bench, it is private, and it is never published.

## 3. What counts as which bump

While on 0.x, npm treats `^0.MINOR.x` as "minor is the breaking digit", so:

| Change | Bump | Example |
|---|---|---|
| Bug fix, no API change | patch | A chart's right axis clipped its labels |
| New export, new optional option | minor | `defineToolHost` gains an option with a default |
| New contract version | minor | `bytes` output added |
| Renamed or removed export, changed signature | minor on 0.x, major on 1.x | `Runner.run` takes a different first argument |
| Docs, tests, CI, the bench | none, no changeset needed | This file |

Nothing under `packages/` is exempt from needing a changeset just because it looks internal. If it is
reachable from an `exports` entry, a consumer can depend on it.

## 4. The road to 1.0

**Now: 0.x.** The package API can still change, and pre-1.0 is how you say that honestly. First
published version is `0.1.0`.

**1.0.0 when all of these are true:**

* the packages have a real consumer that is not this repository, so the API has met a second set of
  requirements;
* no breaking package change has been needed for two consecutive minor releases;
* contract version 2 has shipped, which proves the migration machinery works on something real rather
  than on synthetic versions in a test;
* the docs are stable enough that a newcomer gets a tool running without asking anyone.

That last one is the real gate. Anything else is a number.

## 5. How a release runs

Two merges, with a person in between.

```
you: open a PR, include a changeset      (pnpm changeset)
        │
        ▼
merge to main                            main is protected: PR required, checks must pass
        │
        ▼
release.yml: `pending` job finds changeset files
        │
        ▼
`version` job opens or updates "Release: version packages"
   version numbers bumped, CHANGELOG.md written
        │
        ▼
GATE 1  you read that diff and merge it
        │
        ▼
release.yml: `pending` job finds nothing pending
        │
        ▼
`publish` job waits on the npm-publish environment
        │
        ▼
GATE 2  you approve the deployment in the Actions tab
        │
        ▼
typecheck, test, build, then `changeset publish`
        │
        ▼
npm + git tag + GitHub release
```

Two gates, and they check different things. **Gate 1** is the version numbers and the changelog: a diff
worth reading, because it is what consumers will see. **Gate 2** is the last stop before the registry,
and it exists because a merge can happen for all sorts of reasons while an explicit "yes, publish this"
cannot happen by accident. npm has no undo.

⚠️ The workflow is three jobs rather than one because `environment:` is job-level in GitHub Actions, not
step-level. A single job carrying the environment would demand an approval on **every** push to `main`,
including versioning runs that publish nothing, and an approval prompt that fires constantly is one
nobody reads.

`main` is protected: pull request required, `tests` and `build` must pass, no force pushes, no branch
deletion, linear history. Admins can bypass, which keeps a solo repository unblocked, and approvals are
set to zero because you cannot approve your own pull request.

Adding a changeset:

```sh
pnpm changeset
```

Pick the packages, pick patch or minor, and write one sentence a consumer would want to read. See
[.changeset/README.md](../.changeset/README.md).

## 6. One-time setup

Neither of these exists yet. Both are needed before the first publish.

**1. The npm org.** `@toolbench` is a scope, and a scope belongs to either a user or an org. The npm
account is `eknowledger`, so `@toolbench` needs an org of that name.

⚠️ **There is no CLI command for this.** `npm org` only manages the members of an org that already
exists; `npm org create` is not a command. Creating an org is a web-only flow:

1. <https://www.npmjs.com/org/create>
2. Name it `toolbench`, choose the **Free** plan (unlimited public packages).
3. Confirm with `npm org ls toolbench`, which should list you as `owner`.

Until the org exists, `npm publish` fails with a 404 and "Scope not found", which is not an obvious way
of saying "make the org first".

**2. Authentication.** Two ways, and the workflow supports both. `changesets/action` prefers OIDC when
it is available, so the token is a fallback rather than the plan.

*Trusted publishing (preferred, no stored secret).* Configure `eknowledger/toolbench` and
`.github/workflows/release.yml` as the trusted publisher for each package on npmjs.com. It is configured
per package, so the package has to exist first: publish 0.1.0 by hand (§8), then switch, then no secret
is stored anywhere.

*Token (only if you are not doing the first publish by hand).* Create a **granular access token** with
write access to the `@toolbench` scope, give it an expiry, and add it as a repository secret:

```sh
gh secret set NPM_TOKEN
```

Publishing 0.1.0 by hand from a laptop avoids creating this token at all, which is the better path: no
long-lived credential with publish rights then exists anywhere. See §8.

*Enable 2FA on the npm account first, either way.* npm is actively restricting tokens that bypass 2FA
(the notice shows up in our own CI logs), and an account that can publish a package other people install
should have it on. Trusted publishing via OIDC is exempt from the 2FA prompt, so it does not fight this.
A manual publish will prompt for a one-time code, which is the intended friction.

**3. Turn publishing on.** The workflow will not publish until you say so:

```sh
gh variable set PUBLISH_TO_NPM --body true
```

Without this, the release job still runs and still opens release PRs, but never publishes. That gate
exists because a release workflow with no npm identity fails on every push to `main`, and a permanently
red `main` is worse than a switch, since it teaches everyone to stop reading the crosses.

**4. Provenance** is already on (`id-token: write` plus `NPM_CONFIG_PROVENANCE`). It publishes a signed
attestation tying the tarball to this commit and this workflow, and npm shows it on the package page. It
is free and it is the main defence a small package has against someone shipping a tarball that does not
match the source.

## 7. What gets published

`files: ["dist"]` in each package, plus the README, LICENSE and package.json that npm always includes.
Not published: `src`, tests, the bench, the docs directory, the tools.

The build step in CI runs `npm pack --dry-run` for both packages and prints the file list, so a stray
file is visible in the log before it is visible on npm.

Consumers get compiled ESM plus `.d.ts` and source maps. There is no CommonJS build. Both packages are
`"type": "module"`, and a browser-targeted package with zero dependencies in 2026 does not need one.

## 8. Publishing by hand

For the first release, or if the workflow is broken:

```sh
pnpm install --frozen-lockfile
pnpm check                      # typecheck + all tests
pnpm bench:build && pnpm size   # transfer budgets
pnpm release                    # builds, then changeset publish
```

`pnpm release` is `pnpm build && changeset publish`, so it cannot publish a stale `dist`. You need to be
logged in (`npm login`) and a member of the org.

## 8b. The bootstrap, and the passkey trap

Recorded because it took six failed attempts and none of it is written down by npm.

**The circular dependency.** npm configures trusted publishing per package, through that package's own
settings page, so the package has to exist. Provenance requires OIDC, which only exists in CI. So the
very first release of a package cannot have both a trusted publisher and an attestation. Something has to
give, and it is provenance on 0.1.0.

**A granular token inherits the 2FA requirement it was created under.** The token here was issued while
the account was set to "authorization and writes". Relaxing the account to authorization-only afterwards
did not change the token: CI kept failing with `EOTP`, asking for a one-time password no runner can
type. If you need a token to publish unattended, create it *after* setting the account to
authorization-only, not before.

**⚠️ A passkey cannot satisfy npm's CLI one-time-password prompt.** This is the one that actually blocks
you. If your 2FA is a passkey (Bitwarden, iCloud Keychain, a hardware key) rather than a TOTP app, there
is no six-digit code to type. npm's own CLI handles this by printing a URL and deferring to the browser,
where a passkey works. `changeset publish` does not: it prompts for a TOTP itself and never reaches
npm's browser flow.

So the bootstrap publish goes around changesets, while still letting pnpm rewrite the workspace protocol:

```sh
pnpm build
# pnpm pack rewrites "workspace:^" to a real range. Plain `npm publish` would not, and would ship a
# dependency no consumer can resolve.
pnpm --filter @toolbench/sdk exec pnpm pack --pack-destination /tmp/tb
pnpm --filter @toolbench/runtime exec pnpm pack --pack-destination /tmp/tb

# Verify the rewrite happened before publishing anything.
tar -xzOf /tmp/tb/toolbench-runtime-0.1.0.tgz package/package.json | grep toolbench/sdk

# npm, not changesets: this is the path that offers browser authentication.
npm publish /tmp/tb/toolbench-sdk-0.1.0.tgz --access public
npm publish /tmp/tb/toolbench-runtime-0.1.0.tgz --access public
```

`publishConfig.provenance` has to come out of both `package.json` files for a local publish, or npm
fails with `EUSAGE: Automatic provenance generation not supported for provider: null`. Put it back
afterwards; CI needs it.

One more thing that wasted time: after a successful publish the registry metadata endpoint returned 404
for about a minute while the search index already showed both packages. The publish had worked. Check
`npm access list packages @toolbench` and the search index before concluding anything failed.

## 9. If a bad version ships

**Do not unpublish.** It breaks every lockfile that already resolved it, and npm only allows it for 72
hours anyway.

Instead:

```sh
npm deprecate @toolbench/runtime@0.3.1 "Broken worker teardown, use 0.3.2"
```

Then fix forward: patch release, and a line in the changelog saying what was wrong. If the bad version is
`latest` and the fix will take a while, move the tag back:

```sh
npm dist-tag add @toolbench/runtime@0.3.0 latest
```
