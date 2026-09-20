# Regex explainer

Walks a JavaScript regular expression token by token, tests it against a subject, and shows the
matches as JSON. Press Run: this one does not update as you type, and the reason is below.

## What it computes

The walk is a reading of the pattern, not a different engine. Each token is the source text plus a
short meaning: the atom, then a comma, then how many times it may repeat. Capturing groups are
numbered in the order JavaScript numbers them.

The match is whatever `RegExp` does with the chosen flags. Without `g` that is the first match.
With `g` it is every match. The JSON block is the `data-lang` hook: the runtime does not highlight
it, and a host that wants highlighting can.

## What this does not handle

- **Other dialects.** JavaScript `RegExp` only. POSIX, PCRE, RE2 and .NET have different rules,
  especially around lookbehind, word characters and what `\\s` includes.
- **Replacement and split.** The tool tests; it does not rewrite.
- **The `u` and `v` flags.** Unicode property escapes and set notation need those flags, and they
  are not on the menu. A `\\p{L}` without `u` is just a `p`.
- **Host highlighting.** `code` sets `data-lang`. Colouring the block is a host concern, see the
  project issue on highlighting.
- **Catastrophic patterns, in general.** A group that already contains an unbounded repeat (`+`, `*`,
  `{n,}`) and is itself unbounded is refused by name, because `(a+)+` is the one a reader writes by
  accident and the message is worth more than a timeout. That refusal is not the safety net: it lists
  one shape, and `(a|aa)+$` nests no repeat, passes it, and takes 28 seconds on 45 characters. The
  timeout is the safety net.
- **A full static analysis.** Possessive quantifiers, recursion and atomic constructs do not exist
  in JavaScript; things that do exist but this walk does not name are shown as the characters they
  are.

## Why it runs in a worker, and why there is no live update

An explainer reads best live, and the first version of this tool auto-ran on the main thread for
exactly that reason. It cannot. This is the only tool here that compiles a pattern the reader typed
and runs it against a subject the reader typed, so its running time is the reader's to choose, and a
regular expression can choose minutes. Measured with the call this tool makes: `(a|aa)+$` against 45
characters of `a` and a trailing `b` takes **28 seconds**, 4.2 s at 41 characters and 0.6 s at 37.

On the main thread there is nothing to interrupt. `ctx.signal` only stops a tool that checks it, and
nothing can be checked while the regex engine is inside a match, which is why the manifest refuses
`timeoutMs` outside worker mode. So the match gets its own thread and two seconds, and a pathological
pattern becomes a message instead of a tab you have to close.

Dropping `autoRun` is not a separate decision, and the contract will not let it be one: the SDK
rejects `autoRun` together with `thread: "worker"`, on the grounds that a tool declaring a worker has
already admitted its running time depends on its input. Trading the live update for a Run button is
the cost of a tool that cannot be made fast, and this tool is the reason that rule exists.
