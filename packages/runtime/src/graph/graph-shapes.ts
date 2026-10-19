/** The shapes chunk: hexagon, parallelogram, cylinder, document. Data where it can be, paths where not. */
import { r1 as f, SHAPES } from "./geometry.ts";
import type { Box } from "./model.ts";

SHAPES.hexagon = { size: (w, h) => [w + h + 34, h + 10], t: [0, 0.5, 0, 1, -0.5, 0, 1, 0, 0.5, 1, -0.5, 1, 0, 0.5, 1, 0, 0, 0.5] };
SHAPES.parallelogram = { size: (w, h) => [w + 24 + Math.ceil((h + 10) * 0.6), h + 10], t: [0, 0.3, 0, 1, 0, 0, 1, -0.3, 1, 0, 0, 1] };
const p6 = (b: Box, k: number): [number, number][] => [[b.x, b.y + k], [b.x + b.w / 2, b.y], [b.x + b.w, b.y + k], [b.x + b.w, b.y + b.h - k], [b.x + b.w / 2, b.y + b.h], [b.x, b.y + b.h - k]];
SHAPES.cylinder = {
	size: (w, h) => [w + 24, h + 24],
	d: ({ x, y, w, h }) => `M${f(x)} ${f(y + 6)}A${f(w / 2)} 6 0 0 1 ${f(x + w)} ${f(y + 6)}V${f(y + h - 6)}A${f(w / 2)} 6 0 0 1 ${f(x)} ${f(y + h - 6)}Z M${f(x)} ${f(y + 6)}A${f(w / 2)} 6 0 0 0 ${f(x + w)} ${f(y + 6)}`,
	pg: (b) => p6(b, 6),
};
SHAPES.document = {
	size: (w, h) => [w + 24, h + 18],
	d: ({ x, y, w, h }) => `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h - 4)}C${f(x + w * 0.75)} ${f(y + h - 12)} ${f(x + w * 0.25)} ${f(y + h + 4)} ${f(x)} ${f(y + h - 4)}Z`,
	pg: (b) => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h - 4], [b.x + b.w * 0.75, b.y + b.h - 7], [b.x + b.w * 0.25, b.y + b.h - 1], [b.x, b.y + b.h - 4]],
};
