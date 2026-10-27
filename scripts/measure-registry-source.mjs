/**
 * Time `RegistrySource` validation at a few hundred tools: construction and the first `list()`.
 *
 * The first `list()` validates and migrates every manifest, and the constructor did until the
 * validator became a chunk of its own (#259). That is deliberate: a malformed tool rejects with an
 * error that names the field. It is also linear in tool count, on the main thread, before first
 * paint. Issue #17 asked for a number rather than a shrug.
 *
 *   pnpm measure:registry
 *
 * Generation sits outside the timed region. The headline figure in docs/architecture.md
 * §15 is the median of the timed runs over 500 synthetic manifests, after warmup. The
 * warmup also loads the validation module, so its import is not in the timed figure.
 *
 * The manifests are already objects, which is what a host hands the constructor after
 * the bundler has parsed `tool.json`. JSON.parse is not part of this cost.
 */
import { registerHooks } from "node:module";
import { cpus, platform, arch } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sdkSourceHooks } from "./resolve-sdk-source.mjs";
import { SDK_VERSION } from "../packages/sdk/src/version.ts";

registerHooks(sdkSourceHooks);

/** The count issue #17 asked for. */
export const COUNT = 500;

const DEFAULT_WARMUP = 5;
const DEFAULT_ITERATIONS = 21;

const USAGE = `Usage: pnpm measure:registry [--count N] [--warmup N] [--iterations N]

Time RegistrySource construction and first list() on N synthetic manifests (default ${COUNT}).

Generation is outside the timed region. The printed median is what docs/architecture.md
§15 quotes, after warmup. Does not assert a budget: this is a measurement, not a gate.
`;

/**
 * A current-contract manifest with two inputs, typical of a real tool and heavier than
 * the one-field fixture `validate.test.ts` uses to break one rule at a time. Using that
 * fixture here would understate the work. Samples stay off: not every tool ships them.
 */
export function syntheticManifest(index, sdk = SDK_VERSION) {
	const id = `synth-${String(index).padStart(4, "0")}`;
	return {
		sdk,
		id,
		name: `Synth ${index}`,
		blurb: "A synthetic tool used only to time RegistrySource validation.",
		version: "1.0.0",
		capabilities: ["pure"],
		runtime: { entry: "index.ts", thread: "main" },
		kinds: ["fields", "error"],
		card: "live",
		cardFields: 1,
		inputs: [
			{ id: "value", type: "number", label: "Value", default: 1, min: 0, max: 10 },
			{
				id: "method",
				type: "select",
				label: "Method",
				default: "nearest",
				options: [
					{ value: "nearest", label: "Nearest" },
					{ value: "linear", label: "Linear" },
				],
			},
		],
	};
}

/** A tool's `load()` is not part of validation. Calling it here means the bench is measuring the wrong thing. */
function idleLoad() {
	return Promise.reject(new Error("measure-registry-source: load() is not part of validation and should not run"));
}

export function syntheticEntries(count, sdk = SDK_VERSION) {
	const entries = [];
	for (let i = 0; i < count; i++) {
		entries.push({ manifest: syntheticManifest(i, sdk), load: idleLoad });
	}
	return entries;
}

export async function loadRegistrySource() {
	const { RegistrySource } = await import("../packages/runtime/src/sources.ts");
	return RegistrySource;
}

function median(samples) {
	const sorted = [...samples].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function ms(n) {
	return `${n.toFixed(2)} ms`;
}

/**
 * Time `new RegistrySource(entries)` and its first `list()`, which is where the validation runs. The
 * instance is read after each run so a JIT cannot treat the work as dead.
 */
export async function timeValidation(Source, entries, { warmup = DEFAULT_WARMUP, iterations = DEFAULT_ITERATIONS } = {}) {
	if (entries.length === 0) throw new Error("timeValidation needs at least one entry");
	const firstId = syntheticManifest(0).id;
	for (let i = 0; i < warmup; i++) {
		const source = new Source(entries);
		await source.list();
		if (source.manifest(firstId)?.id !== firstId) throw new Error("warmup validation lost an id");
	}
	const samples = [];
	for (let i = 0; i < iterations; i++) {
		const t0 = performance.now();
		const source = new Source(entries);
		await source.list();
		const t1 = performance.now();
		if (source.manifest(firstId)?.id !== firstId) throw new Error("timed validation lost an id");
		samples.push(t1 - t0);
	}
	return {
		count: entries.length,
		warmup,
		iterations,
		min: Math.min(...samples),
		median: median(samples),
		max: Math.max(...samples),
		samples,
	};
}

export function runtimeLine() {
	const cpu = cpus()[0]?.model?.trim() ?? "unknown CPU";
	return `Node ${process.version} (${platform()} ${arch()}, ${cpu})`;
}

export function formatReport(result, { runtime = runtimeLine(), sdk = SDK_VERSION } = {}) {
	return [
		"RegistrySource construction and first list()",
		`  ${runtime}`,
		`  ${result.count} synthetic manifests (contract ${sdk}, two inputs: number + select)`,
		`  warmup ${result.warmup}, timed ${result.iterations}`,
		"",
		`  min     ${ms(result.min)}`,
		`  median  ${ms(result.median)}`,
		`  max     ${ms(result.max)}`,
		"",
	].join("\n");
}

function parseArgs(argv) {
	let count = COUNT;
	let warmup = DEFAULT_WARMUP;
	let iterations = DEFAULT_ITERATIONS;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") return { help: true, count, warmup, iterations };
		if (arg === "--count" || arg === "--warmup" || arg === "--iterations") {
			const raw = argv[++i];
			const value = Number(raw);
			if (!Number.isInteger(value) || value < 1) {
				throw new Error(`${arg} needs a positive integer, got ${JSON.stringify(raw)}`);
			}
			if (arg === "--count") count = value;
			else if (arg === "--warmup") warmup = value;
			else iterations = value;
			continue;
		}
		if (arg.startsWith("-")) throw new Error(`unknown flag ${arg}`);
		throw new Error(`unexpected argument ${arg}`);
	}
	return { help: false, count, warmup, iterations };
}

export async function main(argv = process.argv.slice(2), io = process) {
	try {
		const { help, count, warmup, iterations } = parseArgs(argv);
		if (help) {
			io.stdout.write(USAGE);
			return 0;
		}
		const Source = await loadRegistrySource();
		const entries = syntheticEntries(count);
		const result = await timeValidation(Source, entries, { warmup, iterations });
		io.stdout.write(formatReport(result));
		return 0;
	} catch (error) {
		io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
}

const invokedAsCli =
	process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedAsCli) {
	process.exitCode = await main();
}
