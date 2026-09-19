/**
 * Transfer-size budget for the built bench.
 *
 * The README and docs/architecture.md quote gzip sizes. A number in a document rots the moment nobody
 * checks it, and the whole lazy-loading argument rests on these staying small, so CI checks them.
 *
 * Budgets are ceilings with deliberate headroom, not targets. A failure here is not automatically a
 * bug: it is a prompt to look at what grew, decide whether it was worth it, and either fix it or raise
 * the ceiling in the same commit that spent it. Raising a budget silently is the one thing to avoid.
 *
 * Usage: node scripts/size-check.mjs [--update]
 *   --update  rewrite the sizes quoted in README.md and docs/architecture.md
 */
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ASSETS = join(import.meta.dirname, "..", "bench", "dist", "assets");

/**
 * Each entry matches one built chunk. `budget` is bytes, gzipped.
 *
 * `boot` is the runtime plus the bench's own wiring, which is the closest honest proxy for "what a
 * page pays to use any tool at all". It is not the runtime alone, and the docs say so.
 */
const BUDGETS = [
	/*
	 * Raised from 18,000 by contract v2: the bytes renderer is about 1.5 KB gzipped, which is real
	 * runtime code every consumer pays for. Recorded here rather than raised quietly, and the README's
	 * size table moved with it.
	 *
	 * Raised again from 19,000 by contract v3, in the commit that spent it. The sample row is 907 bytes
	 * of runtime code, and percentiles declaring its own samples added another 164, because
	 * `bench/src/registry.ts` imports every `tool.json` and so manifest data lands in this chunk too.
	 * That left 75 bytes under the old ceiling, which is not a ceiling with headroom: the next
	 * unrelated change would have failed here for reasons that had nothing to do with it.
	 */
	/*
	 * Raised from 19_500 to 20_500 in the commit that spent it. What it bought: a second live region so a
	 * result summary is announced without rendering as a line of metadata above the result; a query
	 * container and three rules so a card's chart keeps legible labels when the card is narrower than the
	 * chart's own viewBox; and the `parts` attribute plumbing. 19_500 left 46 bytes of headroom, which is
	 * not headroom.
	 */
	{ label: "runtime + host wiring", pattern: /^boot-[^/]+\.js$/, budget: 20_500 },
	/*
	 * The bench's theme switch, split out of `boot` on purpose. It is a test instrument, so it must not
	 * be counted in the figure the README quotes for what a consumer pays. Tracked so it cannot grow
	 * unnoticed either.
	 */
	{ label: "bench theme switch", pattern: /^bench-theme-[^/]+\.js$/, budget: 1_500, deployOnly: true },
	/*
	 * The fixture manifests, split out of `boot` for the same reason as the theme switch and measured for the
	 * same one: a chunk nobody watches is a chunk that grows. 571 bytes for one fixture, and open pull
	 * requests add three more, so the ceiling is set to leave room for those without leaving room for
	 * everything.
	 */
	{ label: "bench fixtures", pattern: /^bench-fixtures-[^/]+\.js$/, budget: 2_000, deployOnly: true },
	{ label: "bench fixtures, worker copy", pattern: /^worker-bench-fixtures-[^/]+\.js$/, budget: 2_000, deployOnly: true },
	{ label: "stylesheet", pattern: /^boot-[^/]+\.css$/, budget: 1_200 },
	{ label: "worker entry", pattern: /^tool\.worker-[^/]+\.js$/, budget: 4_000 },
	{ label: "tool: percentiles", pattern: /^tool-percentiles-[^/]+\.js$/, budget: 2_000 },
	{ label: "tool: queue-explorer", pattern: /^tool-queue-explorer-[^/]+\.js$/, budget: 2_000 },
	/*
	 * The worker's own copies. Vite builds the worker in a separate Rollup pass, so every tool
	 * reachable from it is emitted twice. A reader downloads one copy (a tool declares one thread);
	 * the second copy costs deploy bytes only. Tracked so it stays a known cost rather than a
	 * surprise, and named so the network panel says which thread ran.
	 */
	{ label: "worker copy: percentiles", pattern: /^worker-tool-percentiles-[^/]+\.js$/, budget: 2_000, deployOnly: true },
	{ label: "worker copy: queue-explorer", pattern: /^worker-tool-queue-explorer-[^/]+\.js$/, budget: 2_000, deployOnly: true },
];

