from PIL import Image
import os

# Website background color to blend with
WEBSITE_BG = (32, 37, 43)  # #20252b — matches var(--card) used in .stats, .panel, .modal-card

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

    # Create 1:1 canvas with WEBSITE background color (not pure black)
    sq = max(w, h)
    pad = max(8, int(sq * 0.10))
    canvas_size = sq + pad * 2

    canvas = Image.new("RGBA", (canvas_size, canvas_size), WEBSITE_BG + (255,))

    # Center the image
    offset_x = (canvas_size - w) // 2
    offset_y = (canvas_size - h) // 2

    canvas.paste(img, (offset_x, offset_y), img)

    out_path = os.path.join(out_dir, f"{name}.png")
    canvas.save(out_path)
    print(f"Saved {name}: {canvas_size}x{canvas_size} with bg #{WEBSITE_BG[0]:02x}{WEBSITE_BG[1]:02x}{WEBSITE_BG[2]:02x}")

print("Done!")
