#!/usr/bin/env python3
"""Generate PWA icons without PIL: a green rounded tile with a white road mark.
Writes icon-192.png, icon-512.png (maskable-safe: mark stays in the inner 80%)."""
import zlib, struct, sys, pathlib

OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path("/home/user/chrissdr1/app/icons")
OUT.mkdir(parents=True, exist_ok=True)
BG = (0x1A, 0x56, 0xC4); FG = (0xFF, 0xFF, 0xFF); SOFT = (0xDD, 0xE7, 0xF8)   # tema biru (Ibu suka biru)

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
                # Band kept inside the standard maskable safe zone (80% / radius 0.40
                # from centre): with half-width 0.11 the corners reach ~0.37, not 0.41
                # like the wider band this replaced.
                if abs(d) < 0.11 and 0.25 < t < 0.75:
                    c = SOFT
                    # dashed centre line
                    if abs(d) < 0.018 and int(t * 9) % 2 == 0 and 0.30 < t < 0.70:
                        c = BG
                # home dot at the top-right end of the road (also inside the safe zone)
                hx, hy = 0.72, 0.28
                if (u-hx)**2 + (v-hy)**2 < 0.07**2:
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
<rect width="100" height="100" rx="22" fill="#1A56C4"/>
<path d="M25 75 L75 25" stroke="#DDE7F8" stroke-width="22" stroke-linecap="butt"/>
<path d="M31 69 L69 31" stroke="#1A56C4" stroke-width="3.2" stroke-dasharray="7 7"/>
<circle cx="72" cy="28" r="7" fill="#fff"/>
</svg>
''', encoding="utf-8")
print("icons written to", OUT)
