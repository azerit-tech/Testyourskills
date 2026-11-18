# Les planches de l'audit du slalom (SPEC §18.62), depuis audit.json (diag/audit_trafic.py --out) :
#
#   python3.10 tools/film3d/diag/audit_trafic_planche.py --audit DIR/audit.json --out dessus.png
#   python3.10 tools/film3d/diag/audit_trafic_planche.py --gris DIR --images "OUV:26,51 P4:13,48" --out gris.png
#
# --audit : la vue de dessus, redressée le long de la route (abscisse s en m, écart n en m, positif à gauche ;
# l'échelle en travers est grossie). La berline, la circulation, les patrouilles, les garées, les bordures ; les boîtes
# aux images des manœuvres. --gris : la planche des gris du film (render_film --dry --ville), DIR/<PLAN>+ville/NNNN.png.
# matplotlib : python3.10 (le python3 de la machine n'en a pas).
import argparse
import json
import math
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.image as mpimg  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Polygon  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--audit")
ap.add_argument("--gris")
ap.add_argument("--images", default="")
ap.add_argument("--titre", default="")
ap.add_argument("--out", required=True)
A = ap.parse_args()

ENCRE, DISCRET, GRILLE, FOND = "#1f1f1d", "#6b6a63", "#e4e3dd", "#fcfcfb"
C_TRAFIC, C_HERO, C_PATROUILLE, C_VIE, C_FIXE = "#2a78d6", "#eb6834", "#1baf7a", "#9a998f", "#c9c8c0"
START = {"OUV": 0, "P1": 75, "P2": 108, "P3": 215, "P4": 318, "P5": 426, "P6": 486, "FIN6": 619}


