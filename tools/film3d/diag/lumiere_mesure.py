# Les contrôles chiffrés de la lumière v3.1 (SPEC §18.36), sur des images PNG rendues : Python seul, sans Blender ni
# bibliothèque (le PNG est lu par zlib), pour tourner sur le Mac comme sur la machine louée.
#
#   python3 tools/film3d/diag/lumiere_mesure.py OUV-20.png P1-30.png P3-24.png P6-30.png
#       contrôles 1 (écrêtage) et 2 (chaussée) par image, puis 4 (continuité) d'une image à la suivante, dans
#       l'ordre donné (les images de part et d'autre d'une coupe, ou les images témoins des plans dans l'ordre)
#   python3 tools/film3d/diag/lumiere_mesure.py --rampes allumees.png eteintes.png --patrouilles 2
#       contrôle 3 : la même image rendue rampes allumées puis éteintes (6 % du cadre par patrouille visible, 12 % pour
#       toutes ensemble)
#   python3 tools/film3d/diag/lumiere_mesure.py --coupes <dossier des images du film>
#       contrôle 5 : la berline de part et d'autre de chaque coupe continue du bras commun (parcours.RACCORDS), sur
#       les images <dossier>/<PLAN>…/NNNN.png. La boîte du coffre n'est pas fixe : elle s'ancre sur les deux feux
#       arrière (D = leur écart), 0,40 D au-dessus d'eux ; la chaussée est mesurée 0,60 D sous eux. Médiane des
#       --mediane dernières images d'un plan et des premières du suivant (3 par défaut : sur une image seule, le bruit
#       d'un brouillon à 32 échantillons atteint 12 % sur le rouge). Le rouge et la saturation, pas la luminance : elle
#       pèse peu le rouge (de P1 à P2 du film éclairé n° 2, rouge +69 %, luminance +9 %). Puis, sans verdict, la part
#       des images de chaque plan où le coffre tient dans sa bande cible (--pas : une image sur six).
#   python3 tools/film3d/diag/lumiere_mesure.py --coffre P1-48-ciel400.png P1-48-ciel600.png
#       la même mesure du coffre et de la chaussée, image par image (les images fixes d'un essai de dose), sans verdict
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
# contrôle 5, la berline aux coupes continues (mesures sur le coffre, ancré sur les feux arrière)
COUPE_ROUGE, COUPE_ROUGE_VISE = 0.20, 0.10     # écart du rouge médian du coffre : bloquant, visé
COUPE_SAT = 8.0                         # points de saturation (TSV)
COUPE_TEINTE = 5.0                      # degrés
COUPE_ROUTE = 0.20                      # écart de la luminance de la chaussée derrière elle
COUPE_MEDIANE = 3                       # images de chaque côté
BANDE_COFFRE = {"teinte": (345.0, 355.0), "sat": (70.0, 85.0), "lum": (9.0, 15.0)}   # la cible du client
# la recherche des feux arrière, en parts du cadre de poursuite (berline au centre, à 58 % du haut) et en pixels d'une
# image de 360 de large (mis à l'échelle) ; le coffre et la chaussée en unités de D : (au-dessus des feux, demi-largeur,
# demi-hauteur)
FEUX_FENETRE = (70 / 360, 320 / 640, 290 / 360, 470 / 640)
FEUX_MIN, FEUX_AMAS, FEUX_TROU, FEUX_D = 12, 5, 25, (45, 150)
COFFRE = (0.40, 0.30, 0.085)
PLANS_DE_FACE = ("P4",)                 # la berline vue de face : pas de coffre à mesurer
CHAUSSEE = (-0.60, 0.50, 0.13)


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


# ---------------------------------------------------------------- contrôle 5 : la berline aux coupes

def _feu(p):
    """Un pixel de feu arrière allumé : rouge orangé très clair."""
    r, g, b = p
    return r >= 225 and 40 <= g <= 215 and b <= 170 and r - b >= 80


