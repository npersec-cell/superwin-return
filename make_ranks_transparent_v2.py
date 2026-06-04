from PIL import Image
import os

ranks = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'ace', 'conqueror', 'crown']
out_dir = r'C:\Users\Nontapon Tuvinan\WorkBuddy\2026-05-26-15-39-49\public\ranks'

for name in ranks:
    path = os.path.join(out_dir, f'{name}.png')
    if not os.path.exists(path):
        print(f"SKIP: {path} not found")
        continue

    img = Image.open(path).convert('RGBA')
    w, h = img.size

    # Replace very dark pixels with transparent
    # Use a threshold that removes the solid background but keeps icon shadows
    pixels = img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r < 30 and g < 30 and b < 30 and a > 0:
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