def dessus():
    d = json.load(open(A.audit, encoding="utf-8"))
    tr = d["traj"]
    route = tr["route"]                                   # un point par mètre d'abscisse

    def sn(x, y, s_hint=None):
        """(s, n) du point de ville (x, y) : le point de la route le plus proche (autour de s_hint), n à gauche."""
        lo, hi = (0, len(route) - 2) if s_hint is None else (max(0, int(s_hint) - 40), min(len(route) - 2, int(s_hint) + 40))
        best = (1e18, 0.0, 0.0)
        for i in range(lo, hi + 1):
            (x0, y0), (x1, y1) = route[i], route[i + 1]
            dx, dy = x1 - x0, y1 - y0
            L2 = dx * dx + dy * dy
            u = max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / L2))
            px, py = x0 + u * dx, y0 + u * dy
            dd = (x - px) ** 2 + (y - py) ** 2
            if dd < best[0]:
                side = dx * (y - py) - dy * (x - px)
                best = (dd, i + u, math.copysign(math.sqrt(dd), side))
        return best[1], best[2]

    def coins(x, y, cap, w, l):
        c = math.radians(cap)
        fx, fy = -math.sin(c), math.cos(c)
        lx, ly = -fy, fx
        return [(x + a * l * fx + b * w * lx, y + a * l * fy + b * w * ly) for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1))]

    hero = tr["hero"]
    hero_sn = []
    s_prev = 0.0
    for x, y in hero:
        s, n = sn(x, y, s_prev)
        hero_sn.append((s, n))
        s_prev = s
    caps = [p[2] for p in d["poses"]] if "poses" in d and len(d["poses"][0]) > 2 else None

    # (titre, s de, à, n de, à, bordures [(n, de s, à s)], images des boîtes)
    zones = [
        ("L'avenue (OUV, P1)", 0, 112, -7.5, 10.5,
         [(-5.75, 0, 112), (9.25, 0, 112)], (8, 30, 53, 64, 82, 102)),
        ("La rue et le pont (P3, P4)",
         178, 365, -8.5, 10.0, [(-3.65, 178, 226), (4.35, 178, 226)], (259, 283, 300, 340, 362, 378, 395, 418)),
        ("La jetée (P6)", 388, 478, -4.5, 8.0,
         [(-2.25, 392, 478), (5.75, 392, 478)], (500, 527, 548, 560, 582, 598, 612)),
    ]
    fig, axes = plt.subplots(len(zones), 1, figsize=(15, 13.5), facecolor=FOND,
                             gridspec_kw=dict(height_ratios=[1.0, 1.25, 1.0], hspace=0.42))
    for ax, (titre, s0, s1, n0, n1, bords, images) in zip(axes, zones):
        ax.set_facecolor(FOND)
        ax.set_xlim(s0, s1)
        ax.set_ylim(n0, n1)
        ax.set_title(titre, loc="left", color=ENCRE, fontsize=12, fontweight="bold", pad=8)
        ax.set_xlabel("abscisse de la route s (m)", color=DISCRET, fontsize=9)
        ax.set_ylabel("écart n (m, gauche en haut)", color=DISCRET, fontsize=9)
        ax.grid(True, color=GRILLE, linewidth=0.8)
        ax.tick_params(colors=DISCRET, labelsize=8)
        for sp in ax.spines.values():
            sp.set_color(GRILLE)
        for n, a, b in bords:
            ax.plot([a, b], [n, n], color=ENCRE, linewidth=1.6, solid_capstyle="butt")
        ax.axhline(0.0, color=DISCRET, linewidth=0.8, linestyle=(0, (6, 4)))
        # le pont : ses bordures (x ±7,0 en ville), la route s'y décale
        if s0 < 300 < s1:
            for xb in (-7.0, 7.0):
                pts = [sn(xb, y, None) for y in range(-325, -206, 6)]
                ax.plot([p[0] for p in pts], [p[1] for p in pts], color=ENCRE, linewidth=1.6)
        g_lo = next(g for g, (s, n) in enumerate(hero_sn) if s >= s0)
        g_hi = max(g for g, (s, n) in enumerate(hero_sn) if s <= s1 and g < 619)
        # les garées et les fixes
        for nom, poly in tr.get("fixes", []) + tr.get("garees_scenes", []):
            q = [sn(x, y) for x, y in poly]
            if all(s0 - 5 <= p[0] <= s1 + 5 for p in q) and all(n0 - 2 <= p[1] <= n1 + 2 for p in q):
                ax.add_patch(Polygon(q, closed=True, facecolor=C_FIXE, edgecolor=DISCRET, linewidth=0.6))
        # la circulation et la vie qui roule : son chemin pendant que la berline est dans la zone, ses boîtes
        for nom, m in tr["mobiles"].items():
            trafic = nom.startswith("trafic_")
            pts = []
            for g in range(g_lo, g_hi + 1, 2):
                x, y, c = m["poses"][g]
                if math.hypot(x - hero[g][0], y - hero[g][1]) < 90.0:
                    s, n = sn(x, y)
                    if s0 <= s <= s1 and n0 <= n <= n1:
                        pts.append((s, n))
            if len(pts) < 2:
                continue
            col = C_TRAFIC if trafic else C_VIE
            ax.plot([p[0] for p in pts], [p[1] for p in pts], color=col, linewidth=1.4 if trafic else 0.9,
                    alpha=0.9 if trafic else 0.6)
            vu = None
            for g in images:
                x, y, c = m["poses"][g]
                if c is None or math.hypot(x - hero[g][0], y - hero[g][1]) > 45.0:
                    continue
                q = [sn(px, py) for px, py in coins(x, y, c, *m["demi"])]
                if all(s0 <= p[0] <= s1 for p in q) and all(n0 <= p[1] <= n1 for p in q):
                    ax.add_patch(Polygon(q, closed=True, facecolor=col, edgecolor=FOND, linewidth=1.0,
                                         alpha=0.85 if trafic else 0.5))
                    cs, cn = sum(p[0] for p in q) / 4, sum(p[1] for p in q) / 4
                    if trafic and (vu is None or abs(cs - vu) > 0.07 * (s1 - s0)):
                        vu = cs
                        ax.annotate(f"{nom.split('_')[-1].upper()} {g}", (cs, cn), xytext=(0, -13 if cn < 0.3 else 11),
                                    textcoords="offset points", ha="center", fontsize=7, color=ENCRE)
        # les patrouilles
        for nom, m in tr["patrouilles"].items():
            pts = []
            for k in range(0, len(m["pts"]), 2):
                g = m["g0"] + k
                if g_lo <= g <= g_hi:
                    s, n = sn(*m["pts"][k])
                    if s0 <= s <= s1 and n0 <= n <= n1:
                        pts.append((s, n))
            if len(pts) >= 2:
                ax.plot([p[0] for p in pts], [p[1] for p in pts], color=C_PATROUILLE, linewidth=1.0, alpha=0.8)
            for g in images:
                if m["g0"] <= g <= m["g1"] and m["caps"][g - m["g0"]] is not None:
                    x, y = m["pts"][g - m["g0"]]
                    if math.hypot(x - hero[g][0], y - hero[g][1]) > 40.0:
                        continue
                    q = [sn(px, py) for px, py in coins(x, y, m["caps"][g - m["g0"]], 0.975, 2.5)]
                    if all(s0 <= p[0] <= s1 for p in q) and all(n0 <= p[1] <= n1 for p in q):
                        ax.add_patch(Polygon(q, closed=True, facecolor=C_PATROUILLE, edgecolor=FOND, linewidth=1.0,
                                             alpha=0.45))
        # la berline : son chemin, ses boîtes aux images des manœuvres
        hs = [(s, n) for g, (s, n) in enumerate(hero_sn) if g_lo <= g <= g_hi]
        ax.plot([p[0] for p in hs], [p[1] for p in hs], color=C_HERO, linewidth=2.2)
        for g in images:
            if not g_lo <= g <= g_hi:
                continue
            x, y = hero[g]
            (xa, ya), (xb, yb) = hero[max(0, g - 2)], hero[min(len(hero) - 1, g + 2)]
            cap = caps[g] if caps else math.degrees(math.atan2(-(xb - xa), yb - ya))
            q = [sn(px, py, hero_sn[g][0]) for px, py in coins(x, y, cap, 0.9, 2.45)]
            ax.add_patch(Polygon(q, closed=True, facecolor=C_HERO, edgecolor=FOND, linewidth=1.0))
            ax.annotate(f"{g}", hero_sn[g], xytext=(0, 13 if hero_sn[g][1] > -0.2 else -17), textcoords="offset points",
                        ha="center", fontsize=8, fontweight="bold", color=ENCRE)
    hand = [plt.Line2D([], [], color=C_HERO, linewidth=2.2, label="la berline (boîtes : images du film)"),
            plt.Line2D([], [], color=C_TRAFIC, linewidth=1.6, label="la circulation de la poursuite (trafic.py)"),
            plt.Line2D([], [], color=C_PATROUILLE, linewidth=1.2, label="les patrouilles"),
            plt.Line2D([], [], color=C_VIE, linewidth=1.0, label="le reste de la vie qui roule"),
            plt.Line2D([], [], color=ENCRE, linewidth=1.6, label="les bordures de la chaussée"),
            plt.Line2D([], [], color=DISCRET, linewidth=0.8, linestyle=(0, (6, 4)), label="la route sans slalom (n = 0)")]
    fig.legend(handles=hand, loc="lower center", ncol=3, frameon=False, fontsize=9, labelcolor=ENCRE)
    fig.suptitle(A.titre or "Le slalom vu de dessus, redressé le long de la route (l'échelle en travers est grossie)",
                 x=0.07, ha="left", color=ENCRE, fontsize=14, fontweight="bold", y=0.975)
    fig.subplots_adjust(left=0.06, right=0.985, top=0.92, bottom=0.10)
    fig.savefig(A.out, dpi=110, facecolor=FOND)
    print("écrit", A.out)


