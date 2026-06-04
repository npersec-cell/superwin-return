from PIL import Image
import os

# Load source sprite sheet
src_path = r'C:\Users\Nontapon Tuvinan\.workbuddy\clipboard-images\clipboard-2026-06-04T06-53-50-604Z-c70d445f.png'
img = Image.open(src_path).convert("RGBA")
w, h = img.size
print(f"Source size: {w}x{h}")

# Detect orange/yellow grid lines
def is_grid_color(pixel):
    r, g, b, a = pixel
    if a < 200:
        return False
    return r > 180 and g > 100 and b < 80 and r > g

grid_cols = []
for x in range(w):
    bright_count = sum(1 for y in range(h) if is_grid_color(img.getpixel((x, y))))
    if bright_count > h * 0.3:
        grid_cols.append(x)

grid_rows = []
for y in range(h):
    bright_count = sum(1 for x in range(w) if is_grid_color(img.getpixel((x, y))))
    if bright_count > w * 0.3:
        grid_rows.append(y)

from itertools import groupby

def group_consecutive(nums):
    groups = []
    for k, g in groupby(enumerate(nums), lambda x: x[0] - x[1]):
        group = list(map(lambda x: x[1], g))
        groups.append((group[0], group[-1]))
    return groups

col_bands = group_consecutive(grid_cols)
row_bands = group_consecutive(grid_rows)

x_starts = [0] + [band[1] + 1 for band in col_bands]
x_ends = [band[0] - 1 for band in col_bands] + [w - 1]
y_starts = [0] + [band[1] + 1 for band in row_bands]
y_ends = [band[0] - 1 for band in row_bands] + [h - 1]

print(f"X boundaries: {list(zip(x_starts, x_ends))}")
print(f"Y boundaries: {list(zip(y_starts, y_ends))}")

rank_names = [
    ["bronze", "silver", "gold", "platinum"],
    ["diamond", "crown", "ace", "conqueror"]
]

out_dir = r'C:\Users\Nontapon Tuvinan\WorkBuddy\2026-05-26-15-39-49\public\ranks'
os.makedirs(out_dir, exist_ok=True)

# For each cell, we keep only the area between:
#   - top: after the small red/orange text (~15% from top)
#   - bottom: before the rank name text (~25% from bottom)
# We use the FULL width of the cell (logo touches left/right edges)
# NO content-aware bounding box — the logo fills the cell width already

for row in range(len(y_starts)):
    for col in range(len(x_starts)):
        name = rank_names[row][col]

        x0, x1 = x_starts[col], x_ends[col]
        y0, y1 = y_starts[row], y_ends[row]

        # Crop the ENTIRE cell (don't trim margins — grid lines will be handled)
        cell = img.crop((x0, y0, x1 + 1, y1 + 1))
        cw, ch = cell.size

        # Remove top 15% (small red/orange text area)
        y_top = int(ch * 0.15)
        # Remove bottom 25% (rank name text like BRONZE, GOLD, etc.)
        y_bottom = int(ch * 0.75)  # keep up to 75% mark

        logo_area = cell.crop((0, y_top, cw, y_bottom))

        # Clean up any orange/yellow grid residue pixels inside logo_area
        # by replacing them with black
        logo_clean = logo_area.copy()
        lw, lh = logo_clean.size
        for y in range(lh):
            for x in range(lw):
                r, g, b, a = logo_clean.getpixel((x, y))
                if a > 200 and r > 180 and g > 100 and b < 80 and r > g:
                    logo_clean.putpixel((x, y), (0, 0, 0, 255))

        # Make 1:1 canvas with pure black background
        lw, lh = logo_clean.size
        sq = max(lw, lh)

        # Add extra padding (10%) so nothing touches edges
        pad = max(8, int(sq * 0.10))
        canvas_size = sq + pad * 2

        final = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 255))

        # Center the logo
        offset_x = (canvas_size - lw) // 2
        offset_y = (canvas_size - lh) // 2

        final.paste(logo_clean, (offset_x, offset_y), logo_clean)

        out_path = os.path.join(out_dir, f"{name}.png")
        final.save(out_path)
        print(f"Saved {name}: logo_area={lw}x{lh}, canvas={canvas_size}x{canvas_size}, offset=({offset_x},{offset_y})")

print("Done!")
