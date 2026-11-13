# Le fil de fer d'un plan, sans Blender : ce que la caméra du plan voit de la berline et de la route, image par image.
# La caméra est celle des clés finales du plan (motion.plan_data : le bras, la visée commune, l'opérateur ; 24 mm,
# 9:16), le cadre 360 × 640. On y voit : la boîte de la berline (motion.HERO_BOX), roulis et tangage de sa caisse
# (parcours.body), ses faces tournées vers l'objectif teintées (l'arrière rouge, l'avant orange) et une flèche sur son
# toit, ses quatre roues (les avant braquées comme les clés les braquent, par-dessus la caisse) ; au sol, la
# trajectoire de son centre (1 s derrière, 2 s devant), la flèche de sa marche (cyan) et celle de sa caisse (blanc) :
# l'angle entre les deux est la glisse ; la route sur 80 m devant elle, tirée de parcours.ROUTE (un gabarit : la voie de la berline de
# 3,5 m en tirets, des bords à 5,25 m de part et d'autre, pas la chaussée vraie du lieu) ; les bordures et les
# obstacles que le module du plan décrit (P2 : bordures de l'anneau ; P5 : poteaux de chaîne, caisses) ; les autres
# véhicules du plan (boîtes grises) ; l'horizon ; les bandes du HUD (12 % du haut, 15 % du bas).
# Pillow est nécessaire (python3.13 de Homebrew) ; ffmpeg pour le film.
#
#   python3.13 tools/film3d/diag/fil_de_fer.py P2 --sortie DOSSIER
#       DOSSIER/P2/NNNN.png et DOSSIER/P2.mp4 (24 i/s), le plan de l'arbre où est l'outil
#   python3.13 tools/film3d/diag/fil_de_fer.py P5 --sortie DOSSIER --avant RACINE
#       côte à côte : à gauche le plan lu dans RACINE (une copie de tools/film3d, d'un autre commit), à droite celui
#       de l'arbre de l'outil ; DOSSIER/P5-avant-apres.mp4 et DOSSIER/P5-planche.png (8 images autour de la crête de
#       la glisse, de 4 en 4 images)
import argparse
import json
import math
import os
import shutil
import subprocess
import sys

W, H = 360, 640
SS = 2                                  # suréchantillonnage du dessin
ICI = os.path.dirname(os.path.abspath(__file__))
WHEELS = ((1.38, 0.76, True), (1.38, -0.76, True), (-1.39, 0.76, False), (-1.39, -0.76, False))
WHEEL_R, WHEEL_W = 0.33, 0.24
OTHER_BOX = (4.9, 1.9, 1.5)
LANE, EDGE = 1.75, 5.25
AHEAD, BEHIND = 80.0, 12.0
FONTS = ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc")


def _font(size):
    """Une police qui a les accents (celle de Pillow par défaut ne les a pas toutes)."""
    from PIL import ImageFont
    for path in FONTS:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


class Cam:
    """La caméra (x, y, z, lacet, site, roulis, focale) de motion.key_camera ; projection de motion.screen_point,
    avec la profondeur, pour couper les segments à l'objectif."""

    def __init__(self, cam):
        x, y, z, yaw, pitch, roll, lens = cam
        a, b, c = math.radians(yaw), math.radians(pitch), math.radians(roll)
        f = (-math.sin(a) * math.cos(b), -math.cos(a) * math.cos(b), math.sin(b))
        r = (-math.cos(a), math.sin(a), 0.0)
        u = (r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0])
        self.r = [math.cos(c) * r[i] + math.sin(c) * u[i] for i in range(3)]
        self.u = [-math.sin(c) * r[i] + math.cos(c) * u[i] for i in range(3)]
        self.f, self.o, self.yaw = f, (x, y, z), a
        self.kx, self.ky = 10.125 / lens, 18.0 / lens

    def local(self, p):
        d = [p[i] - self.o[i] for i in range(3)]
        return (sum(d[i] * self.r[i] for i in range(3)), sum(d[i] * self.u[i] for i in range(3)),
                sum(d[i] * self.f[i] for i in range(3)))

    def px(self, q):
        x, y, z = q
        return ((0.5 + 0.5 * x / z / self.kx) * W * SS, (0.5 - 0.5 * y / z / self.ky) * H * SS)

    def seg(self, a, b, near=0.2):
        qa, qb = self.local(a), self.local(b)
        if qa[2] < near and qb[2] < near:
            return None
        if qa[2] < near or qb[2] < near:
            t = (near - qa[2]) / (qb[2] - qa[2])
            q = tuple(qa[i] + (qb[i] - qa[i]) * t for i in range(3))
            qa, qb = (q, qb) if qa[2] < near else (qa, q)
        return self.px(qa), self.px(qb)


