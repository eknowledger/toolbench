# UTF-8 bytes

Encodes a string as UTF-8 and shows the result as a hex dump, marking every character that needs more
than one byte.

## What it computes

UTF-8 encodes a code point in one to four bytes. ASCII (U+0000 to U+007F) stays one byte, which is the
property that made UTF-8 win. Everything else costs more, and the "Overhead" field is exactly that cost:
bytes minus code points.

Highlighted runs are one character each. Four-byte sequences are marked differently because they are
where naive code usually breaks: they are the ones outside the Basic Multilingual Plane, and in
JavaScript they occupy two UTF-16 units.

## What it does not handle

- **Graphemes.** "Characters" means Unicode code points. A combining mark is its own code point, so
  `e` + U+0301 counts as two characters and three bytes even though it looks like one letter. One of the
  fixtures pins that behaviour rather than hiding it.
- **Other encodings.** UTF-8 only. UTF-16 and legacy code pages are a different tool.
- **Normalisation.** The input is encoded as given. NFC and NFD forms of the same text produce different
  byte counts, correctly.
- **Invalid input.** A JavaScript string cannot hold an invalid UTF-8 sequence, so there is nothing to
  reject. A lone surrogate is replaced with U+FFFD by `TextEncoder`, per the WHATWG encoding standard.

## Reference

- [RFC 3629](https://www.rfc-editor.org/rfc/rfc3629), UTF-8, a transformation format of ISO 10646
