# Ce que la caméra du film voit (parcours.chase), sans Blender (SPEC §18.69) :
#
#   python3 tools/film3d/diag/audit_cadre.py [--chocs] [--dense] [--json sortie.json]
#
# --chocs : pour chaque contact (contacts.CHOCS), image par image autour de lui, la part de la patrouille dans le
#   cadre (la silhouette de sa boîte à l'écran, l'enveloppe convexe de ses huit coins, coupée au cadre et rapportée
#   à la silhouette entière), la place du point de contact, celle de la berline ; et la patrouille 1 dans P1.
# --dense : image par image de la poursuite (0 à 618), les voitures de la vie qui ROULENT, à moins de 40 m devant
#   l'objectif, et lisibles : la moitié au moins de leur rectangle dans le cadre et hors de celui de la berline quand
#   elles sont derrière elle, 3 % de la hauteur du cadre au moins (38 px sur 1280 : mesuré, une voiture à 30 m
#   environ sur le pont, objectif à 19–22 mm, à 37 m au 24 mm). Les trous de plus de 1,5 s, le compte par seconde.
#   Les patrouilles sont comptées à part (elles roulent avec la berline : pas un repère).
# Le rectangle est celui des huit coins de la boîte : il déborde un peu la caisse. Les décors ne masquent rien ici.
import argparse
import json
import math
import os
import sys

ap = argparse.ArgumentParser()
ap.add_argument("--chocs", action="store_true")
ap.add_argument("--dense", action="store_true")
ap.add_argument("--json", default=None)
ap.add_argument("--src", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
A = ap.parse_args() if __name__ == "__main__" else ap.parse_args([])
sys.path.insert(0, os.path.abspath(A.src))
import contacts as C  # noqa: E402
import motion as M  # noqa: E402
import parcours as P  # noqa: E402
import trafic as T  # noqa: E402
import vie as V  # noqa: E402

FPS = P.FPS
H_BOITE = 1.45
PATROL = (2 * C.PATROL[1], 2 * C.PATROL[0], H_BOITE)
PORTEE, MOITIE, HAUT_MIN, TROU = 40.0, 0.5, 0.03, 1.5
HAUTEUR = {"bus": 3.0, "camion": 2.6}          # m, estimées (les autres : H_BOITE)
OUT = {}
_POURS = T._poursuite()
_VEH = [v for v in V.vehicules() if not isinstance(v[3], V.Fixe)]


def aire(b):
    return max(0.0, b[1] - b[0]) * max(0.0, b[3] - b[2])


def coupe(b, c=(0.0, 1.0, 0.0, 1.0)):
    return max(b[0], c[0]), min(b[1], c[1]), max(b[2], c[2]), min(b[3], c[3])


def rect(cam, shot, x, y, cap, box):
    """Le rectangle (u0, u1, v0, v1) d'une boîte posée en ville, vue par la caméra du tronçon ; None derrière."""
    inv, rot = T._vers_scene(shot)
    sx, sy = inv(x, y)
    b = M.hero_screen(cam, sx, sy, P.sol(shot, sx, sy), cap - rot, box=box)
    return (b["u0"], b["u1"], b["v0"], b["v1"]) if b else None


def profondeur(cam, shot, x, y):
    """La distance devant l'objectif (m, le long de la visée à plat) d'un point de la ville ; négative derrière."""
    inv, _ = T._vers_scene(shot)
    sx, sy = inv(x, y)
    a = math.radians(cam[3])
    return (sx - cam[0]) * -math.sin(a) + (sy - cam[1]) * -math.cos(a)


def hero_rect(cam, shot, f):
    h = P.hero(shot)
    hx, hy = h["pos"](f)
    b = M.hero_screen(cam, hx, hy, P.sol(shot, hx, hy), h["heading"](f))
    return (b["u0"], b["u1"], b["v0"], b["v1"]), (hx, hy), b["u"]


def patrouille(shot, nom, g):
    g0, g1, fn, capf = _POURS[(shot, nom)]
    if not g0 <= g <= g1:
        return None
    c = capf(g)
    if c is None:
        return None
    return fn(g) + (c,)


def part_dans_cadre(r):
    return aire(coupe(r)) / aire(r) if r and aire(r) > 0 else 0.0


def _aire_poly(p):
    return 0.5 * abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))))


