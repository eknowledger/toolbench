# Histogram

Takes a list of numbers, splits the range into equal-width bins, and draws the counts as bars. The
running share of the data sits on a second axis so a long tail is visible as both a short bar and a
line that has already climbed.

The result is a chart and only a chart. There is no group around it, and no input is marked
`primary`: a compact card therefore shows the first input (the measurements) and has to render a
`series` as the whole answer.

## What it computes

Bins are equal width from the smallest value to the largest. The last bin is closed on the right so
the maximum is counted, not dropped. Each bar is placed at the midpoint of its bin. The right-hand
series is the cumulative count as a percent of the total, to one decimal place.

When every value is the same there is no width to split, so the chart is one bar at that value.

## What this does not handle

- **Automatic bin widths.** Sturges, Scott and Freedman-Diaconis are not used. The reader picks the
  count.
- **Density or relative frequency on the bars.** The bars are counts. The percent is the cumulative
  line, not a normalisation of the bars.
- **Categories or dates.** Tokens have to be finite numbers.
- **Unequal bins or explicit edges.** There is no way to say "break at 0, 10, 50, 100".
- **Outlier fences.** A single extreme value stretches every bin. That is the honest picture of the
  range, and it is also why a log scale would be a different tool.

## Separators

Spaces, commas, semicolons and newlines. A comma sitting between two digits (`1,204`) is an error:
the tokenizer would otherwise read that as 1 and 204, and the chart would look plausible while
being wrong.
