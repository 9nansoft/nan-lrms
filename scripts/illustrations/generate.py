"""Regenerate the NN-LRMS illustration set from manifest.json.

Usage: python3 scripts/illustrations/generate.py [--only file.webp]
Writes public/illustrations/<file> (webp, max 900px, quality stepped down to
fit <=150 KB) and records the seed actually used back into the manifest so
reruns are reproducible.
"""
import base64, io, json, pathlib, sys, urllib.request
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "scripts/illustrations/manifest.json"
OUT = ROOT / "public/illustrations"
API = "https://text2image-flux2.bmscloud.in.th/v1/generate"
MAX_BYTES = 150 * 1024


def generate(style: str, item: dict) -> tuple[bytes, int]:
    body = {"prompt": f"{item['prompt']} {style}", "aspect": item["aspect"],
            "num_inference_steps": 40, "transparent": item["transparent"]}
    if item.get("seed"):
        body["seed"] = item["seed"]
    req = urllib.request.Request(API, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        res = json.load(r)
    first = res["images"][0]
    b64 = first if isinstance(first, str) else (first.get("b64_json") or first.get("image") or first.get("data"))
    seed = res.get("seed") or (first.get("seed") if isinstance(first, dict) else None)
    return base64.b64decode(b64.split(",")[-1]), int(seed)


def trim_transparent(im: Image.Image, pad_ratio: float = 0.06) -> Image.Image:
    """Crop empty (fully transparent) margins, keeping a small even padding, so
    the subject fills the EmptyState card instead of floating in a big margin."""
    if im.mode != "RGBA":
        return im
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if not box:
        return im
    pad = int(max(box[2] - box[0], box[3] - box[1]) * pad_ratio)
    return im.crop((max(box[0] - pad, 0), max(box[1] - pad, 0),
                    min(box[2] + pad, im.width), min(box[3] + pad, im.height)))


def to_webp(png: bytes, transparent: bool = False) -> bytes:
    im = Image.open(io.BytesIO(png))
    if transparent:
        im = trim_transparent(im)
    im.thumbnail((900, 900))
    for q in (82, 74, 66, 58, 50):
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=q)
        if buf.tell() <= MAX_BYTES:
            return buf.getvalue()
    raise SystemExit("cannot fit under 150 KB — simplify the prompt")


def main() -> None:
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    manifest = json.loads(MANIFEST.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for item in manifest["items"]:
        if only and item["file"] != only:
            continue
        print(f"[illustrations] generating {item['file']} (seed {item.get('seed') or 'new'}) ...", flush=True)
        png, seed = generate(manifest["style"], item)
        data = to_webp(png, item["transparent"])
        (OUT / item["file"]).write_bytes(data)
        item["seed"] = seed
        print(f"[illustrations] {item['file']}: {len(data)//1024} KB, seed {seed}", flush=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
