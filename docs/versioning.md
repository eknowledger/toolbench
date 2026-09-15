# Versioning and compatibility

The promise: **a tool written today keeps working, unchanged, against every future runtime.**

This document says what that covers, what it does not, and the procedure for raising the contract
version. It is short on purpose. A compatibility policy nobody reads is not a policy.

**Contents**

1. [Three versions, do not confuse them](#1-three-versions-do-not-confuse-them)
2. [What the promise covers](#2-what-the-promise-covers)
3. [Additive only](#3-additive-only)
4. [How it works](#4-how-it-works)
5. [Raising the contract version](#5-raising-the-contract-version)
6. [Worked example: adding a `bytes` output](#6-worked-example-adding-a-bytes-output)
7. [If a breaking change is unavoidable](#7-if-a-breaking-change-is-unavoidable)
8. [Deprecating a tool](#8-deprecating-a-tool)
9. [Version history](#9-version-history)

---

## 1. Three versions, do not confuse them

| Version | Where | Changes when | Example |
|---|---|---|---|
| **Contract version** | `manifest.sdk`, and `SDK_VERSION` in `packages/sdk/src/version.ts` | A new output kind, input type or capability is added. Rarely, and deliberately | `2` |
| **Package version** | `packages/*/package.json` | Every release, including bug fixes | `0.1.0` |
| **Tool version** | `manifest.version` | The tool author changes the tool. Nothing in the system branches on it | `1.2.0` |

Only the first one is a compatibility boundary. A package release can add a renderer, fix a chart or
rewrite the form code, and no tool notices. Raising the contract version is the only change that
requires a migration and a checklist.

## 2. What the promise covers

A tool declaring `"sdk": 1` will, on every future runtime:

* load and validate;
* have its inputs rendered with the same semantics;
* have its results rendered, possibly better than before;
* pass its own fixtures without those fixtures being edited.

What is explicitly **not** promised:

* **Pixels.** The runtime's visual design will change. If your tool depends on exact spacing, it depends
  on something that was never part of the contract.
* **Extra fields you invented.** Unknown manifest keys are ignored today. A future version may claim a
  key you were using for your own purposes.
* **Internals.** Anything not exported from `@toolbench/sdk` or `@toolbench/runtime` can change in a
  patch release. That includes every module under `render/`.
* **The tool's own correctness.** If your tool was wrong, it stays wrong. The fixtures keep it
  consistent, not correct.

## 3. Additive only

Every contract change must be one of:

* a new member of the `Output` union;
* a new `InputSpec` variant;
* a new optional field on an existing type;
* a new capability;
* a new optional manifest key.

Not allowed, in a contract version bump:

* removing or renaming anything;
* making an optional field required;
* narrowing a type, including narrowing a string to a union of literals;
* changing what an existing field means.

The test of whether a change is additive is mechanical: **write the migration.** If the `manifest` and
`output` halves are both the identity function, the change was additive. If either one has to
transform something, you took something away, and §7 applies.

## 4. How it works

Three mechanisms, and the third is the one that makes the first two mean anything.

**On the way in.** `upgradeManifest` runs before validation. It reads the declared `sdk`, walks the
migration chain up to the current version, and hands the result to `validateManifest`. A manifest
declaring a version higher than the runtime supports is refused with a message saying what to upgrade,
which is a great deal more useful than rendering half of it.

**On the way out.** `upgradeOutput` runs on every result, on whichever side produced it, before any
renderer sees it. It takes the tool's declared version so it knows which migrations apply. Renderers
therefore only ever handle current-shaped data.

Old runtimes meeting newer tools is handled too, since that combination exists as soon as anyone caches
a page. The renderer dispatcher's default branch calls `unknownOutput`, which renders "this needs a
newer runtime" rather than nothing at all.

**In CI.** `pnpm test` runs **every** tool's fixtures against the current SDK and runtime. This is the
part that turns the policy into an enforced constraint: a change that breaks an older tool fails the
build, whatever anyone intended.

```
tool.json  ──►  upgradeManifest  ──►  validateManifest  ──►  Manifest (current)
                (chain of steps)      (rules + invariants)

tool.run() ──►  upgradeOutput    ──►  render            ──►  DOM
                (chain of steps)      (exhaustive switch)
```

The chain holds one step today, `1 → 2`, and both of its halves are the identity function.

It was built before anything needed it, and tested against synthetic versions, which is why the first
real entry was a five-line change rather than a design exercise under pressure. It also caught a bug in
itself while still synthetic: `chainFrom` used the module constant instead of the injected current
version, so chains silently did nothing. That defect would have been invisible until the first real
migration, at which point it would have looked like a compatibility failure rather than a two-line bug.

## 5. Raising the contract version

Six steps. All of them, in one pull request.

1. **`packages/sdk/src/types.ts`** Add the new member, variant or optional field.
2. **`packages/sdk/src/version.ts`** Raise `SDK_VERSION`, append the number to
   `SUPPORTED_SDK_VERSIONS` (it never shrinks), and add a `SDK_CHANGELOG` entry saying what the version
   adds. That entry is data because error messages quote it: a tool asking for version 3 gets told what
   version 3 is.
3. **`packages/sdk/src/migrate.ts`** Add the `Migration` for the boundary you created. Both halves are
   the identity function if the change was additive. If they are not, stop and read §7.
4. **`packages/sdk/src/validate.ts`** Validate the new thing, and add any invariant it needs. Ask
   whether a tool using it may still be a live card; anything touching files or the network may not.
5. **`packages/runtime`** Add the renderer or the control. The exhaustive switch in `render/index.ts`
   will not compile until you do. ⚠️ It is not the only one: `summarise` in `element.ts` also switches
   over every kind, because a result has to announce itself to a screen reader. Contract v2 found that
   the hard way. Expect the compiler to point at both.
6. **Tests.** A fixture using the new feature, and a fixture proving an older tool is unaffected.

Then, before merging:

- [ ] `pnpm check` passes
- [ ] `pnpm bench:build && pnpm test:bench` passes
- [ ] **Every existing tool's fixtures pass without being edited.** If one needed editing, the change was
      not additive
- [ ] The migration's two halves are the identity function, or §7 was followed
- [ ] `SDK_CHANGELOG` says what the version adds, in a sentence someone reading an error will understand
- [ ] §9 of this document updated
- [ ] `docs/authoring-a-tool.md` documents the new feature

## 6. Worked example: adding a `bytes` output

⚠️ **This is no longer hypothetical.** It shipped as contract version 2 in 0.2.0, and it is kept here
because it is the shape every future bump should have. The real change matched this sketch almost
exactly; what it added was the discovery that a new output kind also breaks the *host's* exhaustive
switch, not only the renderer's, which is covered in step 5 below.

A hex-dump tool wants a byte grid with offsets, ASCII gutter, and selectable ranges. A `table` can
approximate it and looks wrong.

**types.ts**

```ts
export type Output =
  | /* ... existing members ... */
  | { kind: "bytes"; bytes: number[]; offset?: number; highlight?: ByteRange[]; caption?: string };

// A highlight needs a NAME, not just a span. Colour alone tells a reader something is
// interesting without saying what, and tells a screen reader nothing at all.
export interface ByteRange { at: number; len: number; label: string; tone?: Tone }

export const OUTPUT_KINDS = [/* ... */, "bytes"] as const;
```

**version.ts**

```ts
export const SDK_VERSION = 2;
export const SUPPORTED_SDK_VERSIONS: readonly number[] = [1, 2];
export const SDK_CHANGELOG: Record<number, string> = {
  1: "computation and visualisation: ...",
  2: "byte-oriented output: the bytes kind, for hex dumps and binary formats.",
};
```

**migrate.ts**

```ts
export const MIGRATIONS: readonly Migration[] = [
  {
    from: 1,
    // A v1 manifest cannot mention "bytes", so there is nothing to change.
    manifest: (m) => m,
    // A v1 tool cannot return "bytes" either. Both halves are the identity, which is
    // what an additive change looks like: trivial because nothing was taken away.
    output: (o) => o,
  },
];
```

**runtime** gets `render/bytes.ts` and a `case "bytes"` in the dispatcher.

Now the important part: a tool declaring `"sdk": 1` is unaffected. Its manifest passes through one
identity step, its results pass through another, and its fixtures pass untouched. That is the shape every
version bump should have, and the reason the checklist insists on it.

## 7. If a breaking change is unavoidable

Sometimes the contract is wrong rather than incomplete. In that case:

1. **Say so in the pull request, before writing code.** What is wrong, why an additive change cannot
   fix it, and what breaks.
2. **Add the new form alongside the old one.** Both are supported.
3. **Write a real migration.** The `Migration` halves now do work, and the tests must cover an actual
   old-shaped manifest and an actual old-shaped output.
4. **Deprecate the old form in the changelog**, with the version that will remove it.
5. **Remove it in a major package release**, never in a minor or a patch, and only after at least one
   release where the old form still worked and warned.

`SUPPORTED_SDK_VERSIONS` shrinking is the visible sign that this happened. It should be rare enough to
be memorable.

## 8. Deprecating a tool

A tool, unlike the contract, is allowed to reach the end of its life.

```jsonc
{ "status": "deprecated" }   // still runs; the host shows it is on the way out
{ "status": "retired" }      // does not run; the host explains and links elsewhere
```

Prefer `retired` over deleting. A URL that someone has bookmarked, or that is linked from a post, should
explain what happened rather than return a 404. If the tool is replaced, put the replacement in `links`.

## 9. Version history

| Contract version | Shipped | Adds |
|---|---|---|
| 1 | Initial | `fields`, `text`, `code`, `table`, `series`, `group`, `error` outputs. `text`, `textarea`, `number`, `select`, `toggle` inputs. The `pure` capability. Main and worker threads. |
| 2 | 0.2.0 | The `bytes` output kind, for wire formats and hex dumps, with named highlight ranges. Both migration halves are the identity function, and every v1 tool's fixtures passed unedited. |

Planned, in likely order. Nothing here is committed, and each would follow §5:

| Version | Adds | Why it is not in the contract yet |
|---|---|---|
| 3 | A `file` input and an `assets` capability | Reading a file means a tool is no longer purely a function of declared inputs. That interacts with seeding, with fixtures, and with whether a tool may be a live card, and each of those needs deciding rather than guessing |
| 4 or later | A `net` capability with an injected `ctx.fetch` | The runtime would have to own the timeout, the abort and the failure rendering. A tool calling `fetch` itself would break cancellation and make fixtures meaningless |
