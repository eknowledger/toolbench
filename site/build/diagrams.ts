/**
 * The docs' mermaid diagrams, as inline SVG, read from the committed cache in `site/build/diagrams/`.
 *
 * The diagrams are ```mermaid blocks in the repository's markdown, which GitHub renders itself, so the
 * markdown stays the single source. The site is its own HTML, so something has to draw them, and that
 * something is not the build: `pnpm site:diagrams` (site/build/draw-diagrams.ts) draws them once, on
 * demand, and the build only reads the drawings. A reader downloads no diagram library, the build needs
 * no browser, and the workspace carries no diagram dependency.
 *
 * Each drawing is keyed by a hash of its source and the drawing settings, so an edited diagram has no
 * drawing until the command runs again, and the build says so rather than showing a stale one.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CACHE = join(import.meta.dirname, "diagrams");
/** Part of every key: change it and every diagram is drawn again. */
export const SETTINGS = "mermaid-12.2.0 base sentinels-v1 arial-15";

export function key(source: string): string {
	return createHash("sha256").update(`${SETTINGS}\n${source}`).digest("hex").slice(0, 12);
}

export const file = (source: string) => join(CACHE, `${key(source)}.svg`);

/** Fail the build, naming the command, if any diagram has no drawing for its current source. */
export function checkDiagrams(sources: string[]): void {
	const missing = [...new Set(sources)].filter((s) => !existsSync(file(s)));
	if (missing.length === 0) return;
	const first = (missing[0] ?? "").split("\n").find((l) => l.trim() && !/^\s*(?:flowchart|sequenceDiagram|stateDiagram|graph)/.test(l))?.trim();
	throw new Error(
		`${missing.length} mermaid diagram${missing.length === 1 ? " has" : "s have"} no drawing for ${missing.length === 1 ? "its" : "their"} current source (first: ${first}). Run \`pnpm site:diagrams\` and commit site/build/diagrams/.`,
	);
}

/** The drawing for one block, from the cache. */
export function diagram(source: string): string {
	const path = file(source);
	if (!existsSync(path)) throw new Error(`No drawing for a mermaid block (${key(source)}). Run \`pnpm site:diagrams\`.`);
	return `<figure class="diagram">${readFileSync(path, "utf8").trim()}</figure>`;
}

/** Every ```mermaid block in a markdown text. */
export function mermaidBlocks(markdown: string): string[] {
	return [...markdown.matchAll(/^```mermaid\n([\s\S]*?)^```/gm)].map((m) => (m[1] ?? "").replace(/\n$/, ""));
}
