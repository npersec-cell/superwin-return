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

def is_red_or_orange(pixel):
    r, g, b, a = pixel
    if a < 150:
        return False
    # Red text (high R, low G, low B)
    if r > 160 and g < 80 and b < 80:
        return True
    # Orange/yellow text (high R, medium G, low B)
    if r > 180 and g > 80 and b < 60:
        return True
    return False

for row in range(len(y_starts)):
    for col in range(len(x_starts)):
        name = rank_names[row][col]
        
        x0, x1 = x_starts[col], x_ends[col]
        y0, y1 = y_starts[row], y_ends[row]
        
        # Crop the cell with margin trim to remove grid residue
        margin = 2
        cell = img.crop((x0 + margin, y0 + margin, x1 + 1 - margin, y1 + 1 - margin))
        cw, ch = cell.size
        
        # FIRST: chop bottom 28% to remove text (BRONZE, GOLD, ACE, etc.)
        logo_height = int(ch * 0.72)
        no_text = cell.crop((0, 0, cw, logo_height))
        nw, nh = no_text.size
        
        # SECOND: auto-detect and crop top red/orange text residue
        # Scan from top down to find where red/orange text ends
        top_trim = 0
        for y in range(nh):
            red_count = sum(1 for x in range(nw) if is_red_or_orange(no_text.getpixel((x, y))))
            if red_count > nw * 0.05:  # more than 5% of row is red/orange
                top_trim = y + 1
            else:
                # This row has no red/orange text, but keep scanning a few more rows
                # in case there's a gap within the text
                gap_rows = 0
                for yy in range(y + 1, min(y + 4, nh)):
                    rc = sum(1 for x in range(nw) if is_red_or_orange(no_text.getpixel((x, yy))))
                    if rc > nw * 0.05:
                        gap_rows = yy - y
                        break
                if gap_rows == 0:
                    top_trim = y
                    break
        
        # Add a small buffer after detected text
        top_trim = min(nh - 1, top_trim + 2)
        no_top_text = no_text.crop((0, top_trim, nw, nh))
        
        # THIRD: find bounding box of non-black content
        tw, th = no_top_text.size
        left, top, right, bottom = tw, th, 0, 0
        has_content = False
        
        for y in range(th):
            for x in range(tw):
                r, g, b, a = no_top_text.getpixel((x, y))
                brightness = max(r, g, b)
                is_black = brightness < 20
                is_grid = r > 180 and g > 100 and b < 80 and r > g
                
                if not is_black and not is_grid and a > 100:
                    has_content = True
                    left = min(left, x)
                    right = max(right, x)
                    top = min(top, y)
                    bottom = max(bottom, y)
        
        if has_content:
            # Add small padding
            pad = 4
            left = max(0, left - pad)
            top = max(0, top - pad)
            right = min(tw - 1, right + pad)
            bottom = min(th - 1, bottom + pad)
            content = no_top_text.crop((left, top, right + 1, bottom + 1))
        else:
            content = no_top_text
        
        # FOURTH: make 1:1 with pure black background
        lw, lh = content.size
        sq = max(lw, lh)
        final = Image.new("RGBA", (sq, sq), (0, 0, 0, 255))
        offset_x = (sq - lw) // 2
        offset_y = (sq - lh) // 2
        final.paste(content, (offset_x, offset_y), content)
        
        out_path = os.path.join(out_dir, f"{name}.png")
        final.save(out_path)
        print(f"Saved {name}: top_trim={top_trim}px, content={lw}x{lh}, final={sq}x{sq}")

print("Done!")
