# Ce que le bras de la caméra donne à l'image, mesuré sans Blender sur la caméra du film (parcours.chase, ou un
# réglage de bras.py) : la vitesse et le nerf se lisent ici avant de se juger sur un rendu.
#
#   python3 tools/film3d/diag/audit_bras.py                 # le tableau par tronçon du réglage en place (BRAS_FILM)
#   python3 tools/film3d/diag/audit_bras.py --bras A,B,C    # les réglages côte à côte
#   python3 tools/film3d/diag/audit_bras.py --bras B --images 125-200   # image par image
#   python3 tools/film3d/diag/audit_bras.py --bras A,B,C --gels         # les images de gel et les étoiles
#
# Par image du film (720 × 1280, 24 i/s) :
#   sol      le défilement de la chaussée en bas du cadre, px par image : le point du sol vu à (50 %, 90 %) du cadre,
#            suivi d'une demi-image avant à une demi-image après. Le flou de bougé en étire la moitié (obturateur 0,5).
#   bord     le même au bord du cadre, à la hauteur du pare-chocs de la berline (10 %, 75 %) : la bordure, les
#            voitures garées, les rambardes.
#   pano     le panoramique de la caméra, °/s (le lacet de la visée).
#   décor    le balayage du décor, px par image : un point fixe de la ville à 30 m devant l'objectif, au centre du
#            cadre (une façade, les palmiers de l'îlot), suivi d'une demi-image avant à une demi-image après. Il compte
#            le panoramique ET le déplacement de la caméra en travers de sa visée (le bras à l'extérieur du virage
#            regarde en travers de sa route : le décor défile de côté).
#   flanc    l'angle entre l'axe de la caisse et la ligne caméra → berline, ° (0 : de dos, 90 : de profil), signé
#            (positif : on voit son flanc gauche) ; et sa vitesse, °/s : la caisse qui pivote DANS le cadre.
#   large    la largeur de la boîte de la berline, % de la largeur du cadre ; u, v : son centre.
#   bras     la distance caméra → berline (m), la hauteur au-dessus de la chaussée (m), la focale (mm), le roulis (°).
#   acc, jerk  l'accélération (m/s²) et l'à-coup (m/s³) de la caméra par rapport à la berline, sur la pose sans
#            vibration (celle de chase) ; d2u : l'accélération du centre de la berline à l'écran, % de largeur / image².
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import motion as M  # noqa: E402
import parcours as P  # noqa: E402

W_PX, H_PX = 720.0, 1280.0
FPS = P.FPS
TRONCONS = [(n, P.START[n], P.START[n] + P.frames(n) - 1) for n in ("OUV", "P1", "P2", "P3", "P4", "P5", "P6", "FIN6")]
GELS = (107, 214, 317, 425, 485, 719)


def shot_of(g):
    for n, a, b in TRONCONS:
        if a <= g <= b:
            return n, g - a + 1
    n, a, b = TRONCONS[-1]
    return n, g - a + 1


def chase_fn(reglage=None):
    """(tronçon, image) -> caméra, pour un réglage de bras.py (None : parcours.chase tel qu'il est installé)."""
    if reglage is None:
        return P.chase
    import bras
    return lambda shot, f: bras.chase(shot, f, reglage)


def _axes(cam):
    x, y, z, yaw, pitch, roll, lens = cam
    a, b, c = math.radians(yaw), math.radians(pitch), math.radians(roll)
    f = (-math.sin(a) * math.cos(b), -math.cos(a) * math.cos(b), math.sin(b))
    r = (-math.cos(a), math.sin(a), 0.0)
    u = (r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0])
    r, u = ([math.cos(c) * r[i] + math.sin(c) * u[i] for i in range(3)],
            [-math.sin(c) * r[i] + math.cos(c) * u[i] for i in range(3)])
    return f, r, u


def sol_vu(cam, u, v, zsol):
    """Le point de la chaussée (plan z = zsol) vu à (u, v) du cadre ; None si le rayon ne descend pas."""
    f, r, up = _axes(cam)
    lens = cam[6]
    a, b = (2.0 * u - 1.0) * 10.125 / lens, (1.0 - 2.0 * v) * 18.0 / lens
    d = [f[i] + a * r[i] + b * up[i] for i in range(3)]
    if d[2] >= -1e-6:
        return None
    k = (zsol - cam[2]) / d[2]
    return cam[0] + k * d[0], cam[1] + k * d[1], zsol


