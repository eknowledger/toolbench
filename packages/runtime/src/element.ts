/**
 * `<tool-host>` — the whole public surface of this package.
 *
 * ```html
 * <tool-host tool="percentiles" mode="page"></tool-host>
 * ```
 *
 * Three modes, one declaration, and the mode decides both the layout **and when the tool's code is
 * fetched**:
 *
 * | mode | layout | loads its code |
 * |---|---|---|
 * | `card` | name, one input, a few result fields | **on click** — until then it is static markup |
 * | `page` | everything: all inputs, full result, links | when it scrolls near the viewport |
 * | `embed` | no title; sized for the middle of an article | when it scrolls near the viewport |
 *
 * ⚠️ **A card is a facade.** It renders whatever output it was seeded with (or a prompt), and imports
 * nothing until someone clicks. That is what lets a page carry several cards without paying for any
 * of them — the alternative, hydrating on visibility, charges every reader who scrolls past for a
 * tool nobody used.
 *
 * Accessibility is part of the contract, not a later pass, because a generated form is exactly where
 * it gets forgotten:
 *
 *  - every control has a real `<label for>`, and its `description` becomes `aria-describedby`;
 *  - an `{ kind: "error", input }` result marks that control `aria-invalid` and points its
 *    description at the message, so the error is attached to the thing that caused it;
 *  - results are announced through a short `role="status"` summary — "6 fields", "error: …" — rather
 *    than an `aria-live` region over the output, which would read whole tables aloud on every
 *    keystroke pause;
 *  - focus never moves on a debounced run, and moves to the result only when someone presses Run;
 *  - there is always a Run button. Debounce-on-typing alone leaves a keyboard user no way to say
 *    "go now", and is wrong anyway for anything slow.
 */
import type { InputSpec, InputValues, Manifest, Output, Row, Sample, SelectOption } from "@toolbench/sdk";
import { defaultInputs, inputProblem, isSafeLinkHref, shareableInputs } from "@toolbench/sdk";
import { el, fill } from "./dom.ts";
import { ChartRendererMissing, isLazyKind, plural, loadRenderers, prepareOutput, render, unknownOutput, type LazyKind, type RenderOptions } from "./render/index.ts";
import { ToolCrashError, ToolTimeoutError, WorkerUnavailableError } from "./protocol.ts";
import { isSuperseded, Runner, type Runnable } from "./runner.ts";
import { type ToolSource } from "./sources.ts";
import { applyHostStyles, applyStyles, hostSheetsFor, type HostStyles } from "./styles.ts";
import { help } from "./markup.ts";
import { applyPartialValues, coerce, fromQuery } from "./values.ts";

export type Mode = "card" | "page" | "embed";

/**
 * The attributes `<tool-host>` reads, as a type: what a page writes in its markup, and what the docs'
 * Host API reference lists. Types only; nothing here ships in the bundle.
 */
export interface ToolHostAttributes {
	/** The id of the tool to show, as its manifest declares. */
	tool: string;
	/**
	 * `card`: name, blurb, the `primary` inputs and the first result part, fetching the tool's code only when
	 * the reader opens it. `page`: every input, the full result and the tool's links. `embed`: `page` without
	 * the title, for the middle of an article. `page` and `embed` fetch when they scroll near the viewport.
	 * @default "page"
	 */
	mode?: Mode;
	/**
	 * How many parts of a grouped result to show. A card always caps; on `page` and `embed` there is no cap
	 * unless this is set.
	 * @default 1
	 */
	parts?: number;
	/**
	 * What stands for the parts `parts` hid: `link`, a line of text pointing at the full tool, or `expand`,
	 * a button that shows them in place without running the tool again.
	 * @default "link"
	 */
	more?: "link" | "expand";
	/**
	 * `answer-first` draws the result above the form, for a tool that opens a page about something else.
	 * @default "default"
	 */
	layout?: "default" | "answer-first";
	/**
	 * `none` draws the result and nothing else: no form, no Run, no status line. The page drives the tool
	 * through `values` and `run()`.
	 * @default "default"
	 */
	controls?: "default" | "none";
	/**
	 * A graph wider than its plot: `fit` scales it down to the width, `scroll` draws it full size in a plot
	 * that scrolls. Overrides `defineToolHost({ wide })`.
	 * @default "fit"
	 */
	wide?: "fit" | "scroll";
	/**
	 * `false` hides the expand and fit button on a scaled graph. Overrides `defineToolHost({ wideToggle })`.
	 * @default "true"
	 */
	"wide-toggle"?: "true" | "false";
	/**
	 * `none` leaves out the Reset button, for a tool where it adds nothing, such as one with a single input.
	 * @default "default"
	 */
	reset?: "default" | "none";
	/**
	 * What goes under the tool: `all`, the manifest's links; `page`, only "Open the full tool", pointing at
	 * `pageUrl(id)`; `none`, nothing. For a tool embedded in an article, where a row of references sits between
	 * the answer and the prose. A card shows "Open the full tool" for anything but `none`. A retired tool
	 * keeps its links whatever this says, because its notice points at them. Also a property, `host.links`.
	 * @default "all"
	 */
	links?: "all" | "page" | "none";
	/**
	 * `none` leaves out the share button, and the tool then reads nothing from the page's URL either.
	 * Overrides `defineToolHost({ share })`.
	 * @default "default"
	 */
	share?: "default" | "none";
	/**
	 * Text beside the share button's icon, which is otherwise shown alone. Overrides `defineToolHost({ shareLabel })`.
	 * @default ""
	 */
	"share-label"?: string;
	/**
	 * Where the share button sits: `top`, the end of the title row, or `actions`, the end of the Run row.
	 * Overrides `defineToolHost({ sharePosition })`.
	 * @default "top" on a page, "actions" in an embed
	 */
	"share-position"?: "top" | "actions";
}

/**
 * A host's own link scheme for the share button (#227): how to write a link, and how to read one back.
 * They are a pair because a tool opens with whatever `read` finds, so a `url` with no matching `read`
 * would copy links that open on the defaults.
 */
export interface ShareScheme {
	/** The link to copy, for a tool's id and the values of its inputs that may go in a link. */
	url(id: string, values: InputValues): string;
	/** The values a link on this page carries for a tool, or `undefined`. Read once, as the tool opens. */
	read(id: string): InputValues | undefined;
}

/**
 * The events `<tool-host>` dispatches, as a type: each name and the event a listener receives. Every one is
 * a `CustomEvent` that bubbles and is composed, so a page can listen on the element or on anything above it,
 * `document` included. None fires while the element is first drawing the tool with its starting values, an
 * `autoRun` tool's first answer included: opening a tool is not a change, and not a run anyone asked for.
 * Types only; nothing here ships in the bundle.
 *
 * ```ts
 * host.addEventListener("tool-input", (event) => {
 *   const { values } = (event as ToolHostEvents["tool-input"]).detail;
 *   history.replaceState(null, "", `?${new URLSearchParams(values as Record<string, string>)}`);
 * });
 * ```
 */
export interface ToolHostEvents {
	/**
	 * The inputs changed, by typing, a sample, a preset or a write to `values`. Once per change, after the
	 * form shows the new values, and only when they differ from the last ones reported. Dispatched before a
	 * `values` write returns. `values` is a copy, already clamped and refused the way typing is. Debounce is
	 * the listener's business.
	 */
	"tool-input": CustomEvent<{ values: InputValues }>;
	/**
	 * A run settled: from Run, Enter, `run()`, `reveal()` or an `autoRun` tool's typing. Once per run, after
	 * its result or error is drawn and before `run()` resolves. `values` are the ones the run used. `ok` is
	 * false for an error result and for a run that failed, with `error` the message the reader sees. A run
	 * replaced by a newer one before it finished dispatches nothing.
	 */
	"tool-run": CustomEvent<{ values: InputValues; ok: boolean; error?: string }>;
	/**
	 * The reader pressed Reset. Dispatched after the form shows the starting values and the result is cleared,
	 * and after the `tool-input` for the same change. `values` are the starting values.
	 */
	"tool-reset": CustomEvent<{ values: InputValues }>;
	/**
	 * The reader pressed the share button. After the copy is attempted, whether or not the clipboard took it.
	 * `url` is the link, `values` the inputs it carries: every input but one marked `share: false`.
	 */
	"tool-share": CustomEvent<{ url: string; values: InputValues }>;
}

/** How long a run must last before its progress bar is worth showing. */
const SLOW_MS = 400;

export interface ToolHostConfig {
	/** Where tools come from. */
	source: ToolSource;
	/** Required only for tools that declare `thread: "worker"`. See the README. */
	workerFactory?: () => Worker;
	/** Given a tool id, the URL of its full page, which card and embed modes link out to. */
	pageUrl?: (id: string) => string;
	/** How far ahead of the viewport `page` and `embed` modes start loading. Default "200% 0px". */
	rootMargin?: string;
	/** Milliseconds of quiet before a typed change runs. Default 150. */
	debounceMs?: number;
	/**
	 * Paint a `code` result with the host's own highlighter.
	 *
	 * The runtime does not bundle one: that would roughly double the package, and a host usually
	 * already has one. Return a `Node`, not a string. A string-returning hook would need
	 * `innerHTML`, which SECURITY.md forbids. Omit the hook to keep readable preformatted text.
	 */
	highlight?: (source: string, lang: string) => Node;
	/**
	 * The host's own stylesheets, adopted into every tool's shadow root after the runtime's. A sheet, CSS
	 * text, a list of either, or `{ "*": [...], "tool-id": [...] }` for one tool to differ. The class
	 * names and attributes they may rely on are listed in STYLING.md.
	 */
	styles?: HostStyles;
	/**
	 * A graph wider than its plot: `fit` (default) scales it down to the plot's width, `scroll` draws it at
	 * its natural size in a plot that scrolls. A tool's `wide` attribute overrides it.
	 */
	wide?: "fit" | "scroll";
	/** Whether a scaled graph offers the reader a button to switch between the two. Default true. */
	wideToggle?: boolean;
	/**
	 * The share button on `page` and `embed` tools (#227), a link icon that copies a link to the tool with its
	 * inputs. By default the link is this page's URL with each input as a query parameter named
	 * `<tool id>.<input id>`, `?percentiles.method=linear`, and a tool opening on a page reads its values back
	 * from those. `"none"` removes the button and reads nothing; a `{ url, read }` pair is your own scheme.
	 * Inputs marked `share: false` are never written or read. A tool's `share` attribute overrides it.
	 * @default the query-parameter scheme
	 */
	share?: "none" | ShareScheme;
	/** Text beside the share button's icon, which is otherwise shown alone. A tool's `share-label` overrides it. */
	shareLabel?: string;
	/**
	 * Where the share button sits: `top`, the end of the title row, or `actions`, the end of the Run row. A
	 * tool's `share-position` overrides it.
	 * @default "top" on a page, "actions" in an embed
	 */
	sharePosition?: "top" | "actions";
}

let config: ToolHostConfig | undefined;

