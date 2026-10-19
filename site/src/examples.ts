/**
 * The site's own example tools, in site/examples/: what neither tools/ nor the bench's fixtures can show
 * here. The Base64 decoder that docs/authoring-a-tool.md builds, and a deprecated and a retired tool
 * whose links lead onward within this site.
 */
import { entries } from "./registry.ts";

export const examples = entries(
	import.meta.glob("../examples/*/tool.json", { eager: true, import: "default" }) as Record<string, unknown>,
	import.meta.glob("../examples/*/index.ts") as Record<string, () => Promise<unknown>>,
);