def flux(chase, shot, f, u, v):
    """Le défilement (px par image) du point du sol vu à (u, v), d'une demi-image avant à une demi-image après."""
    cam = chase(shot, f)
    p = sol_vu(cam, u, v, P.sol(shot, cam[0], cam[1]))
    if p is None:
        return 0.0
    a, b = M.screen_point(chase(shot, f - 0.5), p), M.screen_point(chase(shot, f + 0.5), p)
    if not a or not b:
        # le point passe derrière l'objectif en une image : au moins la hauteur qui le séparait du bord
        return H_PX
    return math.hypot((b[0] - a[0]) * W_PX, (b[1] - a[1]) * H_PX)


def decor(chase, shot, f, loin=30.0):
    """Le balayage (px par image) d'un point fixe à `loin` m devant l'objectif, à sa hauteur, au centre du cadre."""
    cam = chase(shot, f)
    a = math.radians(cam[3])
    p = (cam[0] - math.sin(a) * loin, cam[1] - math.cos(a) * loin, cam[2])
    a, b = M.screen_point(chase(shot, f - 0.5), p), M.screen_point(chase(shot, f + 0.5), p)
    return math.hypot((b[0] - a[0]) * W_PX, (b[1] - a[1]) * H_PX) if a and b else 0.0


def _wrap(a):
    return (a + 180.0) % 360.0 - 180.0


def ligne(chase, g):
    shot, f = shot_of(g)
    h = P.hero(shot)
    cam = chase(shot, f)
    hx, hy = h["pos"](f)
    hz = P.sol(shot, hx, hy)
    head = h["heading"](f)
    box = M.hero_screen(cam, hx, hy, hz, head)
    # la ligne caméra → berline, comme un cap (0 = +y, positif à gauche)
    vers = math.degrees(math.atan2(-(hx - cam[0]), hy - cam[1]))

    def aspect(ff):
        c = chase(shot, ff)
        x, y = h["pos"](ff)
        return _wrap(h["heading"](ff) - math.degrees(math.atan2(-(x - c[0]), y - c[1])))
    asp = aspect(f)
    dasp = _wrap(aspect(f + 0.5) - aspect(f - 0.5)) * FPS
    pano = _wrap(chase(shot, f + 0.5)[3] - chase(shot, f - 0.5)[3]) * FPS

    def rel(ff):
        c = chase(shot, ff)
        x, y = h["pos"](ff)
        return c[0] - x, c[1] - y, c[2] - P.sol(shot, c[0], c[1])
    dt = 1.0 / FPS
    r = [rel(f + k) for k in (-1.5, -0.5, 0.5, 1.5)]
    acc = math.sqrt(sum(((r[3][i] - r[2][i]) - (r[1][i] - r[0][i])) ** 2 for i in range(3))) / (2.0 * dt * dt)
    jerk = math.sqrt(sum((r[3][i] - 3.0 * r[2][i] + 3.0 * r[1][i] - r[0][i]) ** 2 for i in range(3))) / dt ** 3

    def uc(ff):
        c = chase(shot, ff)
        x, y = h["pos"](ff)
        b = M.hero_screen(c, x, y, P.sol(shot, x, y), h["heading"](ff))
        return b["u"] if b else 0.5
    d2u = (uc(f + 1) - 2.0 * uc(f) + uc(f - 1)) * 100.0
    dist = math.hypot(hx - cam[0], hy - cam[1])
    return dict(g=g, shot=shot, v=h["speed"](f), glisse=h["slip"](f), sol=flux(chase, shot, f, 0.5, 0.9),
                bord=flux(chase, shot, f, 0.1, 0.75), pano=pano, pano_px=decor(chase, shot, f),
                flanc=asp, dflanc=dasp, large=100.0 * box["w"] if box else 0.0, u=100.0 * box["u"] if box else 0.0,
                v0=100.0 * box["v0"] if box else 0.0, v1=100.0 * box["v1"] if box else 0.0,
                u0=100.0 * box["u0"] if box else 0.0, u1=100.0 * box["u1"] if box else 0.0,
                dist=dist, z=cam[2] - P.sol(shot, cam[0], cam[1]), lens=cam[6], roll=cam[5], acc=acc, jerk=jerk,
                d2u=d2u, vers=vers)


def table(chase, images=None):
    return [ligne(chase, g) for g in (images or range(0, 720))]


def _moy(rows, k, absolu=False):
    xs = [abs(r[k]) if absolu else r[k] for r in rows]
    return sum(xs) / len(xs) if xs else 0.0


def _max(rows, k):
    return max((abs(r[k]) for r in rows), default=0.0)


FENETRES = TRONCONS + [("dérap. 2", 136, 180), ("dérap. 5", 440, 472), ("pont 340–400", 340, 400)]


