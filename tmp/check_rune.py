from PIL import Image
import sys

im = Image.open('screen.png')
# Crop next window
nx, ny, nw, nh = 408, 360, 184, 112
next_win = im.crop((nx, ny, nx+nw, ny+nh))

# Let's see what distinct blocks are present
print("Scanning NEXT window for dark lines or runes...")
# Look for pixels that are very dark (like black) inside the next window, but not the background.
# The background is 0x110d15 (17, 13, 21).

dark_pixels = 0
for y in range(nh):
    for x in range(nw):
        r, g, b, *a = next_win.getpixel((x, y)) if len(next_win.getpixel((0,0))) > 3 else (*next_win.getpixel((x, y)), 255)
        # Background is ~ (17, 13, 21), dark lines inside blocks would be surrounded by brighter colors.
        # But wait, block shadows are black (0,0,0) scaled to 0.4 opacity over background?
        pass
print("Done")