def gris():
    items = []
    for bloc in A.images.split():
        plan, frs = bloc.split(":")
        for f in frs.split(","):
            p = os.path.join(A.gris, f"{plan}+ville", f"{int(f):04d}.png")
            if os.path.exists(p):
                items.append((plan, int(f), p))
            else:
                print("absent", p)
    cols = min(7, max(1, math.ceil(len(items) / 2)))
    rows = math.ceil(len(items) / cols)
    fig, axes = plt.subplots(rows, cols, figsize=(2.9 * cols, 5.5 * rows + 0.6), facecolor=FOND)
    axes = [axes] if rows * cols == 1 else list(getattr(axes, "flat", axes))
    for ax in axes:
        ax.axis("off")
    for ax, (plan, f, p) in zip(axes, items):
        ax.imshow(mpimg.imread(p))
        ax.set_title(f"{plan}/{f}  (image {START[plan] + f - 1} du film)", fontsize=9, color=ENCRE)
    fig.suptitle(A.titre or "Les esquives vues par la caméra du film (gris Workbench)", x=0.02, ha="left", color=ENCRE,
                 fontsize=13, fontweight="bold")
    fig.subplots_adjust(left=0.01, right=0.99, top=0.93, bottom=0.01, wspace=0.03, hspace=0.10)
    fig.savefig(A.out, dpi=110, facecolor=FOND)
    print("écrit", A.out)


if A.audit:
    dessus()
if A.gris:
    gris()
