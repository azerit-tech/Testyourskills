# La conduite simulée (branche film/physique, dynamique.simulate) suit-elle le slalom (parcours.voie) ? Sans Blender.
#
#   python3 tools/film3d/diag/audit_trafic_sim.py --physique DIR [--slalom parcours.py] [--echelle 1.0]
#
# --physique : le dossier tools/film3d de la branche film/physique (git archive origin/film/physique tools/film3d) ;
# --slalom : le parcours.py dont on lit SLALOM, bascule et voie (défaut : celui de ce dépôt) ; --echelle : les écarts
# multipliés (1,5 : l'essai de déports plus larges). La route de la physique reçoit la courbure du slalom (κ + voie″,
# petits angles) ; le conducteur simulé la suit à l'horaire du film, dérapages compris. Mesuré par manœuvre : l'écart
# de suivi, la glisse, la dérive des pneus (saturation : dérive de crête 9°), la latérale, le roulis, le volant ; et
# ce que le slalom change à l'horaire (retard aux étoiles) et aux deux dérapages.
import argparse
import ast
import math
import os
import sys

ap = argparse.ArgumentParser()
ap.add_argument("--physique", required=True)
ap.add_argument("--slalom", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "parcours.py"))
ap.add_argument("--echelle", type=float, default=1.0)
ap.add_argument("--jeu", default=None, help="un SLALOM de remplacement : '(s0,L,dn[,doux]);...'")
A = ap.parse_args()
sys.path.insert(0, os.path.abspath(A.physique))
import dynamique as D  # noqa: E402
import motion as M  # noqa: E402
import parcours as PP  # noqa: E402  (la physique : ROUTE, PLAN, DERAPAGES, DRIVE simulée sans slalom)

# le slalom de la branche auditée : bascule, SLALOM, voie, lus dans son parcours.py (sans l'importer : son motion.py
# n'est pas celui de la physique)
src = ast.parse(open(A.slalom, encoding="utf-8").read())
ns = {"math": math}
for node in src.body:
    nom = getattr(node, "name", None) or (node.targets[0].id if isinstance(node, ast.Assign) and
                                          isinstance(node.targets[0], ast.Name) else None)
    if nom in ("bascule", "SLALOM", "voie"):
        exec(compile(ast.Module([node], []), A.slalom, "exec"), ns)
if A.jeu:
    ns["SLALOM"] = tuple(tuple(float(x) if x.strip() != "doux" else "doux" for x in m.strip("() ").split(","))
                         for m in A.jeu.split(";"))
SLALOM = tuple((m[0], m[1], m[2] * A.echelle) + tuple(m[3:]) for m in ns["SLALOM"])
ns["SLALOM"] = SLALOM
voie = ns["voie"]

R0 = PP.ROUTE
ds = R0.ds
kap = list(R0.k)
for i in range(len(kap)):
    s = i * ds
    n2 = (voie(s + ds) - 2.0 * voie(s) + voie(s - ds)) / (ds * ds)
    n1 = (voie(s + ds) - voie(s - ds)) / (2 * ds)
    kap[i] += n2 / (1.0 + n1 * n1) ** 1.5
R1 = M.Route(*R0.at(0.0)[:3], kap, ds)
# la route du slalom contre la route décalée (ce que la conduite dessinée roule) : l'écart de la construction
worst = (0.0, 0.0)
for i in range(0, len(kap), 20):
    s = i * ds
    x0, y0, h0, _ = R0.at(s)
    c = math.radians(h0)
    n = voie(s)
    xo, yo = x0 - n * math.cos(c), y0 - n * math.sin(c)
    # le point de R1 le plus proche (même abscisse à peu près : R1 est un peu plus longue)
    d = min(math.hypot(R1.at(s + e)[0] - xo, R1.at(s + e)[1] - yo) for e in (-0.4, -0.3, -0.2, -0.1, 0.0, 0.1, 0.2, 0.3, 0.4))
    worst = max(worst, (d, s))
print(f"route du slalom (κ + voie″) contre route décalée de voie(s) : {worst[0]:.3f} m au pire (s {worst[1]:.0f}) ; "
      f"bout de route décalé de {math.dist(R0.at(PP.S_ARRET)[:2], R1.at(PP.S_ARRET)[:2]):.3f} m")

