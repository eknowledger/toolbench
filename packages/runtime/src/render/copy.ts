/**
 * The Copy action on `code` and `table` results (#155): what pressing the button does.
 *
 * Its own chunk, fetched when the first code or table result is drawn, so a page that never draws one
 * does not pay for it: the chart chunk's reasoning. The button itself is drawn by the renderer in boot,
 * disabled until this arrives, which is a few milliseconds after the result and long before a reader
 * can reach it, and never a button that silently does nothing.
 *
 * The button only does the copy. Saying how it went is the host's job: the button dispatches `tb-copy`
 * and `<tool-host>` puts the outcome in its status region, because a renderer has no live region of its
 * own and a second one per result would announce over the first.
 */
import type { Output } from "@toolbench/sdk";

/**
 * What `tb-copy` carries: whether it worked, and the sentence to announce. `ok` false means the clipboard was
 * missing or refused, and the text is selected instead. The words travel with the event so they live in this
 * chunk, not in boot.
 */
export interface CopyResult {
	ok: boolean;
	message: string;
}

/**
 * A table as tab-separated text: the header row, then one line per row, which is what a spreadsheet
 * splits into cells on paste. A cell holding a tab, a newline or a double quote is quoted with its quotes
 * doubled, the form spreadsheets themselves put on the clipboard, so a cell with a newline in it stays one
 * cell rather than starting a row.
 *
 * ⚠️ A cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return is a formula to Excel and Sheets
 * once pasted, and table text can echo what a reader typed, which a shared link can prefill, so
 * `=HYPERLINK(...)` could travel from one reader's URL into another's spreadsheet. Such a cell gets a
 * leading `'`, which spreadsheets read as "this is text", before it is quoted. A plain number is left as it
 * is, so -5, -0.5 and +3 still paste as numbers.
 */
export function tableToTsv(output: Extract<Output, { kind: "table" }>): string {
	const defuse = (text: string) => (/^[=+\-@\t\r]/.test(text) && !/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text) ? `'${text}` : text);
	const quote = (raw: string) => {
		const text = defuse(raw);
		return /[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	};
	const cell = (value: unknown) => quote(typeof value === "object" && value !== null ? String((value as { text: unknown }).text) : String(value));
	return [output.columns.map((column) => quote(column.label)), ...output.rows.map((row) => row.map(cell))].map((line) => line.join("\t")).join("\n");
}

/**
 * Make the renderer's Copy button work: copy, show the outcome in `note`, and tell the host.
 *
 * ⚠️ The note is beside the button, not on the status line. The status line sits above the result, and a
 * "Copied" appearing there pushed the whole result, and the button under the pointer, down by one line.
 * The note is `aria-hidden` because the host announces the same words; reading both would say it twice.
 *
 * ⚠️ The button keeps its label. Turning "Copy code" into "Copied" renames a focused control, which some
 * screen readers read out on top of the announcement, and a visible label that differs from the name is
 * the 2.5.3 failure the card hint was rebuilt to avoid.
 *
 * `select` is what a refused clipboard falls back to: the block's own text, selected, so the reader can
 * copy it with the keyboard. Failing silently would leave them pasting whatever was there before.
 */
export function wireCopy(button: HTMLButtonElement, note: HTMLElement, text: () => string, select: () => Node): void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	button.addEventListener("click", () => {
		const done = (ok: boolean) => {
			if (!ok) {
				const selection = getSelection();
				selection?.selectAllChildren(select());
			}
			// On plain HTTP there is no clipboard to write to (#264), and saying so beats a bare "failed".
			const why = typeof isSecureContext === "boolean" && !isSecureContext ? "Copying needs HTTPS" : "Copy failed";
			note.textContent = ok ? "Copied" : `${why}: the text is selected instead`;
			/*
			 * "Copied" goes after a moment, or it would still claim so after the reader has copied something
			 * else. A failure stays: the selection it describes is still there, and so is the reason.
			 */
			clearTimeout(timer);
			if (ok) timer = setTimeout(() => (note.textContent = ""), 2000);
			button.dispatchEvent(new CustomEvent<CopyResult>("tb-copy", { bubbles: true, detail: { ok, message: ok ? "Copied" : `${why}. The text is selected, so you can copy it yourself` } }));
		};
		/*
		 * `navigator.clipboard` is absent on an insecure origin and in some embedded views, and `writeText`
		 * rejects when the page is not allowed to write. Either way `execCommand("copy")` is tried next, with the
		 * same text, so a table is still its tab-separated form rather than the page's rendering of it (#264).
		 */
		const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
		if (!clipboard?.writeText) {
			done(execCopy(text(), button));
			return;
		}
		clipboard.writeText(text()).then(
			() => done(true),
			() => done(execCopy(text(), button)),
		);
	});
	button.disabled = false;
}

/**
 * ⚠️ The copy for a page with no Clipboard API (#264), as the share chunk's `execCopy`: `execCommand("copy")`
 * on the text in a box beside `back`, selected during the click, then focus back on `back`. Duplicated rather
 * than shared, because a shared module would be a third chunk fetched for a dozen lines.
 */
function execCopy(text: string, back: HTMLElement): boolean {
	const box = document.createElement("textarea");
	box.readOnly = true;
	box.tabIndex = -1;
	box.setAttribute("aria-hidden", "true");
	box.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
	box.value = text;
	back.after(box);
	box.select();
	let ok = false;
	try {
		ok = document.execCommand("copy");
	} catch {
		ok = false;
	}
	box.remove();
	back.focus({ preventScroll: true });
	return ok;
}
