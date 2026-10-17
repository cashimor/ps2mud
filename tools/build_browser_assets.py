"""Convert the PS2MUD village rooms into PNG, glTF, and a scene manifest."""

from __future__ import annotations

import base64
import json
from pathlib import Path
import re
import struct
import wave
import zlib

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Server" / "resources"
ROOMS = ROOT / "Server" / "rooms"
AUDIO = ROOT / "Server" / "audio"
OUT = ROOT / "browser" / "public" / "assets"
ROOM_NAMES = tuple(path.stem for path in sorted(ROOMS.glob("village*.room")))
AVATAR_ANIMATION = "brwm.ani"
AVATAR_TEXTURE = "woman8_.tm2"


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def write_png(path: Path, width: int, height: int, rgba: bytes) -> None:
    rows = b"".join(b"\x00" + rgba[y * width * 4:(y + 1) * width * 4] for y in range(height))
    data = b"\x89PNG\r\n\x1a\n"
    data += png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    data += png_chunk(b"IDAT", zlib.compress(rows, 9))
    data += png_chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def convert_tm2(source: Path, target: Path) -> dict:
    data = source.read_bytes()
    if data[:4] != b"TIM2" or data[4] != 0xEE or struct.unpack_from("<H", data, 6)[0] != 1:
        raise ValueError(f"Unsupported TIM2 header: {source.name}")
    total, clut_size, image_size, header_size, colors = struct.unpack_from("<IIIHH", data, 16)
    clut_type, image_type = data[34], data[35]
    upload_width, upload_height = struct.unpack_from("<HH", data, 36)
    width, height = struct.unpack_from("<HH", data, 64)
    original_type = data[68]
    if image_type != 3 or original_type != 5 or colors != 256 or image_size != width * height or upload_width * upload_height * 4 != image_size:
        raise ValueError(f"Unsupported TIM2 image format: {source.name}")
    color_bytes = {2: 3, 3: 4}.get(clut_type & 0x3F)
    if color_bytes is None or clut_size != 256 * color_bytes:
        raise ValueError(f"Unsupported TIM2 palette: {source.name}")
    image_start = 16 + header_size
    swizzled = data[image_start:image_start + image_size]
    indices = bytearray(image_size)
    for y in range(height):
        for x in range(width):
            block = (y & ~15) * width + (x & ~15) * 2
            swap = (((y + 2) >> 2) & 1) * 4
            pos_y = (((y & ~3) >> 1) + (y & 1)) & 7
            column = pos_y * width * 2 + ((x + swap) & 7) * 4
            byte = ((y >> 1) & 1) + ((x >> 2) & 2)
            indices[y * width + x] = swizzled[block + column + byte]
    palette = data[image_start + image_size:image_start + image_size + clut_size]
    if len(indices) != image_size or len(palette) != clut_size or 16 + total > len(data):
        raise ValueError(f"Truncated TIM2: {source.name}")
    rgba = bytearray(width * height * 4)
    for pixel, index in enumerate(indices):
        # The loader's CLUT upload permutation is reversed by the GS lookup.
        # The supplied window.bmp confirms that the file's palette is direct.
        base = index * color_bytes
        blue, green, red = palette[base:base + 3]
        # The PS2 loader replaces palette alpha with 128 for ordinary textures;
        # several atlases (including fluids8_) store zero in every alpha byte.
        # Transparency for T/U/V models is applied by the renderer instead.
        # The window atlas uses near-black index 0 as empty glass artwork.
        alpha = (0 if index == 0 else 255) if source.name == "window_.tm2" else 255
        rgba[pixel * 4:pixel * 4 + 4] = bytes((red, green, blue, alpha))
    write_png(target, width, height, rgba)
    return {"width": width, "height": height, "paletteBytes": color_bytes}


def meaningful_lines(path: Path) -> list[str]:
    return [line.strip() for line in path.read_text(encoding="latin-1").splitlines()
            if line.strip() and not line.lstrip().startswith("//")]


