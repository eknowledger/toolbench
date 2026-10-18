# Build order

Finds the rounds a set of packages can be built in, given what each one depends on, and draws the
dependency graph with the longest chain marked.

## What it computes

Each package builds one round after the latest of its dependencies, so a package with none builds in
round 1. The build order lists packages by round, and within a round in the order they were written.
"Up to n at once" is the most packages any one round holds: the parallelism a build could use.

The longest chain is the path that sets the number of rounds. It starts at the first package of the last
round and steps down through its first dependency one round lower each time. Other chains of the same
length may exist; this is the first by the order the packages were written.

## Input

One package per line, as `name: dependency, dependency`. A name with no colon has no dependencies, and
a dependency never declared on a line of its own is a package with none. Names are letters, digits and
`. _ - / @`.

## What it does not handle

- **Cycles.** A cycle has no build order. The tool says so, names the first cycle it finds, and marks it on
  the graph.
- **Versions.** A dependency is a name. Two versions of one package are two names.
- **Optional or development dependencies.** Every dependency counts.
