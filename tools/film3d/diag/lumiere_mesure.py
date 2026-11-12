# Les contrôles chiffrés de la lumière v3.1 (SPEC §18.36), sur des images PNG rendues : Python seul, sans Blender ni
# bibliothèque (le PNG est lu par zlib), pour tourner sur le Mac comme sur la machine louée.
#
#   python3 tools/film3d/diag/lumiere_mesure.py OUV-20.png P1-30.png P3-24.png P6-30.png
#       contrôles 1 (écrêtage) et 2 (chaussée) par image, puis 4 (continuité) d'une image à la suivante, dans
#       l'ordre donné (les images de part et d'autre d'une coupe, ou les images témoins des plans dans l'ordre)
#   python3 tools/film3d/diag/lumiere_mesure.py --rampes allumees.png eteintes.png --patrouilles 2
#       contrôle 3 : la même image rendue rampes allumées puis éteintes (6 % du cadre par patrouille visible, 12 % pour
#       toutes ensemble)
#
# La boîte de la berline (fractions du cadre, x vers la droite, y vers le bas depuis le haut) : BOITE par défaut, le
# cadre de poursuite commun (berline à y 58 % depuis le haut) ; --boite x0,y0,x1,y1 pour toutes les images, ou
# --boite IMAGE=x0,y0,x1,y1 (nom de fichier) pour une seule. Chaque ligne finit par « tient » ou « DÉPASSE ».
#
# Les mesures portent sur les valeurs affichées (sRGB 8 bits, après AgX) : luminance = 0,2126 R' + 0,7152 G' +
# 0,0722 B', de 0 à 1 ; « points » de luminance = centièmes.
import argparse
import colorsys
import math
import os
import struct
import sys
import zlib

BOITE = (0.27, 0.42, 0.73, 0.72)       # la berline dans le cadre de poursuite (360 × 640 comme 720 × 1280)
ROUTE_Y = 0.55                          # la chaussée : les 45 % du bas du cadre
CIEL_Y = 0.12                           # le bandeau de ciel : les 12 % du haut (en P3, guirlandes et façades y
                                        # entrent : sa teinte n'y est pas celle du ciel)
# les seuils (lumière v3.1, « Les contrôles ») ; un point de départ, à discuter sur image
CLIP_V, CLIP_MAX = 250, 0.005           # 98 % dans un canal ; au plus 0,5 % du cadre
ROUTE_CLAIR, ROUTE_CLAIR_MAX = 0.70, 0.015
ROUTE_MED = (0.06, 0.20)                # le plafond dur
ROUTE_CIBLE = (0.08, 0.16)              # la cible (docs/cinematique-lumiere-v3-1.md, 2.2) : « hors cible » sinon
RAMPE_ECART, RAMPE_SURF = 0.08, 0.06    # par patrouille visible
RAMPE_SURF_MAX = 0.12                   # toutes les rampes ensemble, quel que soit leur nombre (P4, FIN6)
RAMPE_CRETE, RAMPE_SAT = 0.35, 0.50
CAISSE_VAR = 0.20                       # ± 20 % de la luminance médiane de la caisse
CIEL_TEINTE = 15.0                      # degrés d'écart de teinte du bandeau de ciel


# ---------------------------------------------------------------- lecture PNG (8 ou 16 bits, gris, RVB, RVBA)

