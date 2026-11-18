# L'audit indépendant du slalom et de la circulation (SPEC §18.62), sans Blender : il ne reprend ni trafic.verifier
# ni test_trafic, il remesure tout depuis les poses (berline, patrouilles, vie, circulation) et la caméra du film.
#
#   python3 tools/film3d/diag/audit_trafic.py [--src DIR] [--out DIR] [--sub 4]
#
# --src : le dossier tools/film3d à auditer (défaut : celui de ce fichier) ; --out : où écrire audit.json (les
# planches le lisent : audit_trafic_planche.py). Mesures :
#   1. chaque manœuvre de parcours.SLALOM : images, écart, vitesse, latérale, à-coup, lacet, braquage implicite ;
#      la berline sur la chaussée (bordures, glissières, rambardes) ;
#   2. les contacts, boîtes orientées sans marge, au quart d'image : la marge la plus juste par paire ;
#   3. la cause de chaque écart (ce que la berline aurait touché sans lui) et chaque voiture passée ;
#   4. l'écran : la berline et la route dans le cadre pendant chaque écart, chaque voiture de la circulation ;
#   5. les raccords : position, cap, vitesse, caméra d'une image à l'autre aux frontières des tronçons.
import argparse
import json
import math
import os
import sys

ap = argparse.ArgumentParser()
ap.add_argument("--src", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ap.add_argument("--out", default=None)
ap.add_argument("--sub", type=int, default=4, help="pas des contacts : sous-images par image")
ap.add_argument("--sans", default="", help="sections à sauter : contacts,passages,circulation,ecran,raccords")
ap.add_argument("--hero", default=None, help="la berline simulée à la place de la conduite dessinée : le JSON de "
                "diag/audit_trafic_sim.py --traj (sa boîte contre la chaussée et les autres ; caméra, meute : inchangées)")
A = ap.parse_args()
sys.path.insert(0, os.path.abspath(A.src))
import motion as M  # noqa: E402
import parcours as P  # noqa: E402
import trafic as T  # noqa: E402
import vie as V  # noqa: E402

FPS = P.FPS
TO_CITY, CAP_CITY = P.placer("P4")
N_FILM = P.TOTAL + P.FIN6_FRAMES
EMPATTEMENT = 2.9
OUT = {}


def titre(s):
    print("\n" + "=" * 8 + " " + s)


# ---------------------------------------------------------------- la berline
class Table:
    """La berline simulée (film/physique), lue dans la table de audit_trafic_sim.py --traj : pos, heading, speed, s."""

    def __init__(self, chemin):
        d = json.load(open(chemin, encoding="utf-8"))
        self.hz, self.rows = d["hz"], d["rows"]         # rows : [x, y, cap, v, s]
        print(f"berline simulée : {chemin} ({d.get('physique', '?')}, slalom {d.get('slalom', '?')})")

    def _at(self, k, t):
        u = max(0.0, min(len(self.rows) - 1.001, t * self.hz))
        i = int(u)
        a, b = self.rows[i][k], self.rows[i + 1][k]
        return a + (b - a) * (u - i)

    def pos(self, t):
        return self._at(0, t), self._at(1, t)

    def heading(self, t):
        u = max(0.0, min(len(self.rows) - 1.001, t * self.hz))
        i = int(u)
        a, b = self.rows[i][2], self.rows[i + 1][2]
        return a + ((b - a + 180.0) % 360.0 - 180.0) * (u - i)

    def speed(self, t):
        return self._at(3, t)

    def s(self, t):
        return self._at(4, t)


HERO = Table(A.hero) if A.hero else P.DRIVE
if A.hero and hasattr(P, "SLALOM_SIMULE"):
    P.SLALOM = P.SLALOM_SIMULE          # les manœuvres et leurs causes se lisent sur la table de la conduite simulée


def hero_route(t):
    return HERO.pos(t)


def hero_city(t):
    x, y = TO_CITY(*HERO.pos(t))
    return x, y, HERO.heading(t) - CAP_CITY


def ecart_route(t):
    """L'écart latéral mesuré de la berline à la route (m, positif à gauche) à l'instant t."""
    s = HERO.s(t) if A.hero else P.s_of_t(t)
    rx, ry, rh, _k = P.ROUTE.at(s)
    x, y = HERO.pos(t)
    c = math.radians(rh)
    # la route et la berline ne sont pas à la même abscisse à 1e-3 près : on projette sur la normale
    return (x - rx) * -math.cos(c) + (y - ry) * -math.sin(c)


def cinematique(t, h=1.0 / 48.0):
    """(v, latérale, longitudinale) m/s, m/s² : dérivées centrées des positions."""
    p0, p1, p2 = HERO.pos(t - h), HERO.pos(t), HERO.pos(t + h)
    vx, vy = (p2[0] - p0[0]) / (2 * h), (p2[1] - p0[1]) / (2 * h)
    ax, ay = (p2[0] - 2 * p1[0] + p0[0]) / h / h, (p2[1] - 2 * p1[1] + p0[1]) / h / h
    v = math.hypot(vx, vy)
    if v < 0.3:
        return v, 0.0, 0.0
    return v, (vx * ay - vy * ax) / v, (vx * ax + vy * ay) / v


def manoeuvres():
    titre("1. les manœuvres du slalom (mesurées sur les positions de la conduite)")
    rows = []
    print("  n°  s début→fin (m)   images     durée  écart   v km/h  lat max  lat théo  à-coup  lacet °/s  braq. °  "
          "long. m/s²  cercle")
    for i, m in enumerate(P.SLALOM):
        s0, L, dn = m[0], m[1], m[2]
        ta, tb = P.t_of_s(s0), P.t_of_s(s0 + L)
        ga, gb = ta * FPS, tb * FPS
        ks = range(int(ta * 240), int(tb * 240) + 1)
        lat = [(cinematique(k / 240.0), k / 240.0) for k in ks]
        vmoy = sum(c[0] for c, _ in lat) / len(lat)
        amax = max(abs(c[1]) for c, _ in lat)
        cercle = max(math.hypot(c[1], c[2]) for c, _ in lat)
        along = max((abs(c[2]), c[2]) for c, _ in lat)[1]
        # l'à-coup : la dérivée de la latérale sur 1/24 s
        jerk = max(abs(cinematique(t + 1 / 48.0)[1] - cinematique(t - 1 / 48.0)[1]) * 24.0 for _c, t in lat)
        lacet = max(abs(math.degrees(c[1] / c[0])) for c, _ in lat if c[0] > 1)
        braq = max(abs(math.degrees(math.atan(EMPATTEMENT * c[1] / c[0] ** 2))) for c, _ in lat if c[0] > 1)
        dmes = ecart_route(tb) - ecart_route(ta)
        doux = len(m) > 3 and m[3] == "doux"
        k_lat, k_j = (7.5132, 52.5) if doux else (2 * math.pi, 4 * math.pi ** 2)
        theo = k_lat * abs(dn) * vmoy ** 2 / L ** 2
        rows.append(dict(n=i, s0=s0, s1=s0 + L, g0=ga, g1=gb, duree=tb - ta, ecart=dn, ecart_mesure=dmes,
                         v=vmoy, lat=amax, lat_theo=theo, jerk=jerk, lacet=lacet, braquage=braq, along=along,
                         cercle=cercle, doux=doux))
        print(f"  {i:2d}  {s0:6.1f}→{s0 + L:6.1f}  {ga:6.1f}→{gb:6.1f}  {tb - ta:4.2f} s  {dn:+5.2f}  {vmoy * 3.6:6.1f}  "
              f"{amax:6.2f}  {theo:7.2f}  {jerk:6.1f}  {lacet:8.1f}  {braq:6.2f}  {along:+8.2f}  {cercle:6.2f}"
              f"{'  (doux)' if doux else ''}  [mesuré {dmes:+.2f} m]")
    OUT["manoeuvres"] = rows
    # le profil de l'écart, image par image
    OUT["ecart"] = [ecart_route(g / FPS) for g in range(N_FILM)]
    OUT["voie"] = [P.voie(P.s_of_t(g / FPS)) for g in range(N_FILM)]
    worst = max((abs(a - b), g) for g, (a, b) in enumerate(zip(OUT["ecart"], OUT["voie"]))
                if not any(a_ <= g <= b_ for a_, b_ in P.VOIE_NULLE))
    print(f"  écart mesuré − voie(s) hors dérapages : {worst[0]:.3f} m au pire (image {worst[1]})")
    # sur tout le film : la latérale et le cercle, par tronçon
    print("  par tronçon : latérale max, cercle max (m/s²), à-coup latéral max (m/s³)")
    seg = []
    for nom in [n for n, _ in P.SHOTS] + ["FIN6"]:
        g0 = P.START[nom]
        g1 = g0 + P.frames(nom)
        cs = [(cinematique(k / 96.0), k / 96.0) for k in range(g0 * 4, g1 * 4)]
        la = max((abs(c[1]), t * FPS) for c, t in cs)
        ce = max((math.hypot(c[1], c[2]), t * FPS) for c, t in cs)
        jk = max((abs(cinematique(t + 1 / 48.0)[1] - cinematique(t - 1 / 48.0)[1]) * 24.0, t * FPS) for _c, t in cs)
        seg.append(dict(nom=nom, lat=la, cercle=ce, jerk=jk))
        print(f"    {nom:4s} latérale {la[0]:5.2f} (image {la[1]:5.1f})  cercle {ce[0]:5.2f} (image {ce[1]:5.1f})  "
              f"à-coup {jk[0]:5.1f} (image {jk[1]:5.1f})")
    OUT["troncons"] = seg


# ---------------------------------------------------------------- la chaussée
def chaussee():
    """La berline (ses quatre coins) sur la chaussée : avenue (bordures y −440,65 et −425,65), rue (|x| ≤ 4,0),
    pont (glissières |x| ≤ 7,0), jetée (chaussée |n| ≤ 4,0 autour de son axe, rambarde 4,34)."""
    titre("1 bis. la berline sur la chaussée (coins de la caisse, m de marge à la bordure la plus proche)")
    pires = {}
    for k in range(0, N_FILM * 4):
        t = k / (4 * FPS)
        x, y, cap = hero_city(t)
        pts = coins(x, y, cap, 0.9, 2.45)
        s = P.s_of_t(t)
        if s < P.S_ARC2 - 22.0:
            zone, marge = "avenue", min(min(p[1] - V.AV_TROTTOIR_BORD_MER, V.AV_TROTTOIR_BORD_VILLE - p[1]) for p in pts)
            cote = "mer (droite)" if min(p[1] for p in pts) - V.AV_TROTTOIR_BORD_MER < V.AV_TROTTOIR_BORD_VILLE - max(p[1] for p in pts) else "ville"
        elif -410.0 < y < -343.0 and abs(x) < 9.0:
            zone, marge = "rue", min(4.0 - abs(p[0]) for p in pts)
            cote = "droite" if max(p[0] for p in pts) > -min(p[0] for p in pts) else "gauche"
        elif M.PONT_Y_START < y < M.PONT_Y_FOOT and abs(x) < 12.0:
            zone, marge = "pont", min(7.0 - abs(p[0]) for p in pts)
            cote = "droite" if max(p[0] for p in pts) > -min(p[0] for p in pts) else "gauche"
        elif s > P.S_P6_ANCRE - 20.0 and s < P.S_JETEE_FIN:
            ns = [(p[0] - V.JETEE_O[0]) * V.JETEE_N[0] + (p[1] - V.JETEE_O[1]) * V.JETEE_N[1] for p in pts]
            zone, marge = "jetée", min(4.0 - abs(n) for n in ns)
            cote = "droite" if -min(ns) > max(ns) else "gauche"
        else:
            continue
        if zone not in pires or marge < pires[zone][0]:
            pires[zone] = (marge, t * FPS, cote)
    for z, (m, g, cote) in pires.items():
        print(f"  {z:7s} : {m:+5.2f} m de la bordure {cote} (image {g:.1f}){'   !!! HORS CHAUSSÉE' if m < 0 else ''}")
    OUT["chaussee"] = {z: dict(marge=m, image=g, cote=c) for z, (m, g, c) in pires.items()}


# ---------------------------------------------------------------- les boîtes
def coins(x, y, cap, w, l):
    c = math.radians(cap)
    fx, fy = -math.sin(c), math.cos(c)
    lx, ly = -fy, fx
    return [(x + a * l * fx + b * w * lx, y + a * l * fy + b * w * ly) for a, b in ((1, 1), (1, -1), (-1, -1), (-1, 1))]


def separation(A_, B_):
    """Axes séparateurs : > 0 disjoints (la distance le long du meilleur axe, un minorant de la distance vraie),
    < 0 la profondeur du chevauchement."""
    best = -1e9
    for poly in (A_, B_):
        n = len(poly)
        for i in range(n):
            (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
            ax, ay = y2 - y1, x1 - x2
            d = math.hypot(ax, ay)
            if d < 1e-9:
                continue
            ax, ay = ax / d, ay / d
            pa = [px * ax + py * ay for px, py in A_]
            pb = [px * ax + py * ay for px, py in B_]
            best = max(best, min(pb) - max(pa), min(pa) - max(pb))
    return best


def distance(A_, B_):
    """La distance vraie entre deux polygones convexes disjoints (0 s'ils se chevauchent)."""
    def pt_seg(p, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        L2 = dx * dx + dy * dy
        u = 0.0 if L2 < 1e-12 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
        return math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy)
    if separation(A_, B_) < 0:
        return separation(A_, B_)
    d = 1e9
    for X, Y in ((A_, B_), (B_, A_)):
        for p in X:
            for i in range(len(Y)):
                d = min(d, pt_seg(p, Y[i], Y[(i + 1) % len(Y)]))
    return d


DEMI = {"hero": (0.90, 2.45), "patrol": (0.975, 2.5), "van": (1.0, 2.7)}
_POURS = T._poursuite()
_VEH = V.vehicules()


def entites(g):
    """[(nom, genre, polygone, (x, y), roule, cap)] à l'image g (décimale) : la berline, les patrouilles du tronçon,
    la vie (circulation « trafic », autres mobiles, fixes), les garées et le barrage des scènes."""
    out = []
    t = g / FPS
    x, y, cap = hero_city(t)
    out.append(("hero", "hero", coins(x, y, cap, *DEMI["hero"]), (x, y), True, cap))
    for (shot, nom), (g0, g1, fn, capf) in _POURS.items():
        if not g0 <= g <= g1:
            continue
        c = capf(g)
        if c is None:
            continue
        px, py = fn(g)
        genre = "van" if nom.startswith("van") else "patrol"
        roule = math.dist(fn(g - 1), fn(g + 1)) > 0.02
        out.append((f"{shot}:{nom}", "patrouille", coins(px, py, c, *DEMI[genre]), (px, py), roule, c))
    for nom, modele, _t, course, _kw in _VEH:
        px, py, c = course.pose(g)
        w, l = V.DEMI.get(modele, V.DEMI_DEFAUT)
        roule = course.vit(g) > 0.3 or course.vit(g + 1) > 0.3
        fixe = isinstance(course, V.Fixe)
        genre = "trafic" if nom.startswith("trafic_") else ("garee" if fixe else "vie")
        out.append((nom, genre, coins(px, py, c, w, l), (px, py), roule, c))
    for nom, (px, py, c, w, l, poly, fen) in T.GAREES_SCENES.items():
        if fen is None or fen[0] <= g <= fen[1]:
            out.append((nom, "garee", poly or coins(px, py, c, w, l), (px, py), False, c))
    return out


def contacts():
    titre(f"2. les contacts (boîtes orientées sans marge, pas de 1/{A.sub} d'image, à moins de 160 m de la berline)")
    pires = {}
    for k in range(0, N_FILM * A.sub):
        g = k / A.sub
        es = entites(g)
        hx, hy = es[0][3]
        es = [e for e in es if math.hypot(e[3][0] - hx, e[3][1] - hy) < 160.0]
        for i, a in enumerate(es):
            for b in es[i + 1:]:
                if not (a[4] or b[4]):
                    continue
                if math.hypot(a[3][0] - b[3][0], a[3][1] - b[3][1]) > 14.0:
                    continue
                d = distance(a[2], b[2])
                key = (a[0], b[0])
                if key not in pires or d < pires[key][0]:
                    pires[key] = (d, g, a[1], b[1])
    res = sorted((d, g, a, b, ga, gb) for (a, b), (d, g, ga, gb) in pires.items())
    OUT["contacts"] = [dict(marge=d, image=g, a=a, b=b, genres=[ga, gb]) for d, g, a, b, ga, gb in res if d < 3.0]

    def classe(ga, gb):
        s = {ga, gb}
        if "hero" in s:
            o = (s - {"hero"}).pop()
            return "berline / " + o
        if "patrouille" in s:
            o = (s - {"patrouille"})
            return "patrouille / " + (o.pop() if o else "patrouille")
        return "vie entre elle"
    groupes = {}
    for r in res:
        groupes.setdefault(classe(r[4], r[5]), []).append(r)
    for nom in sorted(groupes):
        rs = groupes[nom]
        print(f"  -- {nom} : {len(rs)} paires approchées ; au plus juste :")
        for d, g, a, b, _ga, _gb in rs[:6]:
            print(f"     {'!!!' if d < 0 else '   '} {d:+6.2f} m  image {g:6.2f}  {a} / {b}")
    OUT["contacts_classes"] = {nom: [dict(marge=r[0], image=r[1], a=r[2], b=r[3]) for r in rs[:8]]
                               for nom, rs in groupes.items()}


# ---------------------------------------------------------------- la cause des écarts, les voitures passées
def route_sn(x, y, s_guess):
    """(s, n) d'un point de ville sur la route de la berline, cherché autour de s_guess."""
    best = (1e9, 0.0, 0.0)
    lo, hi = s_guess - 90.0, s_guess + 160.0
    for _ in range(3):
        k = 60
        for i in range(k + 1):
            s = lo + (hi - lo) * i / k
            rx, ry, rh, _ = P.ROUTE.at(max(0.0, min(P.S_ARRET, s)))
            cx, cy = TO_CITY(rx, ry)
            d = math.hypot(x - cx, y - cy)
            if d < best[0]:
                best = (d, s, rh)
        w = (hi - lo) / k
        lo, hi = best[1] - w, best[1] + w
    s, rh = best[1], best[2]
    rx, ry, rh, _ = P.ROUTE.at(max(0.0, min(P.S_ARRET, s)))
    cx, cy = TO_CITY(rx, ry)
    c = math.radians(rh - CAP_CITY)
    n = (x - cx) * -math.cos(c) + (y - cy) * -math.sin(c)
    return s, n, rh - CAP_CITY


def passages():
    titre("3. les voitures que la berline passe ou croise (à moins de 9 m de côté), et ce que vaudrait la marge sans écart")
    rows = []
    mob = [(nom, modele, course) for nom, modele, _t, course, _kw in _VEH]
    for nom, modele, course in mob:
        w, l = V.DEMI.get(modele, V.DEMI_DEFAUT)
        prev = None
        for k in range(0, P.TOTAL * 4):
            g = k / 4.0
            t = g / FPS
            hx, hy, hc = hero_city(t)
            px, py, pc = course.pose(g)
            c = math.radians(hc)
            fx, fy = -math.sin(c), math.cos(c)
            lon = (px - hx) * fx + (py - hy) * fy
            lat = (px - hx) * -fy + (py - hy) * fx
            if prev is not None and prev[0] > 0.0 >= lon and abs(lat) < 9.0:
                # l'image du passage : marge vraie autour (± 1,5 s), et marge sans le slalom (berline à n = 0)
                best = (1e9, g)
                sans = (1e9, g)
                for kk in range(int((g - 36) * 4), int((g + 36) * 4)):
                    gg = kk / 4.0
                    if gg < 0:
                        continue
                    tt = gg / FPS
                    x, y, cap = hero_city(tt)
                    qx, qy, qc = course.pose(gg)
                    if math.hypot(qx - x, qy - y) > 16.0:
                        continue
                    box = coins(qx, qy, qc, w, l)
                    d = distance(coins(x, y, cap, *DEMI["hero"]), box)
                    best = min(best, (d, gg))
                    # sans slalom : la berline ramenée sur la route (n = 0), cap de la route
                    s = P.s_of_t(tt)
                    rx, ry, rh, _ = P.ROUTE.at(s)
                    e = ecart_route(tt)
                    if abs(e) > 1e-4:
                        cc = math.radians(rh - CAP_CITY)
                        x0, y0 = x + e * math.cos(cc), y + e * math.sin(cc)
                        d0 = distance(coins(x0, y0, rh - CAP_CITY, *DEMI["hero"]), box)
                    else:
                        d0 = d
                    sans = min(sans, (d0, gg))
                v_h = HERO.speed(t)
                v_o = course.vit(g)
                meme = math.cos(math.radians(pc - hc)) > 0
                s_o, n_o, cap_r = route_sn(px, py, P.s_of_t(t))
                rows.append(dict(nom=nom, image=g, lat=lat, v_hero=v_h, v=v_o, sens="même" if meme else "face",
                                 marge=best[0], image_marge=best[1], marge_sans=sans[0], n_route=n_o,
                                 ecart_hero=ecart_route(t), roule=v_o > 0.3,
                                 genre="trafic" if nom.startswith("trafic_") else "vie"))
            prev = (lon, lat)
    rows.sort(key=lambda r: r["image"])
    print("   image  voiture                    sens   v km/h  (berline)  côté m  n route  écart berline  marge  "
          "marge sans écart")
    for r in rows:
        if not r["roule"] and r["genre"] != "trafic" and abs(r["lat"]) > 4.5:
            continue
        flag = "  <- CAUSE (touchée ou < 0,5 m sans écart)" if r["marge_sans"] < 0.5 and abs(r["ecart_hero"]) > 0.05 else ""
        print(f"  {r['image']:6.1f}  {r['nom']:26s} {r['sens']:5s} {r['v'] * 3.6:6.1f}  {r['v_hero'] * 3.6:8.1f}  "
              f"{r['lat']:+6.2f}  {r['n_route']:+6.2f}  {r['ecart_hero']:+8.2f}     {r['marge']:5.2f}  "
              f"{r['marge_sans']:6.2f}{flag}")
    OUT["passages"] = rows
    # chaque manœuvre : sa cause
    print("  -- la cause de chaque manœuvre : ce que la berline aurait touché ou frôlé (< 0,6 m) sans elle (l'écart "
          "d'avant tenu, jusqu'à 2 s après)")
    causes = []
    for i, m in enumerate(P.SLALOM):
        s0, L = m[0], m[1]
        ga, gb = P.t_of_s(s0) * FPS, P.t_of_s(s0 + L) * FPS
        # la fenêtre : de la manœuvre jusqu'à 2 s après ; la berline SANS cette manœuvre : son écart d'avant tenu
        gc = min(P.TOTAL - 1.0, gb + 48.0)
        hit = {}
        for k in range(int(ga * 4), int(gc * 4) + 1):
            g = k / 4.0
            tt = g / FPS
            s = P.s_of_t(tt)
            e = P.voie(s) - sum(mm[2] * P.bascule((s - mm[0]) / mm[1], *mm[3:4] and (mm[3] == "doux",))
                                for j, mm in enumerate(P.SLALOM) if j != i)
            x, y, cap = hero_city(tt)
            rx, ry, rh, _ = P.ROUTE.at(s)
            cc = math.radians(rh - CAP_CITY)
            x0, y0 = x + e * math.cos(cc), y + e * math.sin(cc)
            b0 = coins(x0, y0, cap, *DEMI["hero"])
            for ent in entites(g)[1:]:
                if math.hypot(ent[3][0] - x, ent[3][1] - y) > 12.0:
                    continue
                d0 = distance(b0, ent[2])
                if d0 < 0.6 and (ent[0] not in hit or d0 < hit[ent[0]][0]):
                    hit[ent[0]] = (d0, g, distance(coins(x, y, cap, *DEMI["hero"]), ent[2]))
        causes.append(dict(n=i, g0=ga, g1=gb, jusqu_a=gc, causes={k: v for k, v in hit.items()}))
        txt = ", ".join(f"{k} (sans elle {v[0]:+.2f} m à l'image {v[1]:.1f}, avec {v[2]:+.2f})" for k, v in hit.items())
        print(f"    manœuvre {i} (images {ga:.0f}→{gb:.0f}, écart {m[2]:+.2f}) : {txt or 'AUCUN OBSTACLE sans elle'}")
    OUT["causes"] = causes


def circulation():
    titre("3 bis. la circulation : sens, voie, vitesse (tant qu'elle roule à moins de 120 m de la berline)")
    rows = []
    for nom, modele, _t, course, kw in _VEH:
        if isinstance(course, V.Fixe):
            continue
        vs, ns, sens, gs = [], [], [], []
        for g in range(0, P.TOTAL):
            v = course.vit(g)
            if abs(v) < 0.3:
                continue
            px, py, pc = course.pose(g)
            hx, hy, hc = hero_city(g / FPS)
            if math.hypot(px - hx, py - hy) > 120.0:
                continue
            s_o, n_o, cap_r = route_sn(px, py, P.s_of_t(g / FPS))
            if abs(n_o) > 12.0:
                continue
            vs.append(v)
            ns.append(n_o)
            sens.append(math.cos(math.radians(pc - cap_r)) * (1 if v > 0 else -1))
            gs.append(g)
        if not vs:
            continue
        # la vitesse vraie (positions) contre les clés
        vmax_pos = max(math.dist(course.pose(g)[:2], course.pose(g + 1)[:2]) * FPS for g in gs)
        acc = max(abs(course.vit(g + 1) - course.vit(g)) * FPS for g in gs)
        lat_v = max(abs(course.ecart(g + 1) - course.ecart(g)) * FPS for g in gs) if hasattr(course, "ecart") else 0.0
        rows.append(dict(nom=nom, g0=gs[0], g1=gs[-1], vmin=min(vs), vmax=max(vs), vmax_pos=vmax_pos, n0=min(ns),
                         n1=max(ns), sens=sum(sens) / len(sens), acc=acc, lat_v=lat_v,
                         phares=bool(kw.get("phares")), warning=kw.get("warning")))
    print("  voiture                     images     km/h (clés)   km/h max mesuré  n route (m)     sens   accél. max  "
          "v latérale  phares  warnings")
    for r in rows:
        sens = "même" if r["sens"] > 0.5 else "face" if r["sens"] < -0.5 else "travers"
        print(f"  {r['nom']:26s} {r['g0']:4d}→{r['g1']:4d}  {r['vmin'] * 3.6:5.1f}→{r['vmax'] * 3.6:5.1f}  "
              f"{r['vmax_pos'] * 3.6:10.1f}       {r['n0']:+6.2f}→{r['n1']:+6.2f}  {sens:7s} {r['acc']:6.2f} m/s²  "
              f"{r['lat_v']:5.2f} m/s  {'oui' if r['phares'] else 'NON':5s}  {r['warning']}")
    OUT["circulation"] = rows


# ---------------------------------------------------------------- l'écran
def ecran():
    titre("4. l'écran (la caméra du film, parcours.chase)")
    veh = _VEH
    u_hero, u_route, cam_rel, n_roule, n_trafic, flanc = [], [], [], [], [], []
    vus = {}
    for g in range(0, P.TOTAL):
        shot, f = T._plan(g)
        cam = P.chase(shot, f)
        inv, rot = T._vers_scene(shot)
        h = P.hero(shot)
        hx, hy = h["pos"](f)
        b = M.hero_screen(cam, hx, hy, P.sol(shot, hx, hy), h["heading"](f))
        u_hero.append(b["u"] if b else None)
        # le point de la route (n = 0) à l'abscisse de la berline, et 15 m devant : où est sa voie dans le cadre
        t = g / FPS
        s = P.s_of_t(t)
        pr = []
        for ds in (0.0, 15.0):
            rx, ry = P.ROUTE.at(min(P.S_ARRET, s + ds))[:2]
            sx, sy = P.placer(shot)[0](rx, ry)
            q = M.screen_point(cam, (sx, sy, P.sol(shot, sx, sy)))
            pr.append(q[0] if q else None)
        u_route.append(pr)
        # le cap de la visée par rapport à la route (lacet de la caméra − direction de la route)
        rh = P.ROUTE.at(s)[2] - P.placer(shot)[1]
        cam_rel.append(((cam[3] - 180.0 - rh + 180.0) % 360.0) - 180.0)
        # la caisse vue par la caméra : son cap moins l'axe de la visée (0 : vue de dos ; ce qu'on voit de son flanc)
        flanc.append(((h["heading"](f) - (180.0 - cam[3]) + 180.0) % 360.0) - 180.0)
        nr = nt = 0
        hcx, hcy, _ = hero_city(t)
        for nom, modele, _t, course, _kw in veh:
            if isinstance(course, V.Fixe):
                continue
            x, y, c = course.pose(g)
            d = math.hypot(x - hcx, y - hcy)
            if d > 120.0:
                continue
            roule = course.vit(g) > 0.3 or course.vit(g + 1) > 0.3
            w, l = V.DEMI.get(modele, V.DEMI_DEFAUT)
            sx, sy = inv(x, y)
            bb = M.hero_screen(cam, sx, sy, P.sol(shot, sx, sy), c - rot, box=(2 * l, 2 * w, 1.5))
            if not bb:
                continue
            # dans le cadre : la boîte coupe le cadre et le centre de la caisse est devant l'objectif
            q = M.screen_point(cam, (sx, sy, P.sol(shot, sx, sy) + 0.7))
            if not q or not (bb["u1"] > 0.0 and bb["u0"] < 1.0 and bb["v1"] > 0.0 and bb["v0"] < 1.0):
                continue
            haut = min(1.0, bb["v1"]) - max(0.0, bb["v0"])
            large = min(1.0, bb["u1"]) - max(0.0, bb["u0"])
            if haut < 0.012:
                continue                              # moins de 15 px de haut sur 1280 : un point
            r = vus.setdefault(nom, dict(nom=nom, images=[], haut=0.0, large=0.0, g_max=g, roule=0, u=[]))
            r["images"].append(g)
            r["u"].append(q[0])
            if haut > r["haut"]:
                r["haut"], r["large"], r["g_max"] = haut, large, g
            if roule:
                r["roule"] += 1
                nr += 1
                nt += nom.startswith("trafic_")
        n_roule.append(nr)
        n_trafic.append(nt)
    OUT["u_hero"] = u_hero
    OUT["u_route"] = u_route
    OUT["cam_rel"] = cam_rel
    OUT["n_roule"] = n_roule
    OUT["n_trafic"] = n_trafic
    print("  -- pendant chaque manœuvre : la berline dans le cadre (u, fraction de la largeur), le point de sa voie "
          "d'origine sous elle, le lacet de la visée par rapport à la route")
    for i, m in enumerate(P.SLALOM):
        ga, gb = int(P.t_of_s(m[0]) * FPS), min(P.TOTAL - 1, int(math.ceil(P.t_of_s(m[0] + m[1]) * FPS)))
        us = [u for u in u_hero[ga:gb + 1] if u is not None]
        ur = [p[0] for p in u_route[ga:gb + 1] if p[0] is not None]
        ur15 = [p[1] for p in u_route[ga:gb + 1] if p[1] is not None]
        cr = cam_rel[ga:gb + 1]
        row = dict(n=i, g0=ga, g1=gb, u_hero=(min(us), max(us)), du_hero=max(us) - min(us),
                   du_route=max(ur) - min(ur) if ur else None, du_route15=max(ur15) - min(ur15) if ur15 else None,
                   cam_rel=(min(cr), max(cr)))
        OUT.setdefault("ecran_manoeuvres", []).append(row)
        print(f"    manœuvre {i} (images {ga}→{gb}, {m[2]:+.2f} m) : berline u {min(us):.3f}→{max(us):.3f} "
              f"(Δ {100 * (max(us) - min(us)):.1f} % de la largeur) ; sa voie sous elle Δ {100 * row['du_route']:.1f} %, "
              f"15 m devant Δ {100 * row['du_route15']:.1f} % ; visée/route {min(cr):+.1f}° à {max(cr):+.1f}° ; "
              f"caisse/visée {min(flanc[ga:gb + 1]):+.1f}° à {max(flanc[ga:gb + 1]):+.1f}°")
    print("  -- les voitures mobiles vues (boîte ≥ 1,2 % de la hauteur) : images à l'écran, taille max, vitesse relative")
    rows = []
    for nom, r in vus.items():
        course = next(c for n_, _m, _t, c, _k in _VEH if n_ == nom)
        g = r["g_max"]
        hc = hero_city(g / FPS)[2]
        pc = course.pose(g)[2]
        v_rel = HERO.speed(g / FPS) - course.vit(g) * math.cos(math.radians(pc - hc))
        r2 = dict(nom=nom, g0=r["images"][0], g1=r["images"][-1], n=len(r["images"]), roule=r["roule"],
                  haut=r["haut"], large=r["large"], g_max=g, v_rel=v_rel, u0=r["u"][0], u1=r["u"][-1])
        rows.append(r2)
    rows.sort(key=lambda r: r["g0"])
    for r in rows:
        print(f"    {r['nom']:26s} images {r['g0']:3d}→{r['g1']:3d} ({r['n']:3d} à l'écran, {r['roule']:3d} en roulant, "
              f"{r['n'] / FPS:4.1f} s)  taille max {100 * r['haut']:4.1f} % de la hauteur × {100 * r['large']:4.1f} % "
              f"(image {r['g_max']})  v rel {r['v_rel'] * 3.6:+6.1f} km/h  u {r['u0']:.2f}→{r['u1']:.2f}")
    OUT["vus"] = rows
    tot = P.TOTAL
    print(f"  -- sur les {tot} images de la poursuite : {sum(n > 0 for n in n_roule)} avec au moins une voiture de la "
          f"vie qui roule dans le cadre ({100 * sum(n > 0 for n in n_roule) / tot:.0f} %), "
          f"{sum(n > 0 for n in n_trafic)} avec au moins une de la circulation « trafic » "
          f"({100 * sum(n > 0 for n in n_trafic) / tot:.0f} %)")
    for nom, _n in P.SHOTS:
        g0, g1 = P.START[nom], P.START[nom] + P.frames(nom)
        a = sum(n > 0 for n in n_roule[g0:g1])
        b = sum(n > 0 for n in n_trafic[g0:g1])
        print(f"     {nom:4s} {g1 - g0:3d} images : {a:3d} avec une mobile ({100 * a / (g1 - g0):3.0f} %), {b:3d} avec "
              f"une « trafic » ({100 * b / (g1 - g0):3.0f} %)")


# ---------------------------------------------------------------- les raccords
def raccords():
    titre("5. le calage et les raccords")
    for nom, ok, det in P.check():
        print(f"  {'ok  ' if ok else 'ÉCHEC'} {nom} : {det}")
    gels = [P.START[b] - 1 for _a, b in zip(P._NOMS, P._NOMS[1:])] + [N_FILM - 1]
    print(f"  tronçons {P.START} ; étoiles {P.ETOILES} ; gels (dernière image de chaque étoile) {gels[1:]}")
    OUT["calage"] = dict(start=P.START, etoiles=P.ETOILES, total=N_FILM, check=[(n, bool(o), d) for n, o, d in P.check()])
    # image par image, dans la ville : la berline (position, cap), la caméra (position, lacet, site, focale)
    import ville as VL
    poses = []
    for g in range(N_FILM):
        shot, f = VL.shot_of(g + 1)
        to_v, rot = P.vers_ville(shot)
        h = P.hero(shot)
        x, y = to_v(*h["pos"](f))
        if shot == "FIN6":
            import fin6_orbite as F6
            cam = F6.camera((f - 1) / FPS) if hasattr(F6, "camera") else P.chase(shot, f)
        else:
            cam = P.chase(shot, f)
        cx, cy = to_v(cam[0], cam[1])
        poses.append((x, y, h["heading"](f) + rot, cx, cy, cam[2], cam[3] - rot, cam[4], cam[6], h["speed"](f),
                      h["slip"](f)))
    OUT["poses"] = poses

    def d2(k, j):
        a, b, c = poses[k - 1][j], poses[k][j], poses[k + 1][j]
        if j in (2, 6):
            b = a + ((b - a + 180.0) % 360.0 - 180.0)
            c = b + ((c - b + 180.0) % 360.0 - 180.0)
        return c - 2 * b + a
    print("  aux frontières (images g−1 | g) : le saut d'accélération (différence seconde) contre le pire des 12 "
          "images voisines de chaque côté")
    print("   frontière      berline m/img²  (voisines)   cap °/img²  (voisines)   caméra m/img²  (voisines)   "
          "lacet caméra °/img²  (voisines)")
    out = []
    for nom in list(P._NOMS[1:]):
        g = P.START[nom]
        row = dict(nom=nom, g=g)
        txt = f"   {g - 1:3d}|{g:3d} {nom:4s}"
        for lab, js in (("berline", (0, 1)), ("cap", (2,)), ("camera", (3, 4, 5)), ("lacet", (6,))):
            def mag(k):
                return math.sqrt(sum(d2(k, j) ** 2 for j in js))
            ici = max(mag(g - 1), mag(g))
            vois = max(mag(k) for k in list(range(g - 14, g - 2)) + list(range(g + 2, g + 14)) if 1 <= k < N_FILM - 1)
            row[lab] = (ici, vois)
            txt += f"   {ici:9.4f} ({vois:7.4f}){' !' if ici > 2.0 * vois + 1e-3 else '  '}"
        out.append(row)
        print(txt)
    OUT["raccords"] = out
    # les deux dérapages : la glisse et la vitesse aux étoiles 2 et 5
    for k in (2, 5):
        g = P.ETOILES[k]
        sl = [abs(poses[j][10]) for j in range(g - 30, g + 40)]
        print(f"  étoile {k} (image {g}) : glisse {poses[g][10]:+.1f}°, crête {max(sl):.1f}° ; écart du slalom à "
              f"cette image {OUT['voie'][g]:+.3f} m")


manoeuvres()
chaussee()
for nom_, fn_ in (("contacts", contacts), ("passages", passages), ("circulation", circulation), ("ecran", ecran),
                  ("raccords", raccords)):
    if not A.sans or nom_ not in A.sans.split(","):
        fn_()
if A.out:
    os.makedirs(A.out, exist_ok=True)
    # les trajectoires pour la planche de dessus
    traj = {"hero": [hero_city(g / FPS)[:2] for g in range(N_FILM)],
            "route": [TO_CITY(*P.ROUTE.at(s)[:2]) for s in [k * 1.0 for k in range(int(P.S_ARRET) + 1)]]}
    for nom, modele, _t, course, _kw in _VEH:
        if isinstance(course, V.Fixe):
            x, y, c = course.pose(0)
            w, l = V.DEMI.get(modele, V.DEMI_DEFAUT)
            traj.setdefault("fixes", []).append((nom, coins(x, y, c, w, l)))
        else:
            w, l = V.DEMI.get(modele, V.DEMI_DEFAUT)
            traj.setdefault("mobiles", {})[nom] = dict(
                demi=(w, l), poses=[course.pose(g) for g in range(N_FILM)],
                vit=[course.vit(g) for g in range(N_FILM)])
    for (shot, nom), (g0, g1, fn, capf) in _POURS.items():
        traj.setdefault("patrouilles", {})[f"{shot}:{nom}"] = dict(g0=g0, g1=g1, pts=[fn(g) for g in range(g0, g1 + 1)],
                                                                    caps=[capf(g) for g in range(g0, g1 + 1)])
    traj["garees_scenes"] = [(nom, v[5] or coins(v[0], v[1], v[2], v[3], v[4])) for nom, v in T.GAREES_SCENES.items()]
    OUT["traj"] = traj
    OUT["slalom"] = [list(m) for m in P.SLALOM]
    with open(os.path.join(A.out, "audit.json"), "w", encoding="utf-8") as fh:
        json.dump(OUT, fh, ensure_ascii=False)
    print(f"\nécrit {os.path.join(A.out, 'audit.json')}")