def box_edges(x, y, z0, heading, dims, roll=0.0, pitch=0.0):
    """Les 12 arêtes d'une boîte posée au sol (centre x, y), roulis (positif : penchée à droite) et tangage (positif :
    le nez levé) autour du sol ; la face avant (4 arêtes) à part ; la flèche du toit ; les faces (sauf le dessous) :
    {nom: (4 coins, centre)} et le centre de la boîte."""
    h = math.radians(heading)
    fx, fy = -math.sin(h), math.cos(h)
    rx, ry = fy, -fx
    l2, w2, ht = dims[0] / 2, dims[1] / 2, dims[2]
    cr, sr, cp, sp = math.cos(math.radians(roll)), math.sin(math.radians(roll)), math.cos(math.radians(pitch)), \
        math.sin(math.radians(pitch))

    def pt(a, b, zz):
        a1, z1 = a * cp - zz * sp, a * sp + zz * cp
        b2, z2 = b * cr + z1 * sr, -b * sr + z1 * cr
        return x + fx * a1 + rx * b2, y + fy * a1 + ry * b2, z0 + z2

    c = {(i, j, k): pt(i * l2, j * w2, k * ht) for i in (-1, 1) for j in (-1, 1) for k in (0, 1)}
    edges = []
    for i in (-1, 1):
        for j in (-1, 1):
            edges.append((c[(i, j, 0)], c[(i, j, 1)]))
        for k in (0, 1):
            edges.append((c[(i, -1, k)], c[(i, 1, k)]))
    for j in (-1, 1):
        for k in (0, 1):
            edges.append((c[(-1, j, k)], c[(1, j, k)]))
    front = [(c[(1, -1, 0)], c[(1, 1, 0)]), (c[(1, -1, 1)], c[(1, 1, 1)]), (c[(1, -1, 0)], c[(1, -1, 1)]),
             (c[(1, 1, 0)], c[(1, 1, 1)])]
    arrow = [pt(0.2 * l2, -0.6 * w2, ht), pt(0.85 * l2, 0.0, ht), pt(0.2 * l2, 0.6 * w2, ht)]
    quads = {"avant": [(1, -1, 0), (1, 1, 0), (1, 1, 1), (1, -1, 1)], "arriere": [(-1, -1, 0), (-1, 1, 0), (-1, 1, 1),
                                                                                 (-1, -1, 1)],
             "droite": [(-1, 1, 0), (1, 1, 0), (1, 1, 1), (-1, 1, 1)], "gauche": [(-1, -1, 0), (1, -1, 0), (1, -1, 1),
                                                                               (-1, -1, 1)],
             "toit": [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]}
    faces = {}
    for name, q in quads.items():
        pts = [c[k] for k in q]
        faces[name] = (pts, tuple(sum(v[i] for v in pts) / 4 for i in range(3)))
    return edges, front, arrow, faces, pt(0.0, 0.0, ht / 2)


def fill_faces(draw, cam, faces, centre, colours):
    """Les faces tournées vers l'objectif (une boîte est convexe : rien d'autre ne se cache), couleurs RGBA."""
    for name, (pts, fc) in faces.items():
        n = [fc[i] - centre[i] for i in range(3)]
        if sum(n[i] * (cam.o[i] - fc[i]) for i in range(3)) <= 0.0:
            continue
        q = [cam.local(v) for v in pts]
        if min(v[2] for v in q) < 0.2:
            continue
        draw.polygon([cam.px(v) for v in q], fill=colours.get(name, colours["cote"]))


def blend(img, paint):
    """Peint des formes translucides (paint(draw RGBA)) sur img ; rend (image, son ImageDraw)."""
    from PIL import Image, ImageDraw
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    paint(ImageDraw.Draw(ov))
    out = Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")
    return out, ImageDraw.Draw(out)


