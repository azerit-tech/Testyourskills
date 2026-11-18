# Chaque coup de volant a-t-il une cause que le spectateur voit ? (SPEC §18.74.) Sans Blender.
#
# Jacques, le 18 novembre, sur le brouillon éclairé v10 : « je trouve les coups de volant pas super pertinents, genre
# la personne donne des coups brusques mais y a plein de place devant, ou même parfois rien à éviter il me semble ».
# Une cause qu'on ne voit pas n'existe pas : ce module mesure, pour chaque manœuvre de parcours.SLALOM_SIMULE, au
# moment où le volant part,
#   - ce que la berline toucherait SANS cette manœuvre (elle garde sa ligne : la route plus le slalom moins cette
#     manœuvre, cinématique) : qui, dans combien de temps ; rien : la manœuvre n'évite rien ;
#   - la place libre devant elle dans son couloir (le premier véhicule, pare-chocs à pare-chocs, et ce que cela fait
#     en secondes à la vitesse de rapprochement) ;
#   - ce que la caméra du film montre de cet obstacle : dans le cadre, caché ou non par la berline, sa hauteur en % du
#     cadre, et depuis combien d'images il est lisible (la moitié au moins visible, hors de la silhouette de la
#     berline, 3 % de la hauteur au moins) quand le volant part ;
#   - ce qu'il fait (il roule, il freine, il est arrêté, il vient en face) ;
#   - la marge au passage (boîtes orientées, au quart d'image, la berline simulée) ; la glisse et la latérale.
# Et l'activité du volant sur route libre : hors manœuvres, hors dérapages, hors chocs, la vitesse en travers de la
# route (m/s) et la vitesse du volant (°/s aux roues) de la berline simulée.
#
#   python3 tools/film3d/diag/audit_esquives.py [--json F] [--calme]
import argparse
import json
import math
import os
import sys

ap = argparse.ArgumentParser()
ap.add_argument("--json", default=None)
ap.add_argument("--calme", action="store_true", help="l'activité du volant sur route libre seulement")
A = ap.parse_args() if __name__ == "__main__" else ap.parse_args([])
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
import audit_cadre as AC  # noqa: E402
import contacts as CT  # noqa: E402
import parcours as P  # noqa: E402
import trafic as T  # noqa: E402
import vie as V  # noqa: E402

FPS = P.FPS
HW, HL = T.DIMS["hero"]
COULOIR = 0.3                 # m : de chaque côté de la caisse, ce qui compte comme « devant elle »
LISIBLE = (0.5, 0.03)         # part visible hors de la berline, hauteur (part du cadre)
AVANT, APRES = 48, 36         # images regardées avant le départ du volant, après la fin de la manœuvre
HORS = ("hero", "patrol", "van")   # ni cause ni obstacle : les patrouilles et la meute suivent la berline du film
OUT = {}
_POURS = T._poursuite()
_VEH = V.vehicules()


def manoeuvres():
    """[(k, s0, s1, écart, image de départ, image de fin)] de parcours.SLALOM_SIMULE."""
    return [(k, m[0], m[0] + m[1], m[2], P.t_of_s(m[0]) * FPS, P.t_of_s(m[0] + m[1]) * FPS)
            for k, m in enumerate(P.SLALOM_SIMULE)]


def _voie_sans(k):
    def f(s):
        m = P.SLALOM_SIMULE[k]
        # (toute la ligne de la conduite, changement de voie de la route compris, moins la manœuvre k)
        return P.voie(s) - m[2] * P.bascule((s - m[0]) / m[1], len(m) > 3 and m[3] == "doux")
    return f


def hero_sans(k, g):
    """(x, y, cap) en ville de la berline qui ne ferait pas la manœuvre k, à l'image g : la route plus le reste du
    slalom, à l'abscisse de la berline du film (cinématique : ni retard de suivi, ni choc)."""
    s = P.s_of_t(g / FPS)
    v = _voie_sans(k)
    (x0, y0), (x1, y1) = T.point(s - 0.5, v(s - 0.5)), T.point(s + 0.5, v(s + 0.5))
    x, y = T.point(s, v(s))
    return x, y, math.degrees(math.atan2(-(x1 - x0), y1 - y0))


def _poly(b):
    return b[8] if b[8] else T._coins(b[2], b[3], b[4] or 0.0, b[5], b[6])


def _dans_repere(x, y, cap, pts):
    """Les points dans le repère d'une caisse : (devant, à gauche)."""
    c = math.radians(cap)
    fx, fy = -math.sin(c), math.cos(c)
    return [((px - x) * fx + (py - y) * fy, (px - x) * -fy + (py - y) * fx) for px, py in pts]


