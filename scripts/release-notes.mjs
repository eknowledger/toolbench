/**
 * The GitHub release notes for a version: the same short lines as the site's What's new page, grouped as
 * New, Changed and Fixed, then a link to the page and to the full changelogs.
 *
 * changesets/action writes each release's body from the CHANGELOG.md section, which is every entry in
 * full: the reasoning, the bullets, and the hidden comment the page reads. That is the changelog's job, and
 * a reader scanning a release for what shipped had to read all of it. These notes are read by the same
 * parser as the page (parseChangelog in site/build/whats-new.ts), so the two cannot say different things.
 *
 * The packages are a fixed group, so changesets publishes two tags per version, @toolbench/runtime@V and
 * @toolbench/sdk@V, and makes a release for each. Both get this one body, from both changelogs merged.
 *
 *   node scripts/release-notes.mjs 0.13.0               print one version's notes
 *   node scripts/release-notes.mjs --all --print        print every version's, newest first
 *   node scripts/release-notes.mjs 0.13.0 --apply       rewrite that version's GitHub releases (gh)
 *   node scripts/release-notes.mjs --all --apply        rewrite every past release, once
 *
 * --apply needs the gh CLI signed in with write access to the repository, or GH_TOKEN in CI.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { anchor, CHANGELOGS, compareVersions, continuation, GROUPS, mergedItems } from "../site/build/whats-new.ts";

const SITE = "https://eknowledger.github.io/toolbench";
const BLOB = "https://github.com/eknowledger/toolbench/blob/main";
const PACKAGES = ["@toolbench/runtime", "@toolbench/sdk"];

/** GitHub's anchor for a "## 0.13.0" heading. */
const changelogAnchor = (version) => version.replace(/\./g, "");

/** One version's notes, as markdown. Throws for a version neither changelog has. */
export function releaseNotes(version) {
	const items = mergedItems().get(version);
	if (!items) throw new Error(`Neither ${CHANGELOGS.join(" nor ")} has a section for ${version}`);
	const out = [];
	for (const g of GROUPS) {
		const group = items.filter((i) => i.kind === g.kind);
		if (!group.length) continue;
		out.push(`### ${g.title} (${group.length})`, "");
		for (const i of group) out.push(`- **${i.name}**: ${continuation(i.line)}${i.label ? ` _${i.label}_` : ""}`);
		out.push("");
	}
	if (!items.length) out.push("No changes a reader would notice.", "");
	const changelogs = CHANGELOGS.map((f) => `[${f.split("/")[1]}](${BLOB}/${f}#${changelogAnchor(version)})`).join(", ");
	out.push(`[What's new in ${version}](${SITE}/whats-new.html#${anchor(version)}) · Full changelog: ${changelogs}`, "");
	return out.join("\n");
}

/** Every version either changelog has, newest first. */
export function allVersions() {
	return [...mergedItems().keys()].sort(compareVersions);
}

function apply(version, notes) {
	const dir = mkdtempSync(join(tmpdir(), "release-notes-"));
	const file = join(dir, "notes.md");
	writeFileSync(file, notes);
	try {
		for (const pkg of PACKAGES) {
			const tag = `${pkg}@${version}`;
			try {
				execFileSync("gh", ["release", "view", tag, "--json", "tagName"], { stdio: "ignore" });
			} catch {
				console.log(`${tag}: no GitHub release, skipped`);
				continue;
			}
			execFileSync("gh", ["release", "edit", tag, "--notes-file", file], { stdio: "inherit" });
			console.log(`${tag}: notes rewritten`);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const args = process.argv.slice(2);
	const versions = args.includes("--all") ? allVersions() : args.filter((a) => !a.startsWith("--"));
	if (!versions.length) {
		console.error("Usage: node scripts/release-notes.mjs <version>... | --all  [--print | --apply]");
		process.exit(2);
	}
	for (const v of versions) {
		const notes = releaseNotes(v);
		if (args.includes("--apply")) apply(v, notes);
		else console.log(`${versions.length > 1 ? `===== ${v}\n\n` : ""}${notes}`);
	}
}
