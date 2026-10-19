/**
 * `?wide=` and `?wideToggle=` as `defineToolHost` options (#198), so a browser test can load a page under
 * each host default. Its own chunk, as the highlighter is: a test instrument must not be counted in `boot`.
 */
import type { ToolHostConfig } from "@toolbench/runtime";

export function hostWide(search: string): Pick<ToolHostConfig, "wide" | "wideToggle"> {
	const query = new URLSearchParams(search);
	const wide = query.get("wide");
	const toggle = query.get("wideToggle");
	return { ...(wide === "fit" || wide === "scroll" ? { wide } : {}), ...(toggle === null ? {} : { wideToggle: toggle !== "false" }) };
}
