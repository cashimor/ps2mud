"""Print the palette sample used by the original T* shadow meshes."""

from pathlib import Path
import struct
import zlib

root = Path(__file__).resolve().parents[1]
data = (root / "browser/public/assets/textures/window_.tm2.png").read_bytes()
width, height = struct.unpack_from(">II", data, 16)
chunks = []
offset = 8
while offset < len(data):
    size = struct.unpack_from(">I", data, offset)[0]
    kind = data[offset + 4:offset + 8]
    if kind == b"IDAT":
        chunks.append(data[offset + 8:offset + 8 + size])
    offset += 12 + size
raw = zlib.decompress(b"".join(chunks))
stride = 1 + width * 4
for x, y in ((0, 0), (0, height - 1), (1, 1), (width - 1, height - 1)):
    pixel = raw[y * stride + 1 + x * 4:y * stride + 1 + (x + 1) * 4]
    print(f"({x},{y}): {tuple(pixel)}")
