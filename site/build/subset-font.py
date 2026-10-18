"""
Subset the site's optional web font to the characters and the two weights the site uses.

Run by hand, and only when the site's text gains characters the subset lacks; the two outputs are
committed. It needs fonttools (`pip install fonttools brotli`), which is why it is not part of the build:
the repository's tooling is Node, and a font that changes once a year does not justify a Python step in CI.

    python3 site/build/subset-font.py   (after `pnpm site:build`, which it reads for the characters)

The source is Atkinson Hyperlegible Next's variable Latin file (OFL), instanced to 400 and 700. Weights in
between are synthesised to the nearer of the two by the browser, which is why the site's CSS uses only those.
Characters outside the subset, such as CJK or emoji typed into a tool, fall back to the system font.
"""
import glob
import os

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(SITE)
SOURCE = os.path.join(SITE, "build", "font-source", "atkinson-hyperlegible-next-latin.woff2")

chars = {chr(c) for c in range(0x20, 0x7F)}
text = ""
for path in glob.glob(os.path.join(SITE, "dist", "*.html")) + glob.glob(os.path.join(ROOT, "tools", "*", "tool.json")):
    with open(path, encoding="utf8") as f:
        text += f.read()
# Latin-1 and common punctuation the pages actually contain; everything wider falls back.
chars |= {c for c in set(text) if 0x80 <= ord(c) <= 0x24FF and c.isprintable()}
unicodes = sorted(ord(c) for c in chars)

for weight in (400, 700):
    font = instancer.instantiateVariableFont(TTFont(SOURCE), {"wght": weight})
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk"]
    options.name_IDs = []
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    out = os.path.join(SITE, "public", "fonts", f"atkinson-{weight}.woff2")
    subset.save_font(font, out, options)
    print(f"{out}: {os.path.getsize(out)} bytes, {len(unicodes)} characters")
