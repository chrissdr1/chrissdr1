#!/usr/bin/env python3
"""Generate PWA icons without PIL: a green rounded tile with a white road mark.
Writes icon-192.png, icon-512.png (maskable-safe: mark stays in the inner 80%)."""
import zlib, struct, sys, pathlib

OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path("/home/user/chrissdr1/app/icons")
OUT.mkdir(parents=True, exist_ok=True)
BG = (0x00, 0x71, 0x3C); FG = (0xFF, 0xFF, 0xFF); SOFT = (0xDD, 0xEB, 0xE1)

def png(size):
    px = bytearray()
    r = size * 0.22            # corner radius
    cx = cy = size / 2
    for y in range(size):
        row = bytearray([0])   # filter type 0
        for x in range(size):
            # rounded square
            dx = max(abs(x + .5 - cx) - (cx - r), 0); dy = max(abs(y + .5 - cy) - (cy - r), 0)
            inside = dx*dx + dy*dy <= r*r
            c = BG if inside else (0, 0, 0)
            a = 255 if inside else 0
            if inside:
                u = (x + .5) / size; v = (y + .5) / size
                # road: a wide light band running bottom-left (0,1) to top-right (1,0),
                # same direction as icon.svg; y grows downward so the diagonal is u+v=1
                d = (u + v - 1) / 1.4142          # perpendicular distance from the diagonal
                t = (u - v + 1) / 2               # position along the road, 0 = bottom-left
                if abs(d) < 0.12 and 0.22 < t < 0.78:
                    c = SOFT
                    # dashed centre line
                    if abs(d) < 0.018 and int(t * 9) % 2 == 0 and 0.28 < t < 0.72:
                        c = BG
                # home dot at the top-right end of the road
                hx, hy = 0.74, 0.26
                if (u-hx)**2 + (v-hy)**2 < 0.075**2:
                    c = FG
            row += bytes(c) + bytes([a])
        px += row
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(px), 9)) + chunk(b"IEND", b"")

for s in (192, 512):
    (OUT / f"icon-{s}.png").write_bytes(png(s))

(OUT / "icon.svg").write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="22" fill="#00713C"/>
<path d="M22 78 L78 22" stroke="#DDEBE1" stroke-width="24" stroke-linecap="butt"/>
<path d="M28 72 L72 28" stroke="#00713C" stroke-width="3.5" stroke-dasharray="7 7"/>
<circle cx="74" cy="26" r="7.5" fill="#fff"/>
</svg>
''', encoding="utf-8")
print("icons written to", OUT)
