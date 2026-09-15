# Roadmap

What is planned, in what order, and why that order. The live backlog is
[the issues](https://github.com/eknowledger/toolbench/issues), grouped into
[milestones](https://github.com/eknowledger/toolbench/milestones); this file is the reasoning behind the
grouping.

Nothing here is a commitment or a date.

## Where things stand

Working and tested: the contract, manifest validation with its invariants, the version-migration
machinery, the fixture runner, `<tool-host>` in three display modes, both threading modes, worker
timeout and respawn, seven result kinds with renderers, theming through custom properties, lazy loading
proven by network trace, and transfer budgets checked in CI. 46 Node tests, 14 browser tests against the
built bundle.

Not done: nothing is published, the repository is private, and the framework has exactly one consumer,
which is its own bench.

## [0.1.0 - first publish](https://github.com/eknowledger/toolbench/milestone/1)

No feature work. Get the thing out where it can be used and looked at.

The npm org, the first publish, trusted publishing so no long-lived token exists anywhere, making the
repository public, and a deployed bench so the first thing a visitor can do is try it rather than read
about it. Plus Dependabot, which matters more than it looks: `release.yml` holds `id-token: write`, so
every action it runs can authenticate to npm as this repository.

## [0.2.0 - first real consumer](https://github.com/eknowledger/toolbench/milestone/2)

The most important milestone, and the least glamorous.

A framework whose only consumer is its own test bench is in the weakest position a framework can be in:
the bench was written by the same person on the same day and never pushed back on anything. Integrating
into a real site is what finds the gaps, and the issues that integration produces are worth more than
the integration.

The other work here follows from that. A **seeding helper**, because a hand-written seed goes stale
silently and a stale seed shows a confidently wrong answer. **Scaffolding**, because the first two
minutes of writing a tool are copying boilerplate. A **GitHub-backed pipeline**, which was always
intended as the second way to get tools into a site and is filed as a spike, because the interesting part
is the constraint it has to respect: a manifest is data and can arrive any time, but a module is code and
the bundler has to have seen it.

## [0.3.0 - later contract work](https://github.com/eknowledger/toolbench/milestone/3)

**Contract v2 moved into 0.2.0 and has shipped.** It was pulled forward because the first tool being
built on Toolbench outside this repository is a packet decoder, and a decoder returns a `group` of
`fields` + `table` + `bytes`. A `table` approximates a hex dump badly, so the integration was genuinely
blocked on the kind rather than merely inconvenienced.

The `bytes` kind, its renderer and the `1 → 2` migration are done, and the thing worth recording is that
the policy held: both migration halves are the identity function and no existing tool's fixtures were
touched. The chain is no longer backed by test doubles.

What remains here is the contract work nothing needs yet.

A `file` input is filed as a spike rather than a feature, because it is the first change that breaks the
"a tool is a function of its declared inputs" property that fixtures and seeding both rest on. Four
questions need answering before any code.

Splitting the chart renderer into its own chunk is filed as "measure, then probably close". It became
more interesting after contract v2, which added about 1.5 KB to the runtime for a renderer most tools
never use: the same argument now applies twice.

## [1.0.0 - stable API](https://github.com/eknowledger/toolbench/milestone/4)

The criteria are in [releasing.md §4](docs/releasing.md#4-the-road-to-10). The real one is that a
newcomer can ship a tool without asking anyone; everything else is a number.

Grouped here: verifying the support claim instead of asserting it (Firefox and WebKit in CI), a real
screen-reader pass rather than wiring assertions, coverage reporting, and several open questions that
should be answered and written down even if the answer is "no": whether the chart renderer is worth
splitting, whether the worker's duplicate chunks are avoidable, whether a `net` capability belongs here
at all.

Two of those are deliberately framed as "measure, then probably close". A limitation with a number
attached is useful. A limitation with a shrug attached invites the same conversation every six months.

## Deliberately not planned

From [architecture.md §15](docs/architecture.md#15-limitations) and the README's non-goals. These are
decisions, not gaps:

* **A sandbox.** Worker mode isolates a thread so a runaway loop can be stopped. It shares the page's
  origin and cookies. Running code you did not write needs a different design, and pretending otherwise
  would be the most dangerous thing this project could do.
* **A code playground.** A compiler in the browser is megabytes.
* **A notebook.** No dataflow between tools, no execution order.
* **A charting library.** 40 to 200 KB, and it would decide how every tool looks.
* **A framework dependency.** The runtime is `createElement` and three helpers. If it needed React,
  "drop it into any page" was never true.
