"""Le bilan de la conduite simulée sur tout le film : python3 lab/dynamique/bilan.py [-v]
Aux raccords et aux étoiles : le retard sur l'horaire du plan (m), l'écart à la route (m), la vitesse, la glisse ;
par tronçon : les plus forts écart, glisse, latérale, roulis, lacet ; l'arrêt."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
import parcours as P           # noqa: E402

G = 9.81


def bilan(dr=None, verbose=False):
    dr = dr or P.DRIVE
    noms = list(P.START)
    print("arrêt : simulé %.3f s (image %.1f), plan %.3f s (image %.1f) ; abscisse %.2f pour %.2f"
          % (P.T_ARRET, P.T_ARRET * 24, P.T_PLAN, P.T_PLAN * 24, dr.s(P.T_ARRET + 0.5), P.S_ARRET))
    print("étoiles", P.ETOILES)
    print("  image  quoi     retard  écart  v sim  v plan  glisse")
    marks = [(P.START[n], n) for n in noms] + [(f, "étoile %d" % k) for k, f in P.ETOILES.items()]
    for f, quoi in sorted(marks):
        t = f / 24
        print("  %5d  %-9s %5.2f  %5.2f  %5.1f  %5.1f  %6.1f"
              % (f, quoi, P._s_plan(t) - dr.s(t), dr.lat_err(t), dr.speed(t), P.PLAN.speed(t), dr.slip(t)))
    print("  tronçon   |écart|  |glisse|  latérale g  roulis  lacet °/s  retard min/max")
    ends = [P.START[n] for n in noms[1:]] + [int(P.T_ARRET * 24) + 1]
    for n, b in zip(noms, ends):
        ts = [k / 240 for k in range(P.START[n] * 10, b * 10)]
        ds = [P._s_plan(t) - dr.s(t) for t in ts]
        print("  %-8s  %6.2f   %6.1f     %5.2f     %5.1f    %5.1f     %5.2f %5.2f"
              % (n, max(abs(dr.lat_err(t)) for t in ts), max(abs(dr.slip(t)) for t in ts),
                 max(abs(dr.alat(t)) for t in ts) / G, max(abs(dr.roll(t)) for t in ts),
                 max(abs(dr.yaw_rate(t)) for t in ts), min(ds), max(ds)))
    if verbose:
        print("    f   slip    e      v    vpl  steer  thr  brk   hb  spin     r  alat along  roll    ds")
        for f in range(0, ends[-1] + 1, 4):
            t = f / 24
            print("  %4d %5.1f %5.2f %5.1f %5.1f %5.1f %4.2f %4.2f %4.2f %4.2f %5.0f %5.1f %5.1f %5.1f %5.2f"
                  % (f, dr.slip(t), dr.lat_err(t), dr.speed(t), P.PLAN.speed(t), dr.steer(t), dr.throttle(t),
                     dr.brake(t), dr.handbrake(t), dr.wheelspin(t), dr.yaw_rate(t), dr.alat(t), dr.along(t),
                     dr.roll(t), P._s_plan(t) - dr.s(t)))


if __name__ == "__main__":
    bilan(verbose="-v" in sys.argv)
