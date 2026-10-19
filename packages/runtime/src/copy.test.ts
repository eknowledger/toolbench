import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tableToTsv } from "./render/copy.ts";

/*
 * Every expected string here is written out by hand from the rule in `tableToTsv`'s comment: labels, then
 * rows, cells joined by a tab, rows by a newline, and a cell quoted only when it holds a tab, a newline or a
 * double quote, with its own quotes doubled. None of it was captured from a run.
 */
describe("a table copied as tab-separated text (#155)", () => {
	it("puts the header first and joins cells with tabs and rows with newlines", () => {
		const tsv = tableToTsv({
			kind: "table",
			columns: [{ label: "Percentile" }, { label: "Value", align: "end" }],
			rows: [
				["p50", 5],
				["p99", { text: "9.91", tone: "warn" }],
			],
		});
		assert.equal(tsv, "Percentile\tValue\np50\t5\np99\t9.91");
	});

	it("keeps an unnamed column, so every row has as many cells as the header", () => {
		const tsv = tableToTsv({ kind: "table", columns: [{ label: "" }, { label: "Type" }], rows: [["age", "integer"]] });
		assert.equal(tsv, "\tType\nage\tinteger");
	});

	it("defuses a cell a spreadsheet would run as a formula", () => {
		const tsv = tableToTsv({
			kind: "table",
			columns: [{ label: "a" }, { label: "b" }, { label: "c" }, { label: "d" }],
			rows: [['=HYPERLINK("https://example.com","x")', "+SUM(A1)", "-A1", "@cmd"]],
		});
		// Each gets a leading ', and the first is then quoted because of its quotes, with them doubled.
		assert.equal(tsv, 'a\tb\tc\td\n"\'=HYPERLINK(""https://example.com"",""x"")"\t\'+SUM(A1)\t\'-A1\t\'@cmd');
	});

	it("leaves a signed number alone, so it still pastes as a number", () => {
		const tsv = tableToTsv({ kind: "table", columns: [{ label: "n" }], rows: [["-5"], [-0.5], ["+3"], ["-1e3"], ["-"]] });
		assert.equal(tsv, "n\n-5\n-0.5\n+3\n-1e3\n'-");
	});

	it("defuses before quoting, so a leading tab or CR is both prefixed and kept in one cell", () => {
		const tsv = tableToTsv({ kind: "table", columns: [{ label: "x" }], rows: [["\t=1"], ["\rhi"], ['=say "x"']] });
		assert.equal(tsv, 'x\n"\'\t=1"\n"\'\rhi"\n"\'=say ""x"""');
	});

	it("quotes a cell holding a tab, a newline or a quote, so it stays one cell on paste", () => {
		const tsv = tableToTsv({
			kind: "table",
			columns: [{ label: "a" }, { label: "b" }, { label: "c" }, { label: 'say "hi"' }],
			rows: [["x\ty", "two\nlines", "plain", 'he said "no"']],
		});
		assert.equal(tsv, 'a\tb\tc\t"say ""hi"""\n"x\ty"\t"two\nlines"\tplain\t"he said ""no"""');
	});
});
