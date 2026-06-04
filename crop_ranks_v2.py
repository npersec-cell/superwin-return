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

# Find vertical grid lines
grid_cols = []
for x in range(w):
    bright_count = sum(1 for y in range(h) if is_grid_color(img.getpixel((x, y))))
    if bright_count > h * 0.3:
        grid_cols.append(x)

# Find horizontal grid lines
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

needed = {"bronze", "gold", "diamond", "ace", "conqueror"}

for row in range(len(y_starts)):
    for col in range(len(x_starts)):
        name = rank_names[row][col]
        
        x0, x1 = x_starts[col], x_ends[col]
        y0, y1 = y_starts[row], y_ends[row]
        
        # Crop the cell + add extra 2px margin trim on all sides to remove any grid residue
        margin = 2
        cell = img.crop((x0 + margin, y0 + margin, x1 + 1 - margin, y1 + 1 - margin))
        
        # Content-aware crop: find bounding box of non-black pixels
        # Also exclude orange/yellow grid residue (bright yellow/orange pixels near edges)
        cw, ch = cell.size
        
        # Find content bounds
        left, top, right, bottom = cw, ch, 0, 0
        has_content = False
        
        for y in range(ch):
            for x in range(cw):
                r, g, b, a = cell.getpixel((x, y))
                # Consider as content if not nearly black and not grid color
                brightness = max(r, g, b)
                is_black = brightness < 15
                is_grid = r > 180 and g > 100 and b < 80 and r > g
                
                if not is_black and not is_grid and a > 100:
                    has_content = True
                    left = min(left, x)
                    right = max(right, x)
                    top = min(top, y)
                    bottom = max(bottom, y)
        
        if has_content:
            # Add small padding around content
            pad = 3
            left = max(0, left - pad)
            top = max(0, top - pad)
            right = min(cw - 1, right + pad)
            bottom = min(ch - 1, bottom + pad)
            content = cell.crop((left, top, right + 1, bottom + 1))
        else:
            content = cell
        
        # Make 1:1 with black background
        lw, lh = content.size
        sq = max(lw, lh)
        final = Image.new("RGBA", (sq, sq), (0, 0, 0, 255))
        offset_x = (sq - lw) // 2
        offset_y = (sq - lh) // 2
        final.paste(content, (offset_x, offset_y), content)
        
        out_path = os.path.join(out_dir, f"{name}.png")
        final.save(out_path)
        print(f"Saved {name}: content={lw}x{lh}, final={sq}x{sq}")

print("Done!")
