/**
 * Which contract version introduced each manifest key and each output field (#170), and the checks that
 * refuse a feature newer than the `sdk` a tool declares.
 *
 * `sdk` is meant to say what a tool needs. It stopped meaning that: `upgradeManifest` stamps the current
 * version before `validateManifest` sees it, so a manifest declaring `"sdk": 4` that used v6's `lang`
 * validated, and on a v4 or v5 runtime the same tool loaded and silently lost its highlighting, because a
 * runtime ignores a key it does not know. Two bench fixtures did exactly that and nothing said so. A host
 * cannot refuse a tool it cannot fully run if the tool's own declaration is wrong.
 *
 * So the declared `sdk` is read before anything upgrades it, and a feature from a later version is refused
 * with where it is, the version that added it, and the `sdk` to declare instead.
 *
 * ⚠️ Raising the contract version means a row for everything it adds, in features.test.ts's full table
 * and, at the new number, in `LATER` here. The test checks that every key the validator knows, every input
 * type, capability and output kind has a row there, and that `LATER` matches it, so a bump cannot forget
 * those. A new optional field INSIDE a result has no list to check against, so `OUTPUT_SINCE` is on the
 * checklist in docs/versioning.md §5 instead. Beside version.ts rather than in it, and data in the same
 * spirit as `SDK_CHANGELOG`: it is what lets a refusal explain itself.
 */
import type { Output } from "./types.ts";
import { ManifestError } from "./validate.ts";

type Since = Readonly<Record<string, number>>;

/**
 * Everything a manifest can use that arrived after version 1, keyed by where it sits: a top-level key as
 * itself, then `runtime.`, `inputs.`, `options.` for a select's option, `type.` for an input type,
 * `control.` for a value of an input's `control`, `capabilities.` and `kinds.`. Anything the validator knows that is not here is version 1.
 *
 * ⚠️ Only the later rows ship, because this is in the chunk every page loads: the full table, every key at
 * every version, lives in features.test.ts, which fails when the validator learns a key it has no row for,
 * and when this table disagrees with it. That is what stops a contract bump forgetting a row. With every
 * key listed here and a general walker, the check cost boot 654 gzipped bytes; in this form it is 361.
 */
export const LATER = {
	// No prototype, so a manifest key named `constructor` finds nothing here rather than Object's.
	__proto__: null,
	samples: 3,
	reset: 8,
	"inputs.control": 4,
	"inputs.lang": 6,
	"inputs.grammar": 7,
	"inputs.share": 8,
	"inputs.role": 8,
	"inputs.details": 8,
	"inputs.mode": 9,
	"inputs.minLength": 9,
	"type.secret": 9,
	"type.date": 9,
	"type.color": 9,
	"options.sets": 6,
	// A value of `control`, because the key is older than most of its values.
	"control.slider": 4,
	"control.segmented": 9,
	"control.checkboxes": 9,
	"control.chips": 9,
	"type.multiselect": 9,
	"kinds.bytes": 2,
	"kinds.heatmap": 4,
	"kinds.pie": 4,
	"kinds.radar": 4,
	"kinds.treemap": 4,
	"kinds.venn": 4,
	"kinds.graph": 7,
} as unknown as Since;

/**
 * Optional fields inside a result that arrived after their kind. A value is listed where the value is the
 * feature: the `points`, `step`, `band` and `box` shapes, a text x, the `muted` tone. A kind's own fields
 * arrived with the kind, so `bytes`, `heatmap` and the other later kinds need no rows.
 */
export const OUTPUT_SINCE: Since = {
	"part role": 5,
	"part id": 5,
	"field role": 5,
	"field mono": 8,
	"field tone muted": 5,
	"cell tone muted": 5,
	"table link": 4,
	"column wrap": 8,
	"column rowHeader": 8,
	"cell wrap": 8,
	"chart thresholds": 4,
	"chart readout": 4,
	"chart id": 4,
	"chart orientation": 4,
	"chart mirror": 4,
	"chart yScale": 4,
	"chart xScale": 4,
	"chart x text": 4,
	"series shape points": 4,
	"series shape step": 4,
	"series shape band": 4,
	"series shape box": 4,
	"series boxes": 4,
	"series lower": 4,
	"series markers": 4,
	"series stack": 4,
	"series x": 4,
	"series sizes": 4,
	"series sizeLabel": 4,
	"series notes": 4,
};

/** One feature in a result: where, what to call it, and the version it needs. */
interface Use {
	at: string;
	what: string;
	since: number;
}

/**
 * Refuse a manifest using a key, type, capability or kind newer than its declared `sdk`, naming the first
 * one, the version that added it, and the `sdk` that covers every newer thing it uses, so one edit fixes all.
 *
 * `upgradeManifest` calls it first, before it overwrites `sdk` with the current version and so hides exactly
 * what this looks for. `validateManifest` calls it too, which covers a manifest validated without upgrading;
 * on an upgraded one it finds nothing. A malformed manifest is passed over: explaining that is
 * `validateManifest`'s job. Unknown keys are not this check's business either.
 *
 * Written small on purpose, because it is in the chunk every page loads: `Object(v)` stands in for an
 * object check, since the keys of anything that is not one are none that `LATER` names.
 */
