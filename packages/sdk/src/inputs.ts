/**
 * The checks before a run, apart from the validator, because a browser needs them whether or not it validates
 * manifests: readers type values. validate.ts applies the same rules to samples and presets.
 *
 * ⚠️ A module of its own because bundlers split by module, not by export. In validate.ts, one static import of
 * `inputProblem` from the runtime's eager code put the whole validator back in the chunk every page loads.
 */
import type { InputSpec } from "./types.ts";

/*
 * Dates (#203): each mode's format as a message writes it, and the reading of one. A day must exist, so
 * 2025-02-29 is refused; a time runs 00:00 to 23:59. Values in one format compare as strings, which is why
 * the range checks below are plain `<`.
 */
export const DATE_FORMATS = { date: "YYYY-MM-DD", time: "HH:MM", datetime: "YYYY-MM-DDTHH:MM" };
export type DateMode = keyof typeof DATE_FORMATS;
const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isDay = (v: string) => {
	const day = new Date(`${v}T00:00Z`);
	return /^\d{4}-\d\d-\d\d$/.test(v) && !Number.isNaN(+day) && day.toISOString().startsWith(v);
};
export const isDate = (mode: DateMode, v: unknown): v is string =>
	typeof v === "string" && (mode === "date" ? isDay(v) : mode === "time" ? isTime(v) : v[10] === "T" && isDay(v.slice(0, 10)) && isTime(v.slice(11)));

/**
 * What is wrong with a value of an input whose rules the browser does not hold a reader to, as the sentence
 * the reader sees, naming the input by its label; `undefined` when nothing is. The runtime refuses a value
 * this finds before calling `run`, showing it as an error on that input, so `run` can trust the format and
 * the range. A native date control lets a reader type a day outside `min..max`, and empties itself while a
 * date is half typed; a colour's hex box takes any seven characters; a secret has no minimum length in HTML
 * that holds anything but a form submit. Validation applies it to samples and presets too. Contract version 9.
 */
export function inputProblem(spec: InputSpec, value: unknown): string | undefined {
	if (spec.type === "date") {
		const mode = spec.mode ?? "date";
		const noun = mode === "datetime" ? "a date and time" : `a ${mode}`;
		if (value === "") return `${spec.label} needs ${noun}, as ${DATE_FORMATS[mode]}.`;
		if (!isDate(mode, value)) return `${spec.label} must be ${noun} as ${DATE_FORMATS[mode]}, got ${JSON.stringify(value)}.`;
		if (spec.min && value < spec.min) return `${spec.label} must be on or after ${spec.min}, got ${value}.`;
		if (spec.max && value > spec.max) return `${spec.label} must be on or before ${spec.max}, got ${value}.`;
	}
	// A length and not the value: the message is on screen and in a host's tool-run event.
	if (spec.type === "secret" && String(value).length < (spec.minLength ?? 0)) return `${spec.label} must be at least ${spec.minLength} characters, got ${String(value).length}.`;
	// What a reader types is lowercased and trimmed first, so only a value that is not six hex digits gets here.
	if (spec.type === "color" && !/^#[0-9a-f]{6}$/.test(String(value))) return `${spec.label} must be a #rrggbb colour, got ${JSON.stringify(value)}.`;
	// A reader can untick the last box or remove the last row (#204); the form holds the rest of a list's rules itself.
	if (spec.type === "multiselect" && Array.isArray(value) && value.length < (spec.min ?? 0)) return `${spec.label}: pick at least ${spec.min === 1 ? "one" : spec.min}.`;
	if (spec.type === "rows" && Array.isArray(value) && value.length < (spec.minRows ?? 0)) return `${spec.label}: add at least ${spec.minRows === 1 ? "one row" : `${spec.minRows} rows`}.`;
	return undefined;
}