/** Every connected host's way to restyle itself, so `setHostStyles` reaches hosts that exist already. */
const live = new Set<() => void>();
/** The painted-textarea chunk (#153), once a tool that needs it has activated. */
let painter: typeof import("./paint.ts") | undefined;
/** The share chunk (#227), and the one fetch of it every host on the page waits on. */
let sharer: typeof import("./share.ts") | undefined;
let shareLoad: Promise<void> | undefined;
/** The newer inputs' controls (#203), once a tool that has one has activated. */
let controls: typeof import("./controls.ts") | undefined;
/** A multiselect's checkboxes and chips (#204), once a tool that has one has activated. */
let picker: typeof import("./choices.ts") | undefined;
/** A rows input's list (#204), once a tool that has one has activated. */
let lister: typeof import("./rows.ts") | undefined;
const loadShare = () => (shareLoad ??= import("./share.ts").then((module) => void (sharer = module)));

/** Defines the element. Call once, with the source your host provides. */
export function defineToolHost(options: ToolHostConfig, tagName = "tool-host"): void {
	config = options;
	if (typeof customElements === "undefined") return;
	if (!customElements.get(tagName)) customElements.define(tagName, ToolHost);
}

/**
 * Replace the host's stylesheets on every tool, on the page now and created later, without reloading:
 * a theme switch, say. `undefined` removes them. Takes what `styles` takes.
 */
export function setHostStyles(styles: HostStyles | undefined): void {
	if (!config) return;
	config = { ...config };
	if (styles === undefined) delete config.styles;
	else config.styles = styles;
	for (const restyle of live) restyle();
}

export class ToolHost extends HTMLElement {
	static readonly observedAttributes = ["tool", "mode", "parts", "more", "layout", "controls", "wide", "wide-toggle", "reset", "links", "share", "share-label", "share-position"];

