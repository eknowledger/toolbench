/**
 * Bring a value arriving from outside the form into what its spec allows.
 *
 * Used by sample buttons and the host `values` setter, and by typing and a shared link through `written`. A
 * host is not more trustworthy than a reader, so the paths share this: a number outside min/max is clamped
 * (but see `written`), an invalid
 * select falls back to the default, and a string longer than maxLength is cut. A date is kept as written,
 * and refused before `run` if it is not one.
 *
 * A list is not repaired piece by piece: one with an unknown option, a repeat or more than `max` falls back
 * to its whole default (#204). Half of a list someone else chose, with the rest silently dropped, would
 * answer a question nobody asked; the default at least says it is the default.
 *
 * `validateManifest` already refuses a sample outside those bounds, so for samples this is a
 * backstop rather than the guard. A host-set value never went through that check.
 */
import type { InputSpec, InputValue, InputValues, Row, RowColumn } from "@toolbench/sdk";

export function coerce(spec: InputSpec, value: InputValue, asWritten = false): InputValue {
	switch (spec.type) {
		case "number": {
			const n = Number(value);
			return Number.isFinite(n) ? Math.min(spec.max, Math.max(spec.min, n)) : spec.default;
		}
		case "toggle":
			return Boolean(value);
		case "select":
			return spec.options.some((option) => option.value === String(value)) ? String(value) : spec.default;
		// As written, in range or not: the check before `run` names what arrived rather than a substitute.
		case "date":
			return String(value);
		case "color":
			return String(value).trim().toLowerCase();
		case "multiselect": {
			// In the options' order, so two ways of choosing the same set are one value to Reset, presets and a link.
			const chosen = Array.isArray(value) ? spec.options.map((option) => option.value).filter((v) => (value as unknown[]).includes(v)) : [];
			const whole = Array.isArray(value) && chosen.length === value.length && chosen.length <= (spec.max ?? Infinity);
			// A copy either way: the form edits this array, and the manifest's default must not change with it.
			return whole ? chosen : [...spec.default];
		}
		case "rows": {
			const rows = Array.isArray(value) && value.length <= spec.maxRows ? value.map((row) => cells(spec.columns, row, asWritten)) : undefined;
			return rows?.every(Boolean) ? (rows as Row[]) : structuredClone(spec.default);
		}
		default: {
			const text = String(value);
			return spec.maxLength !== undefined ? text.slice(0, spec.maxLength) : text;
		}
	}
}

/**
 * A value as the reader typed it, or as a link carried it (#262): a number is kept as written, in range or
 * not, and an empty or unreadable box is the string it holds, so `inputProblem` refuses it before `run` and
 * names what is on screen. Clamped here, 99999 under a max of 5000 ran and was shared as 5000 while the box
 * still said 99999, and an emptied box ran on the min. Every other type is `coerce`.
 */
export function written(spec: InputSpec, value: InputValue): InputValue {
	// A rows input's number cells the same way, each refused with its row named.
	if (spec.type !== "number") return coerce(spec, value, true);
	const n = value === "" ? Number.NaN : Number(value);
	return Number.isFinite(n) ? n : String(value);
}

/**
 * One row brought to its columns (#204), or `undefined` for a row that cannot be used: a missing cell, an
 * unknown option, a number that is not one, a toggle that is neither true nor false. A number is clamped and
 * a text cut, as typing does; a key that is no column is dropped. Text from a link reads as typed.
 * `asWritten`, for typing and a link (#262), keeps a number cell as written, and an empty one as its text.
 */
export function cells(columns: readonly RowColumn[], row: unknown, asWritten = false): Row | undefined {
	const given = Object(row) as Record<string, unknown>;
	const out: Row = {};
	for (const column of columns) {
		const v = given[column.id];
		if (v === undefined || v === null || typeof v === "object") return undefined;
		if (column.type === "number") {
			const n = v === "" ? Number.NaN : Number(v);
			if (asWritten) out[column.id] = Number.isFinite(n) ? n : String(v);
			else if (!Number.isFinite(n)) return undefined;
			else out[column.id] = Math.min(column.max, Math.max(column.min, n));
		} else if (column.type === "toggle") {
			if (v !== true && v !== false && v !== "true" && v !== "false") return undefined;
			out[column.id] = v === true || v === "true";
		} else if (column.type === "select") {
			if (!column.options.some((option) => option.value === String(v))) return undefined;
			out[column.id] = String(v);
		} else out[column.id] = String(v).slice(0, column.maxLength);
	}
	return out;
}

/**
 * Merge a partial set of values onto the current form state.
 *
 * Unspecified inputs keep their current value. Unknown ids are ignored: they are not inputs, and
 * writing them into the map would make `run` see keys the tool never declared.
 */
export function applyPartialValues(inputs: readonly InputSpec[], current: InputValues, partial: InputValues, bring = coerce): InputValues {
	const next: InputValues = { ...current };
	for (const spec of inputs) {
		const value = partial[spec.id];
		if (value === undefined) continue;
		next[spec.id] = bring(spec, value);
	}
	return next;
}

/**
 * What the default link on this page says a tool's inputs are (#227): each input under `<tool id>.<input id>`,
 * as the share button writes it. Uncoerced: `applyPartialValues` does that with `written`, as typing does.
 *
 * A multiselect is every repeat of its key, and the bare key alone (`dns.types=`) is none chosen, because an
 * option value is never empty (#204). A toggle is true only for the word `true`; `Boolean("false")` is not.
 * A single value repeated keeps the last, as this reader always has.
 */
export function fromQuery(id: string, inputs: readonly InputSpec[], query: URLSearchParams): InputValues {
	const found: InputValues = {};
	for (const spec of inputs) {
		const key = `${id}.${spec.id}`;
		const all = query.getAll(key);
		const last = all.at(-1);
		/*
		 * Rows are a key per column, `rl.limits.path`, zipped by position. Columns of different lengths are a
		 * link someone cut or edited, so they are left unusable, and `coerce` opens the input on its default.
		 */
		if (spec.type === "rows" && last === undefined) {
			const columns = spec.columns.map((column) => query.getAll(`${key}.${column.id}`));
			const n = columns[0]?.length ?? 0;
			if (n === 0) continue;
			found[spec.id] = columns.every((c) => c.length === n) ? Array.from({ length: n }, (_, r) => Object.fromEntries(spec.columns.map((column, c) => [column.id, columns[c]?.[r] ?? ""]))) : "";
			continue;
		}
		if (last === undefined) continue;
		if (spec.type === "rows") {
			found[spec.id] = [];
			continue;
		}
		found[spec.id] = spec.type === "multiselect" ? all.filter(Boolean) : spec.type === "toggle" ? last === "true" : last;
	}
	return found;
}
