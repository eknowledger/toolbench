# @toolbench/runtime

Renders and runs a [Toolbench](https://github.com/eknowledger/toolbench) tool in any web page. A custom
element, no framework, no dependencies beyond `@toolbench/sdk`.

```sh
pnpm add @toolbench/runtime
```

Register once per site:

```ts
import { defineToolHost, RegistrySource } from "@toolbench/runtime";
import manifest from "./tools/reverse/tool.json";

defineToolHost({
  source: new RegistrySource({
    reverse: { manifest, load: () => import("./tools/reverse/index.ts") },
  }),
  pageUrl: (id) => `/tools/${id}/`,
  // Optional. Paint `code` results with the highlighter you already have.
  // Return a Node, never a string: the runtime will not assign innerHTML.
  // highlight: (source, lang) => yourHighlighter(source, lang),
});
```

Then use it anywhere:

```html
<tool-host tool="reverse" mode="card"></tool-host>
<tool-host tool="reverse" mode="page"></tool-host>
<tool-host tool="reverse" mode="embed"></tool-host>
```

A host can prefill inputs without reaching into the shadow root. `values` is partial, validated like
typed input, and does not run the tool. `run()` is opt-in, and both work before the form has opened:

```ts
const host = document.querySelector("tool-host");
host.values = { text: "hello" };
host.run();
```

The element dispatches `tool-input` (`detail: { values }`) after the inputs change, and `tool-run`
(`detail: { values, ok, error? }`) after a run's result is drawn. Both bubble and are composed, and
neither fires while the tool first opens. `ToolHostEvents` types them.

## What you get

* **Three display modes.** A compact card, a full page, and an in-article embed, from one declaration.
* **Nothing loads until it is needed.** A card is static markup that downloads no tool code until the
  reader opens it. Measured: 0 bytes for a card nobody opens, one chunk when they do.
* **Accessible by default.** Real labels, `aria-describedby` descriptions, errors tied to the control
  that caused them, a polite status region, full keyboard operation, reduced-motion support.
* **Worker mode with a real timeout.** A tool whose running time depends on its input runs off the main
  thread, and a runaway loop is terminated instead of freezing the page.
* **Styles that cannot collide.** Everything renders in a shadow root. Theming is a dozen CSS custom
  properties, and that list is the whole styling API.
* **Host-owned syntax highlighting.** Pass `highlight?: (source, lang) => Node` to paint `code`
  results with the highlighter you already have. Omit it and the source stays readable plain text.
* **Lifecycle status is honoured.** `deprecated` still runs, with a marker a host can style via
  `data-status` and `--tb-mark-*`. `retired` does not: the element explains, renders `links`, and
  never fetches the tool's code.

## Size

Measured with gzip on a minimal page built with Vite's defaults, one tool and nothing else:

| | Transfer |
|---|---|
| Runtime, once per page that uses a tool | 27.2 KB |
| Worker entry, only on pages with a worker-mode tool | ~2.8 KB |
| A typical tool | 1 to 2 KB |
| A page with no tool | 0 bytes |

## Exports

| Entry | For |
|---|---|
| `@toolbench/runtime` | `defineToolHost`, `RegistrySource`, `Runner`, the renderers, the error types, and the `ToolHostConfig` and `ToolHostAttributes` types |
| `@toolbench/runtime/register` | Side-effecting registration, for a page with no bundler |
| `@toolbench/runtime/worker` | `createToolWorker`, for the host's own worker entry file |

## Documentation

- [Architecture](https://github.com/eknowledger/toolbench/blob/main/docs/architecture.md), including
  how theming, lazy loading and the worker protocol actually work
- [Writing a tool](https://github.com/eknowledger/toolbench/blob/main/docs/authoring-a-tool.md)
- [Versioning and compatibility](https://github.com/eknowledger/toolbench/blob/main/docs/versioning.md)

MIT
