# Authoring a tool

Writing, testing and shipping a tool, start to finish. Read
[architecture.md](architecture.md) if you want to know why any of this is shaped the way it is.

**Contents**

1. [What a tool is](#1-what-a-tool-is)
2. [Walkthrough: build one](#2-walkthrough-build-one)
3. [The manifest, field by field](#3-the-manifest-field-by-field)
4. [Inputs](#4-inputs)
   - [4b. Sample inputs](#4b-sample-inputs)
5. [Results](#5-results)
6. [Errors](#6-errors)
7. [Long-running tools](#7-long-running-tools)
8. [Fixtures](#8-fixtures)
9. [Charts](#9-charts)
10. [Help text](#10-help-text)
11. [Checklist](#11-checklist)
12. [Common mistakes](#12-common-mistakes)

---

## 1. What a tool is

A directory with four files:

```
tools/base64/
  tool.json      what it is, what it takes, what it can return
  index.ts       the function
  cases.json     inputs with known answers
  README.md      help text, shown next to the tool
```

The function is the whole tool:

```ts
run(input, ctx) -> Output
```

Three rules, and none of them are style preferences:

1. **No DOM.** `run` executes in Node during tests, in a worker where no DOM exists, and possibly
   during a site build. Reaching for `document` breaks all three.
2. **A function of its inputs.** No clock, no unseeded randomness, no network, no files. This is what
   makes a fixture mean anything. Randomness is fine if it comes from a seeded generator whose seed is
   an input; `tools/queue-explorer` does exactly that.
3. **Cancellable if it can be slow.** Any loop whose length comes from an input checks `ctx.signal`.

## 2. Walkthrough: build one

A Base64 decoder. It is a good first tool because it has real errors, and it wants two result shapes at
once.

### Step 1: the manifest

```jsonc
// tools/base64/tool.json
{
  "sdk": 1, // Contract version 1 (the current contract version is 3; older manifests remain valid and compatible)
  "id": "base64",
  "name": "Base64 decoder",
  "blurb": "Decodes Base64 and shows what the bytes actually are, including where it breaks.",
  "version": "1.0.0",
  "capabilities": ["pure"],
  "runtime": { "entry": "index.ts", "thread": "main" },
  "kinds": ["group", "fields", "table", "error"],
  "card": "live",
  "cardFields": 3,
  "inputs": [
    {
      "id": "source",
      "type": "textarea",
      "label": "Base64",
      "description": "Standard or URL-safe alphabet. Padding optional.",
      "primary": true,
      "dir": "ltr",
      "rows": 3,
      "default": "SGVsbG8sIHdvcmxkIQ=="
    },
    {
      "id": "view",
      "type": "select",
      "label": "Show bytes as",
      "default": "hex",
      "options": [
        { "value": "hex", "label": "Hex" },
        { "value": "ascii", "label": "ASCII" }
      ]
    }
  ]
}
```

`dir: "ltr"` matters more than it looks. Base64 is not prose, and inside a right-to-left page it would
otherwise be laid out backwards.

### Step 2: the function

```ts
// tools/base64/index.ts
import type { Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface. An interface does not satisfy the SDK's index-signature
// constraint, and the error you get for that is not obvious.
type Input = { source: string; view: string };

const ALPHABET = /^[A-Za-z0-9+/\-_]*={0,2}$/;

export default {
  run({ source, view }): Output {
    const trimmed = source.replace(/\s+/g, "");
    if (trimmed.length === 0) {
      return { kind: "error", message: "Nothing to decode.", input: "source" };
    }
    if (!ALPHABET.test(trimmed)) {
      const at = trimmed.search(/[^A-Za-z0-9+/\-_=]/);
      return {
        kind: "error",
        message: `"${trimmed[at]}" is not a Base64 character.`,
        input: "source",
        at,
        len: 1,
      };
    }

    const bytes = decode(trimmed);
    return {
      kind: "group",
      parts: [
        {
          kind: "fields",
          fields: [
            { label: "Bytes", value: String(bytes.length) },
            { label: "Padding", value: trimmed.endsWith("=") ? "present" : "absent" },
            { label: "Alphabet", value: /[-_]/.test(trimmed) ? "URL-safe" : "standard" },
          ],
        },
        {
          kind: "table",
          caption: "Sixteen bytes per row",
          columns: [
            { key: "offset", label: "Offset", align: "end" },
            { key: "bytes", label: view === "hex" ? "Hex" : "ASCII", mono: true },
          ],
          rows: rowsOf(bytes, view),
        },
      ],
    };
  },
} satisfies Tool<Input>;
```

`decode` and `rowsOf` are left out; they are ordinary functions in the same file with nothing
Toolbench-specific about them.

Four decisions worth copying:

* **`error` for bad input, with `input` naming the control.** That is what marks the textarea invalid
  and attaches the message to it for a screen reader. `at` and `len` say where in the string, so the
  host can point at the exact character.
* **`group`** because the summary and the bytes are both the answer. Not one or the other.
* **`align: "end"` on the numeric column**, because misaligned numbers cannot be scanned.
* **`mono: true`** on the byte column, because proportional hex is unreadable.

### Step 3: fixtures

```jsonc
// tools/base64/cases.json
[
  {
    "name": "decodes the canonical example",
    "input": { "source": "SGVsbG8sIHdvcmxkIQ==", "view": "ascii" },
    "expect": {
      "kind": "group",
      "parts": [
        {
          "kind": "fields",
          "fields": [
            { "label": "Bytes", "value": "13" },
            { "label": "Padding", "value": "present" },
            { "label": "Alphabet", "value": "standard" }
          ]
        },
        {
          "kind": "table",
          "caption": "Sixteen bytes per row",
          "columns": [
            { "key": "offset", "label": "Offset", "align": "end" },
            { "key": "bytes", "label": "ASCII", "mono": true }
          ],
          "rows": [[{ "value": "0" }, { "value": "Hello, world!" }]]
        }
      ]
    }
  },
  {
    "name": "rejects a character outside the alphabet, and says where",
    "input": { "source": "SGVs*bG8=", "view": "hex" },
    "expect": { "kind": "error", "message": "\"*\" is not a Base64 character.", "input": "source", "at": 4, "len": 1 }
  },
  {
    "name": "empty input is an error, not an empty result",
    "input": { "source": "   ", "view": "hex" },
    "expect": { "kind": "error", "message": "Nothing to decode.", "input": "source" }
  }
]
```

Exact matching by default is the point. If the tool starts emitting a field twice, or reorders them, or
returns something plausible alongside a correct error, the fixture fails. A "contains what I expected"
check passes all three.

### Step 4: run it

```sh
node --test tools/cases.test.ts
```

That file walks every tool directory, so a new tool is picked up with no registration. It checks the
manifest validates, that `id` equals the directory name, that `cases.json` exists and is not empty, that
every case's kind is declared in `kinds`, and then runs the cases and every sample the manifest declares.

**On your own site**, the same suite is three lines, because the walk is exported:

```ts
import { describe, it } from "node:test";
import { checkToolDirectory } from "@toolbench/sdk/fixtures";

checkToolDirectory(new URL("../src/tools/", import.meta.url), { describe, it });
```

`describe` and `it` are passed in rather than imported, so the SDK keeps its zero dependencies and the
same call works under Vitest. It lives on the `/fixtures` subpath because it reads the filesystem, and
the main entry deliberately does not: `@toolbench/runtime` imports the SDK and runs in a browser.

### Step 5: see it

```sh
pnpm bench
```

The bench globs `tools/*`, so the new tool appears in the gallery on the front page and at
`/tool.html?id=base64`. Click through all three modes. Every visual bug worth mentioning in this
repository was found by looking at the thing, not by reasoning about it.

## 3. The manifest, field by field

| Field | Required | Notes |
|---|---|---|
| `sdk` | yes | Contract version. `3` today. Do not raise it to get a feature that does not exist yet. |
| `id` | yes | Lowercase, digits, hyphens. Must equal the directory name; a test enforces that. It is also a URL segment. |
| `name` | yes | Sentence case. It is a heading, not a title. |
| `blurb` | yes | One sentence, under 200 characters. It is the card line and the page's meta description. Say what the tool does, not that it is useful. |
| `version` | yes | The tool's own version. Semver by convention. Nothing branches on it. |
| `capabilities` | yes | `["pure"]`. Still the only value at contract version 3. |
| `runtime.entry` | yes | Relative to the tool directory. |
| `runtime.thread` | no | `"main"` (default) or `"worker"`. See §7. |
| `inputs` | yes | At least one. A tool with none is a constant. |
| `samples` | no | Labelled example inputs, `{ label, input }`, drawn as a row of buttons under the form. `input` is keyed by input id and may be partial. See §4b. |
| `kinds` | yes | Every kind `run` can return, `"error"` included. Both halves are checked by tests. |
| `card` | no | `"info"` (default) shows the blurb only, `"live"` makes it runnable, `"none"` keeps it off cards. `"live"` requires `["pure"]`. |
| `cardFields` | no | How many fields a compact result shows before "+N more". Default 4. |
| `autoRun` | no | Run as the reader types. Default off. Refused for worker tools. Only for genuinely instant tools. |
| `timeoutMs` | no | 100 to 30000. Worker only; declaring it on the main thread is an error, because there is nothing there to terminate. Default 5000. |
| `status` | no | `"live"` (default), `"deprecated"`, `"retired"`. |
| `help` | no | Path to Markdown, relative to the tool directory. |
| `tags` | no | Free-form strings for the host's own grouping. |
| `links` | no | `{ label, href }`. Specs, source, further reading. |

## 4. Inputs

Five types. Each generates a labelled control with its description wired to `aria-describedby`.

```jsonc
{ "id": "text",  "type": "text",     "label": "Pattern", "default": "^a.*z$", "maxLength": 200 }
{ "id": "body",  "type": "textarea", "label": "Input",   "default": "",       "rows": 6 }
{ "id": "n",     "type": "number",   "label": "Samples", "default": 1000, "min": 1, "max": 100000, "step": 1, "unit": "samples" }
{ "id": "mode",  "type": "select",   "label": "Mode",    "default": "fast",
  "options": [{ "value": "fast", "label": "Fast" }, { "value": "exact", "label": "Exact" }] }
{ "id": "trace", "type": "toggle",   "label": "Show trace", "default": false }
```

Things the validator will hold you to, and why:

* **`min` and `max` are required on a number.** They are the only thing between a bounded computation
  and a hang, and the element clamps to them before your function is called. That means `run` can trust
  its range and skip the defensive check.
* **A select needs two or more options**, and the default must be one of them. One option is a constant.
* **`unit` on any number that has one.** `1000` alone is a riddle; `1000 samples` is not.
* **`description` is not a placeholder.** Placeholder text vanishes when someone types, which is when
  they most want it.
* **At most one input is `primary`.** A card shows exactly that one, so pick the one that makes the tool
  worth opening.
* **`dir: "ltr"`** on anything that is not prose: bytes, code, patterns, identifiers.

## 4b. Sample inputs

Nobody arrives at a tool knowing what to put into it, and the defaults can only demonstrate one thing.
`samples` is a list of labelled example inputs. The runtime draws them as a row of small buttons under the
form, introduced by a visible `Try:`, and a click fills the form with that sample's values.

```jsonc
// tools/percentiles/tool.json, three of the four samples it ships
"samples": [
  {
    "label": "Two clusters",
    "input": { "values": "2 2 3 3 3 4 4 4 5 5 5 6 6 7 7 180 190 195 210 240 260 300 340 900" }
  },
  {
    "label": "Definitions disagree",
    "input": { "values": "3 4 4 5 6 7 9 14 40 260", "method": "linear" }
  },
  {
    "label": "Not a number",
    "input": { "values": "12, 14, 15, 18ms, 21, 24, 31, 44" }
  }
]
```

`input` is keyed by input id, and it is **partial on purpose**. Two of the three above set only `values` and
say nothing about `method`, so whichever definition the reader had chosen stays chosen. That is the usual
shape and usually the right one: change the one thing the example is about, and leave everything else
where the reader put it. "Definitions disagree" sets both, because the point it makes needs both. Under
the linear definition those ten measurements give a p90 of 62.0, and nearest rank gives 40 for the same
data; a sample that quietly reset the definition to the default would put half of that comparison out of
reach.

### Choosing them

Picking the examples is an authoring skill rather than a step in a procedure, so it deserves more thought
than the JSON does.

**Ship the malformed one.** A sample whose input the tool rejects is the most useful example a tool can
offer. It is the one a reader will never type by hand, because nobody sits down to invent a broken input,
and it is the only way they see how the tool behaves when something is wrong before it happens to them for
real. It also says something about the tool: that its failure path was designed and is being shown on
purpose, rather than discovered by accident at the least convenient moment. `percentiles` ships "Not a
number", where a stray `18ms` sits in the middle of an otherwise clean list. A tool with no such sample
hides its failure path until a reader stumbles into it.

**Three or four, not eight.** A row of eight buttons stops being a set of examples and becomes a menu, and
a menu is one more thing to read before the tool can be used. Each sample should show something none of
the others do: the canonical case, one that exposes a distinction the tool exists to explain, an edge, and
the one that fails. If two samples make the same point, keep the clearer one and delete the other.

**A label says what the reader is about to see**, in two or three words. It sits on a small button in a
row, so there is no room for a sentence, and "Two clusters" or "Definitions disagree" tell a reader what
they are choosing. "Example 2" and "Test data" tell them nothing. Two samples may not share a label:
identical buttons that do different things are not something anyone can choose between.

### What a click does

A click **fills the form and stops there**, for the same reason typing does not run the tool: Run is the
trigger, and a sample is an input change like any other. An existing result goes stale, dims, and waits,
which is what lets a reader hold the answer they already have beside the example they just loaded. A tool that
set `autoRun: true` re-runs instead, again exactly as it would for typing. Samples are not an exception to
the rule about Run, they follow it.

Two details are deliberate rather than incidental. Values are written into the live controls rather than by
rebuilding the form, so **focus stays on the button that was pressed** and a reader can move along the row
from the keyboard. And the status region announces that the form was filled, naming the sample, and that
Run is next: for somebody who cannot see the form change, that announcement is the only evidence the click
did anything at all.

**A card shows no samples.** A compact card has room for one input and a Run button, and a row of buttons
there would crowd out the result the card exists to show. Samples appear in `page` and `embed` mode only,
so do not design a tool whose form makes no sense without them.

### What validation will hold you to

`validateManifest` refuses the manifest, naming the field, when:

* a sample names an input the tool does not declare. The message lists the ids that do exist, because this
  is almost always a typo;
* a value's type does not match its input: a string where a `number` is declared, a non-boolean for a
  `toggle`;
* a number falls outside that input's `min` and `max`;
* a string is longer than that input's `maxLength`;
* a `select` value is not one of that input's options;
* a sample's `input` sets nothing at all;
* `samples` is present but empty, which is a key that says nothing;
* two samples share a label.

⚠️ **The runtime clamps a reader's out-of-range number, and validation rejects an author's.** That looks
inconsistent until you see who each rule protects. A reader who types 9999 into a field that stops at 1000
has nowhere better to put that keystroke, and refusing it would leave them holding a form they cannot use,
so the control clamps and `run` keeps its guarantee that values are in range. An author's sample is static
data that CI reads before any reader sees the tool, so it can be a build error naming the field, fixed
once. Clamping it instead would ship a button whose label promises one thing and whose value quietly does
another, and nobody would ever notice.

`maxLength` is the sharpest case. It reaches the browser as the `maxlength` attribute, which constrains
typing and nothing else. Filling a control from a sample assigns its value directly and walks straight
past it, so an over-long sample would be the one route to a value the field itself says is impossible.

### What the build will hold you to

`checkToolDirectory` runs every sample a tool declares, so a declared example that crashes the tool fails
the build with the sample's label in the message. An `{ kind: "error" }` result is a **pass**: the
malformed sample is the one that earns the feature, and rejecting bad input is the tool working. A sample
that overruns its budget is reported as slow rather than as a crash, so the two diagnoses stay apart.

## 5. Results

```ts
{ kind: "fields", fields: [
    { label: "p50", value: "120", unit: "ms" },
    { label: "p99", value: "1450", unit: "ms", tone: "warn", note: "tail is 12x the median" },
    { label: "Arrival rate", value: "800", group: "Inputs" },
]}
```

`tone` is `"good" | "warn" | "bad"`, for when a number's meaning is not obvious from the number.
`note` is the sentence a reader would otherwise have to work out. `group` puts fields under a heading,
which is how one result holds two comparable sets: `tools/queue-explorer` uses "Formula" and
"Simulation" side by side.

```ts
{ kind: "table",
  columns: [{ key: "n", label: "Bucket", align: "end" }, { key: "hits", label: "Hits", align: "end", mono: true }],
  rows: [[{ value: "0-10" }, { value: "812" }], [{ value: "10-20" }, { value: "39", tone: "warn" }]],
  caption: "Latency distribution" }

{ kind: "text", text: "Converged after 4 iterations.", mono: false }

{ kind: "code", lang: "json", source: '{"ok":true}' }

{ kind: "bytes",
  bytes: [72, 195, 169, 108],
  offset: 0,                    // what to LABEL the first byte, for a window into something larger
  caption: "Highlighted runs are one character each",
  highlight: [{ at: 1, len: 2, label: "U+00E9 é", tone: "normal" }] }

{ kind: "group", parts: [ /* any of the above */ ] }
```

Three notes on `bytes`, added in contract version 2 for wire formats. **Every highlight needs a
`label`**, because colour alone tells a reader something is interesting without saying what, and tells a
screen reader nothing at all: the labels become a legend under the dump. **`at` is always relative to
`bytes`**, never to `offset`, which only changes what the first row is *labelled*. And **`tone` is for
real severity only**: the default palette resolves `warn` and `accent` to the same colour, so a tone
used decoratively implies a distinction the reader cannot see.

Two notes on `group`. Order matters: a **card renders only the first part**, so put the part that works
alone at the front. And declare every kind you use, `"group"` included.

## 6. Errors

Two different situations, and a reader can tell them apart only if you keep them apart.

**Bad input.** Return an `error`. The tool worked.

```ts
return {
  kind: "error",
  message: `"${token}" is not a number.`,
  input: "values",   // marks that control invalid, attaches the message to it
  at: offset,        // character offset, if you know it
  len: token.length,
};
```

Write the message so it says what is wrong, where, and what would be right. `"nope" is not a number`
beats `Invalid input`. Never abbreviate an error; a browser test asserts that an error never ends in an
ellipsis, because the truncated half is the half that says what to fix.

**A bug in the tool.** Throw. The runtime says "This tool hit a bug and stopped", puts the stack in the
console, and does not pretend the input was at fault. Do not catch your own bugs and report them as
input errors; that sends the reader off to fix something that was never broken.

## 7. Long-running tools

If the running time depends on an input, declare a worker and honour the signal:

```jsonc
"runtime": { "entry": "index.ts", "thread": "worker" },
"timeoutMs": 8000
```

```ts
run({ samples }, ctx) {
  for (let i = 0; i < samples; i++) {
    if ((i & 0x3ff) === 0) {
      if (ctx.signal.aborted) throw new DOMException("Aborted", "AbortError");
      ctx.progress(i / samples);
    }
    // ... work
  }
}
```

* **Check every 1024 iterations, not every one.** Reading `signal.aborted` a million times is itself
  the slow part.
* **`ctx.progress(fraction)`** takes 0 to 1. The runtime coalesces calls to one animation frame, so
  calling it often is cheap, and the progress bar only appears if the run outlasts 400 ms.
* **`ctx.progress(fraction, partial)`** can pass a partial `Output` to draw as the run proceeds. Useful
  for a converging simulation. The final result always wins, whatever order the frames arrive in.
* **Worker mode is a stability boundary, not a security one.** It exists so a runaway loop can be
  terminated without freezing the page. It shares the page's origin and cookies.
* **`autoRun` is refused here.** A tool that declared a worker did so because it can be slow.

## 8. Fixtures

`cases.json` is an array of cases. Fields:

| Field | Meaning |
|---|---|
| `name` | What the case establishes. "handles empty input" beats "test 2" |
| `input` | Partial input. Anything omitted comes from the manifest defaults |
| `expect` | The expected `Output`, compared exactly by default |
| `match` | `"exact"` (default) or `"subset"` |
| `why` | Required with `subset`. Say what the case is pinning and what it deliberately is not |
| `fieldCount` | Required with `subset` on a `fields` result, so a dropped field still fails |
| `maxMs` | Optional per-case budget |

Subset matching is for results that are mostly computed numbers:

```jsonc
{
  "name": "simulation lands near the closed form at rho = 0.8",
  "input": { "lambda": 8, "mu": 10, "samples": 20000, "seed": 42 },
  "match": "subset",
  "why": "the simulated numbers are checked for convergence in convergence.test.ts; this case pins the shape and the analytic half",
  "fieldCount": 8,
  "expect": { "kind": "fields", "fields": [{ "group": "Formula", "label": "Utilisation", "value": "0.800" }] }
}
```

Note where the work is split. The fixture pins the shape and the exactly-known numbers. The claim that
the simulation is *right* lives in a unit test that can say why: it asserts the simulation converges on
the closed form, that the same seed gives the same answer, and that Little's law holds. Pinning two
hundred computed digits in a fixture would test that nothing changed, which is not the same as testing
that it is correct.

Aim for four to six cases: the canonical example, an edge (empty, one element, the maximum), a
bad-input error, and anything that was once a bug.

The harness enforces four things a tool cannot enforce about itself: that the manifest is valid and its
`sdk` is one this SDK can read, that `cases.json` exists and is not empty, that no case expects a kind
`kinds` failed to declare, and that every sample in the manifest runs. The fourth is there because a
sample is the first thing a reader clicks, so an example that crashes stays invisible until one of them
finds it. See §4b for what counts as running.

## 9. Charts

```ts
{ kind: "series", chart: {
    title: "Wait time against utilisation",
    x: { label: "Utilisation", min: 0, max: 1, format: "fixed2" },
    y: { label: "Wait", unit: "ms", format: "compact" },
    series: [
      { name: "M/M/1", shape: "line", points: [{ x: 0.1, y: 11 }, { x: 0.5, y: 100 }] },
      { name: "Simulated", shape: "line", axis: "right", points: [/* ... */] },
    ],
    annotations: [{ x: 0.8, label: "knee" }],
}}
```

* `shape` is `"line"`, `"area"` or `"bar"`.
* `axis: "right"` for a second scale. The renderer reserves the extra padding for it, so labels are not
  clipped.
* `format` is per axis, not per value. A mix of `20, 15, 10, 5.00` on one axis is a formatting bug, and
  the reason formatting is chosen once per axis.
* Six series colours, then they repeat. A chart needing seven series needs rethinking.
* Every chart also renders as a table inside a `<details>`, automatically. A chart is an image, and a
  screen reader gets nothing from an image. You do not have to do anything to get this, but it is worth
  knowing that your axis labels and series names are read aloud.

## 10. Help text

`README.md` in the tool directory, referenced by `help`. The host renders it beside or below the tool.
What earns its place:

* what the tool computes, in one paragraph;
* the formula, the algorithm, or the spec section, with a link;
* what it does **not** handle. This is the most useful part and the most often missing;
* where the numbers come from, if any are hard-coded.

## 10b. Seeding

If a host puts your tool on a card, it will compute a **seed**: your tool run against its manifest
defaults, embedded in the page so the card shows a real result before any JavaScript loads.

Two consequences for you as the author, and both are easy to get wrong:

* **Your defaults must produce a real result.** `seed()` throws if the tool rejects its own defaults, so
  a default that returns `error` fails the host's build. Pick defaults that demonstrate the tool.
* **Your defaults must be fast.** Seeding runs at build time with a 5 second budget, and it is one tool
  among however many the host has. A default that takes seconds is a default nobody should ship.

You do not have to do anything to support seeding. It is worth knowing it happens, because it makes your
choice of defaults visible to every reader who never presses Run.

## 11. Checklist

- [ ] `id` matches the directory name
- [ ] `blurb` is one sentence under 200 characters, and says what the tool does
- [ ] Every number input has `min`, `max` and a `unit`
- [ ] Every input has a `description` that is not a restatement of its label
- [ ] Exactly one input is `primary`, and it is the interesting one
- [ ] Non-prose inputs are `dir: "ltr"`
- [ ] `kinds` lists every kind `run` can return, `"error"` included
- [ ] Bad input returns `error` with `input` naming the control
- [ ] `run` touches no DOM, no clock, no network, no unseeded randomness
- [ ] Any input-dependent loop checks `ctx.signal`, and the tool declares `thread: "worker"`
- [ ] Four or more cases: canonical, edge, error, past bug
- [ ] Every `subset` case has a `why` that says what is deliberately not pinned
- [ ] Defaults produce a real result, quickly: they are what a seeded card shows
- [ ] If the tool ships `samples`: three or four, one of them malformed, every label two or three words
      saying what the reader will see
- [ ] `README.md` says what the tool does not handle
- [ ] `node --test tools/cases.test.ts` passes
- [ ] Looked at it in `pnpm bench`, in all three modes

## 12. Common mistakes

| Mistake | What happens | Fix |
|---|---|---|
| `interface Input` instead of `type Input` | `Tool<Input>` does not compile, with an unhelpful message about index signatures | Use a `type` alias. TypeScript gives type aliases an implicit index signature; interfaces do not |
| Returning a bare `fields` when the answer is also a table | Half the answer is missing | `group` |
| Putting the chart first in a group | The card shows a chart with no context | Order by what works alone |
| Forgetting `"error"` in `kinds` | Validation fails at startup | Add it. Every tool can be given bad input |
| Catching your own bug and returning `error` | The reader goes looking for a mistake they did not make | Throw. Bugs and bad input are different |
| Unbounded loop on the main thread | The page freezes and nothing can stop it | `min`/`max` on the input, and `thread: "worker"` |
| `timeoutMs` with `thread: "main"` | Validation fails | Move to a worker or bound the input. A main-thread timeout cannot fire |
| Ignoring `ctx.signal` | A timeout terminates the worker, so the reader is fine, but every cancelled run costs a full worker restart | Check the signal every 1024 iterations |
| `Math.random()` or `Date.now()` in `run` | Fixtures pass locally and fail in CI, or pass every second time | Take a seed as an input. See `tools/queue-explorer` |
| A `subset` case with no `why` | The fixture runner refuses it | Say what is pinned and what is not, or make it exact |
