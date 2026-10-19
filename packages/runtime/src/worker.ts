/**
 * The worker side of the protocol.
 *
 * A host uses it in about six lines, and those six lines are the price of the one thing a worker
 * gives you — a tool that can be stopped:
 *
 * ```ts
 * // tool.worker.ts, in the HOST app, because only the host's bundler can see its tool modules
 * import { createToolWorker } from "@toolbench/runtime/worker";
 * import { registry } from "./registry.ts";
 *
 * createToolWorker({ load: (id) => registry[id].load() });
 * ```
 *
 * ⚠️ **Why the host and not this package.** The worker has to `import()` the tool's module, and a
 * bundler can only follow an import it can see at build time. If this package tried to resolve tool
 * paths itself, it would either need `eval` or produce URLs that 404 in production. Handing the
 * loader in keeps the bundler's view of the module graph complete — and it means this file has no
 * opinion about how a host organises its tools.
 */
import type { ToolModule } from "@toolbench/sdk";
import { upgradeOutput } from "@toolbench/sdk";
import type { Request, Response } from "./protocol.ts";

export interface ToolWorkerOptions {
	/** Resolve a tool id to its module. Usually a lookup in the same registry the page uses. */
	load(id: string): Promise<ToolModule>;
	/** Defaults to `self`. Injectable so the protocol can be tested without a real worker. */
	scope?: WorkerScope;
}

/** The slice of `DedicatedWorkerGlobalScope` this uses — small enough to fake in a test. */
export interface WorkerScope {
	postMessage(message: Response): void;
	addEventListener(type: "message", listener: (event: MessageEvent<Request>) => void): void;
}

export function createToolWorker(options: ToolWorkerOptions): void {
	const scope = options.scope ?? (self as unknown as WorkerScope);
	const modules = new Map<string, Promise<ToolModule>>();
	/** One controller per in-flight sequence, so an abort message can reach the right run. */
	const running = new Map<number, AbortController>();

	scope.addEventListener("message", (event) => {
		const message = event.data;
		if (message.type === "abort") {
			running.get(message.seq)?.abort(new DOMException("aborted by the page", "AbortError"));
			running.delete(message.seq);
			return;
		}
		if (message.type === "layout") {
			void laid(message);
			return;
		}
		void run(message);
	});

	/**
	 * A large graph's layout, for a page that would otherwise stop while it ran. The layout and the chunks it
	 * fetches are this package's own modules, so unlike a tool's code they need no loader from the host.
	 */
	async function laid({ seq, graph, collapsed }: Extract<Request, { type: "layout" }>): Promise<void> {
		try {
			const { layoutHere } = await import("./graph/graph-worker.ts");
			scope.postMessage({ type: "laid", seq, layout: await layoutHere(graph, collapsed) });
		} catch (error) {
			const e = error as Error;
			scope.postMessage({ type: "crash", seq, name: e?.name ?? "Error", message: e?.message ?? String(error), ...(e?.stack ? { stack: e.stack } : {}) });
		}
	}

	async function run(request: Extract<Request, { type: "run" }>): Promise<void> {
		const { seq, id, input, sdk } = request;
		const controller = new AbortController();
		running.set(seq, controller);
		try {
			let module = modules.get(id);
			if (!module) {
				module = options.load(id);
				modules.set(id, module);
			}
			const { default: tool } = await module;
			const output = await tool.run(input, {
				signal: controller.signal,
				progress: (fraction, partial) => {
					// The page throttles; the worker just reports. Sending a partial from here is what
					// lets a long simulation show itself converging instead of hiding behind a bar.
					scope.postMessage(partial === undefined ? { type: "progress", seq, fraction } : { type: "progress", seq, fraction, partial });
				},
			});
			scope.postMessage({ type: "result", seq, output: upgradeOutput(output, sdk) });
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") return; // the page already knows
			const e = error as Error;
			scope.postMessage({
				type: "crash",
				seq,
				name: e?.name ?? "Error",
				message: e?.message ?? String(error),
				...(e?.stack ? { stack: e.stack } : {}),
			});
		} finally {
			running.delete(seq);
		}
	}

	scope.postMessage({ type: "ready" });
}
