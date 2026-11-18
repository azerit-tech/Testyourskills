"""Le changement de voie rapide, hors dérapage : la berline simulée suit-elle une route qui se décale de 3 à 3,5 m en
1 à 1,5 s à 90 km/h (le slalom entre les voitures de la branche film/trafic) ? python3 lab/dynamique/voie.py [-v]

La route d'essai : une droite, un décalage en S (quintique : courbure continue, nulle aux deux bouts), une droite ;
`slalom` : un décalage, puis son retour. Mesuré : l'écart à la route (le retard sur le S quand il demande plus que
l'adhérence), le dépassement à l'arrivée, la glisse, le roulis, la latérale, le lacet, le volant, et le temps que
la voiture met vraiment à changer de voie (de 5 % à 95 % du décalage)."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
import dynamique as D          # noqa: E402
import motion as M             # noqa: E402

V = 90.0 / 3.6
S0, DS = 60.0, 0.1             # le S commence à S0 m ; pas de la route


def route(decalages):
    """decalages : [(début m, longueur m, décalage m à gauche)]. Rend (motion.Route, y(s) le décalage voulu)."""
    def y_of(s):
        y = 0.0
        for a, L, w in decalages:
            u = max(0.0, min(1.0, (s - a) / L))
            y += w * u * u * u * (10.0 - 15.0 * u + 6.0 * u * u)
        return y
    n = int(round((S0 + sum(L for _, L, _ in decalages) + 160.0) / DS))
    kap = []
    for i in range(n):
        s = i * DS
        k = 0.0
        for a, L, w in decalages:
            u = (s - a) / L
            if 0.0 < u < 1.0:
                k += w * (60.0 * u - 180.0 * u * u + 120.0 * u ** 3) / (L * L)      # y''(s), petits angles
        kap.append(k)
    return M.Route(0.0, 0.0, 0.0, kap, DS), y_of


def essai(nom, decalages, verbose=False):
    R, y_of = route(decalages)
    plan = D.Plan(R, lambda t: V * t, lambda t: V, lambda t: 0.0)
    T = (S0 + sum(L for _, L, _ in decalages) + 120.0) / V
    dr = D.simulate(plan, (), t_span=(0.0, T))
    ts = [k / 240.0 for k in range(int(T * 240))]
    a0, L0, w0 = decalages[0]
    # la place en travers : sur une route presque droite vers +y, la gauche est −x
    lat = [-dr.pos(t)[0] for t in ts]
    t5 = next(t for t, y in zip(ts, lat) if abs(y) > 0.05 * abs(w0))
    t95 = next(t for t, y in zip(ts, lat) if abs(y) > 0.95 * abs(w0))
    fin = y_of(1e9)
    apres = [y for t, y in zip(ts, lat) if t > (decalages[-1][0] + decalages[-1][1]) / V]
    sens = 1.0 if decalages[-1][2] > 0 else -1.0
    depasse = max(0.0, max(sens * (y - fin) for y in apres))
    m = dict(voulu=L0 / V, vrai=t95 - t5, ecart=max(abs(dr.lat_err(t)) for t in ts), depasse=depasse,
             glisse=max(abs(dr.slip(t)) for t in ts), roulis=max(abs(dr.roll(t)) for t in ts),
             lat_g=max(abs(dr.alat(t)) for t in ts) / D.G, lacet=max(abs(dr.yaw_rate(t)) for t in ts),
             volant=max(abs(dr.steer(t)) for t in ts), v_min=min(dr.speed(t) for t in ts),
             fin=abs(lat[-1] - fin), glisse_fin=abs(dr.slip(ts[-1])))
    print("%-22s voulu %.2f s, fait en %.2f s ; écart %.2f m, dépassement %.2f m ; glisse %.1f°, roulis %.1f°, "
          "latérale %.2f g, lacet %.0f °/s, roues %.1f° ; vitesse ≥ %.1f km/h ; à la fin %.2f m, %.1f°"
          % (nom, m["voulu"], m["vrai"], m["ecart"], m["depasse"], m["glisse"], m["roulis"], m["lat_g"], m["lacet"],
             m["volant"], m["v_min"] * 3.6, m["fin"], m["glisse_fin"]))
    if verbose:
        print("     t    y voulu  y   glisse roulis  lat   lacet roues  gaz")
        for k in range(int(S0 / V * 24) - 2, int((decalages[-1][0] + decalages[-1][1]) / V * 24) + 30, 2):
            t = k / 24
            print("  %5.2f %6.2f %6.2f %5.1f %5.1f %5.1f %5.0f %5.1f %4.2f"
                  % (t, y_of(dr.s(t)), -dr.pos(t)[0], dr.slip(t), dr.roll(t), dr.alat(t), dr.yaw_rate(t),
                     dr.steer(t), dr.throttle(t)))
    return m, dr


def duree(w, a_lat):
    """La durée (s) d'un décalage de w m dont la latérale ne dépasse pas a_lat m/s² (quintique : 5,77 w / T²)."""
    return math.sqrt(5.7735 * abs(w) / a_lat)


T30, T35 = duree(3.0, 5.5), duree(3.5, 5.5)          # ce que le mouillé permet : 1,77 s et 1,92 s à 0,56 g
# (nom, décalages, faisable) : les faisables d'abord (à la latérale du plan, 5,5 m/s²), puis ce que le découpage
# voudrait (1 à 1,5 s : 0,8 à 2 g de latérale demandés, plus que le mouillé n'en tient)
CAS = (("3 m en %.2f s" % T30, [(S0, T30 * V, 3.0)], True),
       ("3,5 m en %.2f s" % T35, [(S0, T35 * V, 3.5)], True),
       ("3,5 m à droite, %.2f s" % T35, [(S0, T35 * V, -3.5)], True),
       ("slalom 3,5 m, 2 × %.2f s" % T35, [(S0, T35 * V, 3.5), (S0 + T35 * V, T35 * V, -3.5)], True),
       ("3 m en 1,5 s", [(S0, 1.5 * V, 3.0)], False),
       ("3,5 m en 1,5 s", [(S0, 1.5 * V, 3.5)], False),
       ("3,5 m en 1,2 s", [(S0, 1.2 * V, 3.5)], False),
       ("3,5 m en 1 s", [(S0, 1.0 * V, 3.5)], False),
       ("slalom 3,5 m, 2 × 1,5 s", [(S0, 1.5 * V, 3.5), (S0 + 1.5 * V, 1.5 * V, -3.5)], False))

if __name__ == "__main__":
    for nom, dec, _ok in CAS:
        essai(nom, dec, "-v" in sys.argv)
