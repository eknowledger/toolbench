# Contributing

Thanks for looking. This is a small project with strong opinions, so this document is mostly about which
opinions are load bearing.

## Setup

```sh
git clone https://github.com/eknowledger/toolbench
cd toolbench
pnpm install
pnpm check      # should be green before you change anything
pnpm bench      # http://localhost:5180
```

The project site is https://eknowledger.github.io/toolbench/, built from `site/` with `pnpm site:build`
and served locally with `pnpm site`. The bench is not published: it is the browser suite's fixture, and
`pnpm bench` runs it locally. A maintainer enables Pages once (Settings → Pages → Source: GitHub
Actions). See the README's Live demo section.

Node 24 or newer. Toolbench runs TypeScript directly, with no build step, which is how a tool's fixtures
execute in a plain `node --test`. That floor is worth it.

## The loop

| Command | When |
|---|---|
| `pnpm check` | Constantly. Typecheck plus every Node test, about a second |
| `pnpm new-tool <id>` | Scaffolds `tools/<id>/` with the four files, already green |
| `pnpm bench` | Whenever you touch the runtime. Look at the thing |
| `pnpm bench:build && pnpm size` | Before a PR, if `packages/runtime` grew |
| `pnpm test:graph-scale` | After a change to the graph layout. Its 250 and 500 node graphs, out of `pnpm test` because they take about 25 s; CI runs them on every pull request |
| `pnpm test:counts --update` | After adding or removing tests. It rewrites the Count column in the testing table, so nobody types those numbers |
| `pnpm test:bench` | Before a PR. Browser tests, against the **built** bundle. `PLAYWRIGHT_BROWSER=firefox` or `webkit` for the other engines |
| `pnpm coverage` | When you want the uncovered list. Node suite only, no threshold |
| `pnpm changeset` | In the same PR as any change a consumer would notice |
| `pnpm site:shots` | After a changeset names a new `shot`. Screenshots for the What's new page, see below |