def _enveloppe(pts):
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts

    def demi(seq):
        h = []
        for q in seq:
            while len(h) >= 2 and (h[-1][0] - h[-2][0]) * (q[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (q[0] - h[-2][0]) <= 0:
                h.pop()
            h.append(q)
        return h[:-1]
    return demi(pts) + demi(pts[::-1])


def _coupe_poly(poly):
    """Le polygone coupé au cadre [0, 1]² (Sutherland-Hodgman)."""
    for axe, borne, signe in ((0, 0.0, 1), (0, 1.0, -1), (1, 0.0, 1), (1, 1.0, -1)):
        out = []
        for i, a in enumerate(poly):
            b = poly[(i + 1) % len(poly)]
            da, db = signe * (a[axe] - borne), signe * (b[axe] - borne)
            if da >= 0:
                out.append(a)
            if (da >= 0) != (db >= 0):
                k = da / (da - db)
                out.append((a[0] + k * (b[0] - a[0]), a[1] + k * (b[1] - a[1])))
        poly = out
        if len(poly) < 3:
            return []
    return poly


def silhouette(cam, shot, x, y, cap, box):
    """La part de la silhouette d'une boîte posée en ville qui tombe dans le cadre (0 à 1) : l'enveloppe convexe de
    ses huit coins vus par la caméra, coupée au cadre. Un coin derrière l'objectif : la part de son rectangle."""
    inv, rot = T._vers_scene(shot)
    sx, sy = inv(x, y)
    z = P.sol(shot, sx, sy)
    h = math.radians(cap - rot)
    fx, fy = -math.sin(h), math.cos(h)
    l, w, ht = box
    pts = [M.screen_point(cam, (sx + fx * l * a + fy * w * b, sy + fy * l * a - fx * w * b, z + zz))
           for a in (-0.5, 0.5) for b in (-0.5, 0.5) for zz in (0.0, ht)]
    if any(q is None for q in pts):
        return part_dans_cadre(rect(cam, shot, x, y, cap, box)) if any(pts) else 0.0
    env = _enveloppe(pts)
    tot = _aire_poly(env)
    cl = _coupe_poly(env)
    return _aire_poly(cl) / tot if tot > 0 and cl else 0.0


def lignes_choc(c, avant=14, apres=11):
    """Autour du contact c, image par image : dict(g, part (de la silhouette de la patrouille dans le cadre), u (son
    rectangle), hero_u, hero (le rectangle de la berline), point (le point de contact à l'écran))."""
    shot, nom, gi = c["plan"], c["patrouille"], c["image"]
    loc = C.patrouille_de(c).point(c)                        # (m devant le centre de la berline, à sa gauche)
    rows = []
    for g in range(max(0, int(gi) - avant), int(gi) + apres + 1):
        sh, f = T._plan(g)
        cam = P.chase(sh, f)
        p = patrouille(sh, nom, g) or patrouille(shot, nom, g)
        r = rect(cam, sh, *p, PATROL) if p else None
        hr, (hx, hy), hu = hero_rect(cam, sh, f)
        a = math.radians(P.hero(sh)["heading"](f))
        fx, fy = -math.sin(a), math.cos(a)
        px, py = hx + loc[0] * fx - loc[1] * fy, hy + loc[0] * fy + loc[1] * fx
        q = M.screen_point(cam, (px, py, P.sol(sh, px, py) + C.H_CHOC))
        rows.append(dict(g=g, part=silhouette(cam, sh, *p, PATROL) if p else 0.0, u=(r[0], r[1]) if r else None,
                         hero_u=hu, hero=hr, point=q))
    return rows


def bilan_choc(c, rows):
    """(la plus petite part de la patrouille dans les 8 images avant le choc, sa part au choc, le point de contact
    est dans le cadre)."""
    gi = c["image"]
    avant = [r["part"] for r in rows if gi - 8 <= r["g"] < gi]
    au = next(r for r in rows if r["g"] == int(gi))
    q = au["point"]
    return min(avant), au["part"], q is not None and 0.0 <= q[0] <= 1.0 and 0.0 <= q[1] <= 1.0


def chocs():
    print("======== les contacts dans le cadre (caméra du film)")
    res = []
    for c in C.CHOCS:
        gi = c["image"]
        rows = lignes_choc(c)
        print(f"  -- {c['nom']} : image {gi:g} ({c['plan']}), patrouille « {c['patrouille']} »")
        print("     image  patrouille dans le cadre   u de son rectangle     berline u    point de contact (u, v)")
        for r in rows:
            u, q = r["u"], r["point"]
            print(f"     {r['g']:4d}   {100 * r['part']:5.1f} %                 "
                  + (f"{u[0]:+.3f} → {u[1]:+.3f}" if u else "      —        ")
                  + f"       {r['hero_u']:.3f}       " + (f"({q[0]:+.3f}, {q[1]:.3f})" if q else "—")
                  + ("   <- choc" if r["g"] == int(gi) else ""))
        mini, au, ok_pt = bilan_choc(c, rows)
        avant = [r["part"] for r in rows if gi - 8 <= r["g"] < gi]
        print(f"     les 8 images avant le choc : {100 * mini:.1f} % au moins ({100 * sum(avant) / len(avant):.1f} % "
              f"en moyenne) ; au choc {100 * au:.1f} %, point de contact {'dans le' if ok_pt else 'HORS du'} cadre")
        res.append(dict(nom=c["nom"], image=gi, rows=rows, avant_min=mini, au_choc=au, point_dans=ok_pt))
    # P1 : la patrouille 1 est-elle à l'image ?
    g0, g1 = P.START["P1"], P.START["P2"] - 1
    parts = []
    for g in range(g0, g1 + 1):
        sh, f = T._plan(g)
        cam = P.chase(sh, f)
        best = 0.0
        for (shot, nom) in _POURS:
            if shot != sh:
                continue
            p = patrouille(shot, nom, g)
            if p and profondeur(cam, sh, p[0], p[1]) > 0.5:
                best = max(best, silhouette(cam, sh, *p, PATROL))
        parts.append(best)
    print(f"  -- P1 (images {g0} à {g1}) : la patrouille la mieux vue, part dans le cadre : "
          + " ".join(f"{100 * p:.0f}" for p in parts[::4]) + f" (une image sur 4) ; {sum(p >= 0.5 for p in parts)} "
          f"images sur {len(parts)} avec une patrouille à moitié au moins dans le cadre")
    OUT["chocs"] = res
    OUT["p1_patrouille"] = parts


def dense(silence=False):
    """Remplit OUT (n_vie, n_patrouilles, noms : par image ; trous : [(première, dernière image)]) et l'affiche."""
    dit = (lambda *a: None) if silence else print
    dit("======== les voitures qui roulent devant l'objectif (≤ 40 m, lisibles), image par image")
    n_vie, n_pat, noms = [], [], []
    for g in range(0, P.TOTAL):
        sh, f = T._plan(g)
        cam = P.chase(sh, f)
        hr, (hx, hy), _ = hero_rect(cam, sh, f)
        d_hero = math.hypot(hx - cam[0], hy - cam[1])
        vus = []
        for nom, modele, _t, course, _kw in _VEH:
            if not (course.vit(g) > 0.3 or course.vit(g + 1) > 0.3):
                continue
            x, y, cap = course.pose(g)
            d = profondeur(cam, sh, x, y)
            if not 0.5 < d <= PORTEE:
                continue
            w, l = V.DEMI.get(modele, V.DEMI_DEFAUT)
            r = rect(cam, sh, x, y, cap, (2 * l, 2 * w, HAUTEUR.get(modele, H_BOITE)))
            if not r or aire(r) <= 0:
                continue
            vis = aire(coupe(r))
            if d > d_hero:                                   # derrière la berline : ce qu'elle en cache
                vis -= aire(coupe(coupe(r), hr))
            haut = min(1.0, r[3]) - max(0.0, r[2])
            if vis / aire(r) >= MOITIE and haut >= HAUT_MIN:
                vus.append(nom)
        np_ = 0
        for (shot, nom) in _POURS:
            if shot != sh:
                continue
            p = patrouille(shot, nom, g)
            if p and 0.5 < profondeur(cam, sh, p[0], p[1]) <= PORTEE and part_dans_cadre(rect(cam, sh, *p, PATROL)) >= MOITIE:
                np_ += 1
        n_vie.append(len(vus))
        n_pat.append(np_)
        noms.append(vus)
    OUT["n_vie"], OUT["n_patrouilles"], OUT["noms"] = n_vie, n_pat, noms
    trous, a = [], None
    for g, n in enumerate(n_vie + [1]):
        if n == 0 and a is None:
            a = g
        elif n > 0 and a is not None:
            if g - a > TROU * FPS:
                trous.append((a, g - 1))
            a = None
    OUT["trous"] = trous
    dit(f"  images avec une voiture au moins : {sum(n > 0 for n in n_vie)} sur {P.TOTAL} "
          f"({100 * sum(n > 0 for n in n_vie) / P.TOTAL:.0f} %) ; deux au moins : {sum(n > 1 for n in n_vie)}")
    dit("  trous de plus de 1,5 s (aucune voiture qui roule, lisible, à moins de 40 m) : "
          + (", ".join(f"{a}→{b} ({(b - a + 1) / FPS:.1f} s)" for a, b in trous) or "aucun"))
    dit("  par seconde (images, moyenne de voitures lisibles, images sans aucune, patrouilles en moyenne) :")
    for g0 in range(0, P.TOTAL, 24):
        seg = n_vie[g0:g0 + 24]
        sh = T._plan(g0)[0]
        qui = sorted({n.replace("trafic_", "") for row in noms[g0:g0 + 24] for n in row})
        dit(f"    {g0:3d}→{min(P.TOTAL, g0 + 24) - 1:3d} {sh:4s} {sum(seg) / len(seg):4.1f}   vides {sum(n == 0 for n in seg):2d}   "
              f"patrouilles {sum(n_pat[g0:g0 + 24]) / len(seg):3.1f}   {' '.join(qui)[:110]}")


if __name__ == "__main__":
    if A.chocs or not A.dense:
        chocs()
    if A.dense or not A.chocs:
        dense()
    if A.json:
        json.dump(OUT, open(A.json, "w", encoding="utf-8"))
        print("écrit", A.json)
