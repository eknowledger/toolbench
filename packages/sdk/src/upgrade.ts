/**
 * The manifest half of the migration chain in migrate.ts: read a raw manifest of any supported version and
 * return one shaped for the current contract. Apart from the output half, so the chunk that upgrades
 * outputs does not carry the feature check this one runs.
 */
import { checkManifestFeatures } from "./features.ts";
import { MIGRATIONS, VersionError, chainFrom, type Migration } from "./migrate.ts";
import { SDK_VERSION } from "./version.ts";

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
	/*
	 * ⚠️ Here, before the chain stamps the current version over `sdk`, because this is the last moment the
	 * declaration exists (#170). A manifest declaring 4 that used v6's `lang` validated after the stamp, and
	 * a v4 runtime then loaded it and ignored the key. Every caller passes through here, so every one refuses.
	 */
	checkManifestFeatures(manifest);

	let out = manifest;
	for (const step of chainFrom(declared, migrations, currentVersion)) {
		out = step.manifest(out);
		out = { ...out, sdk: step.from + 1 };
	}
	return { ...out, sdk: currentVersion };
}
