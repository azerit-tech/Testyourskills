# Méthode A du banc de réalisme (« kit ») : un hôtel Art déco de front de mer, rez-de-chaussée et
# trois étages sur la parcelle du banc, dont le réalisme vient surtout de vraies pièces de
# bibliothèque (CC0 / CC BY) posées sur des volumes simples : fenêtres à petits bois, portes
# vitrées, intérieurs de boutiques éclairés, lettres néon, climatiseurs, descentes d'eau, coffrets,
# tuyaux, applique, jardinières, plantes, terrasse, garde-corps, store. Le code ne fait que la
# coque en stuc et l'éclairage de façade (lavages, tubes néon).
#
#   lockf -k <scratchpad>/blender.lock nice -n 19 taskpolicy -b \
#     /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/lab/A_kit.py [-- pres|large]
import os
import sys
import time

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench  # noqa: E402

T0 = time.time()
bench.setup()

import A_facade as F  # noqa: E402
import A_lib as L  # noqa: E402
import A_openings as O  # noqa: E402
import A_parts as P  # noqa: E402

S = bench.S
lin = S.lin
X0 = F.X0

M = F.mats()
obs, openings = F.build(M)
F.canopy(M)
F.rooms_back(M)

alpha = P.neon_alphabet(M)


def word(text, mat, origin, height, facing, **kw):
    return P.neon_word(alpha, text, mat, origin, height, facing, **kw)


# l'enseigne en drapeau sur le pylône : panneau émaillé, HOTEL en lettres néon lilas des deux côtés
pa, pb = F.PYL
yc = (pa + pb) / 2
blade = S.Boxes("A_blade")
blade.add(X0 + 0.6, X0 + 1.75, yc - 0.12, yc + 0.12, 5.0, 12.9, M["trim"])
blade.add(X0 + 0.6, X0 + 0.9, yc - 0.08, yc + 0.08, 12.9, 13.6, M["trim"])
F.bevel(blade.done(), 0.02)
for k, y in enumerate((yc - 0.125, yc + 0.125)):
    word("HOTEL", M["lilac"], (X0 + 1.18, y - 0.03 if k == 0 else y + 0.03, 12.55), 1.05, "-y", vertical=True, spacing=0.16)
for z0, z1 in ((5.0, 12.9),):
    for y in (yc - 0.13, yc + 0.13):
        P.tube(f"A_tube_blade_{y:.2f}", (X0 + 1.74, y, z0 + 0.05), (X0 + 1.74, y, z1 - 0.05), M["lilac"], 0.016)
# le nom de l'hôtel en lettres néon corail posées sur la marquise
word("OCEAN", M["coral"], (X0 + 2.5, yc, 3.82), 0.6, "x", spacing=0.4)
S.box("A_raceway", X0 + 2.43, X0 + 2.57, yc - 1.75, yc + 1.75, 3.72, 3.84, M["metal"])

parts = P.props(M)
P.dress_props(M, parts)
W = O.window_sources(M)
O.dress_windows(M, W, openings)
I = O.interiors_sources()
O.dress_ground(M, parts, I, lambda t, m, o, h, f: word(t, m, o, h, f))
O.dress_ac(O.ac_pack(M))
O.railing(M)
O.awning(M)
P.facade_lights(M)

# silhouette du toit : mâts sur le pylône et sur les blocs d'extrémité
S.cyl("A_mast_pyl", (X0 - 0.2, yc, F.TOP + 5.6), (X0 - 0.2, yc, F.TOP + 9.0), 0.035, M["metal"])
for k, y in enumerate((F.E1[0] + 1.8, F.E2[1] - 1.8)):
    S.cyl(f"A_mast_{k}", (X0 - 0.6, y, F.TOP + 2.5), (X0 - 0.6, y, F.TOP + 5.2), 0.025, M["metal"])

L.cap_textures(2048)
print(f"[A] scène construite en {time.time() - T0:.0f} s, {len(bpy.data.objects)} objets", flush=True)
which = tuple(a for a in sys.argv[sys.argv.index("--") + 1:]) if "--" in sys.argv else ("large", "pres")
bench.render("A-kit", which=which)
