import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canLoad, MIGRATIONS, type Migration, upgradeManifest, upgradeOutput, VersionError } from "./migrate.ts";
import type { Output } from "./types.ts";
import { SDK_VERSION, SUPPORTED_SDK_VERSIONS } from "./version.ts";

/**
 * These tests use SYNTHETIC versions rather than real ones.
 *
 * They were written while contract version 1 was the only real version, to prove the mechanism carries
 * an old tool forward before anything depended on it: the alternative is exercising the compatibility
 * machinery for the first time on the day it is needed, which is the day you least want to be
 * debugging it. They stay now that versions 2 and 3 are real, because every real step so far is the
 * identity function, and a synthetic chain is the only place a step that actually transforms something
 * can be tested.
 *
 * The synthetic chain models exactly what a real additive change looks like: version 2 renames
 * nothing and removes nothing, it only adds. So the migration's job is to fill in what an old tool
 * could not have known about.
 */

/** 1 → 2: version 2 (imagined) adds a `tags` array and a `tone` on fields. */
const one_to_two: Migration = {
	from: 1,
	manifest: (m) => ({ ...m, tags: m.tags ?? [] }),
	output: (o) => (o.kind === "fields" ? { ...o, fields: o.fields.map((f) => ({ tone: "normal" as const, ...f })) } : o),
};

/** 2 → 3: version 3 (imagined) wraps a bare output in a group, so every tool is uniform. */
const two_to_three: Migration = {
	from: 2,
	manifest: (m) => ({ ...m, grouped: true }),
	output: (o) => (o.kind === "group" ? o : { kind: "group", parts: [o] }),
};

const CHAIN = [one_to_two, two_to_three];

const v1manifest = {
	sdk: 1,
	id: "old-tool",
	name: "A tool written a long time ago",
	blurb: "Still works.",
	version: "1.0.0",
	capabilities: ["pure"],
	runtime: { entry: "index.ts" },
	inputs: [{ id: "n", type: "number", label: "N", default: 1, min: 0, max: 9 }],
	kinds: ["fields", "error"],
};

describe("upgradeManifest", () => {
	it("passes a current manifest through untouched", () => {
		const out = upgradeManifest({ ...v1manifest, sdk: SDK_VERSION });
		assert.equal(out.sdk, SDK_VERSION);
		assert.equal(out.id, "old-tool");
	});

	it("carries a version-1 manifest up a two-step chain", () => {
		const out = upgradeManifest(v1manifest, CHAIN, 3);
		assert.equal(out.sdk, 3, "ends at the current version");
		assert.deepEqual(out.tags, [], "the 1→2 step filled in what a v1 tool could not declare");
		assert.equal(out.grouped, true, "the 2→3 step also ran");
		assert.equal(out.id, "old-tool", "and nothing the old tool did say was lost");
	});

	it("runs the steps in order, not in the order they were listed", () => {
		const seen: number[] = [];
		const spy = (from: number): Migration => ({
			from,
			manifest: (m) => { seen.push(from); return m; },
			output: (o) => o,
		});
		upgradeManifest(v1manifest, [spy(2), spy(1)], 3);
		assert.deepEqual(seen, [1, 2]);
	});

	it("refuses a tool from the future, and says what to do about it", () => {
		assert.throws(
			() => upgradeManifest({ ...v1manifest, sdk: 9 }, CHAIN, 3),
			(e: unknown) => {
				assert.ok(e instanceof VersionError);
				assert.match(e.message, /needs contract version 9/);
				assert.match(e.message, /Upgrade @toolbench\/runtime/);
				return true;
			},
		);
	});

	it("treats a missing migration step as a loud SDK bug, not a silent pass", () => {
		// Current version 3, but only the 1→2 step exists: the 2→3 gap must be reported.
		assert.throws(
			() => upgradeManifest(v1manifest, [one_to_two], 3),
			(e: unknown) => {
				assert.ok(e instanceof VersionError);
				assert.match(e.message, /No migration from contract version 2 to 3/);
				assert.match(e.message, /bug in @toolbench\/sdk/);
				return true;
			},
		);
	});

	it("rejects a manifest with no version at all", () => {
		assert.throws(() => upgradeManifest({ id: "x" }), VersionError);
	});
});

