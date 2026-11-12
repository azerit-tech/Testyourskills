# La conduite de motion.drive() vue de dessus, sans Blender : un virage de 28 m abordé à 19 m/s voulus (la voiture
# freine avant, glisse un peu, un petit retour, remet les gaz) et un arrêt en glisse depuis 44 km/h.
#   python3 tools/film3d/diag/conduite_demo.py [sortie.png]
# En haut, la route (gris) et la caisse toutes les 4 images (bleu : roule ; rouge : freine à plus de 2 m/s², les
# feux stop ; orange : glisse de plus de 2°), un trait de l'avant ; en bas, image par image : la vitesse (noir,
# 0 à 20 m/s), la glisse (orange, ±20°), le braquage des roues avant (vert, ±20°), l'accélération latérale (bleu)
# et longitudinale (rouge), ±8 m/s², les limites en pointillés. Les chiffres de chaque cas s'impriment.
import math
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import motion as M  # noqa: E402

W, H = 1200, 900
BG, GREY, BLUE, RED, ORANGE, BLACK, GREEN, LIGHT = ((250, 250, 247), (175, 175, 170), (40, 90, 200), (210, 40, 40),
                                                    (240, 140, 20), (20, 20, 20), (30, 150, 60), (225, 225, 220))
img = [bytearray(BG * W) for _ in range(H)]


def px(x, y, c):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < W and 0 <= y < H:
        img[y][3 * x:3 * x + 3] = bytes(c)


def seg(a, b, c, th=1, dash=0):
    n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) + 1
    for i in range(n + 1):
        if dash and (i // dash) % 2:
            continue
        x = a[0] + (b[0] - a[0]) * i / n
        y = a[1] + (b[1] - a[1]) * i / n
        for dx in range(-(th // 2), th - th // 2):
            for dy in range(-(th // 2), th - th // 2):
                px(x + dx, y + dy, c)


def save(path):
    raw = b"".join(b"\x00" + bytes(r) for r in img)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def panel(d, frames, box, gbox, title):
    """Vue de dessus dans box (x0, y0, x1, y1 en pixels), courbes dans gbox."""
    ts = [M.t_of(f) for f in frames]
    pts = [d.pos(t) for t in ts]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    span = max(max(xs) - min(xs), max(ys) - min(ys)) + 12.0
    sc = min(box[2] - box[0], box[3] - box[1]) / span
    ox, oy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2

    def P(x, y):
        return ox + (x - cx) * sc, oy - (y - cy) * sc
    for a, b in zip(pts, pts[1:]):
        seg(P(*a), P(*b), GREY, 2)
    for f, t in zip(frames, ts):
        if (f - frames[0]) % 4:
            continue
        x, y = d.pos(t)
        h = math.radians(d.heading(t))
        fx, fy, rx, ry = -math.sin(h), math.cos(h), math.cos(h), math.sin(h)
        corners = [(x + fx * a * 2.45 + rx * b * 0.9, y + fy * a * 2.45 + ry * b * 0.9)
                   for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1))]
        c = RED if -d.along(t) > 2.0 else ORANGE if abs(d.slip(t)) > 2.0 else BLUE
        for a, b in zip(corners, corners[1:] + corners[:1]):
            seg(P(*a), P(*b), c, 1)
        seg(P(x, y), P(x + fx * 2.45, y + fy * 2.45), c, 2)
    # les courbes
    gx0, gy0, gx1, gy1 = gbox
    for y in range(gy0, gy1 + 1, max(1, (gy1 - gy0) // 4)):
        seg((gx0, y), (gx1, y), LIGHT, 1)

    def G(i, v, lo, hi):
        return gx0 + (gx1 - gx0) * i / (len(frames) - 1), gy1 - (gy1 - gy0) * (v - lo) / (hi - lo)
    for lim, lo, hi in ((6.5, -8, 8), (-6.5, -8, 8), (-7.0, -8, 8)):
        seg(G(0, lim, lo, hi), G(len(frames) - 1, lim, lo, hi), (150, 150, 150), 1, dash=4)
    series = ((lambda t: d.speed(t), 0, 20, BLACK), (lambda t: d.slip(t), -20, 20, ORANGE),
              (lambda t: d.steer(t), -20, 20, GREEN), (lambda t: d.alat(t), -8, 8, BLUE),
              (lambda t: d.along(t), -8, 8, RED))
    for fn, lo, hi, c in series:
        vals = [fn(t) for t in ts]
        for i in range(len(vals) - 1):
            seg(G(i, vals[i], lo, hi), G(i + 1, vals[i + 1], lo, hi), c, 2)
    # les chiffres, à la mesure de motion.py (images rendues)
    s = M.car_series(d.pos, frames, heads={f: d.heading(M.t_of(f)) for f in frames})
    sl = {f: d.slip(M.t_of(f)) for f in frames}
    rate = {f: (sl[f + 1] - sl[f - 1]) * M.FPS / 2 for f in frames[1:-1]}
    grow = [r * (1 if sl[f] >= 0 else -1) for f, r in rate.items()]
    drift = [f for f in frames if abs(sl[f]) > 3.0]
    loss = ""
    if drift:
        v0, v1 = d.speed(M.t_of(drift[0])), d.speed(M.t_of(drift[-1]))
        loss = f", vitesse {(v1 / v0 - 1) * 100:+.0f} % pendant la glisse"
    print(f"{title} : latérale {max(abs(v) for v in s['alat'].values()):.1f} m/s², freinage "
          f"{max(-v for v in s['along'].values()):.1f}, accélération {max(s['along'].values()):.1f}, cercle "
          f"{max(math.hypot(s['alat'][f], s['along'][f]) for f in s['alat']):.1f}, à-coup {max(s['jerk'].values()):.1f} "
          f"m/s³, lacet {max(abs(v) for v in s['yaw_acc'].values()):.0f} °/s² ; vitesse mini "
          f"{min(s['speed'].values()):.1f} m/s ; glisse {max(sl.values()):.1f}° (retour {min(sl.values()):.1f}°), "
          f"installation {max(grow):.0f} °/s, retour {max(-g for g in grow):.0f} °/s{loss} ; feux stop "
          f"{d.brake_windows(frames=frames)}" + (f" ; arrêt à {d.t_stop:.2f} s" if d.t_stop else ""))


def main(out):
    turn = M.drive(dict(start=(0.0, 0.0, 0.0), pieces=[M.line(50), M.arc(28, 90), M.line(40)]), speed=19.0)
    stop = M.drive(dict(start=(0.0, 0.0, 0.0), pieces=[M.line(12), M.arc(14, 70)]), speed=12.2, stop=True)
    panel(turn, list(range(1, 145)), (20, 20, 590, 600), (30, 630, 580, 880), "virage de 28 m, 19 m/s voulus")
    panel(stop, list(range(1, 105)), (610, 20, 1180, 600), (620, 630, 1170, 880), "arrêt en glisse depuis 44 km/h")
    seg((600, 10), (600, 890), LIGHT, 1)
    save(out)
    print(out)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.getcwd(), "conduite_demo.png"))