let files;
try {
	files = readdirSync(ASSETS);
} catch {
	console.error(`No build found at ${ASSETS}. Run \`pnpm bench:build\` first.`);
	process.exit(1);
}

const kb = (n) => `${(n / 1000).toFixed(1)} KB`;
const rows = [];
let failed = 0;

for (const { label, pattern, budget, deployOnly } of BUDGETS) {
	const matches = files.filter((f) => pattern.test(f));
	if (matches.length !== 1) {
		// Zero means the chunk vanished or was renamed; more than one means manualChunks stopped
		// splitting the way the docs describe. Both are real problems, not test noise.
		console.error(`✗ ${label}: expected exactly one file matching ${pattern}, found ${matches.length}`);
		failed++;
		continue;
	}
	const size = gzipSync(readFileSync(join(ASSETS, matches[0]))).length;
	const over = size > budget;
	if (over) failed++;
	rows.push({ label, size, budget, over, deployOnly });
}

const width = Math.max(...rows.map((r) => r.label.length));
console.log("\nTransfer size, gzipped:\n");
for (const { label, size, budget, over } of rows) {
	const pct = Math.round((size / budget) * 100);
	console.log(
		`  ${over ? "✗" : "✓"} ${label.padEnd(width)}  ${kb(size).padStart(8)}  of ${kb(budget).padStart(8)} budget  (${pct}%)`,
	);
}
// Only what a single reader can actually download: the worker copies are alternatives to the
// main-thread ones, never both on one page.
const total = rows.filter((r) => !r.deployOnly).reduce((sum, r) => sum + r.size, 0);
console.log(`\n  ${"worst case for one reader".padEnd(width)}  ${kb(total).padStart(8)}\n`);

if (process.argv.includes("--update")) {
	const find = (label) => rows.find((r) => r.label === label)?.size ?? 0;
	const edits = [
		/*
		 * ⚠️ Anchored on the leading "| Runtime" and the trailing "| " only.
		 *
		 * These patterns quoted each table's whole row label, so editing the prose in a row silently
		 * stopped it matching, and the README then published 17.8 KB while the chunk was really 18.9 KB.
		 * Nothing failed: this script only exits non-zero on a budget overrun, so a figure it can no
		 * longer find is a figure nobody checks. Matching the least text that still identifies the row is
		 * what keeps it working when somebody rewords the label.
		 */
		["README.md", /(\| Runtime[^|]*\| )[\d.]+ KB/, kb(find("runtime + host wiring"))],
		["docs/architecture.md", /(\| Runtime[^|]*\| )[\d.]+ KB/, kb(find("runtime + host wiring"))],
		["README.md", /(\| Worker entry[^|]*\| )[\d.]+ KB/, kb(find("worker entry"))],
		["docs/architecture.md", /(\| Worker entry[^|]*\| )[\d.]+ KB/, kb(find("worker entry"))],
	];
	for (const [file, pattern, value] of edits) {
		const path = join(import.meta.dirname, "..", file);
		const before = readFileSync(path, "utf8");
		const after = before.replace(pattern, `$1${value}`);
		if (after !== before) {
			const { writeFileSync } = await import("node:fs");
			writeFileSync(path, after);
			console.log(`updated ${file} -> ${value}`);
		}
	}
}

if (failed > 0) {
	console.error(
		`${failed} budget${failed === 1 ? "" : "s"} exceeded. Look at what grew, then either fix it or\n` +
			"raise the budget in scripts/size-check.mjs in the same commit, saying what bought the bytes.\n",
	);
	process.exit(1);
}
