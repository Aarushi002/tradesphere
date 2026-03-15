"""
Enhance logo: transparent background + darker colors for T-shirt printing.
"""
from PIL import Image
import os

# Paths: input is in Cursor project assets; output in workspace assets
INPUT_PATH = r"C:\Users\aarus\.cursor\projects\d-Desktop-Projects-tradesphere\assets\c__Users_aarus_AppData_Roaming_Cursor_User_workspaceStorage_c6513dd32f145425f1b2b4e2f6b1a638_images_Untitled_design__2_-663b66c8-f9bf-4a6d-8955-f1e12f25aca4.png"
OUTPUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gamma-flow-capital-tshirt.png")

# Threshold: pixels with R,G,B all below this are treated as background (made transparent)
BLACK_THRESHOLD = 55
# How much to darken foreground (0.0–1.0; lower = darker). 0.55 = noticeably darker for print
DARKEN_FACTOR = 0.55

def main():
    img = Image.open(INPUT_PATH).convert("RGBA")
    w, h = img.size
    pixels = img.load()

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            # Treat near-black as background -> full transparency
            if r <= BLACK_THRESHOLD and g <= BLACK_THRESHOLD and b <= BLACK_THRESHOLD:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                # Darken foreground colors
                nr = int(r * DARKEN_FACTOR)
                ng = int(g * DARKEN_FACTOR)
                nb = int(b * DARKEN_FACTOR)
                pixels[x, y] = (nr, ng, nb, a)

    img.save(OUTPUT_PATH, "PNG")
    print(f"Saved: {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