	#root: ShadowRoot;
	#runner: Runner | undefined;
	#loaded: Runnable | undefined;
	#manifest: Manifest | undefined;
	#values: InputValues = {};
	/**
	 * Values set before the manifest is here. `#prepare` applies them on top of defaults so a host
	 * can prefill a card that has not listed tools yet.
	 */
	#queued: InputValues = {};
	/**
	 * The values `tool-input` last reported, serialised. Compared rather than dispatching on every write,
	 * because a host writing the values the form already holds, or a keystroke a number box coerces back to
	 * the same number, changed nothing a listener could act on.
	 */
	#reported = "";
	/**
	 * The values the tool first rendered with, serialised: the defaults with any host prefill on top. Reset
	 * returns to these, so an embed that opened on the page's own values goes back there and not to the
	 * manifest's defaults, which is where a "Start again" sample went.
	 */
	#start = "";
	/** Whether the starting values include a host prefill, so a reset seed is marked stale as it was at first. */
	#startPrefilled = false;
	/** Counts resets, so a run still in flight when the reader pressed Reset does not draw over the cleared panel. */
	#resets = 0;
	/** True after a host wrote `values`, so a later paint of a seed can mark that seed stale. */
	#hostWroteValues = false;
	/** Settles when the current `#prepare` finishes. `run()` waits on this so it does not no-op. */
	#ready: Promise<void> = Promise.resolve();
	/** In-flight activation. A host `run()` during a click or intersection must wait for it. */
	#activation: Promise<void> | undefined;
	#observer: IntersectionObserver | undefined;
	#debounce: ReturnType<typeof setTimeout> | undefined;
	#slowTimer: ReturnType<typeof setTimeout> | undefined;
	#activated = false;
	/** True between "the reader asked for this" and "the tool's code is here". */
	#loading = false;
	#seed: Output | undefined;
	/**
	 * The last thing actually drawn: a result, a `progress` partial, or an error.
	 *
	 * ⚠️ This exists because `#paint` rebuilds the shadow tree, and without it a repaint threw the
	 * reader's answer away. Any observed attribute does that: `host.setAttribute("parts", "2")` after a
	 * run left the output empty, and on a seeded host it was worse than empty, because `#paint` ends by
	 * drawing the seed and the reader was then looking at the defaults' result under their own inputs
	 * with nothing saying so.
	 */
	#shown: Output | undefined;
	/** The last visible status line, for the same reason as `#shown`: a repaint builds a fresh, empty one. */
	#status = "";
	/**
	 * Whether the reader has opened the disclosure.
	 *
	 * Deliberately survives a re-run. Expanding is the reader saying "show me the whole answer", which is a
	 * statement about what they want to see rather than about one particular output. Collapsing it on every
	 * run would make anyone iterating on inputs press it again each time, which reads as the control not
	 * working. Cleared only when the tool itself changes.
	 */
	#expanded = false;
	/** Set by `reveal` to draw every part when a plain `parts` cap hid the one asked for. Cleared with `#expanded`. */
	#uncapped = false;
	#controls = new Map<string, HTMLElement>();
	/** The range control beside a number box that asked for `control: "slider"`, kept in step with it. */
	#sliders = new Map<string, HTMLInputElement>();
	/** Repaint for each painted textarea (#153), for values written without a keystroke. */
	#painters = new Map<string, () => void>();
	/** Shows an error's line under one row of a rows input (#204), or clears it. */
	#marks = new Map<string, (row: number | undefined, line: string) => void>();
	#els: {
		output?: HTMLElement;
		status?: HTMLElement;
		announce?: HTMLElement;
		run?: HTMLButtonElement;
		reset?: HTMLButtonElement;
		progress?: HTMLElement;
	} = {};

	constructor() {
		super();
		this.#root = this.attachShadow({ mode: "open" });
		this.#reapplyStyles();
	}

	#restyle = (): void => this.#reapplyStyles();

	/**
	 * A precomputed result to show before anything runs.
	 *
	 * A server-rendering host sets this so a card is useful with no JavaScript at all — the same
	 * output the tool would produce for its defaults, rendered as static markup.
	 */
	set seed(output: Output | undefined) {
		this.#seed = output;
		if (!this.#activated) this.#paint();
	}

	/**
	 * Prefill the form. Partial is fine: unnamed inputs keep their current value.
	 *
	 * Validated the way typing is (clamp, refuse, truncate), and does not run the tool, even if the
	 * tool set `autoRun`. An existing result goes stale. Works before activation, so a card can be
	 * prefilled. A host that wants the tool to run calls `run()` afterwards. Dispatches `tool-input` before
	 * returning if the values changed, except before the tool has loaded, when they become its starting values.
	 */
	set values(partial: InputValues) {
		if (partial == null || typeof partial !== "object" || Array.isArray(partial)) return;
		if (!this.#manifest) {
			this.#queued = { ...this.#queued, ...partial };
			this.#hostWroteValues = true;
			return;
		}
		this.#applyHostValues(partial);
	}

	/**
	 * A copy of the current input values, including ones a compact card has not rendered.
	 *
	 * The setter is the primitive a host example button needs. The getter is here so a shareable
	 * deep link can read the form the same way it writes it, without the host reaching into the
	 * shadow root.
	 */
	get values(): InputValues {
		// A deep copy, since a list is an array a host could otherwise edit in place behind the form (#204).
		return structuredClone(this.#manifest ? this.#values : this.#queued);
	}

	/**
	 * Run the tool. Opt-in: setting `values` never does this on its own.
	 *
	 * Waits for the manifest, activates if the form has not opened yet, then runs. So
	 * `host.values = …; host.run()` works on a card nobody has clicked. Dispatches `tool-run` once the result
	 * is drawn, before the promise resolves.
	 *
	 * ⚠️ Does NOT move focus, unlike the reader pressing Run. Focus follows the person who acted, and here
	 * the person who acted is the page, not the reader: a host running a tool on load would otherwise yank
	 * a reader out of whatever they were doing and drop them on a result they did not ask for. Pass
	 * `{ focus: true }` when the call is the direct consequence of something the reader did, such as a
	 * button the page itself renders.
	 */
	async run(options: { focus?: boolean } = {}): Promise<void> {
		await this.#ready;
		if (!this.#manifest) return;
		await this.#activate();
		await this.#run({ focusResult: options.focus === true });
	}

	/**
	 * Bring one part of the result to the reader: the part whose `id` is `id` (#147). Resolves `true` once
	 * it is on screen with focus on it, `false` if the result has no such part.
	 *
	 * Opens whatever stands in the way. A closed card or a not-yet-visible tool is activated first, since
	 * a link that does nothing is worse than one that opens a card. A tool with nothing on screen at all,
	 * no seed and no result, runs on its current inputs, because otherwise there is no part to go to. A
	 * part behind `parts`/`more` is shown: with `more="expand"` the disclosure opens, as if pressed, and
	 * with a plain cap every part is drawn, since the reader asked for one the cap hid.
	 */
	async reveal(id: string): Promise<boolean> {
		await this.#ready;
		if (!this.#manifest) return false;
		await this.#activate();
		if (this.#shown === undefined && this.#seed === undefined) await this.#run({ focusResult: false });
		const find = () => this.#els.output?.querySelector<HTMLElement>(`[data-part="${CSS.escape(id)}"]`);
		let part = find();
		const shown = this.#shown ?? this.#seed;
		// Only for a part the result has: an unknown id must not lift a cap the page chose.
		if ((!part || part.closest("[hidden]")) && shown && hasPart(shown, id)) {
			this.#expanded = true;
			this.#uncapped = this.more !== "expand";
			// Redrawing the seed must not record it as a result, for the reason `#paint` gives.
			const fromSeed = this.#shown === undefined;
			this.#draw(shown);
			if (fromSeed) this.#shown = undefined;
			part = find();
		}
		if (!part) return false;
		// A part is a div, not a control: tabindex -1 lets it hold focus without joining the tab order.
		if (!part.hasAttribute("tabindex")) part.setAttribute("tabindex", "-1");
		// "start", as a fragment link lands: "nearest" left a revealed table pinned to the bottom edge.
		part.scrollIntoView({ block: "start" });
		part.focus({ preventScroll: true });
		return true;
	}

	get mode(): Mode {
		const mode = this.getAttribute("mode");
		return mode === "card" || mode === "embed" ? mode : "page";
	}

	/**
	 * How many parts of a grouped result a compact card shows. Default 1.
	 *
	 * An attribute rather than a manifest key, and deliberately: how much room a card has is a property of
	 * the page it is on, not of the tool. The same tool is a one-part card in a sidebar and a two-part card
	 * leading a section, and a manifest cannot know which.
	 */
	get cardParts(): number {
		const raw = Number(this.getAttribute("parts"));
		return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
	}

	/**
	 * The cap to hand the renderer, or `undefined` for none.
	 *
	 * ⚠️ The absence of `parts` and `parts="1"` have to mean different things outside a card, which is why
	 * this is not just `cardParts`. A card caps at 1 by default and always has. An embedded tool showed
	 * everything, so defaulting it to 1 the moment the cap stopped being card-only would silently truncate
	 * every existing embed on upgrade. So: a card always gets a cap, and anything else gets one only
	 * because the page asked for it by name.
	 */
	get #partsCap(): number | undefined {
		if (this.mode === "card") return this.cardParts;
		return this.hasAttribute("parts") ? this.cardParts : undefined;
	}

	/**
	 * `link` (default) or `expand`: what the truncation notice does.
	 *
	 * Anything unrecognised is `link`, so a typo degrades to today's behaviour rather than to no notice.
	 */
	get more(): "link" | "expand" {
		return this.getAttribute("more") === "expand" ? "expand" : "link";
	}

	/**
	 * `answer-first` puts the result above the form (#103). For a tool used as the opening figure of a page
	 * about something else, where the result is the argument and the controls are how a sceptic checks it:
	 * a three-input tool used that way put 480px of fields above an answer below the fold.
	 *
	 * Anything else is the default, form first. Ignored by a card, which is already answer-forward.
	 */
	get layout(): "default" | "answer-first" {
		return this.getAttribute("layout") === "answer-first" ? "answer-first" : "default";
	}

	/**
	 * `none`: draw the result and nothing else, for a page that owns the controls and drives the tool with
	 * `values` and `run()` (#103). Without it, any controls a page built were duplicated by the ones inside
	 * the shadow root. Ignored by a card.
	 */
	/**
	 * What goes under the tool (#216): `all`, the manifest's links; `page`, only "Open the full tool"; `none`,
	 * nothing. A card has no room for the manifest's links, so it reads anything but `none` as `page`, which
	 * is what it always drew. Anything unrecognised is the default, so a typo does not hide the links.
	 *
	 * A retired tool does not ask: its notice says the links below are the way onward, so they stay.
	 */
	get links(): "all" | "page" | "none" {
		const value = this.getAttribute("links");
		return value === "none" ? "none" : value === "page" || this.mode === "card" ? "page" : "all";
	}

	set links(value: "all" | "page" | "none") {
		this.setAttribute("links", value);
	}

	/**
	 * Whether this tool has a share button, and so reads a link on load (#227). Not on a card, which has room
	 * for one input and Run, not with `controls="none"`, where the page owns the controls and so its links,
	 * and not when the tool or the host said `none`.
	 */
	get #shares(): boolean {
		return this.mode !== "card" && this.controls !== "none" && this.getAttribute("share") !== "none" && config?.share !== "none";
	}

	/**
	 * What a link on this page says this tool's inputs are: the host's `read`, else the query parameters named
	 * `<tool id>.<input id>`. Never an input marked `share: false`, whatever the link says, so a crafted link
	 * cannot fill a password field. A toggle reads `"true"`; any other string would otherwise be true.
	 */
	#fromLink(manifest: Manifest): InputValues {
		const scheme = config?.share;
		let found: InputValues | undefined;
		try {
			found = typeof scheme === "object" ? scheme.read(manifest.id) : fromQuery(manifest.id, manifest.inputs ?? [], new URLSearchParams(location.search));
		} catch {
			// A host reader that throws leaves the tool on its own values: a broken link is not a broken page.
			found = undefined;
		}
		const out: InputValues = {};
		const shareable = shareableInputs(manifest);
		for (const spec of manifest.inputs ?? []) {
			const value = found?.[spec.id];
			if (value === undefined || !shareable.includes(spec.id)) continue;
			out[spec.id] = spec.type === "toggle" && typeof value === "string" ? value === "true" : value;
		}
		return out;
	}

	/** `none`: no Reset button (#208). Anything else draws one. */
	get reset(): "default" | "none" {
		return this.getAttribute("reset") === "none" ? "none" : "default";
	}

	get controls(): "default" | "none" {
		return this.getAttribute("controls") === "none" ? "none" : "default";
	}

	get toolId(): string {
		return this.getAttribute("tool") ?? "";
	}

	connectedCallback(): void {
		live.add(this.#restyle);
		if (!config) {
			this.#fatal("No source: call defineToolHost({ source }) before using <tool-host>.");
			return;
		}
		this.#readInlineSeed();
		this.#ready = this.#prepare();
	}

	disconnectedCallback(): void {
		/*
		 * ⚠️ This is what stops a worker leaking. On a site with client-side navigation the element is
		 * removed rather than the page reloaded, and a worker with no owner survives at a few megabytes
		 * each. Nothing else in the system will clean it up.
		 */
		live.delete(this.#restyle);
		this.#runner?.dispose();
		this.#runner = undefined;
		this.#loaded = undefined;
		this.#activation = undefined;
		this.#observer?.disconnect();
		this.#observer = undefined;
		if (this.#debounce) clearTimeout(this.#debounce);
		if (this.#slowTimer) clearTimeout(this.#slowTimer);
	}

	attributeChangedCallback(name: string, before: string | null, after: string | null): void {
		if (before === after || !this.isConnected) return;
		if (name === "tool") {
			this.#activated = false;
			this.#loaded = undefined;
			this.#activation = undefined;
			this.#hostWroteValues = false;
			// A different tool. Keeping the old one's output would show one tool's answer under another's
			// name, which is the one thing worse than showing nothing. The status line goes with it.
			this.#shown = undefined;
			this.#status = "";
			this.#expanded = false;
			this.#uncapped = false;
			this.#ready = this.#prepare();
		} else {
			this.#paint();
		}
	}

	// --- setup ------------------------------------------------------------------------------------

	async #prepare(): Promise<void> {
		const source = config?.source;
		if (!source) return;
		try {
			/*
			 * The manifest is fetched now; the tool's *code* is not. That split is the whole reason a
			 * card can be free: everything needed to draw the interface is data.
			 */
			const manifests = await source.list();
			const manifest = manifests.find((m) => m.id === this.toolId);
			if (!manifest) {
				this.#fatal(`No tool with id "${this.toolId}". Known: ${manifests.map((m) => m.id).join(", ") || "none"}.`);
				return;
			}
			this.#manifest = manifest;
			const defaults = defaultInputs({ manifest });
			/*
			 * A host may have written `values` while `list()` was in flight (queued) or in the gap
			 * after `#manifest` was set but before this assignment (already merged into `#values`).
			 * Resetting to defaults without that overlay would drop a prefill that arrived on time.
			 */
			const overlay: InputValues = { ...this.#queued };
			this.#queued = {};
			if (this.#hostWroteValues) Object.assign(overlay, this.#values);
			// A shared link wins over the page's own prefill: it is the reader's, and it is why they came.
			if (this.#shares) Object.assign(overlay, this.#fromLink(manifest));
			this.#values = applyPartialValues(manifest.inputs, defaults, overlay);
			if (Object.keys(overlay).length > 0) this.#hostWroteValues = true;
			// A prefill that arrived before the manifest follows the same preset rule as one after it.
			this.#follow(Object.keys(overlay));
			// The starting values, prefill included, are what the first `tool-input` is measured against.
			this.#reported = this.#start = JSON.stringify(this.#values);
			this.#startPrefilled = this.#hostWroteValues;
			/*
			 * ⚠️ Before the first paint, and only when this paint is going to draw a chart.
			 *
			 * The chart renderer is its own chunk, about 1.5 KB gzipped that most pages never need. Awaiting
			 * it here is what lets `render` stay synchronous: a seeded card paints a chart in `#paint` with
			 * no chance to await, and every later draw is synchronous too.
			 *
			 * The trigger used to be `kinds`, which says what `run` CAN return. A closed card has not run and
			 * may never run, so every card declaring `series` fetched the chunk for a chart it would not draw
			 * unless opened (#97). A card now asks what its seed contains; activation loads it for everything
			 * else. Embed and page hosts activate as soon as they are visible, so they keep the early start.
			 *
			 * ⚠️ And the load is not fatal. It sat inside this `try`, whose `catch` is `#fatal`, so one missed
			 * request (a purge mid-deploy, an offline reload, a strict CSP) replaced every series-declaring
			 * card on the page with a bundler error before a facade had painted. A card that cannot fetch a
			 * renderer it does not yet need is still a working card; a seed that needed it degrades in
			 * `#paint` to the parts that can be drawn.
			 */
			const needed = this.mode !== "card" ? manifest.kinds.filter(isLazyKind) : [];
			if (needed.length > 0) await loadRenderers(needed).catch(() => undefined);
			// The seed's own needs, a graph's chunks among them: a seed is painted with no chance to load and redraw.
			if (this.#seed) await prepareOutput(this.#seed).catch(() => undefined);
			this.#paint();

			/*
			 * A retired tool is still listed so a bookmarked URL is not a 404. It must not load or
			 * run: that is the whole reason the status exists. The first version ignored it, so a
			 * retired tool fetched its code and ran like any other, a field that claimed the tool
			 * was gone and then did the opposite.
			 */
			if (lifecycleStatus(manifest) === "retired") return;
			if (this.mode === "card") return; // waits for a click; a deprecated card is not a live facade
			this.#watchForViewport();
		} catch (error) {
			this.#fatal(error instanceof Error ? error.message : String(error));
		}
	}

	#watchForViewport(): void {
		const margin = config?.rootMargin ?? "200% 0px";
		if (typeof IntersectionObserver !== "function") {
			void this.#activate();
			return;
		}
		this.#observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					this.#observer?.disconnect();
					this.#observer = undefined;
					void this.#activate();
				}
			},
			{ rootMargin: margin },
		);
		this.#observer.observe(this);
	}

	async #activate(): Promise<void> {
		if (this.#activation) return this.#activation;
		if (this.#loaded && this.#runner) return;
		if (!this.#manifest || !config) return;
		// A retired tool never loads. Guarded here rather than only in #paint so nothing fetches its
		// chunk: the field claims the tool is gone, and downloading it anyway would make that a lie.
		if (lifecycleStatus(this.#manifest) === "retired") return;
		this.#activation = this.#activateBody(config);
		try {
			await this.#activation;
		} finally {
			if (!this.#loaded) this.#activation = undefined;
		}
	}

	async #activateBody(cfg: ToolHostConfig): Promise<void> {
		this.#activated = true;
		/*
		 * ⚠️ The form is not painted until the module is here.
		 *
		 * Painting it first gave a Run button that existed and did nothing, because `#run` has no tool to
		 * call yet — invisible on a fast local load and a real dead control on a slow connection. The
		 * facade stays up, with a loading hint, until there is something behind it.
		 */
		this.#loading = true;
		this.#paint();
		try {
			// Not fatal, for the same reason as in `#prepare`: `#draw` retries if a chart turns up without it.
			const lazyKinds = this.#manifest?.kinds.filter(isLazyKind) ?? [];
			const chart = lazyKinds.length > 0 ? loadRenderers(lazyKinds).catch(() => undefined) : undefined;
			/*
			 * The painted textarea, alongside the tool's code and only when it can be used: a tool declaring
			 * `lang`, and something to paint it with, a host's hook or the tool's own grammar (#163). A failed
			 * fetch leaves the plain textarea, which still works.
			 */
			const paint =
				!painter && this.#manifest?.inputs.some((input) => input.type === "textarea" && input.lang && (cfg.highlight || input.grammar))
					? import("./paint.ts").then((module) => void (painter = module), () => undefined)
					: undefined;
			// With the tool's code, so the button is live when the form appears. A failed fetch leaves it disabled.
			const share = this.#shares ? loadShare().catch(() => undefined) : undefined;
			// The newer inputs' controls (#203). A failed fetch leaves each the plain control the runtime draws itself.
			const native =
				!controls && this.#manifest?.inputs.some((input) => input.type === "color" || input.type === "secret" || (input.type === "select" && input.control === "segmented"))
					? import("./controls.ts").then((module) => void (controls = module), () => undefined)
					: undefined;
			// A multiselect's choices (#204). A failed fetch leaves a native multiple select.
			// A rows input's list (#204), the largest of the input controls, so only for a tool with one.
			const listed =
				!lister && this.#manifest?.inputs.some((input) => input.type === "rows")
					? import("./rows.ts").then((module) => void (lister = module), () => undefined)
					: undefined;
			const lists =
				!picker && this.#manifest?.inputs.some((input) => input.type === "multiselect")
					? import("./choices.ts").then((module) => void (picker = module), () => undefined)
					: undefined;
			this.#loaded = await this.#resolve(cfg);
			await chart;
			await paint;
			await share;
			await native;
			await lists;
			await listed;
			this.#runner = new Runner(cfg.workerFactory ? { workerFactory: cfg.workerFactory } : {});
			this.#loading = false;
			this.#paint();
			/*
			 * ⚠️ Activation does NOT run the tool.
			 *
			 * The first version ran on activation and on every keystroke, and the result was a Run button
			 * that appeared broken: by the time you looked at it, the answer was already there, and
			 * pressing it changed nothing visible. Work nobody asked for, and a control that lies about
			 * being the trigger.
			 *
			 * So the reader decides. A seeded result stays on screen as the starting point, and the tool
			 * runs when Run is pressed — or as the reader types, but only for a tool that opted into
			 * `autoRun` because it is genuinely instant.
			 *
			 * Skip the prompt when a host already prefilled: `#paint` has just marked the seed stale,
			 * and overwriting that with "showing the default result" would lie about whose inputs these
			 * are.
			 *
			 * ⚠️ No prompt at all for a host with nothing on screen. "press Run" sat directly above a button
			 * labelled Run, restating it, and it was the first line every reader met (#99).
			 *
			 * ⚠️ The one exception to "activation does not run": an `autoRun` tool. It has declared itself
			 * instant and has no Run button (#104), so waiting for the reader to touch an input meant an empty
			 * output under a form, with nothing saying why. Its default answer is computed once, here.
			 */
			if (this.#manifest?.autoRun === true) {
				void this.#run({ focusResult: false, quiet: true });
			} else if (!this.#hostWroteValues && this.#seed) {
				this.#say("showing the default result. Press Run to try your own");
			}
		} catch (error) {
			this.#activated = false;
			this.#loading = false;
			this.#showError(error);
		}
	}

	/**
	 * Get whatever this thread actually needs in order to run the tool.
	 *
	 * ⚠️ For a worker-mode tool with a worker available, that is the manifest and nothing else. The
	 * module is imported inside the worker, so importing it here too downloaded and parsed a second
	 * copy that was never called — doubling what a reader pays for every worker-mode tool. A browser
	 * test asserts which of the two chunks gets fetched.
	 */
	async #resolve(cfg: ToolHostConfig): Promise<Runnable> {
		const manifest = this.#manifest as Manifest;
		const runsInWorker = manifest.runtime.thread === "worker" && cfg.workerFactory !== undefined;
		if (runsInWorker) return { manifest };
		return cfg.source.load(manifest.id);
	}

	// --- running ----------------------------------------------------------------------------------

	/**
	 * An input changed. Either run (only if the tool asked for that) or mark what is on screen as no
	 * longer matching the form — which is the honest thing, and it makes Run mean something.
	 */
	#inputChanged(): void {
		if (this.#manifest?.autoRun === true) {
			if (this.#debounce) clearTimeout(this.#debounce);
			const wait = config?.debounceMs ?? 150;
			this.#debounce = setTimeout(() => void this.#run({ focusResult: false }), wait);
			return;
		}
		this.#markStale();
	}

	#markStale(): void {
		const output = this.#els.output;
		if (!output) return;
		// Nothing to go stale before the first run.
		const hasResult = output.children.length > 0;
		// A page that owns the controls owns staleness too (#103): nothing here can say what changed or why.
		if (this.controls === "none" && this.mode !== "card") return;
		output.toggleAttribute("data-stale", hasResult);
		this.#els.run?.toggleAttribute("data-attention", true);
		// Nothing on screen means nothing is stale, and "press Run" would only restate the button (#99).
		this.#say(hasResult ? "inputs changed. Press Run" : "");
	}

	/** `quiet` is for the run activation makes on its own, which is part of opening the tool and reports nothing. */
	async #run(options: { focusResult: boolean; quiet?: boolean }): Promise<void> {
		const loaded = this.#loaded;
		const runner = this.#runner;
		if (!loaded || !runner) return;
		if (this.#manifest && lifecycleStatus(this.#manifest) === "retired") return;
		// Taken now: the reader may type while a worker runs, and the event describes this run, not the form.
		const values = this.values;
		const settled = (ok: boolean, error?: string) => {
			if (!options.quiet) this.#emit("tool-run", { values, ok, ...(error !== undefined ? { error } : {}) });
		};

		const resets = this.#resets;
		this.#hostWroteValues = false;
		this.#els.output?.removeAttribute("data-stale");
		this.#els.run?.removeAttribute("data-attention");
		this.#setBusy(true);
		this.#say("running…");
		try {
			// A value the form cannot hold a reader to, a date out of range say, is refused here, naming its input (#203).
			let refused: Output | undefined;
			for (const spec of this.#manifest?.inputs ?? []) {
				const message = inputProblem(spec, this.#values[spec.id]);
				if (message) {
					refused = { kind: "error", message, input: spec.id };
					break;
				}
			}
			const output =
				refused ??
				(await runner.run(loaded, this.values, {
					onProgress: (fraction, partial) => {
						this.#setProgress(fraction);
						if (partial && resets === this.#resets) this.#draw(partial);
					},
				}));
			if (resets !== this.#resets) return;
			this.#setBusy(false);
			this.#draw(output);
			/*
			 * ⚠️ An error stays on the VISIBLE line; a result only gets announced.
			 *
			 * The split is between "here is what happened, and you can see it" and "here is what happened,
			 * and you need to do something". A summary of a result that is already on screen is metadata and
			 * reads as debug output; an error is the one outcome a reader has to act on, so it says so where
			 * they are looking. Announcing it too would say it twice to a screen reader.
			 */
			if (output.kind === "error") this.#say(summarise(output, this.mode === "card"));
			else this.#announce(summarise(output, this.mode === "card"));
			if (output.kind === "error") {
				// The field's name first, unless the message already starts with it, as the runtime's own refusals do;
				// and the row a tool names in a rows input (#204), its index from 0 and its words from 1.
				const label = this.#manifest?.inputs.find((spec) => spec.id === output.input)?.label ?? "";
				const name = output.row !== undefined ? `${label}, row ${output.row + 1}` : label;
				this.#markInvalid(output.input, output.message.startsWith(label) ? output.message : `${name}: ${output.message}`, output.row);
			} else this.#markInvalid(undefined);
			if (options.focusResult) this.#els.output?.focus();
			settled(output.kind !== "error", output.kind === "error" ? output.message : undefined);
		} catch (error) {
			if (isSuperseded(error) || resets !== this.#resets) return; // a newer run, or a reset, owns the UI
			this.#setBusy(false);
			settled(false, this.#showError(error));
		}
	}

	/** Draws the failure and returns its message, which is also what `tool-run` reports. */
	#showError(error: unknown): string {
		if (!this.#els.output) {
			// Activation itself failed, so there is no result area yet: the whole element becomes the
			// message. Better than a facade that silently never opens.
			const message = error instanceof Error ? error.message : String(error);
			this.#fatal(message);
			return message;
		}
		/*
		 * A tool crashing, a worker failing to start and a timeout are three different problems, and a
		 * reader who cannot tell them apart cannot do anything useful about any of them.
		 */
		const message =
			error instanceof ToolTimeoutError
				? error.message
				: error instanceof WorkerUnavailableError
					? error.message
					: error instanceof ToolCrashError
						? `This tool hit a bug and stopped: ${error.message}`
						: error instanceof Error
							? error.message
							: String(error);
		this.#draw({ kind: "error", message });
		this.#say(`error: ${message}`);
		if (error instanceof ToolCrashError && error.toolStack) console.error(error.toolStack);
		return message;
	}

	#emit(type: keyof ToolHostEvents, detail: ToolHostEvents[typeof type]["detail"]): void {
		this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
	}

	/**
	 * Dispatch `tool-input` if the values differ from the last ones reported. Called last by every path that
	 * writes them, so a listener reading the form or the status line finds them already updated.
	 */
	#changed(): void {
		const now = JSON.stringify(this.#values);
		this.#showReset(now);
		if (now === this.#reported) return;
		this.#reported = now;
		this.#emit("tool-input", { values: this.values });
	}

	/**
	 * Hidden while the values are the starting ones, so it is never a button that does nothing.
	 *
	 * ⚠️ Toggled, never inserted, and only when it changes. Chrome ends an undo group at a node insertion
	 * anywhere in the document (the defect register's "one undo took back one character"), so a button added
	 * on the first keystroke and removed when the values came back would split the reader's typing into
	 * separate undo steps.
	 */
	#showReset(now = JSON.stringify(this.#values)): void {
		const reset = this.#els.reset;
		if (reset && reset.hidden !== (now === this.#start)) reset.hidden = !reset.hidden;
	}

	/**
	 * Back to the first-load state (#208): the starting values in every control, the result cleared, the seed
	 * back if there was one, and an `autoRun` tool's default answer computed again, because that is what the
	 * reader first saw.
	 */
	#doReset(): void {
		this.#resets++;
		if (this.#debounce) clearTimeout(this.#debounce);
		this.#setBusy(false);
		this.#values = JSON.parse(this.#start) as InputValues;
		this.#syncControls();
		this.#hostWroteValues = this.#startPrefilled;
		this.#shown = undefined;
		this.#expanded = this.#uncapped = false;
		const output = this.#els.output;
		output?.removeAttribute("data-stale");
		this.#els.run?.removeAttribute("data-attention");
		output?.replaceChildren();
		this.#markInvalid(undefined);
		if (this.#seed) {
			this.#draw(this.#seed);
			this.#shown = undefined;
			if (this.#startPrefilled) this.#markStale();
		}
		this.#say("inputs reset to their starting values");
		// The button has just hidden itself, and focus on a hidden button falls to the page. A segmented
		// select's group cannot take focus, so its chosen radio does.
		const first = this.#controls.values().next().value;
		(first?.querySelector<HTMLElement>(":checked") ?? first)?.focus();
		this.#changed();
		this.#emit("tool-reset", { values: this.values });
		if (this.#manifest?.autoRun === true) void this.#run({ focusResult: false });
	}

	// --- painting ---------------------------------------------------------------------------------

	#paint(): void {
		const manifest = this.#manifest;
		if (!manifest) return;
		this.#reflectStatus(manifest);
		if (lifecycleStatus(manifest) === "retired") {
			this.#paintRetired(manifest);
			return;
		}
		const mode = this.mode;
		const compact = mode === "card";
		const pageUrl = config?.pageUrl?.(manifest.id);
		const life = lifecycleStatus(manifest);

		const body = el("div", { class: "tb-body" });
		const frame = el("div", { class: "tb" });
		/*
		 * Only on the active form: a facade has nothing to share yet, and its values are not the reader's. The
		 * chunk draws the button, and activation waits for it, so the button is never one with nothing behind
		 * it. If it could not be fetched there is no button; turned on after activation, it fetches and repaints.
		 */
		const sharing = this.#activated && !this.#loading && this.#shares;
		if (sharing && !sharer) void loadShare().then(() => this.#paint(), () => undefined);
		const shareBar = sharing ? sharer?.shareBar(this, manifest, () => this.#values, config as ToolHostConfig, () => this.#els.announce) : undefined;
		const position = this.getAttribute("share-position");
		const atTop = shareBar && (position === "top" || position === "actions" ? position : (config?.sharePosition ?? (mode === "page" ? "top" : "actions"))) === "top";
		const title = titleRow(manifest, compact, pageUrl);

		if (mode !== "embed") {
			frame.append(
				el(
					"div",
					{ class: "tb-head" },
					atTop ? el("div", { class: "tb-share-top" }, title, shareBar) : title,
					mode === "page" ? el("p", { class: "tb-blurb" }, manifest.blurb) : null,
				),
			);
		} else if (atTop) {
			body.append(el("div", { class: "tb-share-top" }, shareBar));
		}

		if (!this.#activated || this.#loading) {
			/*
			 * The facade: static, and clickable only for a live card. A deprecated tool still runs on its
			 * page, but a compact slot that opens it presents it as current, which is the thing status
			 * exists to prevent.
			 */
			const deprecatedCard = compact && life === "deprecated";
			// One string for the visible hint and the accessible name, so they cannot drift apart.
			const hint = this.#seed ? "Try it" : "Open this tool";
			const liveCard = compact && !this.#loading && !deprecatedCard;
			/*
			 * ⚠️ On a live card the hint IS the control, and the card around it is ordinary content (#98, #105).
			 *
			 * The whole card used to be one <button> named with aria-label. aria-label replaces an element's
			 * contents as its accessible name, so a screen reader heard "Try it: Queue explorer, button" and
			 * never reached the blurb or the seeded answer, the part of a closed card worth hearing. The same
			 * shape failed three axe rules: the name could never contain all the visible text inside it
			 * (2.5.3), the seeded chart's "Show the data as a table" <summary> was a focusable control nested
			 * in a button (4.1.2), and that summary was 19px tall (2.5.8). No wording fixes a button that
			 * wraps a paragraph; not wrapping it does.
			 *
			 * The name starts with the visible text, "Try it", so a speech-input user saying it still matches,
			 * which was the point of the previous fix. A click anywhere else on the card still opens it: see
			 * the handler below.
			 */
			const hintEl = liveCard
				? el("button", { class: "tb-facade-hint", type: "button", "aria-label": `${hint}: ${manifest.name}` }, hint)
				: el("span", { class: "tb-facade-hint" }, this.#loading ? "loading…" : hint);
			const preview = el(
				"div",
				{ class: "tb-body" },
				mode === "page" ? null : el("p", { class: "tb-blurb" }, manifest.blurb),
				mode === "embed" ? lifecycleMark(life) : null,
				this.#seed
					? renderOrDegrade(
							this.#seed,
							withHostHighlight(this, {
								compact,
								// No Copy either: nothing here can announce whether it worked, and the preview's job is to open.
								copy: false,
								/*
								 * No `more` here on purpose. This is the facade, and in card mode the whole preview
								 * is inside a button: a disclosure button nested in it would be invalid and would
								 * activate the card instead of expanding. A closed card's job is to open.
								 */
								...(this.#partsCap !== undefined ? { cardParts: this.#partsCap } : {}),
								...(manifest.cardFields !== undefined ? { cardFields: manifest.cardFields } : {}),
							}),
						)
					: null,
				deprecatedCard ? null : hintEl,
			);
			if (liveCard) {
				const card = el("div", { class: "tb-facade" });
				card.append(preview);
				/*
				 * A click anywhere on the card opens it, as it always has, except one that lands on a control
				 * of its own: the seeded chart's data-table disclosure, a link in a result. Those do what they
				 * say. The hint button's own click bubbles here, which is how it opens the card too.
				 */
				card.addEventListener("click", (event) => {
					const target = event.target as Element | null;
					const control = target?.closest?.("a, button, summary, input, select, textarea, label");
					if (control && !control.classList.contains("tb-facade-hint")) return;
					void this.#activate();
				});
				frame.append(card);
			} else {
				frame.append(preview);
				if (deprecatedCard && pageUrl) {
					frame.append(el("div", { class: "tb-foot" }, el("a", { href: pageUrl }, "Open the full tool")));
				}
			}
			fill(this.#root, frame);
			this.#reapplyStyles();
			return;
		}

		// Active: the form, the actions, the status line, the output.
		const inputs = compact ? primaryOnly(manifest.inputs) : manifest.inputs;
		const form = el("fieldset", { class: "tb-form" });
		this.#controls.clear();
		this.#sliders.clear();
		this.#painters.clear();
		this.#marks.clear();
		for (const spec of inputs) form.append(this.#control(spec));

		const run = el("button", { class: "tb-run", type: "button" }, "Run");
		/*
		 * ⚠️ Focus moves to the answer only for a keyboard press. Focusing the output scrolls it into view,
		 * and a reader who clicked Run is looking at the button: the page jumped 773px on every click,
		 * including clicks that recomputed the same answer (#101). A click produced by Enter or Space on a
		 * button has `detail` 0, which is how the two are told apart.
		 */
		run.addEventListener("click", (event) => void this.#run({ focusResult: event.detail === 0 }));
		// Hidden until a run outlasts SLOW_MS. A bar that flashes for 20 ms is noise.
		const progress = el("div", { class: "tb-progress", "aria-hidden": "true", hidden: true }, el("i", { style: "width:0%" }));
		/*
		 * Seeded with the last line, so a repaint keeps its explanation. Without it, a redrawn seed loses
		 * the "showing the default result" label and becomes the silent revert this was meant to fix.
		 *
		 * ⚠️ Set here, at creation, and not after `fill`. A live region announces when its content changes
		 * while it is in the document, so assigning the same text afterwards would have a screen reader
		 * re-read the line every time a host touched an attribute. Content present before insertion is not
		 * announced, which is the behaviour wanted: restore it silently, announce only what is new.
		 */
		const status = el("p", { class: "tb-status", role: "status", "aria-live": "polite" }, this.#status);
		/*
		 * ⚠️ A second live region, and this one is never seen.
		 *
		 * A result summary, "6 fields, chart, 2 series, table, 5 rows", is exactly what a screen reader needs
		 * and exactly what a sighted reader does not: it rendered above the result as a line of metadata that
		 * reads like debug output, describing something already on screen. Announcing it here and leaving the
		 * visible line for what a reader can act on, "press Run", "inputs changed", an error, keeps both
		 * audiences served without either paying for the other.
		 */
		const announce = el("p", { class: "tb-announce tb-sr", role: "status", "aria-live": "polite" });
		const output = el("div", { class: "tb-output", tabindex: "-1" });
		/*
		 * One delegated listener for the disclosure, attached to the output area rather than to the button.
		 * The button is rebuilt by every draw, so wiring it per render would mean re-attaching on every run;
		 * the container outlives them all.
		 *
		 * ⚠️ The guarantee is "never re-RUN", not "never re-render", and the first version confused the two.
		 *
		 * It toggled `hidden` in place, to keep focus on the button. That stopped working the moment the
		 * disclosure took over the whole truncation: expanding now also renders the visible parts
		 * uncompacted, so their markup genuinely differs between the two states and cannot be reached by
		 * flipping an attribute. Redrawing from `#shown` costs nothing that matters, because `#shown` is an
		 * output already in hand: the tool is not consulted.
		 *
		 * Focus is then restored by hand. That is the part a reader would notice if it were forgotten: press
		 * the button, and without this the redraw drops focus to the shadow root and their place in the
		 * article with it.
		 */
		output.addEventListener("click", (event) => {
			const button = (event.target as Element | null)?.closest?.(".tb-disclose");
			if (!(button instanceof HTMLButtonElement) || this.#shown === undefined) return;
			this.#expanded = button.getAttribute("aria-expanded") !== "true";
			this.#draw(this.#shown);
			const next = output.querySelector(".tb-disclose");
			if (next instanceof HTMLButtonElement) next.focus();
		});
		/*
		 * A Copy button's outcome (#155), said in the unseen region: the note beside the button is what a
		 * sighted reader sees, and it is aria-hidden so this is not heard twice. Written directly rather than
		 * through `#announce`, which also clears the visible line, and copying does not answer "inputs changed".
		 *
		 * ⚠️ Emptied first, then written a frame later. A second copy would otherwise write the same "Copied"
		 * into the region, which is not a change, and a screen reader would say nothing the second time.
		 */
		output.addEventListener("tb-copy", (event) => {
			const { message } = (event as CustomEvent<{ message: string }>).detail;
			announce.textContent = "";
			setTimeout(() => (announce.textContent = message), 50);
		});

		/*
		 * Always built when allowed, and hidden rather than left out, for the undo reason in `#showReset`. Its
		 * accessible name starts with the visible word, so a speech-input user saying "Reset" still matches.
		 */
		// The tool's own opt-out (#208) is the host's `reset="none"` said in the manifest: no button at all.
		const reset =
			this.reset === "none" || manifest.reset === false
				? undefined
				: el("button", { class: "tb-reset", type: "button", "aria-label": "Reset inputs to their starting values", hidden: JSON.stringify(this.#values) === this.#start }, "Reset");
		reset?.addEventListener("click", () => this.#doReset());
		this.#els = { run, progress, status, announce, output, ...(reset ? { reset } : {}) };
		const embedMark = mode === "embed" ? lifecycleMark(lifecycleStatus(manifest)) : null;
		if (embedMark) body.append(embedMark);
		/*
		 * Samples are not on a card. A card has room for one input and a Run button, and a row of buttons
		 * would crowd out the result the card exists to show.
		 */
		const samples = manifest.samples ?? [];
		/*
		 * No Run button for an `autoRun` tool: every change already recomputes, so the button could only
		 * re-run unchanged inputs, and "press Run" described a mode the tool is not in (#104). The progress
		 * bar stays, for the rare slow run.
		 */
		const autoRun = manifest.autoRun === true;
		const inRow = atTop ? undefined : shareBar;
		const actions = autoRun && !reset && !inRow ? progress : el("div", { class: "tb-actions" }, autoRun ? null : run, reset ?? null, progress, inRow ?? null);
		/*
		 * `controls="none"` and `layout="answer-first"` (#103), neither of which a card honours: a card has
		 * not been opened, and is answer-forward already.
		 *
		 * With no controls there is no actions row and no status line either: the page owns when a run
		 * happens, and "inputs changed" belongs to whoever owns the control that made the answer stale.
		 * The announcer stays, since a screen reader still needs to hear that a result arrived.
		 */
		const owned = !compact && this.controls === "none";
		const answerFirst = !compact && this.layout === "answer-first";
		const controlParts: HTMLElement[] = owned ? [progress] : [form, ...(samples.length > 0 && !compact ? [this.#sampleRow(samples)] : []), actions];
		const answerParts: HTMLElement[] = owned ? [announce, output] : [status, announce, output];
		body.append(...(answerFirst ? [...answerParts, ...controlParts] : [...controlParts, ...answerParts]));
		frame.append(body);

		const links = this.links;
		if (links === "all" && (manifest.links?.length ?? 0) > 0) {
			frame.append(el("div", { class: "tb-foot" }, ...(manifest.links ?? []).map(linkTo)));
		} else if (links === "page" && pageUrl) {
			frame.append(el("div", { class: "tb-foot" }, el("a", { href: pageUrl }, "Open the full tool")));
		}

		fill(this.#root, frame);
		this.#reapplyStyles();
		/*
		 * Whatever was on screen goes back on screen. The seed is only the starting point for a host that
		 * has never run: once there is a real result, a partial or an error, redrawing the seed instead
		 * would replace the reader's answer with the defaults' and say nothing about it.
		 */
		const fromSeed = this.#shown === undefined;
		const redraw = this.#shown ?? this.#seed;
		if (redraw) this.#draw(redraw);
		/*
		 * `#draw` records what it drew, and the seed must not count. Otherwise the first paint of a seeded
		 * host makes `#shown` non-empty, and every later check of "has this host ever produced a result"
		 * answers yes when the reader has not pressed anything.
		 */
		if (fromSeed) this.#shown = undefined;
		/*
		 * A host that prefilled before the form existed has just had that seed drawn. The seed is
		 * the defaults' result, not the prefilled inputs', so it is already stale. Mark it the
		 * same way a keystroke would, now that the result area exists to carry the mark.
		 *
		 * Only for the seed. A result the reader ran is not stale just because the element repainted,
		 * and marking it would claim the form had changed when only an attribute did.
		 */
		if (this.#hostWroteValues && fromSeed) this.#markStale();
	}

	#reapplyStyles(): void {
		/*
		 * `fill` on the shadow root clears an appended <style> fallback, and adopted sheets survive it. Run
		 * unconditionally: a host may have replaced the adopted list since the last paint, and the old guard,
		 * "only while the list is empty", read a host's sheet as ours and drew the tool unstyled.
		 */
		applyStyles(this.#root);
		applyHostStyles(this.#root, hostSheetsFor(config?.styles, this.toolId));
	}

	#reflectStatus(manifest: Manifest): void {
		const status = lifecycleStatus(manifest);
		if (status === "live") this.removeAttribute("data-status");
		else this.setAttribute("data-status", status);
	}

	#paintRetired(manifest: Manifest): void {
		this.#els = {};
		this.#activated = false;
		this.#loading = false;
		const mode = this.mode;
		const compact = mode === "card";
		const pageUrl = config?.pageUrl?.(manifest.id);
		const links = manifest.links ?? [];
		const frame = el("div", { class: "tb" });
		if (mode !== "embed") {
			frame.append(
				el(
					"div",
					{ class: "tb-head" },
					titleRow(manifest, compact, pageUrl),
					mode === "page" ? el("p", { class: "tb-blurb" }, manifest.blurb) : null,
				),
			);
		}
		const explanation =
			links.length > 0
				? "This tool has been retired and no longer runs. The links below are the way onward."
				: "This tool has been retired and no longer runs.";
		frame.append(
			el(
				"div",
				{ class: "tb-body" },
				mode === "page" ? null : el("p", { class: "tb-blurb" }, manifest.blurb),
				mode === "embed" ? lifecycleMark("retired") : null,
				el("p", { class: "tb-retired", role: "status" }, explanation),
			),
		);
		if (links.length > 0) {
			frame.append(
				el("div", { class: "tb-foot" }, ...links.map(linkTo)),
			);
		}
		fill(this.#root, frame);
		this.#reapplyStyles();
	}

	#control(spec: InputSpec): HTMLElement {
		const id = `in-${spec.id}`;
		const describedBy: string[] = [];
		// A segmented select is a group of radios (#203): a fieldset captioned by its legend, not one labelled
		// control. Without the controls chunk it is the dropdown, which is what an older runtime draws.
		// A multiselect's choices are a group in the same way (#204); without their chunk, a multiple select.
		const segmented = (spec.type === "select" && spec.control === "segmented" && controls !== undefined) || (spec.type === "multiselect" && picker !== undefined) || (spec.type === "rows" && lister !== undefined);
		const label = el(segmented ? "legend" : "label", { class: "tb-label", for: segmented ? undefined : id, id: `${id}-label` }, spec.label, spec.unit ? el("span", { class: "tb-unit" }, ` (${spec.unit})`) : null);
		// Names for a host sheet (#224), as a result part has data-kind and data-role: one input, one type, or a role.
		const row = el(segmented ? "fieldset" : "div", { class: "tb-field-row", "data-input": spec.id, "data-type": spec.type, "data-role": spec.role || undefined });
		// "3 selected, at most 4" under a list (#204): described by, so the bounds are heard with the group.
		const count = spec.type === "multiselect" || spec.type === "rows" ? el("p", { class: "tb-count", id: `${id}-count` }) : null;
		const desc = spec.description ? help(spec.description, { class: "tb-desc", id: `${id}-desc` }) : null;
		/*
		 * The rest of the help (#215), behind a native disclosure: keyboard, state and announcement are the
		 * browser's. Not in aria-describedby, so focus reads the short hint, not 600 characters. The hidden
		 * words name the input, or every input's disclosure would be called just "More".
		 */
		const more = spec.details
			? el("details", { class: "tb-details" }, el("summary", {}, "More", el("span", { class: "tb-sr" }, ` about ${spec.label}`)), help(spec.details, { class: "tb-details-body" }))
			: null;
		if (desc) describedBy.push(`${id}-desc`);
		if (count) describedBy.push(count.id);
		const errorId = `${id}-err`;

		let control: HTMLElement;
		// What goes in the row when it is not the control itself: a painted textarea's wrapper.
		let placed: HTMLElement | undefined;
		switch (spec.type) {
			case "textarea": {
				const area = el("textarea", {
					class: "tb-textarea",
					id,
					rows: spec.rows ?? 3,
					spellcheck: "false",
					autocapitalize: "off",
					autocomplete: "off",
					dir: spec.dir ?? "auto",
					...(spec.maxLength !== undefined ? { maxlength: spec.maxLength } : {}),
				});
				area.value = String(this.#values[spec.id] ?? spec.default);
				area.addEventListener("input", () => {
					this.#values[spec.id] = area.value;
					this.#edited(spec.id);
				});
				control = area;
				// Painted only when the tool names a language and there is a highlighter or a grammar for it; otherwise plain.
				const highlight = config?.highlight;
				if (spec.lang && (highlight || spec.grammar) && painter) {
					const painted = painter.paintTextarea(area, spec.lang, highlight, spec.grammar);
					placed = painted.wrap;
					this.#painters.set(spec.id, painted.paint);
				}
				break;
			}
			case "select": {
				const choose = (value: string) => {
					this.#values[spec.id] = value;
					// A preset fills the form exactly as a sample does: same write, same stale result, same line.
					const option = spec.options.find((o) => o.value === value);
					if (option?.sets) this.#fill(option.label, option.sets);
					else this.#edited(spec.id);
				};
				if (segmented && controls) {
					/*
					 * The group is the registered control (#203): it carries the description and `aria-invalid`,
					 * and Enter on one of its radios bubbles to it and runs.
					 */
					control = el("div", { class: "tb-seg", id, role: "radiogroup", "aria-labelledby": `${id}-label` });
					this.#painters.set(spec.id, controls.segments(control, spec.options, id, () => String(this.#values[spec.id]), choose));
					break;
				}
				const select = el("select", { class: "tb-select", id });
				for (const option of spec.options) {
					const o = el("option", { value: option.value }, option.label);
					if (option.value === String(this.#values[spec.id] ?? spec.default)) o.selected = true;
					select.append(o);
				}
				select.addEventListener("change", () => choose(select.value));
				control = select;
				break;
			}
			case "toggle": {
				const box = el("input", { class: "tb-checkbox", id, type: "checkbox" });
				box.checked = Boolean(this.#values[spec.id] ?? spec.default);
				box.addEventListener("change", () => {
					this.#values[spec.id] = box.checked;
					this.#edited(spec.id);
				});
				control = box;
				break;
			}
			case "multiselect": {
				const choose = (next: string[]) => {
					this.#values[spec.id] = next;
					this.#edited(spec.id);
				};
				const chosen = () => this.#values[spec.id] as string[];
				if (picker && count) {
					// The group is the registered control, as a segmented select's is: description, aria-invalid, Enter to run.
					control = el("div", { id, role: "group", "aria-labelledby": `${id}-label` });
					this.#painters.set(spec.id, picker.choices(control, spec, count, chosen, choose));
					break;
				}
				// Without the chunk: the browser's own list, which still chooses several and says how many are allowed.
				const list = el("select", { class: "tb-select", id, multiple: true, size: Math.min(spec.options.length, 6) });
				for (const option of spec.options) list.append(el("option", { value: option.value }, option.label));
				const show = () => {
					for (const option of list.options) option.selected = chosen().includes(option.value);
					if (count) count.textContent = `${chosen().length} selected`;
				};
				list.addEventListener("change", () => choose(coerce(spec, [...list.selectedOptions].map((o) => o.value)) as string[]));
				show();
				this.#painters.set(spec.id, show);
				control = list;
				break;
			}
			case "rows": {
				if (lister && count) {
					control = el("div", { id, role: "group", "aria-labelledby": `${id}-label` });
					const view = lister.rows(control, spec, id, count, () => this.#values[spec.id] as Row[], (next) => {
						this.#values[spec.id] = next;
						this.#edited(spec.id);
					}, (message) => {
						// Emptied, then written a frame later, so the same sentence twice is announced twice.
						const region = this.#els.announce;
						if (!region) return;
						region.textContent = "";
						setTimeout(() => (region.textContent = message), 50);
					});
					this.#painters.set(spec.id, view.sync);
					this.#marks.set(spec.id, view.mark);
					break;
				}
				// Without the chunk there is no list to edit, and saying so beats a form that silently runs on the default.
				control = el("p", { class: "tb-desc", id }, "This list could not be loaded, so the tool runs with its starting rows. Reload the page to edit them.");
				break;
			}
			case "number": {
				const input = el("input", {
					class: "tb-input",
					id,
					type: "number",
					min: spec.min,
					max: spec.max,
					...(spec.step !== undefined ? { step: spec.step } : {}),
					inputmode: "decimal",
					dir: "ltr",
				});
				input.value = String(this.#values[spec.id] ?? spec.default);
				input.addEventListener("input", () => {
					// Clamped here, not in the tool: min and max are the only guard against an input
					// that turns a bounded computation into an unbounded one.
					this.#values[spec.id] = coerce(spec, input.value);
					const slider = this.#sliders.get(spec.id);
					if (slider) slider.value = String(this.#values[spec.id]);
					this.#edited(spec.id);
				});
				control = input;
				/*
				 * A slider for a value read by sweeping it (#102), and a native one: `<input type="range">` is
				 * arrow-key operable and announces its value, which a custom track would have to rebuild. The
				 * number box stays, editable and registered as THE control, so exact entry, Enter to run,
				 * samples and error marking all work exactly as they do without a slider. The two share a
				 * label and follow each other; the box is the visible value, so a reader can always report it.
				 */
				if (spec.control === "slider") {
					const slider = el("input", {
						class: "tb-slider",
						type: "range",
						min: spec.min,
						max: spec.max,
						...(spec.step !== undefined ? { step: spec.step } : {}),
						"aria-labelledby": `${id}-label`,
					});
					slider.value = input.value;
					slider.addEventListener("input", () => {
						this.#values[spec.id] = coerce(spec, slider.value);
						input.value = String(this.#values[spec.id]);
						this.#edited(spec.id);
					});
					this.#sliders.set(spec.id, slider);
				}
				break;
			}
			default: {
				/*
				 * A date (#203) is the browser's own picker, dark on a dark page because `color-scheme` is inherited.
				 * It lets a reader type a day outside min..max and empties itself while a date is half typed, so the
				 * value is checked before `run`, by `inputProblem`, rather than trusted.
				 */
				const input = el(
					"input",
					spec.type === "date"
						? { class: "tb-input", id, type: spec.mode === "datetime" ? "datetime-local" : (spec.mode ?? "date"), min: spec.min, max: spec.max, dir: "ltr" }
						: {
								class: "tb-input",
								id,
								type: spec.type === "secret" ? "password" : "text",
								spellcheck: "false",
								autocapitalize: "off",
								autocomplete: "off",
								dir: spec.type === "text" ? (spec.dir ?? "auto") : "ltr",
								maxlength: spec.type === "color" ? 7 : spec.maxLength,
							},
				);
				input.value = String(this.#values[spec.id]);
				input.addEventListener("input", () => {
					// A colour is lowercased and trimmed, so `run` gets #rrggbb however it was typed.
					this.#values[spec.id] = coerce(spec, input.value);
					this.#edited(spec.id);
				});
				control = input;
				/*
				 * A colour's hex box is the labelled control, and the native swatch beside it a shortcut to the system
				 * picker (#203), from the controls chunk. Without it the box alone still takes a colour.
				 */
				if (spec.type === "color" && controls) {
					const swatch = controls.swatch(input, spec.label, () => String(this.#values[spec.id]), (value) => {
						this.#values[spec.id] = value;
						this.#edited(spec.id);
					});
					placed = swatch.row;
					this.#painters.set(spec.id, swatch.sync);
				}
				// A secret's eye (#203), from the same chunk. Without it, the password field alone.
				if (spec.type === "secret" && controls) placed = controls.eye(input, spec.label);
				break;
			}
		}

		/*
		 * Enter runs from a single-line control; a textarea needs a modifier, because Enter there is a
		 * newline. Without this, a keyboard user has to tab past every remaining input to reach Run.
		 */
		control.addEventListener("keydown", (event) => {
			const key = event as KeyboardEvent;
			if (key.key !== "Enter") return;
			const needsModifier = spec.type === "textarea";
			if (needsModifier && !(key.metaKey || key.ctrlKey)) return;
			key.preventDefault();
			void this.#run({ focusResult: true });
		});

		control.setAttribute("aria-describedby", [...describedBy, errorId].join(" "));
		this.#controls.set(spec.id, control);

		if (spec.type === "toggle") {
			row.append(el("div", { class: "tb-toggle-row" }, control, label));
			if (desc) row.append(desc);
			if (more) row.append(more);
		} else {
			const slider = this.#sliders.get(spec.id);
			row.append(label, slider ? el("div", { class: "tb-slider-row" }, slider, control) : (placed ?? control));
			if (desc) row.append(desc);
			if (more) row.append(more);
		}
		// A rows input keeps its count beside Add, inside the list.
		if (count && !count.parentNode) row.append(count);
		// The per-input error slot: unseen and empty until an error names this input, then the visible message (#204).
		row.append(el("p", { class: "tb-sr", id: errorId }));
		return row;
	}

	/**
	 * The examples row.
	 *
	 * Under the whole form rather than under one input. A sample may set several values, and a row
	 * sitting beneath one control claims to fill that control while quietly changing another further
	 * down the form.
	 */
	#sampleRow(samples: Sample[]): HTMLElement {
		const labelId = "tb-samples-label";
		// A visible "Try:" doubling as the group's accessible name, rather than an aria-label repeating
		// it invisibly and drifting from it the first time either changes.
		const row = el("div", { class: "tb-samples", role: "group", "aria-labelledby": labelId });
		row.append(el("span", { class: "tb-samples-label", id: labelId }, "Try:"));
		for (const sample of samples) {
			const button = el("button", { class: "tb-sample", type: "button" }, sample.label);
			button.addEventListener("click", () => this.#fill(sample.label, sample.input));
			row.append(button);
		}
		return row;
	}

	/**
	 * Fill the form from a sample, or from a preset on a select (#151), which is the same act.
	 *
	 * Deliberately the same path a keystroke takes: values in, controls updated, then `#inputChanged`.
	 * So a normal tool marks its result stale and an `autoRun` tool re-runs, which is what "a sample
	 * behaves exactly as typing does" has to mean. Treating it as the one input change that never runs
	 * would make it an exception to the rule it follows.
	 *
	 * ⚠️ Every input the sample names is applied, including one a compact card would not have rendered.
	 * That is safe only because the row is never drawn on a card: applying to visible controls alone
	 * would fill the form differently from how the sample reads, and applying invisibly would leave the
	 * form describing something other than what Run will use. Relaxing the card rule means resolving
	 * that first.
	 */
	#fill(label: string, partial: InputValues): void {
		this.#values = applyPartialValues(this.#manifest?.inputs ?? [], this.#values, partial);
		const note = this.#follow(Object.keys(partial));
		this.#syncControls();
		/*
		 * It is tempting to clear `aria-invalid` here, on the control the last error named. Deliberately
		 * not done: typing does not clear it either, and the error is still on screen, dimmed as stale.
		 * Clearing the marker without removing the message would leave the screen and the screen reader
		 * disagreeing about whether there is an error, and it would make a sample the one input change
		 * that behaves differently from the rest. The next run replaces the result and the marker
		 * together.
		 */
		this.#inputChanged();
		/*
		 * `#markStale` has just said "inputs changed. Press Run". Naming the sample is more use than
		 * that, and it is the only confirmation a screen-reader user gets that the click did anything. An
		 * `autoRun` tool is already announcing its own run, so leave that one alone.
		 */
		if (this.#manifest?.autoRun !== true) this.#say(`filled with "${label}"${note}. Press Run`);
		this.#changed();
	}

	/**
	 * A reader changed one control. Any preset select that names it follows the form, and says so.
	 *
	 * The announcement is the point: a control the reader did not touch has just changed value, and the
	 * status line is the only way a screen-reader user hears that.
	 */
	#edited(id: string): void {
		const note = this.#follow([id]);
		if (note) this.#syncControls();
		this.#inputChanged();
		if (note) this.#say(note.slice(2) + (this.#els.output?.hasAttribute("data-stale") ? ". Press Run" : ""));
		this.#changed();
	}

	/**
	 * Point each preset select at the option the form now matches (#151), after `changed` were written.
	 *
	 * The select is derived from the values rather than remembered, so it cannot drift from them whichever
	 * path wrote them: typing, a sample, or the host. Remembering instead, and switching to "Custom" only on
	 * a keystroke, was mocked up first and a sample walked straight past it, leaving "Library A" above
	 * values that were not Library A's.
	 *
	 * Rules, in order: a select named in `changed` was written on purpose and is left alone, which is how
	 * a host writes literal values; a select is only reconsidered when `changed` touches an input its
	 * presets name, so editing an unrelated field never moves it; the current option stays if it still
	 * matches, which settles a preset whose values another preset's include; otherwise the first matching
	 * preset, then the first option with no `sets`, otherwise unchanged.
	 *
	 * Returns what changed as `; Library now shows "Custom"`, for the caller to put in the status line.
	 */
	#follow(changed: string[]): string {
		let note = "";
		for (const spec of this.#manifest?.inputs ?? []) {
			if (spec.type !== "select" || changed.includes(spec.id)) continue;
			const presets = spec.options.filter((o) => o.sets && changed.some((key) => key in (o.sets as InputValues)));
			if (presets.length === 0) continue;
			// By value, since a preset may write a list (#204), and two equal lists are never the same array.
			const matches = (o: SelectOption) => o.sets !== undefined && Object.entries(o.sets).every(([key, value]) => JSON.stringify(this.#values[key]) === JSON.stringify(value));
			const current = spec.options.find((o) => o.value === this.#values[spec.id]);
			if (current && (matches(current) || (!current.sets && !spec.options.some(matches)))) continue;
			const next = spec.options.find(matches) ?? spec.options.find((o) => !o.sets);
			if (!next) continue;
			this.#values[spec.id] = next.value;
			note += `; ${spec.label} now shows "${next.label}"`;
		}
		return note;
	}

	/**
	 * Apply a host-set partial. Same write path as a sample, then stale, never a run.
	 *
	 * Typing on an `autoRun` tool would debounce-run. A host example button must not: `run()` is
	 * how the host says it wanted that. Sharing `#inputChanged` here would make `values` a hidden
	 * trigger on every instant tool.
	 */
	#applyHostValues(partial: InputValues): void {
		this.#values = applyPartialValues(this.#manifest?.inputs ?? [], this.#values, partial);
		// A preset select the host did not name follows the values it did; one it named is taken literally.
		const note = this.#follow(Object.keys(partial));
		this.#syncControls();
		this.#hostWroteValues = true;
		if (this.#els.output) this.#markStale();
		if (note) this.#say(note.slice(2));
		this.#changed();
	}

	#syncControls(): void {
		for (const spec of this.#manifest?.inputs ?? []) {
			const control = this.#controls.get(spec.id);
			if (!control) continue;
			const next = this.#values[spec.id];
			if (spec.type === "toggle") (control as HTMLInputElement).checked = Boolean(next);
			// A segmented select's group has no value of its own; its painter checks the radio.
			else if ("value" in control) (control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = String(next ?? "");
			const slider = this.#sliders.get(spec.id);
			if (slider) slider.value = String(next ?? "");
			// Assigning `value` fires no input event, so a painted textarea is repainted here or not at all.
			this.#painters.get(spec.id)?.();
		}
	}

	// --- output plumbing --------------------------------------------------------------------------

	#draw(output: Output): void {
		const target = this.#els.output;
		if (!target) return;
		// Recorded before the render, so a kind this build cannot draw still survives a repaint as the
		// same "this build cannot draw it" message rather than silently becoming the seed.
		this.#shown = output;
		const manifest = this.#manifest;
		const compact = this.mode === "card";
		try {
			fill(
				target,
				render(
					output,
					withHostHighlight(this, {
						compact,
						...(this.#partsCap !== undefined && !this.#uncapped ? { cardParts: this.#partsCap } : {}),
						...(this.more === "expand" ? { more: "expand" as const, expanded: this.#expanded } : {}),
						...(manifest?.cardFields !== undefined ? { cardFields: manifest.cardFields } : {}),
					}),
				),
			);
		} catch (error) {
			if (error instanceof ChartRendererMissing) {
				/*
				 * A `series` from a tool that did not declare it in `kinds`, so `#prepare` had no reason to
				 * preload. Load and draw again rather than telling a reader the shape cannot be drawn, which
				 * would be false. One frame late is the cost of a manifest that understated itself.
				 */
				void error.load().then(
					() => this.#draw(output),
					() => fill(target, degraded(output, (rest) => render(rest, { compact }))),
				);
				return;
			}
			// A kind this build cannot draw: an old runtime meeting a newer tool.
			fill(target, unknownOutput(output.kind));
		}
	}

	/**
	 * Mark the input an error names, and show `line` under it, the field's name first (#204). It was a slot only
	 * a screen reader reached, which left a sighted reader of a long form matching a message at the bottom to
	 * a field near the top. The same text is the control's description, so both hear one sentence.
	 */
	#markInvalid(inputId: string | undefined, line = "", rowAt?: number): void {
		for (const [id, control] of this.#controls) {
			const invalid = id === inputId;
			control.toggleAttribute("aria-invalid", invalid);
			if (invalid) control.setAttribute("aria-invalid", "true");
			const slot = this.#root.getElementById(`in-${id}-err`);
			if (!slot) continue;
			slot.textContent = invalid ? line : "";
			// Under the row it names, for a rows input; the group still hears it, from the unseen slot.
			const mark = this.#marks.get(id);
			mark?.(invalid ? rowAt : undefined, line);
			slot.className = invalid && !(mark && rowAt !== undefined) ? "tb-field-msg" : "tb-sr";
		}
	}

	#setBusy(busy: boolean): void {
		this.#els.output?.setAttribute("data-state", busy ? "running" : "idle");
		this.#els.output?.setAttribute("aria-busy", String(busy));
		if (this.#els.run) this.#els.run.disabled = busy;

		if (this.#slowTimer) clearTimeout(this.#slowTimer);
		this.#slowTimer = undefined;
		if (busy) {
			/*
			 * Reveal the bar only if the run is still going after SLOW_MS. Most runs finish in single-digit
			 * milliseconds, and a progress bar that appears and vanishes in that time is worse than none:
			 * it draws the eye to report that nothing happened.
			 */
			this.#slowTimer = setTimeout(() => this.#els.progress?.removeAttribute("hidden"), SLOW_MS);
		} else {
			this.#els.progress?.setAttribute("hidden", "");
			this.#setProgress(0);
		}
	}

	#setProgress(fraction: number): void {
		const bar = this.#els.progress?.firstElementChild as HTMLElement | null;
		if (bar) bar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
	}

	/**
	 * The visible line: what a reader can act on. Prompts, and errors.
	 *
	 * Deliberately not the whole result — see the note at the top of this file.
	 */
	#say(message: string): void {
		// Kept so `#paint` can put it back. The status is what stops a redrawn seed being silent: without
		// it a repainted seeded host shows the defaults' answer with nothing saying whose inputs it is.
		this.#status = message;
		/*
		 * ⚠️ Only when it changes. Assigning `textContent` replaces the text node even when the text is the
		 * same, and Chrome ends its undo group at a node insertion anywhere in the document. Every keystroke
		 * after a result says "inputs changed" again, so typing "abc def" then took 7 presses of undo to take
		 * back instead of 2, measured. Firefox and WebKit were unaffected.
		 */
		if (this.#els.status && this.#els.status.textContent !== message) this.#els.status.textContent = message;
	}

	/**
	 * The unseen line: what a result was, for anyone who cannot see it.
	 *
	 * Also clears the visible line, because after a run the result itself is the feedback and a summary of
	 * something on screen is noise.
	 */
	#announce(message: string): void {
		if (this.#els.announce) this.#els.announce.textContent = message;
		this.#say("");
	}

	#readInlineSeed(): void {
		const script = this.querySelector('script[type="application/json"][data-toolbench-seed]');
		if (!script?.textContent) return;
		try {
			this.#seed = JSON.parse(script.textContent) as Output;
		} catch {
			console.warn("[toolbench] ignored a seed script that is not valid JSON.");
		}
	}

	#fatal(message: string): void {
		this.removeAttribute("data-status");
		const message_el = el("div", { class: "tb-out-error", role: "alert" }, el("span", { class: "tb-error-message" }, message));
		fill(this.#root, el("div", { class: "tb" }, el("div", { class: "tb-body" }, message_el)));
		this.#reapplyStyles();
	}
}

function lifecycleStatus(manifest: Manifest): NonNullable<Manifest["status"]> {
	return manifest.status ?? "live";
}

function lifecycleMark(status: NonNullable<Manifest["status"]>): HTMLElement | null {
	if (status === "deprecated") return el("span", { class: "tb-mark", "data-status": "deprecated" }, "Deprecated");
	if (status === "retired") return el("span", { class: "tb-mark", "data-status": "retired" }, "Retired");
	return null;
}

function hasPart(output: Output, id: string): boolean {
	return output.id === id || (output.kind === "group" && output.parts.some((part) => hasPart(part, id)));
}

/** Every kind in an output that is drawn by code of its own (a chart, a heatmap, a pie). */
function lazyKindsIn(output: Output | undefined): LazyKind[] {
	if (!output) return [];
	if (output.kind === "group") return [...new Set(output.parts.flatMap((part) => lazyKindsIn(part)))];
	return isLazyKind(output.kind) ? [output.kind] : [];
}

/**
 * What a reader is told is missing. A graph is not a chart: a card that lost its graph said "The chart could
 * not be loaded.", naming something it never had (#201). Nor is a hex dump, since its renderer became a chunk.
 */
function missingNoun(kinds: readonly LazyKind[]): string {
	const named = (kind: LazyKind) => (kind === "graph" ? "graph" : kind === "bytes" ? "byte view" : "chart");
	return ["chart", "graph", "byte view"].filter((noun) => kinds.some((kind) => named(kind) === noun)).join(" and the ");
}

/**
 * Render, and if the chart renderer is not loaded, render everything that is not a chart.
 *
 * Only reached when the chart chunk could not be fetched. The reader gets the fields and tables and a
 * line saying the chart is missing, instead of an error in place of the whole result.
 */
function renderOrDegrade(output: Output, options: RenderOptions): HTMLElement {
	try {
		return render(output, options);
	} catch (error) {
		if (!(error instanceof ChartRendererMissing)) throw error;
		return degraded(output, (rest) => render(rest, options));
	}
}

function degraded(output: Output, draw: (rest: Output) => HTMLElement): HTMLElement {
	const note = el("p", { class: "tb-status" }, `The ${missingNoun(lazyKindsIn(output))} could not be loaded.`);
	const rest = output.kind === "group" ? output.parts.filter((part) => lazyKindsIn(part).length === 0) : [];
	if (rest.length === 0) return note;
	const body = draw(rest.length === 1 ? (rest[0] as Output) : { kind: "group", parts: rest });
	return el("div", {}, body, note);
}

/**
 * A manifest link, or its label as plain text when the target is not one a reader should be handed.
 * The validator refuses such a link already; this is the second layer, because a host can construct a
 * manifest without ever passing it through the validator, and `href` is the one attribute where a string
 * becomes script.
 */
function linkTo(link: { label: string; href: string }): HTMLElement {
	return isSafeLinkHref(link.href) ? el("a", { href: link.href, rel: "noopener" }, link.label) : el("span", {}, link.label);
}

function titleRow(manifest: Manifest, compact: boolean, pageUrl: string | undefined): HTMLElement {
	const name = el("h3", { class: "tb-name" }, pageUrl && compact ? el("a", { href: pageUrl }, manifest.name) : manifest.name);
	const mark = lifecycleMark(lifecycleStatus(manifest));
	return mark ? el("div", { class: "tb-title" }, name, mark) : name;
}

/**
 * Thread the host highlighter into a render call without writing `highlight: undefined`.
 * `exactOptionalPropertyTypes` refuses that, and omitting the key is what "no hook" means.
 */
function withHostHighlight(host: HTMLElement, options: RenderOptions): RenderOptions {
	const highlight = config?.highlight;
	// The worker factory too, so a graph too large for the main thread can be laid out in one.
	const graphWorker = config?.workerFactory;
	// How a wide graph is drawn (#198): the element's attribute, else the host's default. Unknown values are ignored.
	const wide = host.getAttribute("wide");
	const toggle = host.getAttribute("wide-toggle");
	return {
		...options,
		...(highlight ? { highlight } : {}),
		...(graphWorker ? { graphWorker } : {}),
		wide: wide === "fit" || wide === "scroll" ? wide : (config?.wide ?? "fit"),
		wideToggle: toggle === "true" || toggle === "false" ? toggle === "true" : (config?.wideToggle ?? true),
	};
}

/**
 * The inputs a compact card shows: every one marked `primary`, or the first if none is.
 *
 * ⚠️ This used to take exactly one, with `find` rather than `filter`, and that made `primary` a boolean
 * whose second use was silently ignored. A manifest saying three inputs are primary got one, with nothing
 * to say why. `primary` reads as "worth showing when space is short", and a tool whose question needs two
 * numbers to be worth asking could not express it.
 *
 * Behaviour is unchanged for a manifest marking one input, or none, which is every tool that exists today.
 */
function primaryOnly(inputs: InputSpec[]): InputSpec[] {
	const primary = inputs.filter((input) => input.primary === true);
	return primary.length > 0 ? primary : inputs.slice(0, 1);
}

/** A one-line description of a result, for the status region. Never the result itself. */
function summarise(output: Output, brief = false): string {
	switch (output.kind) {
		case "fields":
			return plural(output.fields.length, "field");
		case "table":
			return `table, ${plural(output.rows.length, "row")}`;
		case "series":
			return `chart, ${output.chart.series.length} series`;
		case "heatmap":
			return `heatmap, ${output.heatmap.y.length} by ${output.heatmap.x.length}`;
		case "pie":
			return `${output.pie.donut ? "donut" : "pie"} chart, ${plural(output.pie.slices.length, "slice")}`;
		case "radar":
			return `radar chart, ${output.radar.axes.length} axes, ${output.radar.series.length} series`;
		case "treemap":
			return `treemap, ${output.treemap.root.children?.length ?? 0} groups`;
		case "venn":
			return `Venn diagram, ${output.venn.sets.length} sets`;
		case "graph": {
			// What the figure says of itself, so a screen reader hears the same name the picture carries.
			const { label, nodes, edges } = output.graph;
			return `Graph, ${label}: ${plural(nodes.length, "node")}, ${plural(edges.length, "edge")}`;
		}
		case "bytes": {
			// The named ranges are the useful part: "84 bytes" tells a screen-reader user nothing they
			// can act on, whereas the field names are the reason they ran the tool.
			const named = output.highlight?.length ?? 0;
			const size = plural(output.bytes.length, "byte");
			/*
			 * "ranges", not "fields". The first wording made a group of fields plus bytes announce
			 * itself as "4 fields, 19 bytes, 4 fields marked", where the two counts of "fields" meant
			 * different things and neither was wrong on its own.
			 */
			return named > 0 ? `${size}, ${plural(named, "range")} marked` : size;
		}
		case "text":
		case "code":
			return "result ready";
		case "group": {
			// On a card only the first part is rendered, so announcing all of them would describe
			// something the reader cannot see.
			const parts = brief ? output.parts.slice(0, 1) : output.parts;
			return parts.map((part) => summarise(part, brief)).join(", ");
		}
		case "error":
			return `error: ${output.message}`;
	}
}