def ground_arrow(x, y, z, heading, length):
    h = math.radians(heading)
    fx, fy = -math.sin(h), math.cos(h)
    tip = (x + fx * length, y + fy * length, z)
    wing = [(tip[0] - fx * 0.6 + s * fy * 0.35, tip[1] - fy * 0.6 - s * fx * 0.35, z) for s in (-1, 1)]
    return [((x, y, z), tip), (wing[0], tip), (wing[1], tip)]


def render(shot, out_dir, racine):
    """Les images PNG du plan dans out_dir ; rend {image: glisse} et la crête."""
    from PIL import Image, ImageDraw
    sys.path.insert(0, racine)
    import motion as M
    import parcours as PC
    specs = M.shot_specs()
    spec = specs[shot]
    mod = spec["module"]
    d = M.plan_data(shot, spec)
    to_scene, cap = PC.placer(shot)
    route = []
    s = -50.0
    while s < PC.ROUTE.length + 100.0:
        x, y, h, _ = PC.ROUTE.at(s)
        X, Y = to_scene(x, y)
        route.append((s, X, Y, h - cap))
        s += 0.5
    body = PC.body() if hasattr(PC, "body") else {}
    heads = mod.tracks_heading() if hasattr(mod, "tracks_heading") else {}
    others = {k: v for k, v in spec.get("named", {}).items() if k != "hero"}
    font, small = _font(14 * SS), _font(12 * SS)
    path = PC.hero(shot)["pos"]
    os.makedirs(out_dir, exist_ok=True)
    slips, i_near = {}, 0
    for f in d["frames"]:
        cam = Cam(d["final"][f])
        p = d["poses"][f]
        hx, hy, hz, head = p["x"], p["y"], p.get("z", 0.0), p["heading"]
        travel = p["travel"] if p["travel"] is not None else head
        slip = (head - travel + 180.0) % 360.0 - 180.0
        slips[f] = slip
        g = body.get(PC.START[shot] + f - 1, {})
        roll, pitch = g.get("roll", 0.0), g.get("pitch", 0.0)
        steer = g.get("steer", PC.hero(shot)["steer"](f))
        screen = (head - PC.cam_cap(shot, f) + 180.0) % 360.0 - 180.0
        img = Image.new("RGB", (W * SS, H * SS), (14, 17, 24))
        dr = ImageDraw.Draw(img)
        # l'horizon : le plan du sol à l'infini, dans l'axe de la caméra
        hz_pts = []
        for da in (-1.2, 1.2):
            a = cam.yaw + da
            q = cam.local((cam.o[0] - math.sin(a) * 1e5, cam.o[1] - math.cos(a) * 1e5, 0.0))
            if q[2] > 0:
                hz_pts.append(cam.px(q))
        if len(hz_pts) == 2:
            (x0, y0), (x1, y1) = hz_pts
            k = (y1 - y0) / (x1 - x0) if abs(x1 - x0) > 1e-6 else 0.0
            ya, yb = y0 - k * x0, y0 + k * (W * SS - x0)
            dr.polygon([(0, ya), (W * SS, yb), (W * SS, H * SS), (0, H * SS)], fill=(30, 33, 38))
            dr.line([(0, ya), (W * SS, yb)], fill=(120, 130, 150), width=SS)

        def line(a, b, col, w=1):
            sg = cam.seg(a, b)
            if sg:
                dr.line(sg, fill=col, width=w * SS)

        # la route : l'abscisse de la berline, puis le gabarit sur BEHIND m derrière et AHEAD m devant
        lo, hi = max(0, i_near - 40), min(len(route), i_near + 400)
        i_near = min(range(lo, hi), key=lambda i: (route[i][1] - hx) ** 2 + (route[i][2] - hy) ** 2)
        s0 = route[i_near][0]
        pts = [r for r in route if s0 - BEHIND <= r[0] <= s0 + AHEAD]
        for off, col, dash, wd in ((-EDGE, (170, 170, 185), False, 2), (EDGE, (170, 170, 185), False, 2),
                                   (-LANE, (230, 220, 120), True, 2), (LANE, (230, 220, 120), True, 2)):
            prev = None
            for s, X, Y, h in pts:
                hr = math.radians(h)
                q = (X - math.cos(hr) * off, Y - math.sin(hr) * off, 0.0)
                on = not dash or (s % 9.0) < 3.0
                if prev is not None and on:
                    line(prev, q, col, wd)
                prev = q
        # bordures et obstacles du lieu (repère de la scène du plan)
        for name in ("SW_KERB", "NW_KERB"):
            poly = getattr(mod, name, None)
            if poly:
                for a, b in zip(poly, poly[1:]):
                    line((a[0], a[1], 0.15), (b[0], b[1], 0.15), (240, 140, 60), 2)
        for x, y in getattr(mod, "CHAIN_POSTS", ()):
            line((x, y, 0.0), (x, y, 1.0), (240, 140, 60), 2)
        cb = getattr(mod, "CRATES_BOX", None)
        if cb:
            x0, x1, y0, y1 = cb
            for a, b in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
                for zz in (0.0, 1.2):
                    line((a[0], a[1], zz), (b[0], b[1], zz), (240, 140, 60))
        # les autres véhicules
        t = M.t_of(f, d["f0"], d["fps"])
        for name, pos in others.items():
            ox, oy = pos(t)[:2]
            if name in heads:
                oh = heads[name](t)
            else:
                ax, ay = pos(t - 0.02)[:2]
                bx, by = pos(t + 0.02)[:2]
                oh = M.heading_of(bx - ax, by - ay) if math.hypot(bx - ax, by - ay) > 1e-4 else 0.0
            ob = box_edges(ox, oy, 0.0, oh, OTHER_BOX)
            img, dr = blend(img, lambda dd: fill_faces(dd, cam, ob[3], ob[4], dict(cote=(90, 95, 105, 200),
                                                                                     toit=(120, 125, 135, 200))))
            for a, b in ob[0]:
                line(a, b, (140, 145, 155))
        # la berline : la trajectoire de son centre (1 s derrière, 2 s devant, en pointillés), marche et caisse au
        # sol, roues, boîte, face avant, flèche du toit
        tr = [path(f + k / 2) for k in range(-48, 97)]
        for k, (a, b) in enumerate(zip(tr, tr[1:])):
            if k % 2 == 0:
                line((a[0], a[1], hz + 0.02), (b[0], b[1], hz + 0.02), (60, 220, 230), 1)
        h = math.radians(head)
        fx, fy = -math.sin(h), math.cos(h)
        wheels = []
        for a, b, front in WHEELS:
            wx, wy = hx + fx * a + fy * b, hy + fy * a - fx * b
            wheels.append((front, box_edges(wx, wy, hz, head + (steer if front else 0.0),
                                            (2 * WHEEL_R, WHEEL_W, 2 * WHEEL_R))[0]))
        for front, ws in wheels:
            if not front:
                for e0, e1 in ws:
                    line(e0, e1, (180, 120, 255), 1)
        edges, front, arrow, faces, centre = box_edges(hx, hy, hz, head, M.HERO_BOX, roll, pitch)
        img, dr = blend(img, lambda dd: fill_faces(dd, cam, faces, centre, dict(
            cote=(120, 135, 160, 120), toit=(200, 205, 220, 120), avant=(255, 150, 40, 140),
            arriere=(220, 50, 50, 160))))
        for a, b in edges:
            line(a, b, (235, 235, 235), 1)
        for a, b in front:
            line(a, b, (255, 150, 40), 2)
        for a, b in zip(arrow, arrow[1:]):
            line(a, b, (255, 150, 40), 2)
        for front, ws in wheels:
            if front:
                for e0, e1 in ws:
                    line(e0, e1, (255, 90, 200), 2)
        # la marche (cyan) et l'axe de la caisse (blanc), par-dessus : l'angle entre les deux est la glisse
        for a, b in ground_arrow(hx, hy, hz + 0.02, travel, 9.0):
            line(a, b, (60, 220, 230), 2)
        for a, b in ground_arrow(hx, hy, hz + 0.02, head, 8.0):
            line(a, b, (255, 255, 255), 2)
        # les bandes du HUD et l'état
        for v in (0.12, 0.85):
            dr.line([(0, v * H * SS), (W * SS, v * H * SS)], fill=(70, 40, 40), width=SS)
        dr.text((8 * SS, 6 * SS), f"{shot} / {f}", font=font, fill=(240, 240, 240))
        dr.text((8 * SS, 24 * SS), f"glisse {slip:+5.1f}°  écran {screen:+5.1f}°", font=small, fill=(60, 220, 230))
        dr.text((8 * SS, 40 * SS), f"braquage {steer:+5.1f}°  {p['speed']:4.1f} m/s", font=small,
                fill=(255, 90, 200))
        dr.text((8 * SS, 56 * SS), f"roulis {roll:+4.1f}°  tangage {pitch:+4.1f}°", font=small,
                fill=(200, 200, 200))
        img.resize((W, H), Image.LANCZOS).save(os.path.join(out_dir, f"{f:04d}.png"))
    crest = max(slips, key=lambda k: abs(slips[k]))
    with open(os.path.join(out_dir, "glisse.json"), "w") as fh:
        json.dump(dict(slips={str(k): v for k, v in slips.items()}, crest=crest, frames=list(d["frames"])), fh)
    return slips, crest, list(d["frames"])


