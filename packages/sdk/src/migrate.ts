/**
 * Backward compatibility, as a mechanism rather than a promise.
 *
 * A tool is pinned to the contract version it was written against. The runtime keeps moving. So
 * every version boundary gets a **migration**: a pair of pure functions that carry an old manifest
 * and an old output forward one step. Loading a tool runs the chain from its declared version up to
 * the current one, and after that the rest of the system only ever sees current shapes.
 *
 * ```
 *  tool declares sdk: 1        runtime speaks 3
 *          │
 *          └──▶ migrate 1→2 ──▶ migrate 2→3 ──▶ current
 * ```
 *
 * Why a chain and not one big adapter: each step is small enough to read, and each step is testable
 * on its own. Adding version 4 means writing one 3→4 step, not revisiting the previous three.
 *
 * The rules that keep this honest, and that `docs/versioning.md` states as policy:
 *
 *  - **Additive only.** A new version may add output kinds, input types and optional fields. It may
 *    not remove or repurpose anything, because a migration cannot invent information an old tool
 *    never had.
 *  - **A migration never fails.** If a step would need to guess, the change was not additive and
 *    does not belong in a version bump.
 *  - **Old fixtures run forever.** Every tool's cases are checked against the current runtime in CI,
 *    which is what turns this file from a good intention into a tested claim.
 */
import type { Manifest, Output } from "./types.ts";
import { SDK_VERSION } from "./version.ts";

export interface Migration {
	/** Migrates a manifest from `from` to `from + 1`. */
	readonly from: number;
	manifest(raw: Record<string, unknown>): Record<string, unknown>;
	/** Migrates an output produced by a tool written against `from`. */
	output(out: Output): Output;
}

/**
 * The chain, ordered by `from`. One step per version boundary, and every step must exist: a gap is a
 * `VersionError` rather than a silent pass-through.
 *
 * The machinery was built before it was needed, which is why the first real entry below was a
 * five-line change rather than a design exercise. It also caught a bug in itself: `chainFrom` used
 * the module constant instead of the injected `currentVersion`, so chains silently did nothing.
 *
 * ⚠️ A healthy entry has `manifest` and `output` both as the identity function. That is the mechanical
 * test of whether a contract change was additive. If either half has to transform something, the
 * change took something away, and docs/versioning.md §7 governs it instead.
 */
export const MIGRATIONS: readonly Migration[] = [
	{
		from: 1,
		/*
		 * 1 → 2 added the `bytes` output kind.
		 *
		 * Both halves are the identity function, and that is the point rather than laziness: a v1
		 * manifest cannot name a kind that did not exist, and a v1 tool cannot return one. If either
		 * half had needed to transform something, the change would not have been additive and
		 * docs/versioning.md §7 would apply instead.
		 */
		manifest: (m) => m,
		output: (o) => o,
	},
	{
		from: 2,
		/*
		 * 2 → 3 added the optional `samples` key.
		 *
		 * Identity on both halves, and for the same reason as 1 → 2: a v2 manifest cannot carry samples,
		 * and nothing about what a tool returns changed. Filling in a default here would be worse than
		 * doing nothing, because the only default available is an example the author did not choose,
		 * which is exactly the guess docs/versioning.md §3 forbids a migration from making.
		 */
		manifest: (m) => m,
		output: (o) => o,
	},
];

export class VersionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "VersionError";
	}
}

/**
 * The steps needed to carry `version` up to `currentVersion`, in order.
 *
 * ⚠️ `currentVersion` is a parameter, not the module constant. It was the constant in the first
 * draft, which meant the injected version was ignored and the chain silently did nothing — the
 * migration tests caught it, which is the argument for testing a compatibility mechanism before the
 * day you need it.
 */
function chainFrom(version: number, migrations: readonly Migration[], currentVersion: number): Migration[] {
	const steps: Migration[] = [];
	for (let v = version; v < currentVersion; v++) {
		const step = migrations.find((m) => m.from === v);
		if (!step) {
			throw new VersionError(
				`No migration from contract version ${v} to ${v + 1}. This is a bug in @toolbench/sdk: ` +
					`the current version is ${currentVersion}, so every version below it needs a migration step.`,
			);
		}
		steps.push(step);
	}
	return steps;
}

/**
 * Read a raw manifest of any supported version and return one shaped for the current contract.
 *
 * `migrations` is injectable so the chain itself can be tested without shipping a fake version.
 */
export function upgradeManifest(
	raw: unknown,
	migrations: readonly Migration[] = MIGRATIONS,
	currentVersion: number = SDK_VERSION,
): Record<string, unknown> {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		throw new VersionError("A manifest must be an object.");
	}
	const manifest = raw as Record<string, unknown>;
	const declared = manifest.sdk;
	if (typeof declared !== "number" || !Number.isInteger(declared) || declared < 1) {
		throw new VersionError(
			`A manifest must declare an integer contract version, e.g. { "sdk": ${currentVersion} }. Got ${JSON.stringify(declared)}.`,
		);
	}
	if (declared > currentVersion) {
		throw new VersionError(
			`This tool needs contract version ${declared}; this runtime speaks ${currentVersion}. ` +
				"Upgrade @toolbench/runtime, or lower the tool's sdk if it does not use the newer features.",
		);
	}

	let out = manifest;
	for (const step of chainFrom(declared, migrations, currentVersion)) {
		out = step.manifest(out);
		out = { ...out, sdk: step.from + 1 };
	}
	return { ...out, sdk: currentVersion };
}

/** Carry an output produced by a tool written against `declaredVersion` up to the current shape. */
export function upgradeOutput(
	out: Output,
	declaredVersion: number,
	migrations: readonly Migration[] = MIGRATIONS,
	currentVersion: number = SDK_VERSION,
): Output {
	if (declaredVersion > currentVersion) {
		throw new VersionError(`Cannot downgrade an output from version ${declaredVersion} to ${currentVersion}.`);
	}
	let value = out;
	for (const step of chainFrom(declaredVersion, migrations, currentVersion)) value = step.output(value);
	return value;
}

/** True when this runtime can load a tool declaring `version`. */
export function canLoad(version: number, currentVersion: number = SDK_VERSION): boolean {
	return Number.isInteger(version) && version >= 1 && version <= currentVersion;
}

export type { Manifest };
