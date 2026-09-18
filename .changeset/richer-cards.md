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

**A compact chart keeps its legend.** Compact mode dropped the axis titles and the legend together. That is
fine for one series and wrong for two: a card showing two coloured lines with no key is decoration, and a
reader cannot tell which line is which or in what unit. The legend carries both the label and the unit, so
it says more per pixel than either axis title, and it costs one line of text.

No contract version change. Nothing here adds or alters a manifest key, and the one rule that changed was
removed rather than added.
