/**
 * `pnpm site:diagrams`: draw the docs' mermaid diagrams to SVG, into the committed cache the build reads.
 *
 * Run it after editing a ```mermaid block. It is not part of the build, on purpose: the site's build
 * needs no browser and the workspace has no diagram dependency. Instead this fetches ONE pinned mermaid
 * build, checks it against the integrity hash below before using it, keeps it in a gitignored cache
 * (site/.diagram-tools/), and draws in the Chrome that Playwright already provides.
 *
 * One drawing serves both themes. Mermaid is given sentinel colours, and every colour in its output is
 * then rewritten to a site custom property: the sentinels by name, and anything mermaid derived from them
 * by lightness, into surface, muted or ink. The light and dark values are the site's own.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { CACHE, file, key } from "./diagrams.ts";
import { diagramSources } from "./plugin.ts";

/*
 * ⚠️ The version, the URL and the hash move together. The hash is the file's SHA-384, the same value a
 * Subresource Integrity attribute would carry; npm's tarball, jsDelivr and unpkg all serve this exact file.
 * The version is also in SETTINGS in diagrams.ts, so a new mermaid redraws everything.
 */
const MERMAID = {
	version: "12.2.0",
	url: "https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.min.js",
	sha384: "8xUhuLNMjW/cI2Dacg3DR4WliYznvIg0LVG1stctThKD/YVrJFI9TNCFxft5NYgp",
};
const TOOLS = join(import.meta.dirname, "..", ".diagram-tools");

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

/** The pinned mermaid, from the local cache or the network, and refused unless its hash matches. */
async function mermaid(): Promise<string> {
	const path = join(TOOLS, `mermaid-${MERMAID.version}.min.js`);
	let bytes = existsSync(path) ? readFileSync(path) : null;
	if (!bytes) {
		const response = await fetch(MERMAID.url);
		if (!response.ok) throw new Error(`Fetching ${MERMAID.url} failed: ${response.status}`);
		bytes = Buffer.from(await response.arrayBuffer());
	}
	const actual = createHash("sha384").update(bytes).digest("base64");
	if (actual !== MERMAID.sha384) {
		rmSync(path, { force: true });
		throw new Error(`mermaid ${MERMAID.version} does not match its pinned hash: expected sha384-${MERMAID.sha384}, got sha384-${actual}. Nothing was drawn.`);
	}
	mkdirSync(TOOLS, { recursive: true });
	writeFileSync(path, bytes);
	return path;
}

const sources = diagramSources();
// Drawings no block uses any more are removed, so the committed cache holds exactly the docs' diagrams.
const wanted = new Set(sources.map((s) => `${key(s)}.svg`));
mkdirSync(CACHE, { recursive: true });
for (const f of readdirSync(CACHE)) if (f.endsWith(".svg") && !wanted.has(f)) rmSync(join(CACHE, f));
const missing = [...new Set(sources)].filter((s) => !existsSync(file(s)) || process.argv.includes("--all"));
if (missing.length === 0) {
	console.log(`All ${wanted.size} diagrams already drawn.`);
} else {
	const script = await mermaid();
	const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? "chrome" });
	try {
		const page = await browser.newPage();
		await page.setContent("<!doctype html><html><body></body></html>");
		await page.addScriptTag({ path: script });
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
	console.log(`Drew ${missing.length} of ${wanted.size} diagrams into site/build/diagrams/.`);
}
