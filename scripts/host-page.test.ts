/**
 * The host page that size-check publishes as "runtime, as a host loads it" (bench/host/).
 *
 * ⚠️ A broken page still has a size. The first build of this page shipped a manifest without "error" in its
 * kinds, so `RegistrySource` threw on load and the card never drew, while the figure measured as normal. The
 * page is only an honest measurement if it is a working host, so its manifest is held to the same rules as
 * every tool's, and its tool to its own output.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { upgradeManifest } from "../packages/sdk/src/upgrade.ts";
import { validateManifest } from "../packages/sdk/src/validate.ts";
import { SDK_VERSION } from "../packages/sdk/src/version.ts";
import tool from "../bench/host/echo/index.ts";

const HOST = join(import.meta.dirname, "..", "bench", "host");

describe("the host page size-check measures", () => {
	it("has a manifest the runtime accepts, at the current contract", () => {
		const raw = JSON.parse(readFileSync(join(HOST, "echo", "tool.json"), "utf8"));
		assert.equal(raw.sdk, SDK_VERSION);
		assert.equal(validateManifest(upgradeManifest(raw)).id, "echo");
	});

	it("runs its tool on the default", async () => {
		assert.deepEqual(await tool.run({ text: "hello" }, {} as never), { kind: "fields", fields: [{ label: "text", value: "hello" }] });
	});

	it("imports only the runtime's two host exports and its own tool", () => {
		// An allowlist: anything from the bench arriving here would be measured as the runtime.
		const main = readFileSync(join(HOST, "main.ts"), "utf8");
		const imports = [...main.matchAll(/^import\s[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
		const dynamic = [...main.matchAll(/import\("([^"]+)"\)/g)].map((m) => m[1]);
		assert.deepEqual(imports, ["@toolbench/runtime", "./echo/tool.json"]);
		assert.deepEqual(dynamic, ["./echo/index.ts"]);
		assert.match(main, /import \{ defineToolHost, RegistrySource \} from "@toolbench\/runtime"/);
	});
});