def _vit(nom, g):
    """La vitesse (m/s, le long de son cap) d'un véhicule de boites à l'image g ; None si on ne sait pas."""
    def pose(q):
        for b in T.boites(q, _POURS, _VEH):
            if b[0] == nom:
                return b
        return None
    a, b = pose(g - 0.5), pose(g + 0.5)
    if not a or not b:
        return None
    return math.hypot(b[2] - a[2], b[3] - a[3]) * FPS, a, b


def ce_qu_il_fait(nom, g, hero_cap):
    """En un mot : arrêté, roule (km/h), freine, accélère, en face, recule, déboîte."""
    r0, r1 = _vit(nom, g - 6), _vit(nom, g + 6)
    if not r0 or not r1:
        return "?"
    v0, v1, b = r0[0], r1[0], r1[2]
    if max(v0, v1) < 0.3:
        return "arrêté"
    mots = []
    cap = b[4] if b[4] is not None else hero_cap
    d = abs((cap - hero_cap + 180.0) % 360.0 - 180.0)
    mots.append("en face" if d > 120.0 else "en travers" if d > 45.0 else "même sens")
    acc = (v1 - v0) / 0.5
    mots.append(f"{0.5 * (v0 + v1) * 3.6:.0f} km/h")
    if acc < -1.0:
        mots.append(f"freine {-acc:.1f} m/s²")
    elif acc > 1.0:
        mots.append(f"accélère {acc:.1f} m/s²")
    return ", ".join(mots)


def cause(k, g0, g1):
    """Ce que la berline toucherait sans la manœuvre k : (image du contact, nom) ou None, et les frôlements
    [(écart, image, nom)] sous 0,6 m."""
    touche, pres = None, {}
    for q in range(int(g0 * 4), int((g1 + APRES) * 4) + 1):
        g = q / 4.0
        if g >= P.TOTAL + P.FIN6_FRAMES - 2:
            break
        x, y, cap = hero_sans(k, g)
        H = T._coins(x, y, cap, HW, HL)
        for b in T.boites(g, _POURS, _VEH):
            if b[1] in HORS or math.hypot(b[2] - x, b[3] - y) > 12.0:
                continue
            d = T.separation(H, _poly(b))
            if d < 0.0 and touche is None:
                touche = (g, b[0])
            if d < 0.6 and d < pres.get(b[0], (9.0, 0))[0]:
                pres[b[0]] = (d, g)
        if touche:
            break
    return touche, sorted((d, g, n) for n, (d, g) in pres.items())


def devant(k, g):
    """Le premier véhicule dans le couloir de la berline (sans la manœuvre k) à l'image g : (pare-chocs à pare-chocs
    en m, nom, vitesse de rapprochement en m/s) ou None dans les 120 m."""
    x, y, cap = hero_sans(k, g)
    best = None
    for b in T.boites(g, _POURS, _VEH):
        if b[1] in HORS:
            continue
        pts = _dans_repere(x, y, cap, _poly(b))
        lon = min(p[0] for p in pts)
        if lon < HL or lon > 120.0 + HL:
            continue
        if min(p[1] for p in pts) > HW + COULOIR or max(p[1] for p in pts) < -HW - COULOIR:
            continue
        if best is None or lon - HL < best[0]:
            best = (lon - HL, b[0])
    if best is None:
        return None
    x2, y2, cap2 = hero_sans(k, g + 1)
    b2 = next((b for b in T.boites(g + 1, _POURS, _VEH) if b[0] == best[1]), None)
    if b2 is None:
        return best + (0.0,)
    lon2 = min(p[0] for p in _dans_repere(x2, y2, cap2, _poly(b2))) - HL
    return best + ((best[0] - lon2) * FPS,)


