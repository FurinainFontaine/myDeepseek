"""Generate the PNG app icons (run with Python + Pillow).

Usage: python tools/make-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
SCALE = 4


def gradient(size, top, bottom):
    image = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(image)
    for y in range(size):
        t = y / (size - 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        draw.line([(0, y), (size, y)], fill=color)
    return image


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def build(size, maskable=False):
    width = size * SCALE
    background = gradient(width, (11, 18, 32), (23, 36, 64))
    if maskable:
        icon = background.convert("RGBA")
    else:
        icon = Image.new("RGBA", (width, width), (0, 0, 0, 0))
        icon.paste(background, (0, 0), rounded_mask(width, int(width * 0.22)))

    draw = ImageDraw.Draw(icon)
    bubble_w = width * (0.52 if maskable else 0.64)
    bubble_h = bubble_w * 0.66
    cx = width / 2
    cy = width / 2 - width * 0.02
    x0, y0 = cx - bubble_w / 2, cy - bubble_h / 2
    x1, y1 = cx + bubble_w / 2, cy + bubble_h / 2
    white = (255, 255, 255, 255)

    draw.rounded_rectangle([x0, y0, x1, y1], radius=bubble_h * 0.28, fill=white)
    tail_h = bubble_h * 0.26
    draw.polygon(
        [
            (cx - bubble_w * 0.2, y1 - width * 0.004),
            (cx - bubble_w * 0.2, y1 + tail_h),
            (cx - bubble_w * 0.02, y1 - width * 0.004),
        ],
        fill=white,
    )

    dot_r = bubble_h * 0.075
    gap = bubble_w * 0.18
    accent = (59, 91, 255, 255)
    for offset in (-1, 0, 1):
        dx = cx + gap * offset
        draw.ellipse([dx - dot_r, cy - dot_r, dx + dot_r, cy + dot_r], fill=accent)

    return icon.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    build(512).save(OUT / "icon-512.png")
    build(192).save(OUT / "icon-192.png")
    build(180).save(OUT / "apple-touch-icon.png")
    build(512, maskable=True).save(OUT / "icon-maskable-512.png")
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
