from PIL import Image
import os

ranks = {
    'bronze': 'bromze.jpg',
    'gold': 'gold.jpg',
    'diamond': 'diamond.jpg',
    'ace': 'ace.jpg',
    'conqueror': 'con.jpg',
}

# Source images from user's uploaded clipboard images
src_dir = r'C:\Users\Nontapon Tuvinan\.workbuddy\clipboard-images'
out_dir = r'C:\Users\Nontapon Tuvinan\WorkBuddy\2026-05-26-15-39-49\public\ranks'

for name, filename in ranks.items():
    # Find the file in clipboard-images (may have timestamp prefix)
    src_path = None
    for f in os.listdir(src_dir):
        if f.endswith(filename):
            src_path = os.path.join(src_dir, f)
            break

    if not src_path:
        print(f"SKIP: {filename} not found in {src_dir}")
        continue

    img = Image.open(src_path).convert('RGBA')
    w, h = img.size

    # Make dark background pixels transparent
    # Threshold: pixels where all channels are very dark (< 35)
    data = img.getdata()
    new_data = []
    for r, g, b, a in data:
        if r < 35 and g < 35 and b < 35:
            new_data.append((0, 0, 0, 0))  # fully transparent
        else:
            new_data.append((r, g, b, a))
    img.putdata(new_data)

    # Find bounding box of non-transparent pixels
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    # Create square transparent canvas with 15% padding
    cw, ch = img.size
    sq = max(cw, ch)
    pad = int(sq * 0.15)
    canvas_size = sq + pad * 2

    canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    ox = (canvas_size - cw) // 2
    oy = (canvas_size - ch) // 2 + int(canvas_size * 0.03)  # slight downward shift
    canvas.paste(img, (ox, oy), img)

    out_path = os.path.join(out_dir, f'{name}.png')
    canvas.save(out_path)
    print(f"{name}: {canvas_size}x{canvas_size} transparent bg")
