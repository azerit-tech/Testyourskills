import math
import clear, parcours as P


class Shift:
    def __init__(self, d, f_a, f_b):
        self.d, self.a, self.b = d, f_a / 24, f_b / 24

    def pos(self, t):
        s = P.s_of_t(t)
        x, y, h, _ = P.ROUTE.at(s)
        h = math.radians(h)
        w = 1.0 if self.a <= t <= self.b else 0.0
        return x - math.cos(h) * self.d * w, y - math.sin(h) * self.d * w

    def heading(self, t):
        return P.ROUTE.at(P.s_of_t(t))[2]


for a, b in ((110, 140), (140, 170), (170, 200), (200, 240)):
    row = []
    for d in (-3, -2, -1, 0, 1, 2, 3):
        (ww, fw), (wb, fb) = clear.p2_clear(Shift(d, a, b))
        row.append(f"{d:+d}:{ww:5.2f}@{fw:.0f}")
    print(a, b, " ".join(row))
