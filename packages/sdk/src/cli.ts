/**
 * `toolbench-manifests <dir|file>... --out <dir>`: every `tool.json` checked at build time, for a host whose
 * bundler has no plugin for it (webpack, esbuild, Rollup, or plain ES modules).
 *
 * Writes one module per manifest, `<out>/<id>.js`, frozen and marked exactly as `@toolbench/runtime/vite` marks
 * it (build.ts is the one implementation), and `<out>/index.js`, exporting `registry` for `new RegistrySource()`
 * with a lazy `import()` of each tool's code. A directory is searched for `tool.json` files at any depth.
 *
 * A bad manifest exits 1 with the validator's whole message and the file's path, and writes nothing, so a
 * build script that runs this first fails before it bundles. The command itself is bin.ts.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { checkManifestText, ManifestFileError, manifestModule } from "./build.ts";
import type { Manifest } from "./types.ts";

const USAGE = "Usage: toolbench-manifests <dir|tool.json>... --out <dir>";

function find(path: string, found: string[]): void {
	if (statSync(path).isFile()) {
		found.push(path);
		return;
	}
	for (const name of readdirSync(path).sort()) {
		if (name === "node_modules" || name.startsWith(".")) continue;
		const child = join(path, name);
		if (statSync(child).isDirectory()) find(child, found);
		else if (name === "tool.json") found.push(child);
	}
}

/** A path from `from` to `to` as an import specifier: forward slashes, and `./` so it is never a bare name. */
function specifier(from: string, to: string): string {
	const path = relative(from, to).split(sep).join("/");
	return path.startsWith(".") ? path : `./${path}`;
}

export function run(args: readonly string[], cwd = process.cwd()): { code: number; message: string } {
	const outAt = args.indexOf("--out");
	const out = outAt >= 0 ? args[outAt + 1] : undefined;
	const inputs = args.filter((_, i) => i !== outAt && i !== outAt + 1);
	if (!out || inputs.length === 0 || inputs.some((a) => a.startsWith("--"))) return { code: 2, message: USAGE };

	const files: string[] = [];
	for (const input of inputs) find(resolve(cwd, input), files);
	if (files.length === 0) return { code: 1, message: `No tool.json under ${inputs.join(", ")}.` };

	const checked: { file: string; manifest: Manifest }[] = [];
	const seen = new Map<string, string>();
	for (const file of files) {
		const shown = relative(cwd, file) || file;
		let manifest: Manifest;
		try {
			manifest = checkManifestText(readFileSync(file, "utf8"), shown);
		} catch (error) {
			if (error instanceof ManifestFileError) return { code: 1, message: error.message };
			throw error;
		}
		// The runtime refuses this too, but only in the browser; here every file is in view, so say which two.
		const other = seen.get(manifest.id);
		if (other) return { code: 1, message: `${shown}: declares the id "${manifest.id}", as ${other} does. Ids must be unique within a source.` };
		seen.set(manifest.id, shown);
		checked.push({ file, manifest });
	}

	const dir = resolve(cwd, out);
	mkdirSync(dir, { recursive: true });
	const imports: string[] = [];
	const entries: string[] = [];
	checked.forEach(({ file, manifest }, i) => {
		writeFileSync(join(dir, `${manifest.id}.js`), manifestModule(manifest));
		imports.push(`import m${i} from "./${manifest.id}.js";`);
		const code = specifier(dir, join(dirname(file), manifest.runtime.entry));
		entries.push(`\t${JSON.stringify(manifest.id)}: { manifest: m${i}, load: () => import(${JSON.stringify(code)}) },`);
	});
	writeFileSync(join(dir, "index.js"), `${imports.join("\n")}\n\nexport const registry = {\n${entries.join("\n")}\n};\n`);
	writeFileSync(
		join(dir, "index.d.ts"),
		'import type { Manifest, ToolModule } from "@toolbench/sdk";\n\nexport declare const registry: Record<string, { manifest: Manifest; load(): Promise<ToolModule> }>;\n',
	);
	return { code: 0, message: `${checked.length} manifest${checked.length === 1 ? "" : "s"} checked, written to ${relative(cwd, dir) || "."}.` };
}
