/**
 * Runs a tool, on the main thread or in a worker, and reports what happened.
 *
 * **The main thread is the default, and that is a considered choice.** A worker cannot touch the DOM,
 * and for first-party code it buys no security — it is a *stability* boundary, not a sandbox. What it
 * does buy is the only thing that can stop a tool whose running time depends on its input, which is
 * why a tool declares `thread: "worker"` when that describes it and stays on the main thread when it
 * does not.
 *
 * The asymmetry is worth stating plainly, because it decides how much this class can promise:
 *
 * | | main thread | worker |
 * |---|---|---|
 * | Cost to start | none | ~2 ms |
 * | Can be timed out | **no** — nothing to terminate | **yes** |
 * | Can hold the page | yes, if the tool loops | no |
 * | Can draw | yes (not that a tool ever should) | no |
 *
 * On the main thread, `ctx.signal` is the *only* stop mechanism, and it only works if the tool checks
 * it. That is why the manifest rejects `timeoutMs` there: a field that cannot do what it says is worse
 * than no field.
 */
import type { InputValues, Manifest, Output, Tool } from "@toolbench/sdk";
import { upgradeOutput } from "@toolbench/sdk";
import { type Request, type Response, ToolCrashError, ToolTimeoutError, WorkerUnavailableError } from "./protocol.ts";

export interface RunHooks {
	/** Called at most once per animation frame, with the latest progress and any partial output. */
	onProgress?(fraction: number, partial?: Output): void;
}

export interface RunnerOptions {
	/**
	 * Creates the worker used for tools that declare `thread: "worker"`.
	 *
	 * The host supplies this because only the host's bundler can wire a worker to the tool modules —
	 * about six lines, shown in the README. Without it, a worker-mode tool falls back to the main
	 * thread with a console warning rather than failing: a slow tool is better than a missing one.
	 */
	workerFactory?: () => Worker;
}

/**
 * What the runner needs to run something.
 *
 * ⚠️ `tool` is optional, and that is the whole point. In worker mode the module is loaded *inside the
 * worker*, so the main thread never calls it and must not download it: fetching it there cost a
 * worker-mode tool two copies of itself, one of which was parsed and never used. A `LoadedTool` from
 * a source satisfies this type, so passing one still works.
 */
export interface Runnable {
	manifest: Manifest;
	tool?: Tool;
}

