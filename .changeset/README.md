# Changesets

This directory holds release intents. One file per change that a consumer would notice.

**Adding one** (do this in the same pull request as the change):

```sh
pnpm changeset
```

Pick the packages, pick `patch` or `minor`, and write one sentence in the voice of someone reading a
changelog: what changed and what it means for them, not which files you touched.

Start it with a kind and a name, and give the links in a comment GitHub does not show:

```markdown
**New: Reset button.** Puts a tool's inputs back where they started. <!-- whats-new: gallery=reset docs=docs.html#reset shot=reset -->

Any detail goes in paragraphs below. The site's What's new page shows only the first one.
```

The kind is `New`, `Fixed` or `Changed`, and the sentence is one sentence. The site builds its What's new
page from the changelogs with no other step, and `pnpm check` fails a changeset that does not follow
this. The comment's keys (`gallery`, `docs`, `shot`, `label`) are in
[CONTRIBUTING.md](../CONTRIBUTING.md#writing-a-changeset), as is `pnpm site:shots` for a new `shot`.

`@toolbench/sdk` and `@toolbench/runtime` are a **fixed group**: they always share a version number,
because the SDK's types and the runtime's renderers are two halves of one contract. Selecting either one
bumps both. That is deliberate, and [docs/releasing.md](../docs/releasing.md) explains why.

**Not every change needs one.** Docs, tests, CI and the bench are not published, so they do not need a
changeset. If a change is invisible from outside the repository, skip it.

**Releasing** is automatic: merging to `main` opens a "Release" pull request that collects the pending
changesets. Merging *that* publishes to npm. See [docs/releasing.md](../docs/releasing.md).