def convert_model(source: Path, target: Path) -> dict:
    lines = iter(meaningful_lines(source))
    if not next(lines).startswith("Frames:") or not next(lines).startswith("Frame:"):
        raise ValueError(f"Invalid MilkShape header: {source.name}")
    mesh_count = int(next(lines).split(":", 1)[1])
    positions: list[float] = []
    normals_out: list[float] = []
    uvs: list[float] = []
    triangle_count = 0
    for _ in range(mesh_count):
        next(lines)  # mesh name, flags, material
        vertices = [next(lines).split() for _ in range(int(next(lines)))]
        normals = [next(lines).split() for _ in range(int(next(lines)))]
        triangles = [next(lines).split() for _ in range(int(next(lines)))]
        for tri in triangles:
            if len(tri) < 7:
                raise ValueError(f"Malformed triangle in {source.name}")
            corners = []
            for corner in range(3):
                vert = vertices[int(tri[corner + 1])]
                normal = normals[int(tri[corner + 4])]
                corners.append(([float(value) for value in vert[1:4]],
                                [float(value) for value in normal[:3]],
                                # Tchurch.txt contains UV tokens such as "0,0.4"; keep the final value.
                                [float(value.split(",")[-1]) for value in vert[4:6]]))
            a, b, c = (corner[0] for corner in corners)
            ab = [b[i] - a[i] for i in range(3)]
            ac = [c[i] - a[i] for i in range(3)]
            cross = [ab[1] * ac[2] - ab[2] * ac[1],
                     ab[2] * ac[0] - ab[0] * ac[2],
                     ab[0] * ac[1] - ab[1] * ac[0]]
            if sum(cross[i] * corners[0][1][i] for i in range(3)) < 0:
                corners[1], corners[2] = corners[2], corners[1]
            for position, normal, uv in corners:
                positions.extend(position)
                normals_out.extend(normal)
                uvs.extend(uv)
            triangle_count += 1
    if not positions:
        raise ValueError(f"Empty model: {source.name}")
    payloads = [struct.pack(f"<{len(values)}f", *values) for values in (positions, normals_out, uvs)]
    offsets = [0, len(payloads[0]), len(payloads[0]) + len(payloads[1])]
    blob = b"".join(payloads)
    xyz = [positions[i::3] for i in range(3)]
    gltf = {
        "asset": {"version": "2.0", "generator": "PS2MUD local converter"},
        "buffers": [{"byteLength": len(blob), "uri": "data:application/octet-stream;base64," + base64.b64encode(blob).decode("ascii")}],
        "bufferViews": [{"buffer": 0, "byteOffset": offsets[i], "byteLength": len(payloads[i]), "target": 34962} for i in range(3)],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(positions) // 3, "type": "VEC3",
             "min": [min(axis) for axis in xyz], "max": [max(axis) for axis in xyz]},
            {"bufferView": 1, "componentType": 5126, "count": len(normals_out) // 3, "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": len(uvs) // 2, "type": "VEC2"},
        ],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "mode": 4}]}],
        "nodes": [{"mesh": 0}], "scenes": [{"nodes": [0]}], "scene": 0,
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(gltf, separators=(",", ":")), encoding="utf-8")
    return {"triangles": triangle_count, "meshes": mesh_count}