plan = D.Plan(R1, PP._s_plan, PP.PLAN.speed, PP.PLAN.along, PP.S_ARRET)
dr = D.simulate(plan, PP.DERAPAGES, t_span=PP.T_SPAN)
base = PP.DRIVE
FPS = 24.0
A_PIC = math.degrees(D.peak_alpha()) if D.peak_alpha() < 1.0 else D.peak_alpha()


def col(d, k, t):
    return d._at(k, t)


print(f"dérive de crête des pneus : {A_PIC:.1f}° ; arrêt simulé {dr.t_stop:.2f} s (sans slalom {base.t_stop:.2f} s)")
print("manœuvre            images      écart suivi  glisse   dérive av/ar   latérale  roulis  volant  lacet    "
      "retard horaire   (sans slalom : glisse, dérive ar, écart, latérale)")
for i, m in enumerate(SLALOM):
    s0, L, dn = m[0], m[1], m[2]
    # les instants où la berline simulée passe s0 et s0 + L (plus 0,6 s : la fin du rattrapage)
    ts = [k / 240.0 for k in range(0, int(31 * 240))]
    ta = next(t for t in ts if dr.s(t) >= s0)
    tb = next(t for t in ts if dr.s(t) >= s0 + L) + 0.6
    # hors des deux dérapages (images 120 à 205, 428 à 492 : le slalom y est nul, la glisse est celle du geste)
    w = [t for t in ts if ta <= t <= tb and not (120 <= t * FPS <= 205 or 428 <= t * FPS <= 492)]
    e = max(abs(dr.lat_err(t)) for t in w)
    sl = max(abs(dr.slip(t)) for t in w)
    af = max(abs(col(dr, "alpha_f", t)) for t in w)
    ar = max(abs(col(dr, "alpha_r", t)) for t in w)
    al = max(abs(dr.alat(t)) for t in w)
    ro = max(abs(dr.roll(t)) for t in w)
    st = max(abs(dr.steer(t)) for t in w)
    yr = max(abs(dr.yaw_rate(t)) for t in w)
    late = max(abs(dr.s(t) - PP._s_plan(t)) for t in w)
    sl0 = max(abs(base.slip(t)) for t in w)
    ar0 = max(abs(col(base, "alpha_r", t)) for t in w)
    e0 = max(abs(base.lat_err(t)) for t in w)
    al0 = max(abs(base.alat(t)) for t in w)
    print(f"  {i} {dn:+5.2f} m sur {L:4.0f} m  {ta * FPS:5.1f}→{tb * FPS:5.1f}   {e:5.2f} m    {sl:5.1f}°   "
          f"{af:4.1f}° / {ar:4.1f}°   {al:5.2f}     {ro:4.1f}°   {st:4.1f}°  {yr:4.0f}°/s   {late:5.2f} m          "
          f"({sl0:.1f}°, {ar0:.1f}°, écart {e0:.2f} m, latérale {al0:.2f}){'   SATURÉ' if max(af, ar) > A_PIC else ''}")
print("les deux dérapages (crête de glisse, image) et l'horaire aux étoiles, avec / sans slalom :")
for g0, g1 in ((120, 205), (428, 492)):
    a = max((abs(dr.slip(g / FPS)), g) for g in range(g0, g1))
    b = max((abs(base.slip(g / FPS)), g) for g in range(g0, g1))
    ea = max(abs(dr.lat_err(g / FPS)) for g in range(g0, g1))
    eb = max(abs(base.lat_err(g / FPS)) for g in range(g0, g1))
    print(f"  images {g0}-{g1} : glisse {a[0]:.1f}° (image {a[1]}) / {b[0]:.1f}° (image {b[1]}) ; écart à la route "
          f"{ea:.2f} m / {eb:.2f} m")
for k, g in sorted(PP.ETOILES.items()):
    t = g / FPS
    print(f"  étoile {k} image {g} : retard sur l'horaire {dr.s(t) - PP._s_plan(t):+.2f} m / {base.s(t) - PP._s_plan(t):+.2f} m ; "
          f"v {dr.speed(t) * 3.6:.1f} / {base.speed(t) * 3.6:.1f} km/h")
print("aux frontières des tronçons (image, retard horaire avec / sans) : " + ", ".join(
    f"{n} {g} : {dr.s(g / FPS) - PP._s_plan(g / FPS):+.2f} / {base.s(g / FPS) - PP._s_plan(g / FPS):+.2f}"
    for n, g in PP.START.items()))
