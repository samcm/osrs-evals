#!/usr/bin/env python3
# Writes site/public/assets/brands/<slug>.svg and SOURCES.md: one-colour marks for BrandMark's CSS mask
# (shape in the alpha, square viewBox), and the wordmark font to site/public/assets/fonts/.
# Fetches pinned npm packages, Amp's press kit and RuneStar's font release (needs npm and the network).
#   python3 site/game/brands.py
import datetime, io, re, subprocess, sys, tarfile, tempfile, urllib.request, zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public/assets/brands"
LOBE, SIMPLE = "@lobehub/icons-static-svg@1.104.0", "simple-icons@16.38.0"
AMP = "https://ampcode.com/logo-light.svg"
OMP = "https://raw.githubusercontent.com/can1357/oh-my-pi/c61a4881a55389ca576662d62dbee0399463a0c1/assets/icon.svg"
FONTS = "https://github.com/RuneStar/fonts/releases/download/1.103-0/RuneScape-Fonts.zip"

# slug: (source, file in package, product it names, note)
MARKS = {
    "anthropic": ("lobe", "anthropic", "Anthropic", ""),
    "openai": ("lobe", "openai", "OpenAI", ""),
    "google": ("lobe", "google", "Google", ""),
    "meta": ("lobe", "meta", "Meta", ""),
    "xai": ("lobe", "xai", "xAI", ""),
    "deepseek": ("lobe", "deepseek", "DeepSeek", ""),
    "moonshot": ("lobe", "moonshot", "Moonshot AI", ""),
    "qwen": ("lobe", "qwen", "Qwen (Alibaba)", ""),
    "zhipu": ("lobe", "zhipu", "Zhipu AI (GLM)", ""),
    "mistral": ("lobe", "mistral", "Mistral AI", ""),
    "claude": ("lobe", "claude", "Claude", ""),
    "gemini": ("lobe", "gemini", "Gemini", ""),
    "claude-code": ("lobe", "claudecode", "Claude Code", "Claude Code's own mark (lobehub `claudecode`), not the Claude spark."),
    "codex": ("lobe", "codex", "Codex CLI", "OpenAI's Codex mark (lobehub `codex`)."),
    "opencode": ("lobe", "opencode", "OpenCode", ""),
    "amp": ("amp", None, "Amp", "The press kit's `logo-light.svg` wordmark, placed as in its square `app-icon.svg` (1024 box, wordmark at translate(113 302.27) scale(2.8363)) without the icon's background. The press kit has only this wordmark and the app icon (lobehub's `amp` mark is not in it)."),
    "bash": ("simple", "gnubash", "bash", "The GNU Bash logo, MIT licensed (github.com/odb/official-bash-logo), for model + bash agents."),
    "omp": ("omp", None, "omp (oh-my-pi)", "The repository's `assets/icon.svg` (the pi with its plugin connector), one colour: the connector's two dark pins cut out of it, the 120×90 box centred in a square."),
}


def omp_mark(svg: str, title: str) -> str:
    """omp's icon as one shape: its light and orange parts filled, its dark parts (the connector's
    pins) cut out, in a square box."""
    shapes = re.findall(r"<(rect|circle)\b([^>]*?)/>", svg)
    keep, cut = [], []
    for tag, attrs in shapes:
        fill = re.search(r'fill="([^"]+)"', attrs).group(1).lower()
        bare = re.sub(r'\s*(fill|opacity)="[^"]*"', "", attrs).strip()
        (cut if fill == "#0d0d0d" else keep).append(f"<{tag} {bare}/>")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -15 120 120"><title>{title}</title>'
            f'<mask id="m"><rect x="0" y="-15" width="120" height="120" fill="#fff"/><g fill="#000">{"".join(cut)}</g></mask>'
            f'<g mask="url(#m)">{"".join(keep)}</g></svg>\n')


def npm(spec: str, into: Path) -> Path:
    name = subprocess.run(["npm", "pack", "--silent", spec], cwd=into, check=True, capture_output=True, text=True).stdout.split()[-1]
    with tarfile.open(into / name) as t:
        t.extractall(into / spec.split("@")[-2].strip("/").replace("/", "_"), filter="data")
    return into / spec.split("@")[-2].strip("/").replace("/", "_") / "package/icons"


