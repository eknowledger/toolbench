---
"@toolbench/runtime": minor
"@toolbench/sdk": minor
---

**New: style tool output with your own CSS.** Pass `styles` to `defineToolHost` and the runtime adopts
your sheets into every tool's shadow root, after its own. Any rule of yours outside a CSS layer wins,
whatever its specificity. `setHostStyles()` swaps them on every tool without a reload. The class names
and attributes you can rely on are listed in STYLING.md, with four worked examples.
([#157](https://github.com/eknowledger/toolbench/issues/157))

- Every result part now carries `data-kind`, and every table cell `data-label` with its column's name.
- Contract version 5: a tool can name any part or field with `role`, rendered as `data-role`, and mark a
  field or cell `tone: "muted"`.
- **Fixed:** a `good` table cell is now green, like a `good` field
  ([#156](https://github.com/eknowledger/toolbench/issues/156)), and a wide result no longer clips its
  whole tool on a narrow screen; it scrolls inside its own box
  ([#154](https://github.com/eknowledger/toolbench/issues/154)).
- ⚠️ Heads-up: the runtime's rules now sit in `@layer toolbench`. If your page already adopts a sheet
  into a tool's shadow root, its unlayered rules now win over the runtime's even where they are less
  specific.
