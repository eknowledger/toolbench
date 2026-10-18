/**
 * What the worker imports to lay out a large graph: the layout and the loader for its chunks, and no drawing.
 * Its own module so the worker's build has one named entry for it.
 */
import type { Graph } from "@toolbench/sdk";
import { layoutLoading, needs } from "./chunks.ts";
import { layout } from "./layout.ts";
import type { GraphLayout } from "./model.ts";

export const layoutHere = (graph: Graph, collapsed: readonly string[]): Promise<GraphLayout> => layoutLoading(() => layout(graph, { collapsed: new Set(collapsed) }), needs(graph));
