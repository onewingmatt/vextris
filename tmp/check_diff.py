from PIL import Image

def get_reddest(img_path):
    im = Image.open(img_path)
    # the NEXT window bounds
    nx, ny, nw, nh = 408, 360, 184, 112
    crop = im.crop((nx, ny, nx+nw, ny+nh))
    pixels = crop.getdata()
    max_red = 0
    # look for pixels with high red but relatively low blue/green
    count_reddish = 0
    for r, g, b, *a in pixels:
        # just measure reddish-ness
        if r > g + 20 and r > b + 10 and r < 150: # The sigil color is dark red
            count_reddish += 1
    return count_reddish

c1 = get_reddest('screen.png')
c2 = get_reddest('tmp/screen_after.png')
print(f"Reddish pixels BEFORE: {c1}")
print(f"Reddish pixels AFTER: {c2}")