`pnpm bench` is not optional politeness. Most of the visual defects in this codebase were found by
looking at the page, not by reasoning about the code, and the
[defect register](docs/architecture.md#14-defect-register) is the evidence.

### Writing a changeset

⚠️ **A changeset is release notes, not a commit message.** It is published verbatim to the GitHub
release and the changelog, where it is read by somebody deciding whether to upgrade. They did not write
the code and do not want the reasoning. The first release notes here were essays, several hundred words
each, explaining *why* a change was made, and nobody could scan them for what shipped.

So: **lead with a bold name and one short sentence that says what a consumer can now do, or what stopped
being broken.** Then, only if needed, a paragraph or two or three bullets of detail. Link the issue.

```markdown
---
"@toolbench/runtime": minor
---

**New: Expand in place.** `more="expand"` reveals the rest of a long result without leaving the page. ([#79](https://github.com/…/issues/79)) <!-- whats-new: gallery=parts docs=docs.html#letting-the-reader-open-the-rest -->

The "+2 more results" notice becomes a button. `more` defaults to `link`, so nothing changes unless you
opt in.
```

That first paragraph is also the release's line on the site's
[What's new](https://eknowledger.github.io/toolbench/whats-new.html) page, which the site build generates
from the two `CHANGELOG.md` files, so a release needs no other step. The page shows only that paragraph.
The convention, which `pnpm check` holds every pending changeset to:

* It starts with `**New: Name.**`, `**Fixed: Name.**` or `**Changed: Name.**`. The name is what the page
  lists, in bold, so make it a short noun phrase: "Reset button", "Readable chart labels".
* Then **one** sentence, under 120 characters. More than one sentence fails the check; the rest goes in
  the paragraphs below.
* Then, optionally, an HTML comment, which GitHub does not show:
  `<!-- whats-new: gallery=<card-id> docs=<page.html#anchor> shot=<name> label="On by default" -->`.
  `gallery` is the "Try it" link (an `id` in `gallery.html`), `docs` the "Docs" link, `shot` a screenshot
  of that gallery card, and `label` a small tag for anything that changes a default or can refuse a tool.
  The site test checks that every link lands.
* A changeset that ships two things can start a later paragraph the same way, and it is a second line.
  Entries in one release with the same kind and name are one line, which is how an entry both packages
  carry, or one change written as three changesets, appears once.
* A new `shot` needs its picture: `pnpm site:shots` builds the site, photographs each named gallery card
  in light and dark, and writes `site/public/whats-new/<name>-light.jpg` and `-dark.jpg` to commit. The
  site build fails, naming that command, while one is missing.

* **New:**, **Fixed:** or **Changed:** makes the intent plain. Changesets groups by version bump, and
  "Minor Changes" is not the same sentence as "here is a new feature".
* Say what a reader can do differently. `values` and `run()` are the names of things; "fill in a tool's
  form from your page" is what they are for.
* Mark anything that can break an existing consumer with **⚠️ Heads-up**, and say what trips it. At 0.x
  a minor bump is the only other signal available.
* The reasoning goes in the commit message and the pull request, which is where somebody debugging this
  in a year will look. It does not go here.

## Where things live

Read [docs/architecture.md](docs/architecture.md) first. The short version:

| Change | Where | Also needs |
|---|---|---|
| New result kind | `packages/sdk/src/types.ts` | A renderer, a migration, a version bump. See [versioning.md](docs/versioning.md) |
| New input type | `types.ts` + `validate.ts` + `element.ts` | Label, description target, keyboard behaviour, a version bump |
| Rendering change | `packages/runtime/src/render/` | A browser test |
| A new tool | `tools/<id>/` | `pnpm new-tool <id>`, then [authoring-a-tool.md](docs/authoring-a-tool.md) |
| Validation rule | `packages/sdk/src/validate.ts` | A unit test, and a row in the architecture doc's invariants table |

## What will get pushed back on

Not to be difficult. Each of these is a decision the project has already made, and reversing one should
be an argued PR rather than a side effect.

* **A dependency in `packages/`.** Both packages have zero. Adding one needs the PR to say what it buys
  and what it costs in transfer size. A charting library is the standing example of a tempting one: it
  would be 40 to 200 KB and would decide how every tool looks.
* **A breaking change to the contract.** Additive only. The test is mechanical: write the migration, and
  if either half is not the identity function, something was taken away.
* **Accessibility as a follow-up.** A new input type without its label and keyboard behaviour is not
  finished. There are browser tests for this and they are meant to be annoying.
* **A behaviour change with no test in the layer that can see it.** Rendering changes need browser tests;
  contract changes need SDK tests. A change that only passes `pnpm check` has not been tested where it
  lives.
* **Editing an existing tool's fixtures to make a change pass.** That is the compatibility promise
  failing. If the edit is genuinely correct, say why in the PR.
* **A framework.** The runtime is `document.createElement` and three helpers in `dom.ts`. If it needs
  React, "drop it into any page" was not true.

## Style

The code is formatted with tabs and long lines, matching what is already there. There is no linter, on
purpose: the rules that matter here are not the ones a linter checks.

Comments explain **why**, not what. If a line looks arbitrary, say what went wrong without it. The `⚠️`
marker means "a trap someone could reasonably fall into again" and is reserved for that.

No em dashes, anywhere: prose, comments, and every string a reader or a tool author sees, which means the
status line, validation messages, a tool's blurb and its output. A colon, a comma or a full stop is always
available. `scripts/em-dash.test.ts` checks the packages' strings and every `tool.json`.

Commit messages: a subject line saying what changed, then prose saying why. If the change came from a
defect, describe the defect concretely, what was on screen and what should have been. Those descriptions
are what the defect register is built from, and they are the most useful thing in the history a year
later.

## Pull requests

- [ ] `pnpm check` passes
- [ ] `pnpm bench:build && pnpm test:bench` passes
- [ ] Every existing tool's fixtures pass **without being edited**
- [ ] New behaviour has a test in the layer that can see it
- [ ] Contract change: version bumped, migration added, changelog line written
- [ ] Public API change: README and the relevant doc updated in the same commit
- [ ] A changeset, if a consumer would notice
- [ ] `pnpm size` if `packages/runtime` grew
- [ ] `pnpm test:counts --update` if you added or removed tests

## Proposing a tool

Tools in this repository exist to exercise the runtime, not to be a collection. The ones that ship
each cover something the others do not: `percentiles` is a main-thread group of fields and a table,
`queue-explorer` is a worker with progress and a timeout, `utf8-bytes` is the `bytes` kind,
`regex-explainer` is the `text` kind, and a worker whose timeout is the point rather than an
afterthought, `histogram` is a bare `series` with no group around it, the `bar` shape, and no
primary input for a card to fall back on, `build-order` is the `graph` kind, a graph the runtime lays out
beside the fields that explain it, and `rate-limits` is the list inputs, an ordered `rows` input whose order
is the answer and a `multiselect`.

Start with `pnpm new-tool <id>`, then replace the starter function. The scaffold exists so the first
two minutes are not copying boilerplate. It does not change what a tool in this repository has to cover.

A new tool in this repo needs to cover something neither of those does: a new output kind, a failure mode
the bench cannot currently produce, a different input shape. A good tool that covers the same ground
belongs on your own site, and that is the point of the project.

## Reporting things

* A bug: what you did, what happened, what you expected, and the browser. If it is visual, a screenshot
  saves both of us a round trip.
* A security issue: [SECURITY.md](SECURITY.md). Read the threat model there first; some things that look
  like vulnerabilities are documented design.
* A question: open a discussion or an issue. If the docs sent you the wrong way, that is a docs bug and
  worth reporting as one.
