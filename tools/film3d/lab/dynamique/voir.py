"""Regarder un dérapage simulé, image par image : python3 lab/dynamique/voir.py P2|P5|tout [clé=valeur …]
(les clés du geste : peak, tenue, avance… ; préfixe d. pour le conducteur, c. pour la voiture)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
import dynamique as D          # noqa: E402
import parcours as P           # noqa: E402

PLAN = D.Plan(P.ROUTE, P._s_plan, P.PLAN.speed, P.PLAN.along, P.S_ARRET)
WIN = {"P2": (118, 226, 0, (-2.0, 12.0)), "P5": (424, 520, 1, (-2.0, 25.0))}


def run(which, ev_over=None, driver=None, car=None, events=None):
    a, b, k, span = WIN[which]
    evs = [dict(e) for e in (events or P.DERAPAGES)]
    evs[k].update(ev_over or {})
    return D.simulate(PLAN, evs[:k + 1], t_span=span, car=car, driver=driver), evs[k]


def mesure(which, dr, ev):
    a, b, k, _ = WIN[which]
    sd = ev["side"]
    fs = [q / 10 for q in range(a * 10, b * 10)]
    sl = [sd * dr.slip(f / 24) for f in fs]
    pk = max(sl)
    fpk = fs[sl.index(pk)]
    hold = sum(1 for v in sl if v > 0.8 * ev["peak"]) / 240.0
    over20 = sum(1 for v in sl if v > 20.0) / 240.0
    neg = -min(sl)
    emax = max(abs(dr.lat_err(f / 24)) for f in fs)
    ds = [PLAN.s_ref(f / 24) - dr.s(f / 24) for f in range(a, b)]
    return dict(pk=round(pk, 1), fpk=fpk, at_star=round(sd * dr.slip(ev["t"]), 1), hold=round(hold, 2),
                over20=round(over20, 2), back=round(neg, 1), e_max=round(emax, 2),
                ds=(round(min(ds), 2), round(max(ds), 2), round(ds[-1], 2)),
                r_max=round(max(abs(dr.yaw_rate(f / 24)) for f in fs), 1),
                alat=round(max(abs(dr.alat(f / 24)) for f in fs), 2),
                roll=round(max(abs(dr.roll(f / 24)) for f in fs), 1),
                counter=round(max(-sd * dr.steer(f / 24) for f in fs), 1))


def table(which, dr, step=2):
    a, b, _, _ = WIN[which]
    print("  f   slip   ref    e     v   vpl  steer  thr  brk   hb  spin    r   alat along roll  ds")
    for f in range(a, b, step):
        t = f / 24
        print("%4d %5.1f %5.1f %5.2f %5.1f %5.1f %5.1f %4.2f %4.2f %4.2f %4.2f %5.0f %5.1f %5.1f %4.1f %5.2f"
              % (f, dr.slip(t), dr.slip_ref(t), dr.lat_err(t), dr.speed(t), PLAN.v_ref(t), dr.steer(t),
                 dr.throttle(t), dr.brake(t), dr.handbrake(t), dr.wheelspin(t), dr.yaw_rate(t), dr.alat(t),
                 dr.along(t), dr.roll(t), PLAN.s_ref(t) - dr.s(t)))


if __name__ == "__main__":
    which = sys.argv[1]
    ev, drv, car = {}, {}, {}
    for kv in sys.argv[2:]:
        if kv == "-q":
            continue
        k, v = kv.split("=")
        v = eval(v)
        (drv if k.startswith("d.") else car if k.startswith("c.") else ev)[k.split(".")[-1]] = v
    for w in (("P2", "P5") if which == "tout" else (which,)):
        dr, e = run(w, ev, drv, car)
        print(w, mesure(w, dr, e))
        if w == "P2":
            import clear
            (gw, fw), (gb, fb) = clear.p2_clear(dr)
            print("   jeu roues %.2f m (image %.0f), caisse %.2f m (image %.0f)" % (gw, fw, gb, fb))
        if "-q" not in sys.argv:
            table(w, dr)
