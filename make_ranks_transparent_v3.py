from PIL import Image
import os

ranks = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'ace', 'conqueror', 'crown']
out_dir = r'C:\Users\Nontapon Tuvinan\WorkBuddy\2026-05-26-15-39-49\public\ranks'

for name in ranks:
    path = os.path.join(out_dir, f'{name}.png')
    if not os.path.exists(path):
        continue

    img = Image.open(path).convert('RGBA')
    w, h = img.size

    # Sample corner pixels to detect background color
    corners = [
        img.getpixel((0, 0)),
        img.getpixel((w-1, 0)),
        img.getpixel((0, h-1)),
        img.getpixel((w-1, h-1)),
    ]
    # Average corner colors (ignore alpha)
    bg_r = sum(c[0] for c in corners) // 4
    bg_g = sum(c[1] for c in corners) // 4
    bg_b = sum(c[2] for c in corners) // 4
    print(f"{name}: detected bg RGB=({bg_r},{bg_g},{bg_b})")

    # Make pixels close to background color transparent
    # Use Euclidean distance in RGB space
    threshold = 45  # distance threshold
    pixels = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            dist = ((r - bg_r)**2 + (g - bg_g)**2 + (b - bg_b)**2) ** 0.5
            if dist < threshold:
                pixels[x, y] = (0, 0, 0, 0)

    # Trim transparent edges
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    # Recenter on transparent square canvas with padding
    cw, ch = img.size
    sq = max(cw, ch)
    pad = int(sq * 0.12)
    canvas_size = sq + pad * 2

    canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    ox = (canvas_size - cw) // 2
    oy = (canvas_size - ch) // 2 + int(canvas_size * 0.02)
    canvas.paste(img, (ox, oy), img)

    canvas.save(path)
    print(f"{name}: {canvas_size}x{canvas_size} transparent bg")