def clean(svg: str, title: str) -> str:
    """Keep the viewBox and paths; drop size, style and colour so only the shape remains."""
    vb = re.search(r'viewBox="([^"]+)"', svg).group(1)
    x, y, w, h = map(float, vb.split())
    assert w == h, f"{title}: viewBox {vb} is not square"
    body = re.sub(r"<title>.*?</title>", "", svg[svg.index(">", svg.index("<svg")) + 1 : svg.rindex("</svg>")], flags=re.S)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><title>{title}</title>{body.strip()}</svg>\n'


def get(url: str) -> bytes:
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    fonts = OUT.parent / "fonts"
    fonts.mkdir(exist_ok=True)
    (fonts / "RuneScape-Bold-12.ttf").write_bytes(zipfile.ZipFile(io.BytesIO(get(FONTS))).read("ttf/RuneScape-Bold-12.ttf"))
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        dirs = {"lobe": npm(LOBE, tmp), "simple": npm(SIMPLE, tmp)}
        amp = get(AMP).decode()
        rows = []
        for slug, (src, file, product, note) in MARKS.items():
            if src == "omp":
                svg = omp_mark(get(OMP).decode(), product)
                url, version, licence = OMP, "can1357/oh-my-pi c61a488", "MIT (can1357/oh-my-pi)"
            elif src == "amp":
                d = re.search(r'<path d="([^"]+)"', amp).group(1)
                svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>{product}</title><path transform="translate(113 302.27) scale(2.8362989324)" d="{d}"/></svg>\n'
                url, version, licence = "https://ampcode.com/press-kit (" + AMP + ")", "fetched " + datetime.date.today().isoformat(), "Amp's press kit; trademark of Amp"
            else:
                svg = clean((dirs[src] / f"{file}.svg").read_text(), product)
                pkg = LOBE if src == "lobe" else SIMPLE
                name, version = pkg.rsplit("@", 1)
                url = f"https://unpkg.com/{name}@{version}/icons/{file}.svg"
                licence = "MIT (lobehub/lobe-icons)" if src == "lobe" else ("MIT (odb/official-bash-logo); simple-icons package CC0-1.0" if slug == "bash" else "simple-icons package CC0-1.0")
                version = f"{name} {version}"
            (OUT / f"{slug}.svg").write_text(svg)
            rows.append(f"| `{slug}.svg` | {product} | {url} | {version} | {licence} | {note} |")
    (OUT / "SOURCES.md").write_text(f"""# Brand marks

Generated by `site/game/brands.py`. Each file is the source's one-colour mark with its size, style and
colour attributes removed (shape only, square viewBox, no added padding), for `BrandMark`'s CSS mask.
The game sprite `program.png` (item 21, Cog) stands for the scripted baseline and comes from the game cache
(`site/game/art.ts`); like all game art it is Jagex's, from 2004scape.

Logos and names are trademarks of their owners, used here only to name their products. Their use
here implies no endorsement. Owners' terms: anthropic.com/legal/trademark-guidelines,
openai.com/brand, x.ai/legal/brand-guidelines, mistral.ai/brand, opencode.ai/brand,
ampcode.com/press-kit, kimi.ai/resources/kimi-brand, facebook.com/brand/resources/meta/company-brand.

| File | Names | Source | Version | Licence of the drawing | Note |
| --- | --- | --- | --- | --- | --- |
{chr(10).join(rows)}

## Fonts

`../fonts/RuneScape-Bold-12.ttf` (wordmark only): RuneStar/fonts release 1.103-0 ({FONTS}),
CC0-1.0, the same file rs-world ships in `src/media`. The TTF conversion is CC0; the glyph designs are
Jagex's (`b12_full` in the game cache). Use at 16px or an integer multiple, without smoothing.
""")
    print(f"brands: {len(MARKS)} marks -> {OUT}", file=sys.stderr)


main()
