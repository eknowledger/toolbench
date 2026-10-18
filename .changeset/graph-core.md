---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: graphs.** ([#152](https://github.com/eknowledger/toolbench/issues/152)) A tool can return `{ kind: "graph", graph }`, nodes and edges, and the runtime lays it out and draws it: ranks along a direction, ports centred on the side facing the other end, orthogonal edges that never share a stretch of line, labels clear of everything, and the same picture in every browser. Every edge is also listed in a table under the picture, and the picture is one tab stop that follows the edges with the arrow keys.

* Nodes take a label, a note, a shape, a tone or colour, a badge and a fixed rank; edges a label, a line style and width, markers, and a side to leave or arrive on. A path can be highlighted, and a tool can set its own `limits`, past which the graph is listed instead of drawn.
* The graph kind is a chunk of its own, fetched only by a page that draws a graph.
* This raises the contract to version 7: a tool returning a graph declares `"sdk": 7`, and every older manifest loads unchanged. `graphProblem` in the SDK checks a graph's structure, and the fixture runner fails a case whose graph the runtime would refuse.
