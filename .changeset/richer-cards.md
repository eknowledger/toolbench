---
"@toolbench/runtime": minor
"@toolbench/sdk": minor
---

A card can show every primary input, and more than one result part

Three changes, all of them about a card that had to say too little.

**Every `primary` input, not the first.** The runtime used `find` where it meant `filter`, so a manifest
marking two inputs primary got one and nothing said why. A question that needs two numbers cannot be asked
with one: a queue card offering an arrival rate without a service time sizes nothing. `validate.ts` no
longer caps the count either, which is a loosening rather than a change, so every manifest that validated
before still validates and no tool has to change.

**A new `parts` attribute on `<tool-host>`.** A compact card rendered exactly one part of a grouped result.
One is too few for a tool whose answer is a number *and* a curve, where the number alone hides how steep
the curve is and the curve alone is a set of unnamed lines. `parts="2"` gives the card room for both, and
whatever does not fit is still counted rather than hidden. Default 1, so existing cards render exactly as
before.

An attribute rather than a manifest key, deliberately: how much room a card has is a property of the page
it sits on, not of the tool, and the same tool is a one-part card in a sidebar and a two-part card leading
a section.

**A card's chart is drawn smaller, not shorter.** Compact mode halved the chart's viewBox height, which took
the plot area from 238 units to 88 and compressed a curve falling from 74% to nothing into an unreadable
band, and dropped the axis titles, the annotation label and the legend with it. None of that was needed: the
geometry is a viewBox scaled to the available width, so a chart on a narrow card is already smaller than one
on a page with its aspect ratio intact. The chart is now identical everywhere, and compact changes only the
rendered size, capped at `--tb-chart-card-max` (52rem). Labels stay legible below that width via a container
query, since text inside a viewBox otherwise shrinks with it.

**A result summary is announced, not displayed.** "6 fields, chart, 2 series, table, 5 rows" rendered above
the result as a line that reads like debug output, describing something already on screen. It is what a
screen reader needs and what a sighted reader does not, so it moves to a visually hidden live region. The
visible line keeps what a reader can act on: prompts, a sample's name, and errors.

No contract version change. Nothing here adds or alters a manifest key, and the one rule that changed was
removed rather than added.
