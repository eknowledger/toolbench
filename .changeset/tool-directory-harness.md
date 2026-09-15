---
"@toolbench/sdk": minor
---

Adds a `@toolbench/sdk/fixtures` subpath exporting the tool-directory harness, so a host authoring its own tools gets the compatibility guarantees in three lines rather than copying forty:

```ts
import { describe, it } from "node:test";
import { checkToolDirectory } from "@toolbench/sdk/fixtures";

checkToolDirectory(new URL("../src/tools/", import.meta.url), { describe, it });
```

It validates every manifest, checks each tool's `id` matches its directory name, refuses an empty `cases.json`, verifies no case expects an output kind the manifest failed to declare, and runs every case with a 50 ms bound for main-thread tools.

Also exports `readToolDirectory`, `readTool` and `scanToolDirectory` for build-time use, such as generating a registry or precomputing seeds, plus `ToolDirectoryError` and `ToolOnDisk`.

`describe` and `it` are passed in rather than imported, so this package keeps its zero dependencies and the same call works under other runners. It is a subpath rather than part of the main entry because it reads the filesystem, and the main entry deliberately does not: `@toolbench/runtime` imports this package and runs in a browser.
