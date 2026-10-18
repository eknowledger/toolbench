import { bootSite } from "./site-host.ts";

bootSite();

/*
 * Light the manifest lines a form control was built from. The runtime's shadow root is open, so the
 * focus event's composed path reaches the control itself, whose id is `in-<input id>`. Read-only: the
 * page observes the tool and changes nothing inside it.
 */
const hero = document.querySelector("#hero-tool");
const lines = [...document.querySelectorAll<HTMLElement>(".trace .line[data-input]")];

function light(id: string | null): void {
	for (const line of lines) line.classList.toggle("lit", id !== null && line.dataset.input === id);
	const first = lines.find((l) => l.dataset.input === id);
	const pane = first?.closest("pre");
	if (first && pane) {
		const top = first.offsetTop - pane.clientHeight / 3;
		pane.scrollTo({ top: Math.max(0, top), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
	}
}

hero?.addEventListener("focusin", (event) => {
	const control = event.composedPath().find((n): n is HTMLElement => n instanceof HTMLElement && n.id.startsWith("in-"));
	light(control ? control.id.slice(3) : null);
});
hero?.addEventListener("focusout", () => light(null));

/*
 * Copy the install command. A real button, so it is keyboard operable for free, and the result goes to a
 * status region so a screen reader hears that it worked, or why it did not.
 */
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
	button.addEventListener("click", async () => {
		const text = document.querySelector(button.dataset.copy ?? "")?.textContent ?? "";
		const status = document.querySelector(".copy-status");
		try {
			await navigator.clipboard.writeText(text);
			if (status) status.textContent = "Copied the install command.";
			button.textContent = "Copied";
		} catch {
			if (status) status.textContent = "Copying is blocked here. Select the command and copy it by hand.";
		}
		setTimeout(() => {
			button.textContent = "Copy";
		}, 2000);
	});
}