def read_png(path):
    """-> (largeur, hauteur, lignes) ; chaque ligne est une liste de (r, g, b) en 0..255."""
    data = open(path, "rb").read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} : pas un PNG")
    pos, idat, w = 8, [], None
    while pos < len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            w, h, depth, ctype, _, _, inter = struct.unpack(">IIBBBBB", body)
            if inter:
                raise ValueError(f"{path} : PNG entrelacé non lu")
            if ctype not in (0, 2, 4, 6) or depth not in (8, 16):
                raise ValueError(f"{path} : type {ctype}, {depth} bits non lu")
        elif kind == b"IDAT":
            idat.append(body)
        elif kind == b"IEND":
            break
        pos += 12 + n
    chans = {0: 1, 2: 3, 4: 2, 6: 4}[ctype]
    bpp = chans * depth // 8
    stride = w * bpp
    raw = zlib.decompress(b"".join(idat))
    prev = bytearray(stride)
    rows = []
    i = 0
    for _ in range(h):
        f = raw[i]
        cur = bytearray(raw[i + 1:i + 1 + stride])
        i += 1 + stride
        if f == 1:
            for x in range(bpp, stride):
                cur[x] = (cur[x] + cur[x - bpp]) & 255
        elif f == 2:
            for x in range(stride):
                cur[x] = (cur[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                a = cur[x - bpp] if x >= bpp else 0
                cur[x] = (cur[x] + ((a + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                a = cur[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                cur[x] = (cur[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        prev = cur
        step = depth // 8
        vals = cur[::step] if step == 1 else cur[0::2]      # 16 bits : l'octet de poids fort
        if chans == 1:
            rows.append([(v, v, v) for v in vals])
        elif chans == 2:
            rows.append([(vals[k], vals[k], vals[k]) for k in range(0, len(vals), 2)])
        else:
            rows.append([(vals[k], vals[k + 1], vals[k + 2]) for k in range(0, len(vals), chans)])
    return w, h, rows


def luma(p):
    return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255.0


def median(vs):
    vs = sorted(vs)
    n = len(vs)
    if not n:
        return float("nan")
    return vs[n // 2] if n % 2 else 0.5 * (vs[n // 2 - 1] + vs[n // 2])


def in_box(x, y, w, h, box):
    return box[0] * w <= x < box[2] * w and box[1] * h <= y < box[3] * h


def verdict(ok):
    return "tient" if ok else "DÉPASSE"


# ---------------------------------------------------------------- contrôles

def controle_1(w, h, rows):
    n = sum(1 for r in rows for p in r if max(p) > CLIP_V)
    f = n / (w * h)
    return f, f <= CLIP_MAX


def controle_2(w, h, rows, box):
    y0 = int(ROUTE_Y * h)
    ls = [luma(p) for y in range(y0, h) for x, p in enumerate(rows[y]) if not in_box(x, y, w, h, box)]
    clair = sum(1 for v in ls if v > ROUTE_CLAIR) / max(1, len(ls))
    med = median(ls)
    return clair, med, clair <= ROUTE_CLAIR_MAX, ROUTE_MED[0] <= med <= ROUTE_MED[1]


def caisse(w, h, rows, box):
    return median([luma(rows[y][x]) for y in range(int(box[1] * h), int(box[3] * h))
                   for x in range(int(box[0] * w), int(box[2] * w))])


def ciel(w, h, rows):
    """Teinte moyenne (circulaire, degrés), saturation et luminance médianes du bandeau du haut."""
    sx = sy = 0.0
    ss, ls = [], []
    for y in range(int(CIEL_Y * h)):
        for p in rows[y]:
            hh, s, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
            sx += s * math.cos(2 * math.pi * hh)
            sy += s * math.sin(2 * math.pi * hh)
            ss.append(s)
            ls.append(luma(p))
    return (math.degrees(math.atan2(sy, sx)) % 360.0), median(ss), median(ls)


def controle_3(on, off, patrols, box_unused=None):
    (w, h, a), (w2, h2, b) = on, off
    if (w, h) != (w2, h2):
        raise ValueError("les deux images n'ont pas la même taille")
    y0 = int(ROUTE_Y * h)
    surf, crete, lens = 0, 0.0, []
    for y in range(h):
        for x in range(w):
            d = luma(a[y][x]) - luma(b[y][x])
            if abs(d) > RAMPE_ECART:
                surf += 1
            if y >= y0:
                crete = max(crete, d)
            if d > 0.25:
                lens.append((d, a[y][x]))
    surf_f = surf / (w * h)
    lens.sort(key=lambda t: -t[0])
    top = lens[:max(1, len(lens) // 10)] if lens else []
    sat = median([colorsys.rgb_to_hsv(*(c / 255 for c in p))[1] for _, p in top]) if top else float("nan")
    return surf_f, crete, sat, surf_f <= min(RAMPE_SURF * max(1, patrols), RAMPE_SURF_MAX), crete <= RAMPE_CRETE, (not top) or sat >= RAMPE_SAT


# ---------------------------------------------------------------- sortie

def parse_box(s):
    v = tuple(float(t) for t in s.split(","))
    if len(v) != 4:
        raise argparse.ArgumentTypeError("boîte : x0,y0,x1,y1")
    return v


def main(argv=None):
    ap = argparse.ArgumentParser(description="Contrôles de la lumière v3.1 sur des PNG (sans Blender).")
    ap.add_argument("images", nargs="*")
    ap.add_argument("--boite", action="append", default=[], help="x0,y0,x1,y1 ou IMAGE=x0,y0,x1,y1")
    ap.add_argument("--rampes", nargs=2, metavar=("ALLUMEES", "ETEINTES"))
    ap.add_argument("--patrouilles", type=int, default=1, help="patrouilles visibles (contrôle 3)")
    a = ap.parse_args(argv)
    default, per = BOITE, {}
    for s in a.boite:
        if "=" in s:
            k, v = s.split("=", 1)
            per[os.path.basename(k)] = parse_box(v)
        else:
            default = parse_box(s)
    bad = 0
    prev = None
    for path in a.images:
        name = os.path.basename(path)
        box = per.get(name, default)
        w, h, rows = read_png(path)
        f1, ok1 = controle_1(w, h, rows)
        clair, med, ok2a, ok2b = controle_2(w, h, rows, box)
        body = caisse(w, h, rows, box)
        hue, sat, sky_l = ciel(w, h, rows)
        print(f"{name} ({w}×{h})")
        print(f"  1 écrêtage           {100 * f1:6.2f} % du cadre > 98 %         (≤ {100 * CLIP_MAX:.1f} %)   {verdict(ok1)}")
        print(f"  2 chaussée claire    {100 * clair:6.2f} % > {100 * ROUTE_CLAIR:.0f} % de luminance   (≤ {100 * ROUTE_CLAIR_MAX:.1f} %)   {verdict(ok2a)}")
        cible = "" if ROUTE_CIBLE[0] <= med <= ROUTE_CIBLE[1] else f", hors cible {100 * ROUTE_CIBLE[0]:.0f} à {100 * ROUTE_CIBLE[1]:.0f}"
        print(f"  2 chaussée médiane   {100 * med:6.1f} %                          ({100 * ROUTE_MED[0]:.0f} à {100 * ROUTE_MED[1]:.0f} %)   {verdict(ok2b)}{cible}")
        print(f"    caisse (médiane)   {100 * body:6.1f} %   ciel : teinte {hue:5.1f}°, saturation {100 * sat:4.1f} %, luminance {100 * sky_l:4.1f} %")
        bad += (not ok1) + (not ok2a) + (not ok2b)
        if prev is not None:
            pname, pbody, phue = prev
            var = (body - pbody) / pbody if pbody > 0 else float("inf")
            dh = abs((hue - phue + 180.0) % 360.0 - 180.0)
            ok4a, ok4b = abs(var) <= CAISSE_VAR, dh <= CIEL_TEINTE
            print(f"  4 caisse depuis {pname} : {100 * var:+6.1f} %   (± {100 * CAISSE_VAR:.0f} %)   {verdict(ok4a)}")
            print(f"  4 teinte du ciel depuis {pname} : {dh:5.1f}°   (≤ {CIEL_TEINTE:.0f}°)   {verdict(ok4b)}")
            bad += (not ok4a) + (not ok4b)
        prev = (name, body, hue)
    if a.rampes:
        on, off = (read_png(p) for p in a.rampes)
        surf, crete, sat, oks, okc, oksat = controle_3(on, off, a.patrouilles)
        print(f"rampes {os.path.basename(a.rampes[0])} / {os.path.basename(a.rampes[1])} ({a.patrouilles} patrouille(s))")
        print(f"  3 surface touchée    {100 * surf:6.2f} % du cadre > {100 * RAMPE_ECART:.0f} pts   (≤ {100 * min(RAMPE_SURF * max(1, a.patrouilles), RAMPE_SURF_MAX):.0f} %)   {verdict(oks)}")
        print(f"  3 crête sur chaussée {100 * crete:6.1f} pts                      (≤ {100 * RAMPE_CRETE:.0f})   {verdict(okc)}")
        print(f"  3 saturation lentille {100 * sat:5.1f} %                       (≥ {100 * RAMPE_SAT:.0f} %)   {verdict(oksat)}")
        bad += (not oks) + (not okc) + (not oksat)
    if not a.images and not a.rampes:
        ap.print_help()
        return 2
    print(f"{bad} contrôle(s) dépassé(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
