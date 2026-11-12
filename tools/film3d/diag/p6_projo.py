# essai P6 : les projecteurs des hélicoptères, derrière la berline, posaient leur nappe devant elle, sur l'enrobé
# entre elle et l'objectif (la moitié basse blanche) : 6° au lieu de 9°, 150 kW au lieu de 400, visés 3 m derrière
# son centre
import math

import motion as M
import p6_jetee as P6

frames = range(P6.F0 - 1, P6.F0 + P6.FRAMES + 1)
n = 0
for o in scene.objects:
    if o.type == "LIGHT" and o.name.endswith("searchlight_spot"):
        o.data.energy = 150000.0
        o.data.spot_size = math.radians(6.0)
        n += 1


def target(t):
    x, y, z = P6.beam_target(t)
    return x, y - 3.0, z


for o in scene.objects:
    if o.name.endswith("searchlight_pivot"):
        M.key_searchlight({"searchlight_pivot": o}, frames, target)
print(f"[diag] {n} projecteurs à 150 kW, 6°, visés 3 m derrière la berline", flush=True)