def feux(w, h, rows):
    """Les deux feux arrière de la berline dans le cadre de poursuite : (milieu x, milieu y, écart D en pixels, angle
    de leur ligne), ou None s'ils ne se trouvent pas (plan de face, berline hors de sa place)."""
    k = w / 360.0
    x0, y0, x1, y1 = (int(FEUX_FENETRE[0] * w), int(FEUX_FENETRE[1] * h), int(FEUX_FENETRE[2] * w),
                      int(FEUX_FENETRE[3] * h))
    pts = [(x, y) for y in range(y0, y1) for x in range(x0, x1) if _feu(rows[y][x])]
    if len(pts) < FEUX_MIN * k * k:
        return None
    xs = sorted(p[0] for p in pts)
    trou, i = max((xs[j + 1] - xs[j], j) for j in range(len(xs) - 1))      # deux amas : le plus grand trou en x
    if trou < FEUX_TROU * k:
        return None
    cut = 0.5 * (xs[i] + xs[i + 1])
    a = [p for p in pts if p[0] < cut]
    b = [p for p in pts if p[0] >= cut]
    if len(a) < FEUX_AMAS * k * k or len(b) < FEUX_AMAS * k * k:
        return None
    ax, ay = sum(p[0] for p in a) / len(a), sum(p[1] for p in a) / len(a)
    bx, by = sum(p[0] for p in b) / len(b), sum(p[1] for p in b) / len(b)
    d = math.hypot(bx - ax, by - ay)
    if not FEUX_D[0] * k <= d <= FEUX_D[1] * k:
        return None
    return 0.5 * (ax + bx), 0.5 * (ay + by), d, math.atan2(by - ay, bx - ax)


def _boite(anc, up, hw, hh):
    """Une boîte orientée comme la ligne des feux : centre à `up` D au-dessus de leur milieu, demi-tailles en D."""
    xm, ym, d, ang = anc
    c, s = math.cos(ang), math.sin(ang)
    cx, cy = xm + s * up * d, ym - c * up * d
    return [(cx + (u * c - v * s) * d, cy + (u * s + v * c) * d) for u, v in ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh))]


def _dans(q, x, y):
    sgn = 0
    for i in range(4):
        (xa, ya), (xb, yb) = q[i], q[(i + 1) % 4]
        cr = (xb - xa) * (y - ya) - (yb - ya) * (x - xa)
        if cr != 0:
            if sgn == 0:
                sgn = 1 if cr > 0 else -1
            elif (cr > 0) != (sgn > 0):
                return False
    return True


def _pixels(w, h, rows, q):
    xs, ys = [p[0] for p in q], [p[1] for p in q]
    return [rows[y][x] for y in range(max(0, int(min(ys))), min(h, int(max(ys)) + 1))
            for x in range(max(0, int(min(xs))), min(w, int(max(xs)) + 1)) if _dans(q, x + 0.5, y + 0.5)]


def teinte_mediane(ps):
    """La teinte médiane (degrés) d'un lot de pixels : la médiane des teintes recentrées sur leur moyenne circulaire
    pondérée par la saturation (le bordeaux est à cheval sur 0°)."""
    sx = sy = 0.0
    hs = []
    for p in ps:
        hh, s, _ = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
        sx += s * math.cos(2 * math.pi * hh)
        sy += s * math.sin(2 * math.pi * hh)
        hs.append(hh * 360.0)
    if not hs:
        return float("nan")
    m = math.degrees(math.atan2(sy, sx)) % 360.0
    return (m + median([((v - m + 180.0) % 360.0) - 180.0 for v in hs])) % 360.0


def coffre(path):
    """Le coffre de la berline et la chaussée derrière elle sur une image de poursuite : teinte (degrés), saturation
    TSV (%), luminance (%), rouge médian (0 à 255), RVB médian, luminance de la chaussée (%) ; None si les feux
    arrière ne se trouvent pas."""
    w, h, rows = read_png(path)
    anc = feux(w, h, rows)
    if anc is None:
        return None
    pc, pr = _pixels(w, h, rows, _boite(anc, *COFFRE)), _pixels(w, h, rows, _boite(anc, *CHAUSSEE))
    if not pc or not pr:
        return None
    rgb = tuple(median([p[i] for p in pc]) for i in range(3))
    return dict(teinte=teinte_mediane(pc), sat=100 * median([colorsys.rgb_to_hsv(*(c / 255 for c in p))[1] for p in pc]),
                lum=100 * median([luma(p) for p in pc]), rouge=rgb[0], rgb=rgb, route=100 * median([luma(p) for p in pr]))


