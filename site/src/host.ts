/**
 * The site's whole integration with Toolbench, written the way any consumer would write it: the
 * published package names, a registry built from a directory glob, a worker for the tools that ask
 * for one, and a host stylesheet. Nothing here reaches into the runtime's internals.
 */
import { defineToolHost, RegistrySource, type RegistryEntry } from "@toolbench/runtime";
import { registry } from "./registry.ts";
import "./theme.ts";

export type BootOptions = {
	/** CSS adopted into every tool's shadow root, after the runtime's own. */
	styles?: string;
	/** Extra tools for one page only, so other pages do not carry their manifests. */
	extra?: Record<string, RegistryEntry>;
};

/*
 * A page-owned figure (`controls="none"`) sits inside the page's own frame, so the tool's frame would be
 * a second border around the same chart.
 */
const COMMON = /* css */ `
:host([controls="none"]) .tb { border: 0; background: transparent; border-radius: 0; }
:host([controls="none"]) .tb-body { padding: 0; }
`;

export function boot({ styles = "", extra }: BootOptions = {}): void {
	styles = COMMON + styles;
	defineToolHost({
		source: new RegistrySource({ ...registry, ...extra }),
		workerFactory: () => new Worker(new URL("./tool.worker.ts", import.meta.url), { type: "module" }),
		// Relative, so the same pages work at / locally and under a sub-path on Pages.
		pageUrl: (id) => `./gallery.html#${encodeURIComponent(id)}`,
		...(styles ? { styles: [styles] } : {}),
	});
}
