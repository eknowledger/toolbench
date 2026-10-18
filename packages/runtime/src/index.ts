/**
 * @toolbench/runtime — renders and runs a tool in any web page.
 *
 *   import { defineToolHost, RegistrySource } from "@toolbench/runtime";
 *
 *   defineToolHost({
 *     source: new RegistrySource({
 *       percentiles: { manifest, load: () => import("./tools/percentiles/index.ts") },
 *     }),
 *     highlight: (source, lang) => yourHighlighter(source, lang), // optional, returns a Node
 *   });
 *
 * Then anywhere in the page:  <tool-host tool="percentiles" mode="page"></tool-host>
 *
 * No framework, no build step required of the host, and nothing here knows what site it is on.
 */
export { ToolHost, defineToolHost, setHostStyles, type Mode, type ToolHostConfig } from "./element.ts";
export { RegistrySource, ToolNotFoundError, type RegistryEntry, type ToolSource } from "./sources.ts";
export { Runner, isSuperseded, type Runnable, type RunHooks, type RunnerOptions } from "./runner.ts";
export { ToolCrashError, ToolTimeoutError, WorkerUnavailableError, type Request, type Response } from "./protocol.ts";
export { render, unknownOutput, type RenderOptions } from "./render/index.ts";
export { STYLES, applyStyles, type HostSheet, type HostStyles } from "./styles.ts";
