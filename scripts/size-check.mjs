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
	 * Raised from 19_500 to 20_000 in the commit that spent it: the element honouring `status` costs 649
	 * gzipped bytes, measured, which is 137 over the ceiling the chart split had just set. Worth recording
	 * that the two changes together leave the figure LOWER than before either: 20,360 before the split,
	 * 19,637 after both, while gaining the feature. The two bench fixtures this added cost nothing here,
	 * because fixture manifests live in their own chunk since the fixture split.
	 *
	 * ⚠️ Lowered from 20_500 to 19_500 by splitting the chart renderer out, measured at 1,372 bytes.
	 * A ceiling that only ever rises stops being a constraint, so when a change genuinely removes weight
	 * the number should follow it down. 18,988 measured, leaving 512.
	 *
	 * Raised from 19_500 to 20_500 in the commit that spent it. What it bought: a second live region so a
	 * result summary is announced without rendering as a line of metadata above the result; a query
	 * container and three rules so a card's chart keeps legible labels when the card is narrower than the
	 * chart's own viewBox; and the `parts` attribute plumbing. 19_500 left 46 bytes of headroom, which is
	 * not headroom.
	 *
	 * Raised from 20_000 to 21_250 in the commit that spent it, and this one is worth reading twice
	 * because almost none of it is runtime code.
	 *
	 * 19,782 measured on the commit before, 20,832 after: 1,050 bytes for two `tool.json` files. The
	 * tools' *code* is not here, it is in tool-regex-explainer and tool-histogram. What lands here is
	 * manifest data, because `bench/src/registry.ts` imports every `tool.json` eagerly, which is the
	 * third time that mechanism has moved this number (percentiles' samples, then the bench fixtures,
	 * which is why those now live in their own chunk).
	 *
	 * ⚠️ 0.2 KB of the gap between this figure and the published one predates this change. The tables
	 * said 19.6 KB while the commit before measured 19.8: the Pages demo added host wiring and the
	 * published figures were not re-run. `--update` in this commit corrects both, so do not read the
	 * 19.6 to 20.9 move as all belonging here.
	 *
	 * ⚠️ And a stale paragraph removed from this block: it recorded a raise to 21_500 for the `status`
	 * work that was never taken, because that change landed at 20_000 instead. A budget history that
	 * describes a ceiling the file does not have is worse than no history.
	 */
	{ label: "runtime + host wiring", pattern: /^boot-[^/]+\.js$/, budget: 21_250 },
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
	/*
	 * The demo highlighter passed to `defineToolHost({ highlight })`. Host-only, split out of `boot` for
	 * the same reason as the theme switch: a consumer does not download it.
	 */
	{ label: "bench highlighter", pattern: /^bench-highlight-[^/]+\.js$/, budget: 1_500, deployOnly: true },
	/*
	 * The chart renderer, fetched only by a page whose tool declares `series`. Counted as reader cost
	 * rather than deployOnly, because a reader of a chart tool genuinely downloads it: the saving is that
	 * everybody else does not.
	 */
	{ label: "chart renderer", pattern: /^chart-[^/]+\.js$/, budget: 2_500 },
	{ label: "stylesheet", pattern: /^boot-[^/]+\.css$/, budget: 1_200 },
	/*
	 * Raised from 4_000 to 4_500 in the commit that spent it. The worker imports the same eager
	 * `tool.json` glob as the page, so two new manifests (regex-explainer, histogram) land in this
	 * chunk. Tool *code* stays in worker-tool-* copies; this is the registry plus the protocol.
	 * 4_000 left the chunk 237 bytes over after those manifests, which is not a ceiling.
	 */
	{ label: "worker entry", pattern: /^tool\.worker-[^/]+\.js$/, budget: 4_500 },
	{ label: "tool: percentiles", pattern: /^tool-percentiles-[^/]+\.js$/, budget: 2_000 },
	{ label: "tool: queue-explorer", pattern: /^tool-queue-explorer-[^/]+\.js$/, budget: 2_000 },
	/*
	 * ⚠️ These four lines arrived after the tools did, and that is the finding rather than the sizes.
	 *
	 * Nothing in this file fails on a chunk no entry matches, so regex-explainer shipped 2,791 gzipped
	 * bytes, plus its worker copy, entirely unmeasured: the run was green and the largest tool in the
	 * repository was invisible to it. Same denylist-shaped mistake this project has now made three
	 * times. Tracked in the backlog as a guard, because remembering to add a line is not a mechanism.
	 *
	 * regex-explainer gets 3_000 where every other tool gets 2_000, and the extra is not slack: a regex
	 * walker is a parser, and 2,791 of parser does not fit in a budget set for tools that compute. A
	 * uniform number here would be a number chosen for tidiness over truth.
	 */
	{ label: "tool: regex-explainer", pattern: /^tool-regex-explainer-[^/]+\.js$/, budget: 3_000 },
	{ label: "tool: histogram", pattern: /^tool-histogram-[^/]+\.js$/, budget: 1_500 },
	/*
	 * ⚠️ The two bench FIXTURES, measured but deployOnly, and labelled so nobody mistakes them for shipped
	 * tools. `json-code` arrived counted as reader cost, which would have put a chunk only the bench
	 * downloads into the "worst case for one reader" total, and `stress` had no line at all so it could grow
	 * unwatched. A fixture is an instrument: track it, never charge a consumer for it.
	 */
	{ label: "bench fixture: json-code", pattern: /^tool-json-code-[^/]+\.js$/, budget: 2_000, deployOnly: true },
	{ label: "bench fixture: stress", pattern: /^tool-stress-[^/]+\.js$/, budget: 2_000, deployOnly: true },
	/*
	 * The worker's own copies. Vite builds the worker in a separate Rollup pass, so every tool
	 * reachable from it is emitted twice. A reader downloads one copy (a tool declares one thread);
	 * the second copy costs deploy bytes only. Tracked so it stays a known cost rather than a
	 * surprise, and named so the network panel says which thread ran.
	 */
	{ label: "worker copy: percentiles", pattern: /^worker-tool-percentiles-[^/]+\.js$/, budget: 2_000, deployOnly: true },
	{ label: "worker copy: queue-explorer", pattern: /^worker-tool-queue-explorer-[^/]+\.js$/, budget: 2_000, deployOnly: true },
	{ label: "worker copy: regex-explainer", pattern: /^worker-tool-regex-explainer-[^/]+\.js$/, budget: 3_000, deployOnly: true },
	{ label: "worker copy: histogram", pattern: /^worker-tool-histogram-[^/]+\.js$/, budget: 1_500, deployOnly: true },
	{ label: "worker copy: json-code", pattern: /^worker-tool-json-code-[^/]+\.js$/, budget: 2_000, deployOnly: true },
	{ label: "worker copy: bench fixture stress", pattern: /^worker-tool-stress-[^/]+\.js$/, budget: 2_000, deployOnly: true },
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
		/*
		 * ⚠️ The badge as well as the table. It is the most-read number in the repository and the only one
		 * that was not covered here, so it sat at 19.6 KB while the table beside it moved twice. A published
		 * figure the refresh tool cannot reach is a figure that rots, which is the whole argument for this
		 * block existing.
		 */
		["README.md", /(runtime-)[\d.]+(%20KB%20gzip)/, kb(find("runtime + host wiring")).replace(" KB", "")],
		["README.md", /(\| Runtime[^|]*\| )[\d.]+ KB/, kb(find("runtime + host wiring"))],
		["docs/architecture.md", /(\| Runtime[^|]*\| )[\d.]+ KB/, kb(find("runtime + host wiring"))],
		["README.md", /(\| Worker entry[^|]*\| )[\d.]+ KB/, kb(find("worker entry"))],
		["docs/architecture.md", /(\| Worker entry[^|]*\| )[\d.]+ KB/, kb(find("worker entry"))],
		/*
		 * ⚠️ The per-tool rows, which this block did not own until a tool was added and somebody checked.
		 *
		 * They were typed by hand, so they drifted exactly as you would expect: both tables published
		 * `percentiles` at 1.2 KB while the chunk measured 1.3. Nobody noticed, because nothing fails on a
		 * stale figure. Generated from the same rows as everything else here, so adding a tool means adding
		 * one line below and one row to each table, and never a number.
		 */
		...["percentiles", "queue-explorer", "regex-explainer", "histogram"].flatMap((id) => [
			["README.md", new RegExp(`(\\| \`${id}\` tool chunk[^|]*\\| )[\\d.]+ KB`), kb(find(`tool: ${id}`))],
			["docs/architecture.md", new RegExp(`(\\| \`${id}\` chunk[^|]*\\| )[\\d.]+ KB`), kb(find(`tool: ${id}`))],
		]),
	];
	for (const [file, pattern, value] of edits) {
		const path = join(import.meta.dirname, "..", file);
		const before = readFileSync(path, "utf8");
		/*
		 * ⚠️ A function, not a `$1${value}$2` string.
		 *
		 * The badge pattern has a trailing group and the table patterns do not, and `$2` in a replacement
		 * string is left LITERALLY when the pattern has no second group. That shipped: four published
		 * figures read "20.2 KB$2" until somebody looked. A function receives the groups as arguments, so a
		 * missing one is `undefined` and defaults away instead of printing itself.
		 */
		const after = before.replace(pattern, (...args) => {
			/*
			 * `replace` calls this with (match, ...groups, offset, string), so the groups are everything
			 * between the first argument and the last two. Naming them positionally is how the first
			 * attempt at this went wrong twice: `$2` in a replacement STRING printed itself literally when
			 * the pattern had one group, and a named second parameter then picked up the offset and
			 * published "20.2 KB18571". Slicing is the only form that does not depend on how many groups a
			 * particular pattern happens to have.
			 */
			const groups = args.slice(1, -2);
			return `${groups[0] ?? ""}${value}${groups[1] ?? ""}`;
		});
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