export function checkManifestFeatures(raw: unknown): void {
	const m = Object(raw) as Record<string, unknown>;
	const declared = m.sdk;
	if (typeof declared !== "number") return;
	let first: [at: string, since: number, what: string] | undefined;
	let needs = 0;
	const see = (at: string, key: string, what = "") => {
		const since = LATER[key] ?? 1;
		if (since <= declared) return;
		first ??= [at, since, what];
		needs = Math.max(needs, since);
	};
	const keysOf = (o: unknown, scope: string, at: string) => {
		for (const key of Object.keys(Object(o))) see(at + key, scope + key);
	};
	const each = (v: unknown, fn: (item: unknown, i: number) => void) => Array.isArray(v) && v.forEach(fn);
	keysOf(m, "", "");
	keysOf(m.runtime, "runtime.", "runtime.");
	for (const key of ["capabilities", "kinds"]) each(m[key], (v, i) => see(`${key}[${i}]`, `${key}.${v}`, `"${v}" `));
	each(m.inputs, (input, i) => {
		const o = Object(input) as Record<string, unknown>;
		keysOf(o, "inputs.", `inputs[${i}].`);
		see(`inputs[${i}].type`, `type.${o.type}`, `"${o.type}" `);
		see(`inputs[${i}].control`, `control.${o.control}`, `"${o.control}" `);
		each(o.options, (option, k) => keysOf(option, "options.", `inputs[${i}].options[${k}].`));
	});
	if (first) throw new ManifestError(first[0], `${first[2]}is from contract version ${first[1]}, but the tool declares "sdk": ${declared}. Declare "sdk": ${needs}.`);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * The first thing in a result newer than the tool's declared `sdk`, as a message, or `undefined`.
 *
 * For the fixture harness: a tool can declare `"sdk": 3` and return a v5 `role`, which an older runtime
 * draws without the name a host stylesheet was looking for, and nothing in the manifest gives it away.
 */
export function outputFeatureProblem(output: Output, declared: number): string | undefined {
	const uses: Use[] = [];
	const use = (feature: string, at: string) => uses.push({ at, what: feature, since: OUTPUT_SINCE[feature] as number });
	const walk = (part: unknown, at: string): void => {
		if (!isObject(part)) return;
		const kind = LATER[`kinds.${String(part.kind)}`];
		if (kind !== undefined) uses.push({ at: `${at}.kind`, what: JSON.stringify(part.kind), since: kind });
		if (part.role !== undefined) use("part role", `${at}.role`);
		if (part.id !== undefined) use("part id", `${at}.id`);
		list(part.fields).forEach((field, i) => {
			if (!isObject(field)) return;
			if (field.role !== undefined) use("field role", `${at}.fields[${i}].role`);
			if (field.tone === "muted") use("field tone muted", `${at}.fields[${i}].tone`);
			if (field.mono !== undefined) use("field mono", `${at}.fields[${i}].mono`);
		});
		if (part.kind === "table") {
			if (part.link !== undefined) use("table link", `${at}.link`);
			list(part.columns).forEach((column, c) => {
				if (isObject(column) && column.wrap !== undefined) use("column wrap", `${at}.columns[${c}].wrap`);
				if (isObject(column) && column.rowHeader !== undefined) use("column rowHeader", `${at}.columns[${c}].rowHeader`);
			});
			list(part.rows).forEach((row, r) =>
				list(row).forEach((cell, c) => {
					if (isObject(cell) && cell.tone === "muted") use("cell tone muted", `${at}.rows[${r}][${c}].tone`);
					if (isObject(cell) && cell.wrap !== undefined) use("cell wrap", `${at}.rows[${r}][${c}].wrap`);
				}),
			);
		}
		const chart = part.chart;
		if (part.kind === "series" && isObject(chart)) {
			for (const key of ["thresholds", "readout", "id", "orientation", "mirror", "yScale", "xScale"]) {
				if (chart[key] !== undefined) use(`chart ${key}`, `${at}.chart.${key}`);
			}
			if (list(chart.x).some((x) => typeof x === "string")) use("chart x text", `${at}.chart.x`);
			list(chart.series).forEach((series, s) => {
				if (!isObject(series)) return;
				const here = `${at}.chart.series[${s}]`;
				if (OUTPUT_SINCE[`series shape ${String(series.shape)}`] !== undefined) use(`series shape ${String(series.shape)}`, `${here}.shape`);
				for (const key of ["boxes", "lower", "markers", "stack", "x", "sizes", "sizeLabel", "notes"]) {
					if (series[key] !== undefined) use(`series ${key}`, `${here}.${key}`);
				}
			});
		}
		list(part.parts).forEach((p, i) => walk(p, `${at}.parts[${i}]`));
	};
	walk(output, "output");
	const newer = uses.filter((use) => use.since > declared);
	const first = newer[0];
	if (!first) return undefined;
	const needs = Math.max(...newer.map((use) => use.since));
	return `${first.at}: ${first.what} is from contract version ${first.since}, but the tool declares "sdk": ${declared}. Declare "sdk": ${needs}.`;
}
