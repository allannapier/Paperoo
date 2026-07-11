"""Bundle the game into one self-contained HTML file.

Inlines js/sprites.js and js/game.js into index.html and embeds every PNG
present in assets/ as a data: URI via window.INLINE_ASSETS, so the result
runs with no network access at all (e.g. as a Claude Artifact preview).

Usage: python3 tools/build_single.py [output.html]
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

def build(out_path):
    html = (ROOT / 'index.html').read_text()

    assets = {}
    for png in sorted((ROOT / 'assets').glob('*.png')):
        b64 = base64.b64encode(png.read_bytes()).decode()
        assets[png.stem] = f'data:image/png;base64,{b64}'
    inline = 'window.INLINE_ASSETS = {\n' + ',\n'.join(
        f'  {k!r}: {v!r}' for k, v in assets.items()) + '\n};'

    def inline_script(m):
        src = m.group(1)
        return '<script>\n' + (ROOT / src).read_text() + '\n</script>'

    html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_script, html)
    html = html.replace('<script>', f'<script>{inline}</script>\n<script>', 1)

    pathlib.Path(out_path).write_text(html)
    print(f'wrote {out_path} with {len(assets)} embedded sprites')

if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'paperoo.html')