def a_l_ecran(nom, g):
    """(hauteur en part du cadre, part dans le cadre, part cachée par la berline, lisible) de l'obstacle à l'image
    entière g, par la caméra du film ; None hors champ ou absent."""
    b = next((b for b in T.boites(g, _POURS, _VEH) if b[0] == nom), None)
    if b is None or g < 0 or g >= P.TOTAL + P.FIN6_FRAMES:
        return None
    sh, f = T._plan(g)
    cam = P.chase(sh, f)
    if AC.profondeur(cam, sh, b[2], b[3]) <= 0.5:
        return None
    haut = AC.HAUTEUR.get(next((v[1] for v in _VEH if v[0] == nom), ""), AC.H_BOITE)
    r = AC.rect(cam, sh, b[2], b[3], b[4] or 0.0, (2 * b[6], 2 * b[5], haut))
    if not r or AC.aire(r) <= 0:
        return None
    dans = AC.aire(AC.coupe(r))
    hr, (hx, hy), _ = AC.hero_rect(cam, sh, f)
    inv, _rot = T._vers_scene(sh)
    sx, sy = inv(b[2], b[3])
    derriere = math.hypot(sx - cam[0], sy - cam[1]) > math.hypot(hx - cam[0], hy - cam[1])
    cache = AC.aire(AC.coupe(AC.coupe(r), hr)) if derriere else 0.0
    h = min(1.0, r[3]) - max(0.0, r[2])
    vis = (dans - cache) / AC.aire(r)
    return h, dans / AC.aire(r), cache / dans if dans > 0 else 0.0, vis >= LISIBLE[0] and h >= LISIBLE[1]


def marge(nom, g0, g1):
    """La marge au plus juste (m, image) entre la berline simulée et l'obstacle, au quart d'image."""
    best = (99.0, None)
    for q in range(int(g0 * 4), int((g1 + APRES) * 4) + 1):
        g = q / 4.0
        bs = T.boites(g, _POURS, _VEH)
        h = bs[0]
        b = next((b for b in bs if b[0] == nom), None)
        if b is None:
            continue
        d = T.separation(T._coins(h[2], h[3], h[4], HW, HL), _poly(b))
        if d < best[0]:
            best = (d, g)
    return best


def bilan():
    rows = []
    for k, s0, s1, e, g0, g1 in manoeuvres():
        t0, t1 = g0 / FPS, g1 / FPS
        v = P.DRIVE.speed(t0)
        touche, pres = cause(k, g0, g1)
        dv = devant(k, g0)
        row = dict(k=k + 1, s=(s0, s1), ecart=e, images=(g0, g1), duree=t1 - t0, v_kmh=v * 3.6,
                   demande=2 * math.pi * abs(e) * v * v / (s1 - s0) ** 2,
                   glisse=max(abs(P.DRIVE.rear_slip(t0 + q / 96.0)) for q in range(int((t1 - t0 + 0.5) * 96))),
                   lat=max(abs(P.DRIVE.alat(t0 + q / 96.0)) for q in range(int((t1 - t0 + 0.5) * 96))))
        row["devant"] = dict(m=dv[0], nom=dv[1], rapprochement=dv[2],
                             s=dv[0] / dv[2] if dv[2] > 0.5 else None) if dv else None
        nom = touche[1] if touche else (pres[0][2] if pres else None)
        row["cause"] = dict(nom=nom, touche=touche is not None, image=touche[0] if touche else (pres[0][1] if pres else None),
                            ecart=None if touche or not pres else pres[0][0]) if nom else None
        row["frolements"] = [(round(d, 2), g, n) for d, g, n in pres[:4]]
        # un choc de patrouille au départ de l'écart : c'est lui la cause (la berline est jetée de côté, ou y revient)
        row["choc"] = next((c["nom"] for c in CT.CHOCS if -6.0 <= c["image"] - g0 <= 6.0), None)
        if nom:
            gi = int(round(g0))
            vu = a_l_ecran(nom, gi)
            n = 0
            while n < AVANT and (a_l_ecran(nom, gi - n) or (0, 0, 0, False))[3]:
                n += 1
            # à l'image, quelle que soit sa taille (ses phares) : la moitié au moins dans le cadre et hors de la
            # berline ; et sa hauteur une seconde avant
            nv = 0
            while nv < AVANT:
                a = a_l_ecran(nom, gi - nv)
                if not a or a[1] * (1.0 - a[2]) < LISIBLE[0]:
                    break
                nv += 1
            avant = a_l_ecran(nom, gi - 24)
            hero_cap = hero_sans(k, g0)[2]
            row["ecran"] = dict(hauteur=vu[0] if vu else 0.0, dans=vu[1] if vu else 0.0, cache=vu[2] if vu else 0.0,
                                lisible_depuis=n, vu_depuis=nv, hauteur_1s=avant[0] if avant else 0.0,
                                fait=ce_qu_il_fait(nom, g0, hero_cap))
            m = marge(nom, g0, g1)
            row["passage"] = dict(marge=m[0], image=m[1])
        rows.append(row)
    OUT["manoeuvres"] = rows
    print("======== chaque manœuvre du slalom, au départ du volant")
    for r in rows:
        print(f"\n  n° {r['k']} : s {r['s'][0]:.1f} → {r['s'][1]:.1f}, écart {r['ecart']:+.1f} m, images {r['images'][0]:.0f} → "
              f"{r['images'][1]:.0f} ({r['duree']:.2f} s), {r['v_kmh']:.0f} km/h ; demande {r['demande']:.1f} m/s², "
              f"latérale {r['lat']:.1f} m/s², dérive arrière {r['glisse']:.1f}°")
        d = r["devant"]
        print("     devant, dans son couloir : " + ("rien à moins de 120 m" if not d else
              f"{d['nom']} à {d['m']:.1f} m, rapprochement {d['rapprochement'] * 3.6:.0f} km/h"
              + (f", soit {d['s']:.1f} s" if d["s"] else ", elle ne s'en rapproche pas")))
        c = r["cause"]
        if r["choc"]:
            ch = next(x for x in CT.CHOCS if x["nom"] == r["choc"])
            print(f"     cause : le choc de la patrouille ({ch['nom']}, image {ch['image']:g}), "
                  f"{(r['images'][0] - ch['image']) / FPS:+.2f} s avant le départ de l'écart")
            if not c:
                continue
        if not c:
            print("     sans la manœuvre : RIEN À ÉVITER (aucun véhicule à moins de 0,6 m de sa ligne)")
            continue
        if c["touche"]:
            print(f"     sans la manœuvre : elle touche {c['nom']} à l'image {c['image']:.1f}, "
                  f"{(c['image'] - r['images'][0]) / FPS:.2f} s après le départ du volant")
        else:
            print(f"     sans la manœuvre : elle ne touche rien ; au plus près {c['nom']} à {c['ecart']:.2f} m "
                  f"(image {c['image']:.1f})")
        e = r["ecran"]
        print(f"     à l'écran au départ du volant : {c['nom']} ({e['fait']}), hauteur {100 * e['hauteur']:.1f} % du cadre, "
              f"{100 * e['dans']:.0f} % dans le cadre, {100 * e['cache']:.0f} % caché par la berline ; lisible (3 % du cadre) "
              f"depuis {e['lisible_depuis']} images ({e['lisible_depuis'] / FPS:.1f} s), à l'image depuis "
              f"{e['vu_depuis']} ({e['vu_depuis'] / FPS:.1f} s ; {100 * e['hauteur_1s']:.1f} % une seconde avant)")
        print(f"     au passage : {r['passage']['marge']:.2f} m (image {r['passage']['image']})")


