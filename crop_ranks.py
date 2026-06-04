from PIL import Image
import os

# Load source sprite sheet
src_path = r'C:\Users\Nontapon Tuvinan\.workbuddy\clipboard-images\clipboard-2026-06-04T06-53-50-604Z-c70d445f.png'
img = Image.open(src_path).convert("RGBA")
w, h = img.size
print(f"Source size: {w}x{h}")

# Detect orange/yellow grid lines by scanning for bright pixels
# Strategy: find columns/rows where most pixels are bright orange/yellow (grid lines)

def is_grid_color(pixel):
    r, g, b, a = pixel
    # Orange/yellow grid lines: high red, medium green, low blue
    if a < 200:
        return False
    return r > 180 and g > 100 and b < 80 and r > g

# Find vertical grid lines (columns)
grid_cols = []
for x in range(w):
    bright_count = sum(1 for y in range(h) if is_grid_color(img.getpixel((x, y))))
    if bright_count > h * 0.3:  # more than 30% of column is grid color
        grid_cols.append(x)

# Find horizontal grid lines (rows)  
grid_rows = []
for y in range(h):
    bright_count = sum(1 for x in range(w) if is_grid_color(img.getpixel((x, y))))
    if bright_count > w * 0.3:  # more than 30% of row is grid color
        grid_rows.append(y)

print(f"Detected grid cols: {grid_cols}")
print(f"Detected grid rows: {grid_rows}")

# Group consecutive grid lines into bands
from itertools import groupby

def group_consecutive(nums):
    groups = []
    for k, g in groupby(enumerate(nums), lambda x: x[0] - x[1]):
        group = list(map(lambda x: x[1], g))
        groups.append((group[0], group[-1]))
    return groups

col_bands = group_consecutive(grid_cols)
row_bands = group_consecutive(grid_rows)

print(f"Grid col bands: {col_bands}")
print(f"Grid row bands: {row_bands}")

# Define cell boundaries using grid bands
# There should be 4 columns and 2 rows
x_starts = [0] + [band[1] + 1 for band in col_bands]
x_ends = [band[0] - 1 for band in col_bands] + [w - 1]

y_starts = [0] + [band[1] + 1 for band in row_bands]
y_ends = [band[0] - 1 for band in row_bands] + [h - 1]

print(f"X boundaries: {list(zip(x_starts, x_ends))}")
print(f"Y boundaries: {list(zip(y_starts, y_ends))}")

# Rank names in order (top-left to bottom-right)
rank_names = [
    ["bronze", "silver", "gold", "platinum"],
    ["diamond", "crown", "ace", "conqueror"]
]

# Output directory
out_dir = r'C:\Users\Nontapon Tuvinan\WorkBuddy\2026-05-26-15-39-49\public\ranks'
os.makedirs(out_dir, exist_ok=True)

# We only need these 5 ranks
needed = {"bronze", "gold", "diamond", "ace", "conqueror"}

# For each cell, crop to the logo only (remove text at bottom), then make 1:1
for row in range(len(y_starts)):
    for col in range(len(x_starts)):
        name = rank_names[row][col]
        
        x0, x1 = x_starts[col], x_ends[col]
        y0, y1 = y_starts[row], y_ends[row]
        
        # Crop the cell
        cell = img.crop((x0, y0, x1 + 1, y1 + 1))
        cw, ch = cell.size
        
        # Remove text at bottom: keep only top ~72% of height
        # The text "BRONZE" etc is at the very bottom
        logo_height = int(ch * 0.72)
        logo = cell.crop((0, 0, cw, logo_height))
        
        # Now make it 1:1 by cropping from center
        lw, lh = logo.size
        if lw > lh:
            # Too wide, crop width to match height
            diff = lw - lh
            left = diff // 2
            right = lw - (diff - left)
            square = logo.crop((left, 0, right, lh))
        elif lh > lw:
            # Too tall, crop height to match width  
            diff = lh - lw
            top = diff // 2
            bottom = lh - (diff - top)
            square = logo.crop((0, top, lw, bottom))
        else:
            square = logo
        
        # Add a small black padding (5%) so it doesn't feel cramped
        sq_size = max(square.size)
        padding = max(2, int(sq_size * 0.06))
        final_size = sq_size + padding * 2
        final = Image.new("RGBA", (final_size, final_size), (0, 0, 0, 255))
        final.paste(square, (padding, padding), square)
        
        # Save
        out_path = os.path.join(out_dir, f"{name}.png")
        final.save(out_path)
        print(f"Saved {name}: original cell={cw}x{ch}, logo={lw}x{lh}, final={final_size}x{final_size}")

print("Done!")