def _ecart_teinte(a, b):
    return ((b - a + 180.0) % 360.0) - 180.0


def _resume(ms):
    """La médiane de plusieurs mesures de coffre (la teinte recentrée sur la première)."""
    t0 = ms[0]["teinte"]
    out = {k: median([m[k] for m in ms]) for k in ("sat", "lum", "rouge", "route")}
    out["teinte"] = (t0 + median([_ecart_teinte(t0, m["teinte"]) for m in ms])) % 360.0
    out["rgb"] = tuple(median([m["rgb"][i] for m in ms]) for i in range(3))
    return out


def dossier_plan(base, plan, suffixe=None):
    """Le dossier des images du plan sous `base` : <PLAN><suffixe> si donné, sinon le seul <PLAN> ou <PLAN>+… qui
    contient des PNG."""
    if suffixe is not None:
        d = os.path.join(base, plan + suffixe)
        return d if os.path.isdir(d) else None
    cands = sorted(d for d in os.listdir(base) if (d == plan or d.startswith(plan + "+"))
                   and any(f.endswith(".png") for f in os.listdir(os.path.join(base, d))))
    if len(cands) > 1:
        raise SystemExit(f"{base} : plusieurs dossiers pour {plan} ({', '.join(cands)}) ; préciser --suffixe")
    return os.path.join(base, cands[0]) if cands else None


def _mesures(d, images):
    out = []
    for f in images:
        p = os.path.join(d, f"{f:04d}.png")
        m = coffre(p) if os.path.isfile(p) else None
        if m is not None:
            out.append(m)
    return out


def dans_bande(m):
    return (BANDE_COFFRE["teinte"][0] <= m["teinte"] <= BANDE_COFFRE["teinte"][1],
            BANDE_COFFRE["sat"][0] <= m["sat"] <= BANDE_COFFRE["sat"][1],
            BANDE_COFFRE["lum"][0] <= m["lum"] <= BANDE_COFFRE["lum"][1])


