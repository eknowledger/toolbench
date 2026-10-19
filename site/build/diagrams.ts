/**
 * The docs' mermaid diagrams, drawn to inline SVG at build time, so a reader downloads no diagram library.
 *
 * The diagrams are written as ```mermaid blocks in the repository's markdown, which GitHub renders too,
 * so the markdown stays the single source. Here each block is drawn by mermaid in headless Chrome
 * (Playwright, already a repository dependency) and cached in `site/build/diagrams/`, keyed by a hash of
 * its source and the settings below. The cache is committed, like a lockfile: a build whose diagrams are
 * unchanged needs no browser, and a changed diagram is drawn on the next build that has one.
 *
 * One drawing serves both themes. Mermaid is given sentinel colours, and every colour in its output is
 * then rewritten to a site custom property: the sentinels by name, and anything mermaid derived from them
 * by lightness, into surface, muted or ink. The light and dark values are the site's own.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const CACHE = join(import.meta.dirname, "diagrams");
/** Part of every key: change it and every diagram is drawn again. */
const SETTINGS = "mermaid-12.2.0 base sentinels-v1 arial-15";

/** Each sentinel and the custom property it becomes. */
const SENTINELS: Record<string, string> = {
	"#fefef1": "var(--d-node)",
	"#fefef2": "var(--d-surface)",
	"#fefef3": "var(--d-surface)",
	"#fefef4": "var(--d-bg)",
	"#fefef5": "var(--d-accent-wash)",
	"#010102": "var(--d-ink)",
	"#010103": "var(--d-border)",
	"#010104": "var(--d-line)",
	"#010105": "var(--d-accent)",
};

const THEME = {
	background: "#fefef4",
	fontFamily: "Arial, Helvetica, sans-serif",
	fontSize: "15px",
	primaryColor: "#fefef1",
	mainBkg: "#fefef1",
	nodeBkg: "#fefef1",
	actorBkg: "#fefef1",
	stateBkg: "#fefef1",
	secondaryColor: "#fefef2",
	tertiaryColor: "#fefef3",
	clusterBkg: "#fefef3",
	noteBkgColor: "#fefef3",
	labelBoxBkgColor: "#fefef3",
	altBackground: "#fefef3",
	compositeBackground: "#fefef3",
	compositeTitleBackground: "#fefef3",
	edgeLabelBackground: "#fefef4",
	labelBackgroundColor: "#fefef4",
	activationBkgColor: "#fefef5",
	primaryTextColor: "#010102",
	secondaryTextColor: "#010102",
	tertiaryTextColor: "#010102",
	textColor: "#010102",
	titleColor: "#010102",
	actorTextColor: "#010102",
	signalTextColor: "#010102",
	labelTextColor: "#010102",
	loopTextColor: "#010102",
	noteTextColor: "#010102",
	stateLabelColor: "#010102",
	transitionLabelColor: "#010102",
	sequenceNumberColor: "#fefef1",
	specialStateColor: "#010102",
	innerEndBackground: "#010102",
	primaryBorderColor: "#010103",
	nodeBorder: "#010103",
	actorBorder: "#010103",
	clusterBorder: "#010103",
	noteBorderColor: "#010103",
	labelBoxBorderColor: "#010103",
	stateBorder: "#010103",
	lineColor: "#010104",
	signalColor: "#010104",
	actorLineColor: "#010104",
	transitionColor: "#010104",
	activationBorderColor: "#010105",
};

function key(source: string): string {
	return createHash("sha256").update(`${SETTINGS}\n${source}`).digest("hex").slice(0, 12);
}

const file = (source: string) => join(CACHE, `${key(source)}.svg`);

/** Lightness of a colour mermaid wrote, for the ones it derived from a sentinel. */
function lightness(colour: string): number | null {
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour)?.[1];
	let rgb: number[] | null = null;
	if (hex) {
		const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
		rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
	} else {
		const m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(colour);
		if (m) rgb = [Number(m[1]), Number(m[2]), Number(m[3])];
		const h = /^hsla?\(\s*[\d.]+[ ,]+[\d.]+%[ ,]+([\d.]+)%/i.exec(colour);
		if (h) return Number(h[1]) / 100;
	}
	if (!rgb) return null;
	return (Math.max(...rgb) + Math.min(...rgb)) / 510;
}

