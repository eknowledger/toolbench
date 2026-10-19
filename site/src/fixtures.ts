/**
 * The bench's fixtures, read only, for the gallery. Each exists to put one runtime feature on screen,
 * which is exactly what a gallery example needs. Registered on the gallery page only, and in the worker,
 * which needs its own view of the module graph for the fixture that runs there.
 *
 * Left out: `json-code`, which duplicates what the regex explainer's code result already shows, and
 * `deprecated` and `retired`, whose links point at bench pages; site/examples/ has the site's own.
 */
import { examples } from "./examples.ts";
import { entries } from "./registry.ts";

export const fixtures = {
	...entries(
		import.meta.glob(["../../bench/fixtures/*/tool.json", "!**/json-code/*", "!**/deprecated/*", "!**/retired/*"], { eager: true, import: "default" }) as Record<string, unknown>,
		import.meta.glob(["../../bench/fixtures/*/index.ts", "!**/json-code/*", "!**/deprecated/*", "!**/retired/*"]) as Record<string, () => Promise<unknown>>,
	),
	// The site's own examples, for what a fixture cannot show here. See site/examples/.
	...examples,
};
