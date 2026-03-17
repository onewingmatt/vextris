from PIL import Image, ImageChops

im1 = Image.open('screen.png')
im2 = Image.open('tmp/screen_after2.png')
diff = ImageChops.difference(im1, im2)
print(f"Diff bounding box: {diff.getbbox()}")