def read_room(name: str) -> list[dict]:
    objects: dict[str, dict] = {}
    for line in (ROOMS / f"{name}.room").read_text(encoding="latin-1").splitlines():
        match = re.fullmatch(r"001 NAME (\S+) MODEL (\S+) TEXTURE (\S+)", line.strip())
        if match:
            key, model, texture = match.groups()
            objects[key] = {"name": key, "model": model, "texture": texture,
                            "position": [0, 0, 0], "rotation": [0, 0, 0],
                            "bias": False, "placed": False}
            continue
        match = re.fullmatch(r"003 LOCATE (\S+) X (-?\d+) Y (-?\d+) Z (-?\d+)", line.strip())
        if match and match[1] in objects:
            objects[match[1]]["position"] = [int(match[i]) for i in (2, 3, 4)]
            objects[match[1]]["placed"] = True
            continue
        match = re.fullmatch(r"017 ROTATE (\S+) X ([-\d.]+) Y ([-\d.]+) Z ([-\d.]+)", line.strip())
        if match and match[1] in objects:
            objects[match[1]]["rotation"] = [float(match[i]) for i in (2, 3, 4)]
            continue
        match = re.fullmatch(r"009 BIAS (\S+)", line.strip())
        if match and match[1] in objects:
            objects[match[1]]["bias"] = True
    if name == "village501501":
        # These objects are declared in the .room file but first placed by
        # village501501.pike:get_update(). Keep the offline preview at the
        # script's initial state; live 003 LOCATE updates replace it.
        for key, position in {
            "door1": [133, 1, 180],
            "door2": [130, 15, 183],
            "door3": [140, 10, 183],
            "elevator": [135, 1, 185],
        }.items():
            objects[key]["position"] = position
            objects[key]["placed"] = True
    return list(objects.values())


def read_avatar(name: str) -> dict:
    lines = meaningful_lines(SOURCE / name)
    base, count = lines[0].split()
    # A -1 part count is the original client's special ghost animation:
    # only its base model is loaded and it slowly rotates.
    if int(count) == -1:
        return {"source": name, "base": base, "texture": AVATAR_TEXTURE,
                "parts": [], "ghost": True}
    parts = []
    for line in lines[1:]:
        match = re.fullmatch(r"(\S+) <([^>]+)> (\d+) (.+)", line)
        if not match:
            raise ValueError(f"Malformed animation line in {name}: {line}")
        values = match[4].split()
        if len(values) != 11:
            raise ValueError(f"Expected ten animation samples and speed in {name}")
        parts.append({"model": match[1], "offset": [float(x) for x in match[2].split(",")],
                      "type": int(match[3]), "samples": [float(x) for x in values[:10]],
                      "speed": int(values[10])})
    if len(parts) != int(count):
        raise ValueError(f"Part count mismatch in {name}")
    return {"source": name, "base": base, "texture": AVATAR_TEXTURE, "parts": parts}


def main() -> None:
    rooms = {name: read_room(name) for name in ROOM_NAMES}
    avatars = {path.name: read_avatar(path.name) for path in sorted(SOURCE.glob("*.ani"))}
    avatar = avatars[AVATAR_ANIMATION]
    # Dynamic items, monsters, spells, and equipment use resource names sent by
    # the server at runtime, so export the full usable resource set.
    models = sorted(path.name for path in SOURCE.glob("*.txt"))
    textures = sorted(path.name for path in SOURCE.glob("*.tm2"))
    stats = {"models": {}, "textures": {}}
    for name in models:
        stats["models"][name] = convert_model(SOURCE / name, OUT / "models" / f"{name}.gltf")
    for name in textures:
        stats["textures"][name] = convert_tm2(SOURCE / name, OUT / "textures" / f"{name}.png")
    # The PS2 client sent these unsigned 8-bit, mono samples to /dev/dsp at
    # 11,025 Hz. WAV wraps the original bytes without changing the sound.
    sounds = []
    (OUT / "audio").mkdir(parents=True, exist_ok=True)
    for source in sorted(AUDIO.glob("*.raw")):
        with wave.open(str(OUT / "audio" / f"{source.stem}.wav"), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(1)
            output.setframerate(11025)
            output.writeframes(source.read_bytes())
        sounds.append(source.stem)
    (OUT / "scene.json").write_text(json.dumps({"rooms": rooms, "avatar": avatar, "avatars": avatars, "stats": stats, "sounds": sounds}, indent=2), encoding="utf-8")
    print(f"Converted {len(rooms)} rooms, {len(avatars)} animations, {len(models)} models, {len(textures)} textures, {len(sounds)} sounds to {OUT}")


if __name__ == "__main__":
    main()
