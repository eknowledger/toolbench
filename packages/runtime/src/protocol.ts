/**
 * The message protocol between the page and a worker.
 *
 * Written out rather than delegated to an RPC library, for a reason that only becomes obvious once
 * you try: **none of `Ctx` can cross a worker boundary.** An `AbortSignal` is not structured-
 * cloneable, `progress` is a function, and a `Response` is neither cloneable nor transferable. So the
 * `Ctx` a tool receives is always constructed on the side that runs it, and these messages are what
 * drive it from the other side.
 *
 * That realisation is also why there is no RPC dependency here: once the protocol is specified, a
 * library adds a wrapper and takes away the one thing a tool harness needs, which is a timeout that
 * can actually stop a running tool.
 */
import type { Graph, InputValues, Output } from "@toolbench/sdk";
import type { GraphLayout } from "./graph/model.ts";

/** page → worker */
export type Request =
	| { type: "run"; seq: number; id: string; input: InputValues; sdk: number }
	| { type: "abort"; seq: number }
	/** Lay out a large graph off the main thread, with these groups drawn closed (#152). */
	| { type: "layout"; seq: number; graph: Graph; collapsed: string[] };

/** worker → page */
export type Response =
	| { type: "ready" }
	| { type: "progress"; seq: number; fraction: number; partial?: Output }
	| { type: "result"; seq: number; output: Output }
	| { type: "laid"; seq: number; layout: GraphLayout }
	/**
	 * The tool threw, or the worker could not load it. Distinct from an `{ kind: "error" }` output,
	 * which means the tool worked and the input was wrong.
	 */
	| { type: "crash"; seq: number; name: string; message: string; stack?: string };

export class ToolTimeoutError extends Error {
	readonly ms: number;
	constructor(ms: number) {
		super(`The tool did not finish within ${ms}ms and was stopped.`);
		this.name = "ToolTimeoutError";
		this.ms = ms;
	}
}

export class ToolCrashError extends Error {
	/** The stack from inside the tool, which is usually the only useful part. */
	readonly toolStack: string | undefined;
	constructor(message: string, toolStack?: string) {
		super(message);
		this.name = "ToolCrashError";
		this.toolStack = toolStack;
	}
}

export class WorkerUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkerUnavailableError";
	}
}
