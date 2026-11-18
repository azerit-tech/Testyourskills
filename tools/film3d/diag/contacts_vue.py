# La vue de dessus des contacts de la poursuite (contacts.py, SPEC §18.68) : une planche par contact, la route à
# l'horizontale (la berline va vers la droite), les boîtes de la berline et de la patrouille à quelques images autour
# du choc, leurs trajectoires (en pointillé : celles d'avant le contact), la circulation, le point de contact.
#   python3.10 tools/film3d/diag/contacts_vue.py --out DIR        (matplotlib : python3.10)
import argparse
import math
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Polygon  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import contacts as C  # noqa: E402
import parcours as P  # noqa: E402
import trafic as T  # noqa: E402
import vie as V  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
A = ap.parse_args()
os.makedirs(A.out, exist_ok=True)

ENCRE, DISCRET, GRILLE, FOND = "#1f1f1d", "#6b6a63", "#e4e3dd", "#fcfcfb"
C_TRAFIC, C_HERO, C_PATROUILLE = "#2a78d6", "#eb6834", "#1baf7a"
IMAGES = (-12, -6, 0, 6, 14, 26)
FPS = 24.0

pours, veh = T._poursuite(), V.vehicules()
for c in C.CHOCS:
    pat = C.patrouille_de(c)
    pat._pret()
    row = next(r for r in pat.rows if r["c"] is c)
    plan, t0, tc = pat.plan, row["t0"], row["tc"]
    h0 = P.hero(plan, chocs=False)
    ox, oy, _ = pat.hero(tc)
    a0 = math.radians(h0["travel"](1.0 + tc * FPS))
    ux, uy = -math.sin(a0), math.cos(a0)                 # l'avant de la route au choc ; sa gauche : (-uy, ux)

    def loc(x, y):
        return (x - ox) * ux + (y - oy) * uy, (x - ox) * -uy + (y - oy) * ux

    to_v, rot = P.vers_ville(plan)
    tx, ty = to_v(0.0, 0.0)
    r = math.radians(-rot)

    def de_ville(x, y):
        dx, dy = x - tx, y - ty
        return dx * math.cos(r) - dy * math.sin(r), dx * math.sin(r) + dy * math.cos(r)

    fig, ax = plt.subplots(figsize=(15, 5.2), dpi=110)
    fig.patch.set_facecolor(FOND)
    ax.set_facecolor(FOND)
    ts = [tc + k / 96.0 for k in range(-16 * 4, 32 * 4 + 1)]
    ax.plot(*zip(*[loc(*h0["pos"](1.0 + t * FPS)) for t in ts]), color=C_HERO, lw=1.0, ls=(0, (4, 3)), alpha=0.7)
    ax.plot(*zip(*[loc(*pat.hero(t)[:2]) for t in ts]), color=C_HERO, lw=1.8, label="la berline (en pointillé : sans le contact)")
    ax.plot(*zip(*[loc(*pat.brut(t)) for t in ts]), color=C_PATROUILLE, lw=1.0, ls=(0, (4, 3)), alpha=0.7)
    ax.plot(*zip(*[loc(*pat(t)) for t in ts]), color=C_PATROUILLE, lw=1.8, label="la patrouille 1 (en pointillé : sa ligne d'avant)")
    vus = set()
    for k in IMAGES:
        t = tc + k / FPS
        Hb, Pb = pat.boites(t)
        fort = k == 0
        for box, col in ((Hb, C_HERO), (Pb, C_PATROUILLE)):
            ax.add_patch(Polygon([loc(*q) for q in box], closed=True, fc=col, ec=ENCRE if fort else col,
                                 alpha=0.85 if fort else 0.28, lw=1.4 if fort else 0.8))
        cx, cy = loc(*pat.hero(t)[:2])
        ax.text(cx, cy - 2.1, f"{c['image'] + k:g}", ha="center", va="top", fontsize=8, color=ENCRE if fort else DISCRET)
        g = int(round(c["image"] + k))
        for q in T.boites(g, pours, veh)[1:]:
            if q[1] in ("patrol", "van") or q[4] is None:
                continue
            box = q[8] or T._coins(q[2], q[3], q[4], q[5], q[6])
            pts = [loc(*de_ville(*p)) for p in box]
            if max(abs(p[0]) for p in pts) < 45 and max(abs(p[1]) for p in pts) < 9:
                ax.add_patch(Polygon(pts, closed=True, fc=C_TRAFIC, ec=C_TRAFIC, alpha=0.22, lw=0.8))
                if q[0] not in vus:
                    vus.add(q[0])
                    ax.text(sum(p[0] for p in pts) / 4, max(p[1] for p in pts) + 0.3, q[0].replace("trafic_", ""),
                            fontsize=7, color=C_TRAFIC, ha="center", clip_on=True)
    px, py = pat.point(c)
    hx, hy, hc = pat.hero(tc)
    ah = math.radians(hc)
    wx, wy = hx - math.sin(ah) * px - math.cos(ah) * py, hy + math.cos(ah) * px - math.sin(ah) * py
    ax.plot(*loc(wx, wy), marker="*", ms=17, color="#f2c230", mec=ENCRE, mew=0.8, zorder=5, label="le point de contact")
    t = pat.touche(c)
    ax.set_title(f"Contact « {c['nom']} », image {c['image']:g} du film : {C.norme(c):.0f} N·s, approche {c['v']:g} m/s ; "
                 f"caisses l'une contre l'autre des images {t[0]:g} à {t[1]:g}", fontsize=11, color=ENCRE, loc="left")
    ax.set_xlim(-16, 34)
    ax.set_ylim(-6.5, 8.5)
    ax.set_aspect("equal")
    ax.grid(True, color=GRILLE, lw=0.6)
    ax.set_xlabel("m le long de la route (0 : la berline au choc) ; sous chaque boîte de la berline, l'image du film",
                  fontsize=9, color=DISCRET)
    ax.set_ylabel("m en travers (gauche en haut)", fontsize=9, color=DISCRET)
    ax.tick_params(colors=DISCRET, labelsize=8)
    for s in ax.spines.values():
        s.set_color(GRILLE)
    ax.legend(loc="upper left", fontsize=8, frameon=False, ncol=3)
    out = os.path.join(A.out, f"{c['nom']}-dessus.png")
    fig.tight_layout()
    fig.savefig(out, facecolor=FOND)
    plt.close(fig)
    print(out)
