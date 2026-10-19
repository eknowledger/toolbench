# @toolbench/sdk

The contract a [Toolbench](https://github.com/eknowledger/toolbench) tool implements. No dependencies,
no DOM.

```sh
pnpm add @toolbench/sdk
```

A tool is one function and one JSON file:

```ts
import type { Tool } from "@toolbench/sdk";

export default {
  run({ text }) {
    return { kind: "fields", fields: [{ label: "reversed", value: [...text].reverse().join("") }] };
  },
} satisfies Tool<{ text: string }>;
```

This package holds four things:

| Export | What it does |
|---|---|
| Types (`Tool`, `Ctx`, `Output`, `InputSpec`, `Manifest`) | The whole agreement between a tool and a host |
| `validateManifest` | Turns unknown JSON into a `Manifest`, or throws naming the field and saying what to do |
| `isSafeLinkHref` | Whether a link target may be offered to a reader: `http`, `https`, `mailto` or relative, judged by the URL parser |
| `upgradeManifest`, `upgradeOutput`, `canLoad` | Version migration, so a tool written against an older contract keeps working |
| `runCases`, `assertCases`, `compare` | The fixture runner. Known-answer cases run in Node with no browser and no build step |

Nothing here touches the DOM, because `run` has to work in three places: Node during tests, a Web
Worker where no DOM exists, and a site build computing a precomputed result.

To render and run a tool in a page, add [`@toolbench/runtime`](https://www.npmjs.com/package/@toolbench/runtime).

## Documentation

- [Writing a tool](https://github.com/eknowledger/toolbench/blob/main/docs/authoring-a-tool.md)
- [Architecture](https://github.com/eknowledger/toolbench/blob/main/docs/architecture.md)
- [Versioning and compatibility](https://github.com/eknowledger/toolbench/blob/main/docs/versioning.md)

MIT