def resume(rows):
    """Par tronçon (et sur les deux dérapages) : les moyennes et les crêtes."""
    out = []
    for n, a, b in FENETRES:
        rs = [r for r in rows if a <= r["g"] <= b]
        if not rs:
            continue
        out.append(dict(nom=n, a=a, b=b, kmh=3.6 * _moy(rs, "v"), sol=_moy(rs, "sol"), sol_max=_max(rs, "sol"),
                        bord=_moy(rs, "bord"), pano=_moy(rs, "pano", True), pano_max=_max(rs, "pano"),
                        pano_px=_moy(rs, "pano_px"), flanc_max=_max(rs, "flanc"), dflanc_max=_max(rs, "dflanc"),
                        glisse=_max(rs, "glisse"),
                        large=_moy(rs, "large"), large_min=min(r["large"] for r in rs),
                        large_max=max(r["large"] for r in rs), dist=_moy(rs, "dist"), z=_moy(rs, "z"),
                        lens=_moy(rs, "lens"), roll=_max(rs, "roll"), acc=_max(rs, "acc"), jerk=_max(rs, "jerk"),
                        d2u=_max(rs, "d2u"), u0=min(r["u0"] for r in rs), u1=max(r["u1"] for r in rs),
                        v0=min(r["v0"] for r in rs), v1=max(r["v1"] for r in rs),
                        u_min=min(r["u"] for r in rs), u_max=max(r["u"] for r in rs),
                        dehors=sum(1 for r in rs if r["u0"] < 0.0 or r["u1"] > 100.0 or r["v0"] < 0.0
                                   or r["v1"] > 100.0)))
    return out


def texte_resume(nom, res):
    t = [f"réglage {nom}",
         "tronçon        images    km/h | sol px/i (max)  bord | pano °/s (max) décor | flanc° max  °/s max  glisse° |"
         " large % (min–max) centre u  bords u   v | dist  haut  focale roulis | acc  jerk  d2u | hors"]
    for r in res:
        t.append(f"{r['nom']:13s} {r['a']:3d}–{r['b']:3d}  {r['kmh']:5.0f} | {r['sol']:5.0f} ({r['sol_max']:4.0f})  "
                 f"{r['bord']:5.0f} | {r['pano']:5.1f} ({r['pano_max']:5.1f}) {r['pano_px']:4.1f} | "
                 f"{r['flanc_max']:6.1f}   {r['dflanc_max']:6.1f}   {r['glisse']:5.1f}  | "
                 f"{r['large']:4.0f} ({r['large_min']:2.0f}–{r['large_max']:2.0f})  {r['u_min']:4.0f}–{r['u_max']:2.0f}  "
                 f"{r['u0']:3.0f}–{r['u1']:3.0f} {r['v0']:2.0f}–{r['v1']:2.0f} | {r['dist']:4.1f}  {r['z']:4.2f}  "
                 f"{r['lens']:4.1f}  {r['roll']:4.1f}  | {r['acc']:4.1f} {r['jerk']:5.0f} {r['d2u']:5.2f} | "
                 f"{r['dehors']:3d}")
    return "\n".join(t)


def texte_images(nom, rows):
    t = [f"réglage {nom}",
         "  g  plan  km/h glisse |  sol  bord | pano décor| flanc  °/s | large   u    v0–v1 | dist haut foc. roul. |"
         " acc jerk"]
    for r in rows:
        t.append(f"{r['g']:3d} {r['shot']:5s} {3.6 * r['v']:4.0f} {r['glisse']:6.1f} | {r['sol']:4.0f} {r['bord']:5.0f} |"
                 f" {r['pano']:5.1f} {r['pano_px']:4.1f} | {r['flanc']:5.1f} {r['dflanc']:5.1f} | {r['large']:4.0f} "
                 f"{r['u']:5.1f} {r['v0']:4.0f}–{r['v1']:3.0f} | {r['dist']:4.1f} {r['z']:4.2f} {r['lens']:4.1f} "
                 f"{r['roll']:4.1f} | {r['acc']:4.1f} {r['jerk']:4.0f}")
    return "\n".join(t)


def parse_images(spec):
    out = []
    for part in spec.split(","):
        a, _, b = part.partition("-")
        out.extend(range(int(a), int(b or a) + 1))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--bras", default=None, help="A, B, C… (bras.py), séparés par des virgules ; sans : la caméra "
                    "en place")
    ap.add_argument("--images", default=None, help="image par image, ex. 125-200")
    ap.add_argument("--gels", action="store_true", help="les images de gel et les étoiles")
    a = ap.parse_args()
    for nom in (a.bras.split(",") if a.bras else [None]):
        ch = chase_fn(nom)
        if a.images or a.gels:
            imgs = parse_images(a.images) if a.images else sorted(set(GELS) | set(P.ETOILES.values()))
            print(texte_images(nom or "en place", table(ch, imgs)))
        else:
            print(texte_resume(nom or "en place", resume(table(ch))))
        print()