describe("upgradeOutput", () => {
	const v1out: Output = { kind: "fields", fields: [{ label: "answer", value: "42" }] };

	it("leaves a current output alone", () => {
		assert.deepEqual(upgradeOutput(v1out, SDK_VERSION), v1out);
	});

	it("adapts an old tool's output through the chain", () => {
		const out = upgradeOutput(v1out, 1, CHAIN, 3);
		assert.equal(out.kind, "group", "the 2→3 step wrapped it");
		assert.ok(out.kind === "group");
		const inner = out.parts[0];
		assert.ok(inner?.kind === "fields");
		assert.deepEqual(inner.fields, [{ tone: "normal", label: "answer", value: "42" }], "the 1→2 step filled the new field");
	});

	it("does not let a migration invent a value the tool did set", () => {
		const withTone: Output = { kind: "fields", fields: [{ label: "answer", value: "42", tone: "bad" }] };
		const out = upgradeOutput(withTone, 1, [one_to_two], 2);
		assert.ok(out.kind === "fields");
		assert.equal(out.fields[0]?.tone, "bad", "the tool's own value wins over the default the migration supplies");
	});
});

/*
 * The real chain, not a synthetic one.
 *
 * Until contract v2 shipped, every test in this file used injected fake versions. These assert the
 * actual MIGRATIONS export, because a compatibility mechanism that only works against test doubles is
 * not a compatibility mechanism.
 */
describe("the real 1 -> 3 chain", () => {
	it("has one step per version boundary, and every step is additive", () => {
		assert.equal(MIGRATIONS.length, 2, "one step per version boundary");
		assert.deepEqual(
			MIGRATIONS.map((step) => step.from),
			[1, 2],
		);
		/*
		 * The mechanical test from docs/versioning.md §3, applied to every step rather than only to the
		 * newest: if either half has to transform something, the change took something away and is a
		 * break rather than a version bump.
		 */
		const manifest = { sdk: 1, id: "x" };
		const output: Output = { kind: "fields", fields: [{ label: "a", value: "1" }] };
		for (const step of MIGRATIONS) {
			const boundary = `${step.from} -> ${step.from + 1}`;
			assert.deepEqual(step.manifest(manifest), manifest, `${boundary} manifest half must be the identity`);
			assert.deepEqual(step.output(output), output, `${boundary} output half must be the identity`);
		}
	});

	it("carries a v1 manifest up to the current version untouched apart from sdk", () => {
		const v1 = { sdk: 1, id: "old-tool", name: "Old", kinds: ["fields", "error"] };
		const upgraded = upgradeManifest(v1);
		assert.equal(upgraded.sdk, SDK_VERSION, "declares the current contract after upgrade");
		assert.equal(upgraded.id, "old-tool");
		assert.deepEqual(upgraded.kinds, ["fields", "error"], "nothing else is rewritten");
	});

	it("carries a v2 manifest up to the current version untouched apart from sdk", () => {
		const v2 = { sdk: 2, id: "dumper", name: "Dumper", kinds: ["bytes", "error"] };
		const upgraded = upgradeManifest(v2);
		assert.equal(upgraded.sdk, SDK_VERSION, "declares the current contract after upgrade");
		assert.deepEqual(upgraded.kinds, ["bytes", "error"], "nothing else is rewritten");
		assert.equal(
			upgraded.samples,
			undefined,
			"a migration must not invent an example the author did not choose",
		);
	});

	it("leaves a v1 tool's output alone", () => {
		const output: Output = {
			kind: "group",
			parts: [
				{ kind: "fields", fields: [{ label: "p50", value: "120" }] },
				{ kind: "table", columns: [{ label: "n" }], rows: [["1"]] },
			],
		};
		assert.deepEqual(upgradeOutput(output, 1), output);
	});

	it("still refuses a manifest from the future", () => {
		assert.throws(() => upgradeManifest({ sdk: SDK_VERSION + 1, id: "x" }), /needs contract version/);
	});

	it("canLoad accepts every supported version and nothing above", () => {
		for (const v of SUPPORTED_SDK_VERSIONS) assert.ok(canLoad(v), `v${v} should load`);
		assert.equal(canLoad(SDK_VERSION + 1), false);
	});
});