def controle_coupes(base, n_med=COUPE_MEDIANE, suffixe=None, pas=6):
    """Contrôle 5 sur le dossier d'images `base`. Renvoie le nombre de mesures dépassées (une coupe qui ne se mesure
    pas compte pour une)."""
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    import parcours as PC
    longueur = dict(PC.SHOTS)
    bad = 0
    for a, b in PC.RACCORDS:
        da, db = dossier_plan(base, a, suffixe), dossier_plan(base, b, suffixe)
        na = longueur[a]
        ma = _mesures(da, range(na - n_med + 1, na + 1)) if da else []
        mb = _mesures(db, range(1, n_med + 1)) if db else []
        print(f"coupe {a}/{na} → {b}/1 (médiane de {len(ma)} et {len(mb)} image(s))")
        if len(ma) < n_med or len(mb) < n_med:
            print(f"  5 NON MESURÉE : {len(ma)} image(s) lue(s) avant, {len(mb)} après, {n_med} attendues de chaque côté "
                  f"(images absentes, ou feux arrière introuvables)   DÉPASSE")
            bad += 1
            continue
        x, y = _resume(ma), _resume(mb)
        dr = (y["rouge"] - x["rouge"]) / x["rouge"] if x["rouge"] else float("inf")
        ds = y["sat"] - x["sat"]
        dt = _ecart_teinte(x["teinte"], y["teinte"])
        dc = (y["route"] - x["route"]) / x["route"] if x["route"] else float("inf")
        oks = (abs(dr) <= COUPE_ROUGE, abs(ds) <= COUPE_SAT, abs(dt) <= COUPE_TEINTE, abs(dc) <= COUPE_ROUTE)
        vise = "" if abs(dr) <= COUPE_ROUGE_VISE or not oks[0] else f", au-delà des ± {100 * COUPE_ROUGE_VISE:.0f} % visés"
        print(f"  5 rouge du coffre     {x['rouge']:5.0f} → {y['rouge']:5.0f}      {100 * dr:+6.0f} %    (± {100 * COUPE_ROUGE:.0f} %)   "
              f"{verdict(oks[0])}{vise}")
        print(f"  5 saturation          {x['sat']:5.1f} → {y['sat']:5.1f} %    {ds:+6.1f} pts  (± {COUPE_SAT:.0f})      {verdict(oks[1])}")
        print(f"  5 teinte              {x['teinte']:5.1f} → {y['teinte']:5.1f}°    {dt:+6.1f}°    (± {COUPE_TEINTE:.0f}°)     {verdict(oks[2])}")
        print(f"  5 chaussée derrière   {x['route']:5.1f} → {y['route']:5.1f} %    {100 * dc:+6.0f} %    (± {100 * COUPE_ROUTE:.0f} %)   {verdict(oks[3])}")
        print(f"    luminance du coffre {x['lum']:5.1f} → {y['lum']:5.1f} %  ; RVB médian {tuple(int(v) for v in x['rgb'])} → "
              f"{tuple(int(v) for v in y['rgb'])}   coupe : {'tient' if all(oks) else 'CASSE'}")
        bad += sum(1 for o in oks if not o)
    # sans verdict : le coffre dans sa bande cible, plan par plan
    print(f"bande cible du coffre (teinte {BANDE_COFFRE['teinte'][0]:.0f} à {BANDE_COFFRE['teinte'][1]:.0f}°, saturation "
          f"{BANDE_COFFRE['sat'][0]:.0f} à {BANDE_COFFRE['sat'][1]:.0f} %, luminance {BANDE_COFFRE['lum'][0]:.0f} à "
          f"{BANDE_COFFRE['lum'][1]:.0f} %), une image sur {pas}, sans verdict :")
    for plan, n in PC.SHOTS:
        d = dossier_plan(base, plan, suffixe)
        ms = _mesures(d, sorted(set(list(range(1, n + 1, pas)) + [n]))) if d and plan not in PLANS_DE_FACE else []
        if not ms:
            print(f"  {plan:4s} non mesuré (pas d'images, ou plan de face)")
            continue
        r = _resume(ms)
        tout = sum(1 for m in ms if all(dans_bande(m)))
        t, sa, lu = (sum(1 for m in ms if dans_bande(m)[i]) for i in range(3))
        print(f"  {plan:4s} {tout:2d} image(s) sur {len(ms):2d} dans la bande (teinte {t}, saturation {sa}, luminance {lu}) ; "
              f"médianes {r['teinte']:5.1f}°, {r['sat']:4.1f} %, {r['lum']:4.1f} %")
    return bad


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
    ap.add_argument("--coupes", metavar="DOSSIER", help="contrôle 5 : la berline aux coupes continues, sur les images "
                                                        "<DOSSIER>/<PLAN>…/NNNN.png")
    ap.add_argument("--mediane", type=int, default=COUPE_MEDIANE, help="images de chaque côté d'une coupe (contrôle 5)")
    ap.add_argument("--suffixe", default=None, help="le suffixe des dossiers de plan (contrôle 5), par exemple "
                                                    "+ville+brouillon ; inutile s'il n'y en a qu'un par plan")
    ap.add_argument("--pas", type=int, default=6, help="le relevé de la bande cible : une image sur --pas")
    ap.add_argument("--coffre", nargs="+", metavar="IMAGE", help="le coffre et la chaussée de chaque image, sans verdict")
    a = ap.parse_args(argv)
    if a.coffre:
        for path in a.coffre:
            m = coffre(path)
            if m is None:
                print(f"{path} : feux arrière introuvables (plan de face, berline hors de sa place)")
                continue
            t, sa, lu = dans_bande(m)
            print(f"{path} : teinte {m['teinte']:5.1f}° ({'dans' if t else 'hors'}), saturation {m['sat']:4.1f} % "
                  f"({'dans' if sa else 'hors'}), luminance {m['lum']:4.1f} % ({'dans' if lu else 'hors'} la bande) ; rouge "
                  f"{m['rouge']:.0f}, RVB {tuple(int(v) for v in m['rgb'])} ; chaussée derrière {m['route']:4.1f} %")
        return 0
    if a.coupes:
        bad = controle_coupes(a.coupes, max(1, a.mediane), a.suffixe, max(1, a.pas))
        print(f"{bad} contrôle(s) dépassé(s)")
        return 1 if bad else 0
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