# ---------------------------------------------------------------- le volant sur route libre

def fenetres():
    """[(image a, image b, nom)] où le volant a une raison de bouger : manœuvres, dérapages, chocs, arrivée."""
    out = []
    for k, _s0, _s1, _e, g0, g1 in manoeuvres():
        out.append((g0 - 2, g1 + 10, f"manœuvre {k + 1}"))
    for a, b in P.VOIE_NULLE:
        # le dérapage : la fenêtre du slalom nul, élargie tant que la berline glisse (2°) ou n'est pas revenue sur
        # sa ligne (0,2 m)
        def pris(g):
            t = g / FPS
            return abs(P.DRIVE.slip(t)) > 2.0 or abs(P.DRIVE.voie_err(t)) > 0.2
        while a > 0 and pris(a - 1):
            a -= 1
        while b < P.TOTAL and pris(b + 1):
            b += 1
        out.append((a, b, "dérapage"))
    # les virages eux-mêmes (le volant y tourne pour la route) : la courbure de la route à une demi-seconde près,
    # hors du changement de voie du pont (1/845 m : la ligne de la berline y est droite)
    def tourne(g):
        return any(abs(P.ROUTE.at(P.s_of_t((g + d) / FPS))[3]) > 0.005 for d in (-12, -6, 0, 6, 12))
    g = 0
    while g < P.TOTAL:
        if tourne(g):
            a = g
            while g < P.TOTAL and tourne(g):
                g += 1
            out.append((a, g, "virage"))
        g += 1
    # l'entrée d'un dérapage : le coup de volant qui le lance, 30 m avant son abscisse
    for ev in (P.DERAP2, P.DERAP5):
        out.append((P.t_of_s(ev["s"] - 30.0) * FPS, P.t_of_s(ev["s"]) * FPS, "entrée de dérapage"))
    for c in CT.CHOCS:
        g = CT.instant(c) * FPS
        out.append((g - 3, g + CT.REJOINT[1] * FPS, "choc"))
    out.append((P.TOTAL - 12, 9999, "arrivée"))
    return out


