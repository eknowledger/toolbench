/**
 * Measure each test layer and rewrite the Count column in docs/architecture.md §12.
 *
 * The numbers in that table changed on almost every pull request and were typed by hand, so they rotted
 * between changes and collided during rebases: five pull requests in one batch each corrected the browser
 * count to a different value, each correct against the `main` it was written on. The size figures in the same
 * document do not have that problem because `size-check.mjs --update` owns them. This is the same shape.
 *
 * Usage: node scripts/test-counts.mjs [--update]
 *   (no flag)  print the measured counts and what the document says, exit non-zero if they disagree
 *   --update   rewrite the Count cells
 *
 * ⚠️ Counts come from each runner's own summary, not from counting `it(` in the source. A static count is
 * wrong for exactly the cases worth counting: `checkToolDirectory` registers its checks per tool at runtime,
 * and some suites generate tests from a loop.
 *
 * ⚠️ The browser layer needs a built bench, because it drives `vite preview`. Run `pnpm bench:build` first.
 * Measuring nothing and reporting success is the failure mode this file exists to prevent.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DOC = join(ROOT, "docs", "architecture.md");

/**
 * One entry per row of the table, keyed on the row's first cell exactly as written there. `glob` is what the
 * Node runner is given; `browser` marks the row that needs the built bench instead.
 */
const LAYERS = [
	{ label: "`packages/sdk/src/*.test.ts`", glob: "packages/sdk/src/*.test.ts" },
	{ label: "`packages/runtime/src/*.test.ts`", glob: "packages/runtime/src/*.test.ts" },
	{ label: "`tools/cases.test.ts`", glob: "tools/cases.test.ts" },
	{ label: "`tools/*/‌*.test.ts`", glob: "tools/*/*.test.ts" },
	{ label: "`scripts/*.test.ts`", glob: "scripts/*.test.ts" },
	{ label: "`bench/bench.test.ts`", browser: true },
];

/**
 * Escape a row label for use inside a pattern.
 *
 * ⚠️ Its own function because every label here contains `*`, and getting this wrong is silent: an unescaped
 * `*` makes the pattern fail to match, the row then reports as missing from the table, and the first version
 * of this file reported four rows absent that were plainly there.
 */
function escapeForRegex(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The `ℹ tests N` line every node:test run prints, whatever the reporter did before it. */
function countFrom(output) {
	const match = /^.\s*tests (\d+)$/m.exec(output);
	if (match === null) throw new Error(`no test summary in:\n${output.slice(-600)}`);
	return Number(match[1]);
}

function runNode(glob) {
	const out = execFileSync(process.execPath, ["--test", glob], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	return countFrom(out);
}

function runBrowser() {
	try {
		const out = execFileSync("pnpm", ["test:bench"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
		return countFrom(out);
	} catch (error) {
		const text = `${error.stdout ?? ""}${error.stderr ?? ""}`;
		if (/vite preview did not start|ENOENT|Cannot find module/.test(text)) {
			throw new Error("the browser layer needs a built bench: run `pnpm bench:build` first");
		}
		throw new Error(`the browser suite failed, so its count is unknown:\n${text.slice(-600)}`);
	}
}

const update = process.argv.includes("--update");
const measured = new Map();
for (const layer of LAYERS) {
	measured.set(layer.label, layer.browser ? runBrowser() : runNode(layer.glob));
}

/*
 * The completeness check, and the reason this is not just five greps. If somebody adds a test directory no row
 * covers, the rows still each measure something and the table quietly describes a subset. Summing the Node
 * layers and comparing against the whole suite is what makes the table an allowlist rather than a sample.
 */
const nodeTotal = [...LAYERS].filter((l) => !l.browser).reduce((sum, l) => sum + measured.get(l.label), 0);
const wholeSuite = countFrom(execFileSync("pnpm", ["test"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (nodeTotal !== wholeSuite) {
	console.error(
		`\nThe Node rows sum to ${nodeTotal} but \`pnpm test\` runs ${wholeSuite}.\n` +
			"Some tests are in a location no row of the table covers, so the table describes a subset.\n" +
			"Add a row to LAYERS in this file and to the table, rather than editing a number.\n",
	);
	process.exitCode = 1;
}

let doc = readFileSync(DOC, "utf8");
let changed = 0;
const rows = [];
for (const { label } of LAYERS) {
	const count = measured.get(label);
	// The row, up to its final cell: `| label | where | what | N |`
	const pattern = new RegExp(`(^\\| ${escapeForRegex(label)} \\|(?:[^|\\n]*\\|){2} )(\\d+)( \\|)$`, "m");
	const found = pattern.exec(doc);
	rows.push({ label, count, says: found === null ? null : Number(found[2]) });
	if (found === null) continue;
	if (Number(found[2]) === count) continue;
	if (update) doc = doc.replace(pattern, `$1${count}$3`);
	changed += 1;
}

const width = Math.max(...rows.map((r) => r.label.length));
console.log("\nTest counts, measured:\n");
for (const { label, count, says } of rows) {
	const state = says === null ? "NO ROW IN THE TABLE" : says === count ? "ok" : `document says ${says}`;
	console.log(`  ${label.padEnd(width)}  ${String(count).padStart(4)}  ${state}`);
}
console.log(`\n  ${"total, Node layers".padEnd(width)}  ${String(nodeTotal).padStart(4)}  against ${wholeSuite} from pnpm test\n`);

if (rows.some((r) => r.says === null)) {
	console.error("A layer has no row in the table. Add one; a missing row cannot be corrected by a number.\n");
	process.exitCode = 1;
} else if (update && changed > 0) {
	writeFileSync(DOC, doc);
	console.log(`updated docs/architecture.md: ${changed} count${changed === 1 ? "" : "s"}\n`);
} else if (changed > 0) {
	console.error(`${changed} count${changed === 1 ? " is" : "s are"} wrong. Run \`pnpm test:counts --update\`.\n`);
	process.exitCode = 1;
}
