/**
 * Every optional graph chunk, imported for its side effect of registering itself, so a Node test lays out
 * any graph without the loading a page does. Pages fetch these on demand instead.
 */
import "../../src/graph/graph-tree.ts";
import "../../src/graph/graph-force.ts";
import "../../src/graph/graph-lines.ts";
import "../../src/graph/graph-shapes.ts";
import "../../src/graph/graph-er.ts";
import "../../src/graph/graph-groups.ts";
import "../../src/graph/graph-search.ts";
import "../../src/graph/graph-repair.ts";

export { effective, layout } from "../../src/graph/layout.ts";
