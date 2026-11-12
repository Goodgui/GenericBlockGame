"""Bundle GenericBlockGame into one HTML file with no asset downloads."""

from pathlib import Path
from base64 import b64encode
import re

root = Path(__file__).resolve().parent
html = (root / "index.html").read_text(encoding="utf-8")


def inline_style(match):
    css = (root / match.group(1)).read_text(encoding="utf-8")
    return "<style>\n" + css + "\n</style>"


def inline_script(match):
    script = (root / match.group(1)).read_text(encoding="utf-8")
    script = re.sub(r"</script", r"<\\/script", script, flags=re.IGNORECASE)
    return "<script>\n" + script + "\n</script>"


html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_style, html)
icon = b64encode((root / "icon.svg").read_bytes()).decode("ascii")
html = html.replace('href="icon.svg"', f'href="data:image/svg+xml;base64,{icon}"')
html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)
html = html.replace(
    "<!-- Ordered classic scripts also work when this file is opened with file://. -->",
    "<!-- Standalone export: styles and scripts are included below. -->",
)
output = root / "exports" / "generic-block-game.html"
output.parent.mkdir(exist_ok=True)
output.write_text(html, encoding="utf-8")
print(f"Created {output.name}: {output.stat().st_size:,} bytes")
