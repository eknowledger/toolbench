/**
 * The worker the runtime starts for tools that declare `thread: "worker"`. It has to live in the site,
 * because only the site's bundler can see the site's tools.
 */
import { createToolWorker } from "@toolbench/runtime/worker";
import { fixtures } from "./fixtures.ts";
import { registry } from "./registry.ts";

// #region worker
const tools = { ...registry, ...fixtures };

createToolWorker({
	load: async (id) => {
		const entry = tools[id];
		if (!entry) throw new Error(`the worker has no tool with id "${id}"`);
		return (await entry.load()) as never;
	},
});
// #endregion