function themeable(svg: string): string {
	return svg.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g, (colour) => {
		const exact = SENTINELS[colour.toLowerCase()];
		if (exact) return exact;
		// Fully transparent stays transparent; anything else derived goes to the nearest of three roles.
		if (/rgba?\([^)]*,\s*0(?:\.0+)?\s*\)/.test(colour)) return "transparent";
		const l = lightness(colour);
		if (l === null) return colour;
		return l > 0.7 ? "var(--d-surface)" : l > 0.35 ? "var(--d-muted)" : "var(--d-ink)";
	});
}

/**
 * Prefix every id inside a drawing with the drawing's own key. Mermaid numbers its elements per diagram
 * (`actor4`, `root-4`), so two diagrams on one page repeated each other's ids, and a reference such as
 * `url(#arrowhead)` could resolve into the wrong drawing.
 */
function unique(svg: string, prefix: string): string {
	const local = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1] ?? "").filter((id) => !id.startsWith(prefix));
	if (local.length === 0) return svg;
	const set = new Set(local);
	const fix = (id: string) => (set.has(id) ? `${prefix}-${id}` : id);
	return svg
		.replace(/(\sid=")([^"]+)"/g, (_, a: string, id: string) => `${a}${fix(id)}"`)
		.replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(#${fix(id)})`)
		.replace(/((?:xlink:)?href=")#([^"]+)"/g, (_, a: string, id: string) => `${a}#${fix(id)}"`)
		.replace(/(aria-(?:labelledby|describedby)=")([^"]+)"/g, (_, a: string, ids: string) => `${a}${ids.split(/\s+/).map(fix).join(" ")}"`);
}

/** Draw every diagram not already in the cache. Needs Chrome only when something is missing. */
export async function prepareDiagrams(sources: string[]): Promise<void> {
	// Drawings no block uses any more are removed, so the committed cache holds exactly the docs' diagrams.
	const wanted = new Set(sources.map((s) => `${key(s)}.svg`));
	if (existsSync(CACHE)) for (const f of readdirSync(CACHE)) if (f.endsWith(".svg") && !wanted.has(f)) rmSync(join(CACHE, f));
	const missing = [...new Set(sources)].filter((s) => !existsSync(file(s)));
	if (missing.length === 0) return;
	mkdirSync(CACHE, { recursive: true });
	const require = createRequire(import.meta.url);
	const { chromium } = (await import("playwright")) as typeof import("playwright");
	const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? "chrome" }).catch((error: unknown) => {
		throw new Error(
			`${missing.length} diagram(s) changed and need drawing, which needs Chrome through Playwright. Run \`pnpm site:build\` where Chrome is installed and commit site/build/diagrams/. (${String(error)})`,
		);
	});
	try {
		const page = await browser.newPage();
		await page.setContent("<!doctype html><html><body></body></html>");
		await page.addScriptTag({ path: require.resolve("mermaid/dist/mermaid.min.js") });
		for (const source of missing) {
			const svg = await page.evaluate(
				async ([id, code, theme]) => {
					const m = (window as unknown as { mermaid: { initialize(o: object): void; render(id: string, c: string): Promise<{ svg: string }> } }).mermaid;
					m.initialize({
						startOnLoad: false,
						theme: "base",
						securityLevel: "strict",
						htmlLabels: false,
						flowchart: { htmlLabels: false, padding: 14 },
						sequence: { useMaxWidth: true },
						themeVariables: theme,
					});
					return (await m.render(id, code)).svg;
				},
				[`d-${key(source)}`, source, THEME] as const,
			);
			writeFileSync(file(source), `${unique(themeable(svg), `d-${key(source)}`)}\n`);
		}
	} finally {
		await browser.close();
	}
}

/** The drawing for one block, from the cache. `prepareDiagrams` must have run for it. */
export function diagram(source: string): string {
	const path = file(source);
	if (!existsSync(path)) throw new Error(`No drawing for a mermaid block (${key(source)}); prepareDiagrams did not run for it.`);
	return `<figure class="diagram">${readFileSync(path, "utf8").trim()}</figure>`;
}

/** Every ```mermaid block in a markdown text. */
export function mermaidBlocks(markdown: string): string[] {
	return [...markdown.matchAll(/^```mermaid\n([\s\S]*?)^```/gm)].map((m) => (m[1] ?? "").replace(/\n$/, ""));
}
