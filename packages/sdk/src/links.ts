/**
 * Which link targets a reader can be offered.
 *
 * A manifest's `links` become `<a href>` elements a reader clicks. A manifest is data, and a host can load
 * one from anywhere through its `ToolSource`, so an `href` of `javascript:` would run script in the host
 * page. SECURITY.md lists exactly that as in scope.
 */

/** The only schemes a link may resolve to. A relative path resolves to the page's own, which is one of these. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/*
 * A fixed base, so a relative link is judged by what it can BECOME rather than by the page it happens to be
 * on. Nothing relative can acquire a scheme of its own, so resolving against an https base is exactly the
 * set of relative links that stay links.
 */
const BASE = "https://toolbench.invalid/";

/*
 * C0 controls, space, DEL and C1 controls. The URL parser strips tab and newline from anywhere in the
 * input and leading or trailing C0 controls and space, so any of them can disguise a scheme.
 */
const CONTROL_OR_SPACE = /[\u0000- \u007f-\u009f]/;

/**
 * Whether `href` is safe to place in a link a reader can click.
 *
 * ⚠️ Decided by the URL parser the browser itself uses, never by matching the text against a pattern.
 * A pattern that looks for a scheme and allows anything without one is a parser differential: the
 * browser strips tab and newline before it reads the scheme, so `java\tscript:alert(1)`,
 * `java\nscript:...`, ` javascript:...` and a leading NUL all read as relative paths to the pattern and as
 * `javascript:` to the browser. All four were measured getting past exactly such a check. Refusing control
 * characters and whitespace outright removes that whole class, and asking `URL` for the protocol removes
 * the rest.
 */
export function isSafeLinkHref(href: unknown): href is string {
	if (typeof href !== "string" || href.length === 0) return false;
	if (CONTROL_OR_SPACE.test(href)) return false;
	let url: URL;
	try {
		url = new URL(href, BASE);
	} catch {
		return false;
	}
	return ALLOWED_PROTOCOLS.has(url.protocol);
}
