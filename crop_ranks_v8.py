from PIL import Image
import os

# Load source sprite sheet
src_path = r'C:\Users\Nontapon Tuvinan\.workbuddy\clipboard-images\clipboard-2026-06-04T06-53-50-604Z-c70d445f.png'
img = Image.open(src_path).convert("RGBA")
w, h = img.size
print(f"Source size: {w}x{h}")

# Detect grid bands same as v7
def is_grid_color(pixel):
    r, g, b, a = pixel
    if a < 200: return False
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
x_ends   = [band[0] - 1 for band in col_bands] + [w - 1]
y_starts = [0] + [band[1] + 1 for band in row_bands]
y_ends   = [band[0] - 1 for band in row_bands] + [h - 1]

rank_names = [
    ["bronze", "silver", "gold", "platinum"],
    ["diamond", "crown", "ace", "conqueror"]
]

out_dir = r'C:\Users\Nontapon Tuvinan\WorkBuddy\2026-05-26-15-39-49\public\ranks'
os.makedirs(out_dir, exist_ok=True)

TOP_DISCARD    = 0.18
BOTTOM_DISCARD = 0.28

for row in range(len(y_starts)):
    for col in range(len(x_starts)):
        name = rank_names[row][col]

        x0, x1 = x_starts[col], x_ends[col]
        y0, y1 = y_starts[row], y_ends[row]

        cell = img.crop((x0, y0, x1 + 1, y1 + 1))
        cw, ch = cell.size

        y_top    = int(ch * TOP_DISCARD)
        y_bottom = int(ch * (1.0 - BOTTOM_DISCARD))
        logo_area = cell.crop((0, y_top, cw, y_bottom))
        lw, lh = logo_area.size

        # Content-aware bounding box
        left, top, right, bottom = lw, lh, 0, 0
        has_content = False
        for y in range(lh):
            for x in range(lw):
                r, g, b, a = logo_area.getpixel((x, y))
                brightness = max(r, g, b)
                is_black = brightness < 15
                is_grid  = r > 180 and g > 100 and b < 80 and r > g
                if not is_black and not is_grid and a > 80:
                    has_content = True
                    left   = min(left, x)
                    right  = max(right, x)
                    top    = min(top, y)
                    bottom = max(bottom, y)

        if has_content:
            pad_x = max(2, int((right - left) * 0.06))
            pad_y = max(2, int((bottom - top) * 0.06))
            left   = max(0, left - pad_x)
            top    = max(0, top - pad_y)
            right  = min(lw - 1, right + pad_x)
            bottom = min(lh - 1, bottom + pad_y)
            content = logo_area.crop((left, top, right + 1, bottom + 1))
        else:
            content = logo_area

        cw2, ch2 = content.size
        sq  = max(cw2, ch2)
        final = Image.new("RGBA", (sq, sq), (0, 0, 0, 255))

        offset_x = (sq - cw2) // 2
        # v7: offset_y = (sq - ch2) // 2 + int(sq * 0.05)
        # v8: shift down EXTRA 8px from v7 position
        offset_y = (sq - ch2) // 2 + int(sq * 0.05) + 8

        # Safety clamp: ensure logo doesn't get clipped at bottom
        max_offset_y = sq - ch2
        if offset_y > max_offset_y:
            offset_y = max_offset_y

        final.paste(content, (offset_x, offset_y), content)

        out_path = os.path.join(out_dir, f"{name}.png")
        final.save(out_path)
        print(f"Saved {name}: content={cw2}x{ch2}, sq={sq}, offset_y={offset_y}, max_safe={max_offset_y}")

print("Done!")
