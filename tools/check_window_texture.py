"""Compare the converted stained-glass atlas with its original BMP reference."""

from pathlib import Path
import struct

from build_browser_assets import ROOT, convert_tm2

tm2 = (ROOT / "Server/resources/window_.tm2").read_bytes()
bmp = (ROOT / "Server/resource/window.bmp").read_bytes()
offset = struct.unpack_from("<I", bmp, 10)[0]
width, height = struct.unpack_from("<ii", bmp, 18)
if (width, height) != (256, 256) or struct.unpack_from("<H", bmp, 28)[0] != 8:
    raise SystemExit("Unexpected BMP format")
palette_bmp = bmp[54:54 + 1024]
image_bmp = bmp[offset:offset + width * height]

header_size = struct.unpack_from("<H", tm2, 28)[0]
image_size = struct.unpack_from("<I", tm2, 24)[0]
raw = tm2[16 + header_size:16 + header_size + image_size]
clut = tm2[16 + header_size + image_size:]

matches = [0, 0]
for y in range(height):
    for x in range(width):
        block = (y & ~15) * width + (x & ~15) * 2
        swap = (((y + 2) >> 2) & 1) * 4
        pos_y = (((y & ~3) >> 1) + (y & 1)) & 7
        column = pos_y * width * 2 + ((x + swap) & 7) * 4
        byte = ((y >> 1) & 1) + ((x >> 2) & 2)
        index = raw[block + column + byte]
        expected = palette_bmp[image_bmp[(height - 1 - y) * width + x] * 4:][:3]
        for candidate, source_index in enumerate((index, (index & 231) + ((index & 8) << 1) + ((index & 16) >> 1))):
            actual = clut[source_index * 4:][:3]
            if actual == expected:
                matches[candidate] += 1

print(f"Matching RGB pixels, direct CLUT: {matches[0]}/{width*height}; reordered CLUT: {matches[1]}/{width*height}")
