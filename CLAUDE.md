# Working agreement — toolbench

Not committed (see `.gitignore`). Rules for how work happens here. The engineering standards
themselves live in [CONTRIBUTING.md](CONTRIBUTING.md), [docs/versioning.md](docs/versioning.md) and
[docs/releasing.md](docs/releasing.md); this file is the process and the traps, and it deliberately
points at those rather than restating them.

---

## 1. The approval gate

**Do not open a pull request until the change has been manually verified and approved.**

The sequence is: build it, run every check, look at it, report what was found, **stop**. Then a PR only
once approval is given. Reaching "tests pass" is not the end of a slice, and opening a PR before
approval has to be undone rather than reviewed.

Stop after each slice for manual verification. If a plan needs to change, say so and offer options
rather than deviating silently.

## 2. Verify, do not assert

Every number in a document, a commit message or a reply must be measured. Not estimated, not
remembered.

**Look at rendered output.** Screenshot it and read the image. Three defects in contract v2 shipped
green tests: a highlight that was invisible, a grid column that drifted on the final row, and a status
line where one word meant two things. No unit test could have caught any of them, and all three were
obvious the moment a screenshot was opened.

**Never generate an expected fixture from the implementation.** That is circular and proves nothing.
Derive it from the specification by hand, then state that you did.

**Assert an allowlist, not a denylist**, when checking what loaded. A denylist only catches leaks you
predicted, which is how a duplicated tool chunk stayed invisible.

## 3. This repository names no consumer

Toolbench is a standalone framework. It must not mention any specific site that uses it, in code, docs,
issues, commit messages or pull requests. A framework that names its consumers looks like it exists to
serve one project, and the name means nothing to anyone reading from outside.

Where a requirement genuinely comes from an external consumer, state the **technical** reason and drop
the source: "a packet decoder returns fields plus a table plus bytes, and a table approximates a hex
dump badly" carries the whole argument without the coupling.

## 4. Writing

* **No em dashes.** Anywhere. A colon, a comma or a full stop is always available.
* Comments explain **why**, not what. If a line looks arbitrary, say what went wrong without it.
* `⚠️` marks a trap someone could reasonably fall into again. Reserved for that.
* Commit messages: a subject saying what changed, then prose saying why. If it came from a defect,
  describe the defect concretely — what was on screen, what should have been. Those descriptions are
  what [architecture.md §14](docs/architecture.md#14-defect-register) is built from and the most useful
  thing in the history a year later.

## 5. Pull requests

* One PR per backlog issue, with `Closes #n` in the body.
* If work has no issue, file one first. The issue is where the reasoning and the open questions live.
* A PR that changes anything under `packages/` needs a changeset (`pnpm changeset`).
* A PR that changes public API updates the README and the relevant doc **in the same commit**.
* Checklist: [CONTRIBUTING.md](CONTRIBUTING.md#pull-requests).

## 6. Commands

```sh
pnpm check                        # typecheck + every Node test. Constantly, ~1s
pnpm bench                        # the bench on :5180. Look at the thing
pnpm bench:build && pnpm size     # transfer budgets
pnpm test:bench                   # browser tests, against the BUILT bundle
```

Test layers, because each catches what the others structurally cannot:

| Layer | Runs in | Covers |
|---|---|---|
| `packages/sdk/src/*.test.ts` | Node | Validation, invariants, migration, fixture comparison |
| `tools/cases.test.ts` | Node | Every tool's manifest and fixtures. **The compatibility mechanism** |
| `tools/*/*.test.ts` | Node | A tool's own properties, e.g. convergence |
| `bench/bench.test.ts` | Chrome, **built** bench | Shadow DOM, workers, lazy chunks, failure paths, a11y wiring |

## 7. Contract changes

Read [docs/versioning.md §5](docs/versioning.md#5-raising-the-contract-version) and follow all six
steps in one PR. The two rules that decide correctness:

1. **Both migration halves must be the identity function.** That is the mechanical test that the change
   was additive. If either has to transform something, it took something away, and §7 governs instead.
2. **No existing tool's fixtures may be edited.** If one needs editing, the change is breaking.

⚠️ A new output kind breaks **two** exhaustive switches, not one: `render/index.ts` and `summarise` in
`element.ts`, because a result must announce itself to a screen reader. Expect the compiler to point at
both.

## 8. Size budgets

`scripts/size-check.mjs` guards the figures the README publishes. A budget may only rise **in the commit
that spends it**, with the reason recorded beside the budget, and the README and architecture size tables
moved in the same commit. Raising one quietly is the single thing to avoid.

Bench-only code does not belong in the `boot` chunk. That chunk is the number a consumer reads as what
they pay; give test instruments their own chunk and their own budget line.

## 9. Traps that have already cost time

| Trap | Symptom |
|---|---|
| **Backticks inside `styles.ts`** | It is one template literal. A backtick in a CSS *comment* terminates it, and the error points ~40 lines away. Walked into twice |
| **Stale dev server** | `import.meta.glob` resolves at transform time, so a server started before a tool directory existed reports `No tool with id ...`. `--strictPort` now makes the port collision loud |
| **`worker.format` defaults to `iife`** | Cannot code-split. Worker mode builds in dev and fails the production build |
| **Vite builds workers in a separate pass** | `build.rollupOptions` does not apply. Without `worker.rollupOptions` the worker's tool copies are all `index-*.js` and duplication is invisible |
| **`interface` for a tool's input type** | Does not satisfy the SDK's index-signature constraint. Must be a `type` alias |
| **Release PRs sit at `BLOCKED`** | GitHub does not trigger workflows for `GITHUB_TOKEN` events, so required checks never attach. Merge with `gh pr merge <n> --squash --admin`; see [releasing.md](docs/releasing.md) |
| **Publishing needs OIDC, not a token** | The npm account's second factor is a passkey, which cannot answer the CLI's one-time-password prompt. A token in CI fails `EOTP` every time |

## 10. Shell

Suggest bare commands: `! pnpm bench`. **Never** `! cd ~/path && cmd` — that form silently produces no
output and no effect in this environment, and it cost two debugging rounds. Also note this shell is zsh:
unquoted parameter expansions do not word-split.

## 11. Standing decisions, not open questions

Reversing one of these should be an argued PR, not a side effect.

* **Zero dependencies in `packages/`.** Both packages have none. A charting library is the standing
  temptation: 40 to 200 KB, and it would decide how every tool looks.
* **No framework.** The runtime is `createElement` plus three helpers in `dom.ts`.
* **Additive contract changes only.**
* **Not a sandbox.** Worker mode is a stability boundary so a runaway loop can be terminated. It shares
  the page's origin and cookies. See [SECURITY.md](SECURITY.md).
* **Accessibility is part of the change**, not a follow-up. A new input type needs its label,
  description target and keyboard behaviour in the same commit.
* **Tools here exercise the runtime**, they are not a collection. A new one must cover something the
  existing ones do not.
