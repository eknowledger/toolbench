/**
 * Bring a value arriving from outside the form into what its spec allows.
 *
 * Used by typed input, by sample buttons, by the host `values` setter and by a shared link. A host is not
 * more trustworthy than a reader, so the paths share this: a number outside min/max is clamped, an invalid
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
import type { InputSpec, InputValue, InputValues } from "@toolbench/sdk";

export function coerce(spec: InputSpec, value: InputValue): InputValue {
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
			const chosen = Array.isArray(value) ? spec.options.map((option) => option.value).filter((v) => value.includes(v)) : [];
			const whole = Array.isArray(value) && chosen.length === value.length && chosen.length <= (spec.max ?? Infinity);
			// A copy either way: the form edits this array, and the manifest's default must not change with it.
			return whole ? chosen : [...spec.default];
		}
		default: {
			const text = String(value);
			return spec.maxLength !== undefined ? text.slice(0, spec.maxLength) : text;
		}
	}
}

/**
 * Merge a partial set of values onto the current form state.
 *
 * Unspecified inputs keep their current value. Unknown ids are ignored: they are not inputs, and
 * writing them into the map would make `run` see keys the tool never declared.
 */
export function applyPartialValues(inputs: readonly InputSpec[], current: InputValues, partial: InputValues): InputValues {
	const next: InputValues = { ...current };
	for (const spec of inputs) {
		const value = partial[spec.id];
		if (value === undefined) continue;
		next[spec.id] = coerce(spec, value);
	}
	return next;
}

/**
 * What the default link on this page says a tool's inputs are (#227): each input under `<tool id>.<input id>`,
 * as the share button writes it. Uncoerced: `applyPartialValues` does that, as for any value from outside.
 *
 * A multiselect is every repeat of its key, and the bare key alone (`dns.types=`) is none chosen, because an
 * option value is never empty (#204). A toggle is true only for the word `true`; `Boolean("false")` is not.
 * A single value repeated keeps the last, as this reader always has.
 */
export function fromQuery(id: string, inputs: readonly InputSpec[], query: URLSearchParams): InputValues {
	const found: InputValues = {};
	for (const spec of inputs) {
		const all = query.getAll(`${id}.${spec.id}`);
		const last = all.at(-1);
		if (last === undefined) continue;
		found[spec.id] = spec.type === "multiselect" ? all.filter(Boolean) : spec.type === "toggle" ? last === "true" : last;
	}
	return found;
}