export class Runner {
	#options: RunnerOptions;
	#worker: Worker | undefined;
	#seq = 0;
	#inflight: {
		seq: number;
		controller: AbortController;
		reject(error: unknown): void;
		resolve(output: Output): void;
		hooks: RunHooks;
		timer: ReturnType<typeof setTimeout> | undefined;
	} | undefined;

	constructor(options: RunnerOptions = {}) {
		this.#options = options;
	}

	/**
	 * Run a tool. Starting a run **cancels any run already in flight** — a form that fires on typing
	 * would otherwise race, and the older answer sometimes wins.
	 */
	async run(loaded: Runnable, input: InputValues, hooks: RunHooks = {}): Promise<Output> {
		this.cancel();
		const seq = ++this.#seq;
		const useWorker = loaded.manifest.runtime.thread === "worker" && this.#options.workerFactory !== undefined;

		if (loaded.manifest.runtime.thread === "worker" && !useWorker) {
			console.warn(`[toolbench] "${loaded.manifest.id}" wants a worker but no workerFactory is set; running on the main thread.`);
		}

		return useWorker ? this.#runInWorker(loaded, input, hooks, seq) : this.#runOnMainThread(loaded, input, hooks, seq);
	}

	/** Abort whatever is running. Safe to call when nothing is. */
	cancel(): void {
		const inflight = this.#inflight;
		if (!inflight) return;
		this.#inflight = undefined;
		if (inflight.timer) clearTimeout(inflight.timer);
		inflight.controller.abort(new DOMException("superseded", "AbortError"));
		if (this.#worker) this.#post({ type: "abort", seq: inflight.seq });
		inflight.reject(new DOMException("superseded", "AbortError"));
	}

	/** Release the worker. Call this when the element leaves the page, or it leaks ~3 MB. */
	dispose(): void {
		this.cancel();
		this.#worker?.terminate();
		this.#worker = undefined;
	}

	// --- main thread ------------------------------------------------------------------------------

	async #runOnMainThread(loaded: Runnable, input: InputValues, hooks: RunHooks, seq: number): Promise<Output> {
		const controller = new AbortController();
		const progress = this.#progressFor(seq, hooks);
		const promise = new Promise<Output>((resolve, reject) => {
			this.#inflight = { seq, controller, resolve, reject, hooks, timer: undefined };
		});

		const tool = loaded.tool;
		if (!tool) {
			/*
			 * Unreachable through the element, which loads the module exactly when this thread will call
			 * it. Reachable by a host driving the Runner directly, so it says what to do rather than
			 * failing on a property access.
			 */
			this.#fail(
				seq,
				new Error(`"${loaded.manifest.id}" has no module on this thread: pass source.load(id), or set a workerFactory.`),
			);
			return promise;
		}

		try {
			const output = await tool.run(input, {
				signal: controller.signal,
				progress: (fraction, partial) => {
					if (!controller.signal.aborted) progress(fraction, partial);
				},
			});
			if (this.#inflight?.seq !== seq) return promise; // superseded: the rejection above wins
			this.#settle(seq, upgradeOutput(output, loaded.manifest.sdk));
		} catch (error) {
			if (this.#inflight?.seq === seq) {
				this.#fail(seq, asCrash(error, loaded.manifest.id));
			}
		}
		return promise;
	}

	// --- worker -----------------------------------------------------------------------------------

	async #runInWorker(loaded: Runnable, input: InputValues, hooks: RunHooks, seq: number): Promise<Output> {
		const worker = this.#ensureWorker();
		const controller = new AbortController();
		const progress = this.#progressFor(seq, hooks);
		const timeoutMs = loaded.manifest.timeoutMs ?? 5000;

		const promise = new Promise<Output>((resolve, reject) => {
			const timer = setTimeout(() => {
				/*
				 * ⚠️ Terminate, then discard. A terminated worker's state is undefined — the tool may
				 * have been halfway through anything — so the next run gets a fresh one. Respawning
				 * costs about 2 ms, which is cheaper than reasoning about what survived.
				 */
				this.#worker?.terminate();
				this.#worker = undefined;
				this.#fail(seq, new ToolTimeoutError(timeoutMs));
			}, timeoutMs);
			this.#inflight = { seq, controller, resolve, reject, hooks: { onProgress: progress }, timer };
		});

		worker.postMessage({ type: "run", seq, id: loaded.manifest.id, input, sdk: loaded.manifest.sdk } satisfies Request);
		return promise;
	}

	/**
	 * A progress reporter that is throttled to one frame AND scoped to one run.
	 *
	 * ⚠️ Both halves matter. Throttling stops a simulation reporting per iteration from spending more
	 * time drawing than computing. The scope check stops the *last* throttled frame arriving after the
	 * final result and overwriting it — which is exactly what happened the first time this ran: the
	 * chart appeared for a moment and was then replaced by the partial fields that preceded it.
	 */
	#progressFor(seq: number, hooks: RunHooks): NonNullable<RunHooks["onProgress"]> {
		/*
		 * ⚠️ The check has to happen at FLUSH time, not at call time.
		 *
		 * The first version guarded the outer call and still lost the race: a progress frame arrives
		 * while the run is current, the throttle defers it to the next animation frame, the result
		 * settles in between, and the deferred frame then draws a partial over the finished output. The
		 * chart appeared for one frame and was replaced by the fields that preceded it.
		 */
		return throttle(hooks.onProgress, () => this.#inflight?.seq === seq);
	}

	#ensureWorker(): Worker {
		if (this.#worker) return this.#worker;
		const factory = this.#options.workerFactory;
		if (!factory) throw new WorkerUnavailableError("No workerFactory was configured.");
		const worker = factory();
		worker.addEventListener("message", (event: MessageEvent<Response>) => this.#onMessage(event.data));
		worker.addEventListener("error", (event) => {
			/*
			 * A worker that fails to load — a 404 chunk, a syntax error, a blocked script — surfaces
			 * here and nowhere else. Without this the reader would watch a spinner forever, which is the
			 * failure mode that made this listener worth writing before it was needed.
			 */
			const seq = this.#inflight?.seq;
			this.#worker?.terminate();
			this.#worker = undefined;
			if (seq !== undefined) {
				this.#fail(seq, new WorkerUnavailableError(`The tool's worker failed to start: ${event.message || "unknown error"}`));
			}
		});
		this.#worker = worker;
		return worker;
	}

	#onMessage(message: Response): void {
		if (message.type === "ready") return;
		const inflight = this.#inflight;
		if (!inflight || inflight.seq !== message.seq) return; // a stale answer to a superseded run
		switch (message.type) {
			case "progress":
				inflight.hooks.onProgress?.(message.fraction, message.partial);
				return;
			case "result":
				this.#settle(message.seq, message.output);
				return;
			case "crash":
				this.#fail(message.seq, new ToolCrashError(message.message, message.stack));
				return;
		}
	}

	#post(request: Request): void {
		this.#worker?.postMessage(request);
	}

	#settle(seq: number, output: Output): void {
		const inflight = this.#inflight;
		if (!inflight || inflight.seq !== seq) return;
		this.#inflight = undefined;
		if (inflight.timer) clearTimeout(inflight.timer);
		inflight.resolve(output);
	}

	#fail(seq: number, error: unknown): void {
		const inflight = this.#inflight;
		if (!inflight || inflight.seq !== seq) return;
		this.#inflight = undefined;
		if (inflight.timer) clearTimeout(inflight.timer);
		inflight.reject(error);
	}
}

/** True when a rejection is just "the reader typed again". */
export function isSuperseded(error: unknown): boolean {
	return error instanceof DOMException && error.name === "AbortError";
}

function asCrash(error: unknown, toolId: string): unknown {
	if (isSuperseded(error)) return error;
	if (error instanceof Error) {
		return new ToolCrashError(`"${toolId}" threw ${error.name}: ${error.message}`, error.stack);
	}
	return new ToolCrashError(`"${toolId}" threw ${String(error)}`);
}

/**
 * Coalesce progress to one call per frame.
 *
 * A simulation reporting per iteration would otherwise spend more time rendering than computing —
 * and on the main thread it would spend it *blocking the frame it is trying to update*.
 */
function throttle(fn: RunHooks["onProgress"], isCurrent: () => boolean): NonNullable<RunHooks["onProgress"]> {
	if (!fn) return () => {};
	let queued: { fraction: number; partial?: Output } | undefined;
	let scheduled = false;
	const flush = () => {
		scheduled = false;
		if (!queued || !isCurrent()) return; // the run this belonged to is over

		const { fraction, partial } = queued;
		queued = undefined;
		fn(fraction, partial);
	};
	return (fraction, partial) => {
		queued = partial === undefined ? { fraction } : { fraction, partial };
		if (scheduled) return;
		scheduled = true;
		if (typeof requestAnimationFrame === "function") requestAnimationFrame(flush);
		else setTimeout(flush, 16);
	};
}
