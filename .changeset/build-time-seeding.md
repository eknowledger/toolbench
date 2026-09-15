---
"@toolbench/sdk": minor
---

Adds `seed()` and `serialiseSeed()` for computing a card's static result at build time, so a seed cannot drift from the tool it describes.

`seed(loaded)` runs a tool against its manifest defaults and returns the `Output`. It throws if the tool crashes on its own defaults or rejects them, because both are authoring bugs and a card seeded with an error message is worse than an unseeded card.

`serialiseSeed(output)` produces JSON safe to embed in `<script type="application/json">`. Use it rather than `JSON.stringify`: an HTML parser ends a `<script>` at the first `</script` in its text however the JSON is quoted, so a tool echoing any part of its input could otherwise truncate the page.

Also exports `defaultInputs()` and `SeedError`.
