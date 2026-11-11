# Piste palmiers du banc : des palmiers distincts (cocotiers courbes, palmiers royaux droits),
# palmes translucides éclairées par derrière, grille d'arbre au pied.
import math
import os
import random
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench  # noqa: E402
S = bench.S


translucent_leaves, coconut_sources, royal_source, tree_grate = S.translucent_leaves, S.coconut_sources, S.royal_source, S.tree_grate


def place(src, name, x, y, rot, lean=(0.0, 0.0), scale=1.0):
    ob = S.instance(src, name, (x, y, 0.15), rot, scale)
    ob.rotation_euler = (math.radians(lean[0]), math.radians(lean[1]), rot)
    tree_grate(name + "_grate", x, y)
    return ob


if __name__ == "__main__":
    random.seed(4)
    bench.setup(frontage=True, palms_on=False)
    hidden = bench.hidden_collection()
    cocos = coconut_sources(hidden)
    royal = royal_source(hidden)
    # des cocotiers de 8 à 12 m, pas trop couchés : les mieux tenus sur un trottoir
    good = [(ob, ang) for ob, top, ang, off in cocos if 8.0 < top < 13.0 and off < 3.5]
    print("[palms] cocotiers :", [(round(t, 1), round(o, 1)) for _, t, _, o in cocos], "retenus", len(good), flush=True)
    xw = -bench.ROAD_HALF - 1.6
    place(royal, "palm_royal_a", xw, 9.0, 0.6, (1.5, -1.0), 1.05)
    # la couronne penche vers la chaussée (+x) côté ville, vers la mer (+x) côté promenade
    ob, ang = good[0]
    place(ob, "palm_coco_a", xw, 24.0, -ang + 0.3)
    place(royal, "palm_royal_b", xw, 37.5, 2.4, (-1.0, 2.0), 0.95)
    ob, ang = good[min(3, len(good) - 1)]
    place(ob, "palm_coco_b", bench.ROAD_HALF + 2.4, 30.0, -ang - 0.4)
    bench.render("P-palms")
