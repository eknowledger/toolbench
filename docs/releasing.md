# Releasing

How versions are decided, how a release happens, and the one-time setup it needs.

**Contents**

1. [Two version numbers](#1-two-version-numbers)
2. [Why the packages move together](#2-why-the-packages-move-together)
3. [What counts as which bump](#3-what-counts-as-which-bump)
4. [The road to 1.0](#4-the-road-to-10)
5. [How a release runs](#5-how-a-release-runs)
5b. [A release that lands as a stack](#5b-a-release-that-lands-as-a-stack)
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

**A release is done when both packages install, not when the workflow goes green.** After approving, check
from a clean directory:

```sh
cd "$(mktemp -d)" && npm init -y >/dev/null && npm install @toolbench/runtime@<version>
```

⚠️ npm can take minutes to serve a package it has already accepted. During 0.8.0, `changeset publish`
reported both packages published and `@toolbench/runtime@0.8.0` installed at once, but
`@toolbench/sdk@0.8.0` was missing from the registry for about three minutes and its tarball returned 404
for about two more. In that window, installing the runtime failed with `ETARGET`, because it depends on an
sdk version npm would not yet serve. Wait for the clean install to succeed before announcing a release or
pointing anyone at it.

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

## 5b. A release that lands as a stack

0.7.0 went out as seven pull requests, #131 to #137, each branch built on the one below it. They were
squash-merged bottom first, one at a time, and then the release PR, #138, versioned them together. Two
things about that are not obvious, and each cost a CI cycle.

**Every step has to fit the size budgets, not just the tip.** Each squash is a commit on `main`, and CI
runs `pnpm size` against each one. A later branch that shrinks a chunk does not help an earlier one that
lands first. In 0.7.0 the tip fitted, but #131 measured 22.6 KB against a runtime budget of 22.0 KB and
#132 measured 23.3 KB against 22.5 KB. #133 was the branch that moved the chart styles out of the runtime
chunk (the runtime line fell from 23.3 to 22.5 KB when it merged), so the stack fitted only as a whole.
Each fix branch fitted alone; nobody had measured them together. Before merging the first, measure every
branch in the order they will land:

```sh
for b in release/1-card-fixes release/2-contract-v4 release/3-readout; do
  git switch -q "$b"
  pnpm -r --filter "./packages/*" exec tsc -b --force   # the bench bundles dist/, so rebuild it
  pnpm bench:build >/dev/null && pnpm size || echo "over budget at $b"
done
```

A branch that is over gets its budget raised in a commit on that branch, under the rule at the top of
[scripts/size-check.mjs](../scripts/size-check.mjs): the commit that spends the bytes raises the ceiling
and says what bought them.
In 0.7.0 that was "the runtime budget for the card fixes measured together, 22.6 of 23.0 KB".

**After a squash, the next branch conflicts with code it already contains.** The squash commit shares no
history with the branch above it, so Git sees the same changes made twice. Merging `main` into
`release/2-contract-v4` after #131 landed reports seven conflicting files, although every line in them
was identical. Neither resolving them by hand nor rebasing is needed. Two checks make it safe to record
`main` as merged while keeping the branch's code exactly:

```sh
git fetch origin
# 1. main is exactly what the merged branch held. Fails if the squash picked up anything else.
test "$(git rev-parse origin/main^{tree})" = "$(git rev-parse origin/release/1-card-fixes^{tree})"
# 2. This branch already contains the merged branch's final commit. Fails if a fix went onto the lower
#    branch after this one last merged it, and "ours" would then silently drop that fix.
git merge-base --is-ancestor origin/release/1-card-fixes HEAD
# Both passed: take main's history and keep this branch's tree.
git merge -s ours origin/main -m "Merge main (#131, identical to this branch's base)"
git push
```

⚠️ `-s ours` discards everything on the other side. Run it only after both checks pass. If either fails,
do a normal `git merge origin/main` and resolve the conflicts. In 0.7.0, `main` after #131 (`926a15d`)
had the same tree as #131's last commit (`ff15235`), which `release/2-contract-v4` had already merged, and
the resulting merge commit (`8623014`) kept that branch's tree unchanged.

It is an ordinary merge, so `git push` needs no force. The squash at the end throws the merge commit
away anyway; it exists so the pull request shows only its own changes and CI runs against them.

**When the stack is open as pull requests, never merge the lower one with `--delete-branch`.** Deleting a
branch that another pull request targets makes GitHub **close** that pull request rather than retarget it.
It happened to #165 when #164 merged with `gh pr merge --squash --delete-branch`. In order:

```sh
gh pr merge <lower> --squash          # no --delete-branch
gh pr edit <upper> --base main        # retarget first
# then the two checks and the merge above, on the upper branch, and push
git push origin --delete <lower-branch>
```

If it has already happened, the pull request is recoverable: push the deleted branch back to its last
commit, reopen the pull request, retarget it to `main`, and delete the branch again.

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

*Trusted publishing. This is not optional here.* Configure, per package on npmjs.com:

| Field | Value |
|---|---|
| Repository | `eknowledger/toolbench` |
| Workflow | `.github/workflows/release.yml` |
| Environment name | `npm-publish` |
| Allow `npm publish` | checked |

Naming the environment means npm refuses an OIDC token from any job not running in it, and that
environment requires a manual approval, so a workflow edit alone cannot publish. Leaving "allow npm
publish" unchecked would restrict this to staged publishing, which `changeset publish` does not support.

It is configured per package, so the package must exist first: publish the first version by hand (§8b),
then switch. After that no credential is stored anywhere, and `NPM_TOKEN` can be deleted.

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

**4. Two repository settings that are not obvious.** Both were found the hard way, and a release fails
without the first.

*Allow Actions to create pull requests.* Off by default. Without it the `version` job bumps versions,
writes changelogs, pushes `changeset-release/main`, and then fails on the last call with "GitHub Actions
is not permitted to create or approve pull requests".

```sh
gh api -X PUT repos/:owner/:repo/actions/permissions/workflow \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
```

*⚠️ Release PRs need `--admin` to merge.* GitHub does not trigger workflows for events caused by
`GITHUB_TOKEN`, so the release PR the bot opens never gets `tests` or `build` run against it. Branch
protection requires those checks, so the PR sits at `BLOCKED` with "no checks reported" forever:

```sh
gh pr merge <n> --squash --admin
```

There is no configuration that keeps both properties. The alternatives are a personal access token,
which reintroduces exactly the long-lived credential trusted publishing exists to remove, or dropping
the required checks, which weakens every other pull request. Admin bypass is the right trade here
because nothing actually goes unverified: the code was checked on the PR that carried the changeset, the
release PR contains only generated version bumps and changelogs, and the publish job re-runs typecheck,
the full test suite and a build before publishing.

**5. Provenance** is already on (`id-token: write` plus `NPM_CONFIG_PROVENANCE`). It publishes a signed
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