def film(frames_dir, mp4):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "24", "-i",
                    os.path.join(frames_dir, "%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16",
                    mp4], check=True)


def label(img, text):
    from PIL import ImageDraw
    ImageDraw.Draw(img).text((W - 8, 8), text, font=_font(16), fill=(255, 220, 120), anchor="ra")


def main():
    ap = argparse.ArgumentParser(description="le fil de fer d'un plan, sans Blender")
    ap.add_argument("plan")
    ap.add_argument("--sortie", required=True)
    ap.add_argument("--racine", default=os.path.dirname(ICI), help="la copie de tools/film3d à lire")
    ap.add_argument("--avant", help="une autre copie de tools/film3d : le film côte à côte avant / après")
    ap.add_argument("--images-seules", action="store_true", help="les PNG seulement (sans film)")
    a = ap.parse_args()
    shot, out = a.plan, os.path.abspath(a.sortie)
    if not a.avant:
        fd = os.path.join(out, shot)
        render(shot, fd, os.path.abspath(a.racine))
        if not a.images_seules:
            film(fd, os.path.join(out, f"{shot}.mp4"))
            print(os.path.join(out, f"{shot}.mp4"))
        return
    from PIL import Image
    work = os.path.join(out, f".{shot}-images")
    da, db, dc = (os.path.join(work, k) for k in ("avant", "apres", "cote"))
    for k in (da, db, dc):
        shutil.rmtree(k, ignore_errors=True)
    subprocess.run([sys.executable, os.path.abspath(__file__), shot, "--sortie", da, "--racine",
                    os.path.abspath(a.avant), "--images-seules"], check=True)
    subprocess.run([sys.executable, os.path.abspath(__file__), shot, "--sortie", db, "--racine",
                    os.path.abspath(a.racine), "--images-seules"], check=True)
    ja = json.load(open(os.path.join(da, shot, "glisse.json")))
    jb = json.load(open(os.path.join(db, shot, "glisse.json")))
    os.makedirs(dc, exist_ok=True)
    pairs = {}
    for f in jb["frames"]:
        A = Image.open(os.path.join(da, shot, f"{f:04d}.png")).convert("RGB")
        B = Image.open(os.path.join(db, shot, f"{f:04d}.png")).convert("RGB")
        label(A, "avant")
        label(B, "après")
        C = Image.new("RGB", (2 * W, H))
        C.paste(A, (0, 0))
        C.paste(B, (W, 0))
        C.save(os.path.join(dc, f"{f:04d}.png"))
        pairs[f] = C
    mp4 = os.path.join(out, f"{shot}-avant-apres.mp4")
    film(dc, mp4)
    c = jb["crest"]
    pick = [min(max(c + 4 * k, jb["frames"][0]), jb["frames"][-1]) for k in range(-4, 4)]
    sheet = Image.new("RGB", (4 * 2 * W + 3 * 8, 2 * H + 8), (40, 40, 40))
    for i, f in enumerate(pick):
        sheet.paste(pairs[f], ((i % 4) * (2 * W + 8), (i // 4) * (H + 8)))
    png = os.path.join(out, f"{shot}-planche.png")
    sheet.save(png)
    print(mp4)
    print(png, "images", pick, "crête avant", ja["crest"], "après", c)


if __name__ == "__main__":
    main()
