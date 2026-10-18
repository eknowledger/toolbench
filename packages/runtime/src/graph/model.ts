/**
 * What the graph layout produces: plain coordinates and SVG path strings, nothing that needs a DOM. That
 * is what lets a large graph be laid out in a worker and posted back, and what the Node tests measure.
 */
import type { GraphRow, GraphShape } from "@toolbench/sdk";

export type Box = { x: number; y: number; w: number; h: number };
export type Pt = [number, number];

export type LaidNode = Box & {
	index: number;
	id: string;
	label: string;
	shape: GraphShape;
	/** The outline as an SVG path, so drawing never needs to know the shapes. */
	outline: string;
	/** A record's rows, each with its box. */
	rows?: (Box & GraphRow)[];
	group?: string;
};

export type LaidEdge = {
	index: number;
	from: string;
	to: string;
	/** The line as an SVG path: moves, lines and quadratic corners only, which is what the checks read back. */
	d: string;
	/** Where the edge meets each node's outline, from and to. */
	ports: [Pt, Pt];
	head?: { d: string; fill: "solid" | "hollow" | "none" };
	tail?: { d: string; fill: "solid" | "hollow" | "none" };
	label?: Box & { text: string };
	/** How the edge was drawn, which differs from the request where a straight line had to fall back. */
	routed: "orthogonal" | "spline" | "straight" | "polyline";
	/** Edges sharing a merge key may share a trunk on purpose. */
	merge?: string;
};

export type LaidGroup = Box & { id: string; label: string; depth: number; title: Box; parent?: string };
export type LaidLane = Box & { id: string; label: string; title: Box };

export type GraphLayout = {
	width: number;
	height: number;
	nodes: LaidNode[];
	edges: LaidEdge[];
	groups: LaidGroup[];
	lanes: LaidLane[];
	/** For tests and the bench, not drawing: ends a full side moved, routes that had to share, the search. */
	meta: { moved: number; soft: number; searched: boolean };
};
