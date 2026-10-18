/**
 * Every optional graph chunk, imported for its side effect of registering itself, so a Node test lays out
 * any graph without the loading a page does. Pages fetch these on demand instead.
 */
import "../../src/graph/graph-repair.ts";

export { effective, layout } from "../../src/graph/layout.ts";
