/**
 * Copy buttons: every code block's, and the install command's. One listener for the whole page.
 *
 * A code block's text is read from its lines, one per `.cl`, joined with newlines, so the copy is the code
 * exactly as formatted and never the line numbers, which are generated content and not text at all. The
 * result is announced through one status region, so a screen reader hears that it worked, or why not.
 */
function statusRegion(): HTMLElement {
	let region = document.getElementById("copy-status");
	if (!region) {
		region = document.createElement("p");
		region.id = "copy-status";
		region.className = "visually-hidden";
		region.setAttribute("role", "status");
		document.body.append(region);
	}
	return region;
}

async function copy(button: HTMLButtonElement, text: string, what: string): Promise<void> {
	const label = button.firstChild;
	try {
		await navigator.clipboard.writeText(text);
		statusRegion().textContent = `Copied ${what}.`;
		if (label?.nodeType === Node.TEXT_NODE) label.textContent = "Copied";
	} catch {
		statusRegion().textContent = "Copying is blocked here. Select the text and copy it by hand.";
	}
	setTimeout(() => {
		if (label?.nodeType === Node.TEXT_NODE) label.textContent = "Copy";
	}, 2000);
}

// Created now rather than on the first click: a live region that appears already holding its message
// is often not announced at all.
statusRegion();

document.addEventListener("click", (event) => {
	const button = (event.target as Element | null)?.closest?.<HTMLButtonElement>("[data-copy-code], [data-copy]");
	if (!button) return;
	if (button.hasAttribute("data-copy-code")) {
		const block = button.closest(".codeblock");
		const lines = [...(block?.querySelectorAll(".cl") ?? [])].map((l) => (l.textContent === " " ? "" : (l.textContent ?? "")));
		void copy(button, lines.join("\n"), "the code");
	} else {
		const text = document.querySelector(button.dataset.copy ?? "")?.textContent ?? "";
		void copy(button, text, "the install command");
	}
});

// A module, so its names stay its own.
export {};
