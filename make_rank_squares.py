from PIL import Image
import os

# Map of input file to output rank name
ranks = {
    r'C:\Users\Nontapon Tuvinan\Desktop\bromze.jpg': 'bronze',
    r'C:\Users\Nontapon Tuvinan\Desktop\gold.jpg': 'gold',
    r'C:\Users\Nontapon Tuvinan\Desktop\diamond.jpg': 'diamond',
    r'C:\Users\Nontapon Tuvinan\Desktop\ace.jpg': 'ace',
    r'C:\Users\Nontapon Tuvinan\Desktop\con.jpg': 'conqueror',
}

out_dir = r'C:\Users\Nontapon Tuvinan\WorkBuddy\2026-05-26-15-39-49\public\ranks'
os.makedirs(out_dir, exist_ok=True)

for src_path, name in ranks.items():
    img = Image.open(src_path).convert("RGBA")
    w, h = img.size
    print(f"{name}: input {w}x{h}")

    # Create 1:1 canvas: use max dimension + 10% padding on all sides
    sq = max(w, h)
    pad = max(8, int(sq * 0.10))
    canvas_size = sq + pad * 2

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 255))

    # Center the image
    offset_x = (canvas_size - w) // 2
    offset_y = (canvas_size - h) // 2

    canvas.paste(img, (offset_x, offset_y), img)

    out_path = os.path.join(out_dir, f"{name}.png")
    canvas.save(out_path)
    print(f"  → saved {canvas_size}x{canvas_size} to {out_path}")

print("Done!")