def calme():
    fen = fenetres()

    def libre(g):
        return not any(a <= g <= b for a, b, _ in fen)
    h = 1.0 / 96.0
    rows, a = [], None
    for g in range(0, P.TOTAL):
        if libre(g) and a is None:
            a = g
        elif not libre(g) and a is not None:
            rows.append((a, g - 1))
            a = None
    if a is not None:
        rows.append((a, P.TOTAL - 1))
    res = []
    for a, b in rows:
        if b - a < 4:
            continue
        ts = [a / FPS + i * h for i in range(int((b - a) / FPS / h) + 1)]
        # la vitesse en travers de la route : la dérivée de l'écart à la route
        vl = [(P.DRIVE.lat_err(t + h) - P.DRIVE.lat_err(t - h)) / (2 * h) for t in ts]
        vs = [(P.DRIVE.steer(t + h) - P.DRIVE.steer(t - h)) / (2 * h) for t in ts]
        st = [P.DRIVE.steer(t) for t in ts]
        # ce qui se voit : le déplacement de côté par rapport à sa ligne (la route décalée de sa voie) et le lacet
        # de la caisse par rapport à cette ligne, en amplitude sur la fenêtre
        ve = [P.DRIVE.voie_err(t) for t in ts]

        def lacet(t):
            sa = P.DRIVE.s(t)
            pente = math.degrees(math.atan((P.voie(sa + 0.25) - P.voie(sa - 0.25)) / 0.5))
            return (P.DRIVE.heading(t) - P.ROUTE.at(sa)[2] - pente + 180.0) % 360.0 - 180.0
        lc = [lacet(t) for t in ts]
        res.append(dict(images=(a, b), travers_max=max(abs(x) for x in vl),
                        travers_rms=math.sqrt(sum(x * x for x in vl) / len(vl)),
                        volant_max=max(abs(x) for x in vs), volant_rms=math.sqrt(sum(x * x for x in vs) / len(vs)),
                        braquage=(min(st), max(st)), cote=max(ve) - min(ve), lacet=max(lc) - min(lc),
                        ecart=(min(P.DRIVE.lat_err(t) for t in ts), max(P.DRIVE.lat_err(t) for t in ts))))
    OUT["calme"] = res
    n = sum(r["images"][1] - r["images"][0] + 1 for r in res)
    print(f"\n======== le volant sur route libre (hors manœuvres, dérapages, chocs, arrivée) : {n} images sur {P.TOTAL}")
    print("     images        en travers de la route (m/s)   volant aux roues (°/s)    braquage (°)     écart à la route (m)")
    for r in res:
        print(f"     {r['images'][0]:3d} → {r['images'][1]:3d}     max {r['travers_max']:.2f}  rms {r['travers_rms']:.2f}"
              f"            max {r['volant_max']:5.1f}  rms {r['volant_rms']:5.1f}     {r['braquage'][0]:+.1f} à {r['braquage'][1]:+.1f}"
              f"     {r['ecart'][0]:+.2f} à {r['ecart'][1]:+.2f}   | de côté {r['cote']:.2f} m, lacet {r['lacet']:.1f}°"
              + ("  VISIBLE" if r["cote"] > 0.15 or r["lacet"] > 1.0 else ""))
    if res:
        tot = sum((r["images"][1] - r["images"][0] + 1) for r in res)
        OUT["calme_bilan"] = dict(
            images=tot, travers_max=max(r["travers_max"] for r in res), volant_max=max(r["volant_max"] for r in res),
            travers_rms=math.sqrt(sum(r["travers_rms"] ** 2 * (r["images"][1] - r["images"][0] + 1) for r in res) / tot),
            volant_rms=math.sqrt(sum(r["volant_rms"] ** 2 * (r["images"][1] - r["images"][0] + 1) for r in res) / tot))
        b = OUT["calme_bilan"]
        print(f"     ensemble : en travers max {b['travers_max']:.2f} m/s, rms {b['travers_rms']:.2f} ; volant max "
              f"{b['volant_max']:.1f} °/s, rms {b['volant_rms']:.1f}")
    # et le mouvement en travers de la route sur tout le film, par manœuvre comptée ou non
    tout = [abs((P.DRIVE.lat_err(g / FPS + h) - P.DRIVE.lat_err(g / FPS - h)) / (2 * h)) for g in range(P.TOTAL)]
    hors = sum(1 for g in range(P.TOTAL) if tout[g] > 0.3 and libre(g))
    OUT["travers_hors"] = hors
    print(f"     images où la berline va à plus de 0,3 m/s en travers de la route sans raison déclarée : {hors}")


if __name__ == "__main__":
    if not A.calme:
        bilan()
    calme()
    if A.json:
        json.dump(OUT, open(A.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("écrit", A.json)
