/**
 * The smallest honest host: the two exports a page needs and one tool, with nothing from the bench.
 *
 * `scripts/size-check.mjs` measures what this page loads as "runtime, as a host loads it", which is the
 * figure the README publishes. The bench's own `boot` chunk is not that figure: it also carries every
 * example's manifest, the bench registry and the bench's page wiring, none of which a host downloads.
 */
import { defineToolHost, RegistrySource } from "@toolbench/runtime";
import manifest from "./echo/tool.json";

defineToolHost({
	source: new RegistrySource({ echo: { manifest, load: () => import("./echo/index.ts") } }),
	pageUrl: (id) => `./tool.html?id=${encodeURIComponent(id)}`,
});
