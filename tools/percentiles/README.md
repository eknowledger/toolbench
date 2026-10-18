# Percentiles

Paste measurements (latencies, sizes, durations, anything) and get p50 through p99.9.

## What the two definitions mean

A percentile is a **position in a sorted list**, and there is more than one convention for what to do
when that position falls between two measurements.

- **Nearest rank** returns a value you actually measured. Your p99 is a real event that really took
  that long.
- **Linear interpolation** returns a point between the two measurements either side of the position.
  It is what numpy and R return by default.

Neither is wrong, and on a large sample they nearly agree. On a small or skewed sample they do not:
the table shows the gap for your data. What *is* wrong is comparing two systems whose tools use
different definitions, which happens constantly.

## Why "averaged p99" is in the output

Percentiles do not average. The tool sorts your measurements, splits them into four equal chunks, takes
each chunk's p99, and averages those. That average is what a great many dashboards display, where the
chunks are hosts or minutes rather than slices of a sorted list.

Beside it is the true p99 of everything pooled. The two differ, often by a lot, and **the direction
depends on where the slow measurements fall**:

- **It understates** when there are more slow measurements than the pooled p99 can ignore and they sit
  in one chunk: the quiet chunks dilute them. The default input does this, a true p99 of 1200 against an
  averaged 328.
- **It overstates** when the slow measurements fit inside the slowest 1% of the pool, which the pooled
  p99 is allowed to ignore. They still set their own chunk's p99, and that chunk is a quarter of the
  average. Ninety-nine measurements of `10` and one of `1000` give a true p99 of 10 and an averaged
  p99 of 257.5.

If you take one thing from this tool, take that: an averaged p99 is not a bound on the real one in
either direction. It is wrong by an amount, and with a sign, that the number itself cannot tell you.

## Notes

- Separators can be spaces, commas, semicolons or newlines. Units are yours; the tool does not care.
- A comma sitting between digits with no space after it is refused. `1,204` is one number to a reader
  pasting from a dashboard and two to a reader pasting a list, and `120,140,180` is three latencies or one
  hundred and twenty million depending on who typed it. The tool could pick either rule, and refusing is the
  one that cannot produce a confident wrong answer: a percentile people quote in a meeting is the wrong place
  to guess. Write `1204`, or put a space after each comma.

## What you can paste

Every row below is real behaviour, not an illustration. To enter one thousand two hundred four, write
`1204`.

| Input | Read as |
|---|---|
| `1204 980 1100 1340` | four measurements |
| `1204, 980, 1100, 1340` | four measurements, comma followed by a space |
| `12 14 15` | three |
| `12, 14, 15` | three |
| `12;14;15` | three, semicolons separate too |
| one number per line | three, newlines separate |
| `12.5 14.25 16.75` | three, a full stop is a decimal point |
| `1,204 980 1,100 1,340` | **refused**, comma between digits |
| `12,14,15` | **refused**, same rule, even though it cannot be a grouping |
| `120,140,180` | **refused**, and this is the case the rule exists for |

The rule in one line: **a comma with a space after it separates measurements, a comma wedged between two
digits is refused.**

- ⚠️ The same collision exists for a decimal comma and for a full stop used as a grouping separator, and
  neither is handled: `1.204` is read as 1.204, which is what a reader writing 1204 in a locale that groups
  with full stops did not mean. The tool cannot know the locale, and unlike the comma case there is no
  reading that is obviously safe to refuse, since `12.5` must keep working.
- A non-numeric token is reported at the character where it starts.
- The mean is shown for contrast only. It is not a percentile and does not behave like one.
