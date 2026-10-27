/**
 * `?wide=` and `?wideToggle=` as `defineToolHost` options (#198), and the share options (#227), so a browser
 * test can load a page under each host default. Its own chunk, as the highlighter is: a test instrument must
 * not be counted in `boot`.
 */
import type { RegistryEntry, ToolHostConfig } from "@toolbench/runtime";

/**
 * `?badManifest=link`: the registry with one more tool, a copy of percentiles whose link is a `javascript:`
 * URL, so a test can see the source refuse it in `list()` (#259), naming the field on every host, with nothing
 * drawn from any manifest. The link scheme is the case because that refusal is a security property.
 */
export function hostRegistry(search: string, registry: Record<string, RegistryEntry>): Record<string, RegistryEntry> {
	const base = registry.percentiles;
	if (new URLSearchParams(search).get("badManifest") !== "link" || !base) return registry;
	const manifest = { ...(base.manifest as object), id: "bad-link", links: [{ label: "Run", href: "javascript:alert(1)" }] };
	return { ...registry, "bad-link": { manifest, load: base.load } };
}

export function hostWide(search: string): Pick<ToolHostConfig, "wide" | "wideToggle"> {
	const query = new URLSearchParams(search);
	const wide = query.get("wide");
	const toggle = query.get("wideToggle");
	return { ...(wide === "fit" || wide === "scroll" ? { wide } : {}), ...(toggle === null ? {} : { wideToggle: toggle !== "false" }) };
}

/**
 * `?hostShare=none`, `?hostSharePosition=`, `?hostShareLabel=` and `?hostShareScheme=hash`. The `hash` scheme
 * is a host's own writer and reader, keeping a tool's values in the fragment as JSON, so a test can see that
 * a custom writer is used and that its reader is what a tool opens with.
 */
export function hostShare(search: string): Pick<ToolHostConfig, "share" | "sharePosition" | "shareLabel"> {
	const query = new URLSearchParams(search);
	const position = query.get("hostSharePosition");
	const label = query.get("hostShareLabel");
	const scheme: ToolHostConfig["share"] = {
		url: (id, values) => `${location.origin}${location.pathname}${location.search}#${new URLSearchParams({ [id]: JSON.stringify(values) })}`,
		read: (id) => {
			const stored = new URLSearchParams(location.hash.slice(1)).get(id);
			return stored ? JSON.parse(stored) : undefined;
		},
	};
	const share = query.get("hostShare") === "none" ? "none" : query.get("hostShareScheme") === "hash" ? scheme : undefined;
	return { ...(share ? { share } : {}), ...(position === "top" || position === "actions" ? { sharePosition: position } : {}), ...(label ? { shareLabel: label } : {}) };
}
