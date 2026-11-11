# Planches de contrôle des modèles de bibliothèque des lieux (port, pont, marina, rond-point, rue)
# et des pièces de la distribution qui manquaient (avion, barrage).
#
#   blender -b -t 2 --factory-startup -P tools/film3d/lab/lieux_sheet.py -- --sheet port,pont,marina,rue,distribution [--only nom,nom]
#
# Vignettes Workbench, pas de Cycles (le Mac de Jacques sature : ni compilation de noyaux ni échantillons) :
# chaque modèle est chargé seul, tel que livré (échelle, textures du fichier, couleurs des textures, cavités),
# posé sur un sol gris, cadré en trois quarts par sa sphère englobante, 480 x 360, puis la scène est vidée
# avant le suivant. La légende (nom, triangles, emprise en m, plus grande texture) est un texte devant
# l'objectif. Les cases vont dans ref/lab/lieux/<planche>/<nom>.png, la planche assemblée dans
# ref/lab/lieux-<planche>.png (trois colonnes).
# Les modèles sont lus dans assets/<chemin> (téléchargés par fetch.py) ; un modèle absent est sauté.
import argparse
import math
import os
import resource
import sys
import time

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cast_vehicles as cv  # noqa: E402
import cast_vehicles_render as cvr  # noqa: E402

# (nom de case, chemin sous assets/, rotation z en degrés pour montrer le profil utile)
SHEETS = {
    "port": [
        ("container-sizes", "lieux/port/container-sizes/model.glb", 0),
        ("container-20-red", "lieux/port/container-20-red/model.glb", 0),
        ("container-20-webster", "lieux/port/container-20-webster/model.glb", 0),
        ("crane-rmg", "lieux/port/crane-rmg/model.glb", 0),
        ("crane-harbor", "lieux/port/crane-harbor/model.glb", 0),
        ("crane-portal", "lieux/port/crane-portal/model.glb", 0),
        ("ship-container", "lieux/port/ship-container/model.glb", 0),
        ("ship-cargo", "lieux/port/ship-cargo/model.glb", 0),
        ("trawler", "lieux/port/trawler/model.glb", 0),
        ("forklift", "lieux/port/forklift/model.glb", 0),
        ("bollard-double", "lieux/port/bollard-double/model.glb", 0),
        ("pallets", "lieux/port/pallets/model.glb", 0),
        ("old-tyre (PH)", "lieux/port/old-tyre/old_tyre.gltf", 0),
    ],
    "pont": [
        ("lamp-long-arm", "lieux/pont/lamp-long-arm/model.glb", 0),
        ("lamp-freeway-double", "lieux/pont/lamp-freeway-double/model.glb", 0),
        ("lamp-cobra", "lieux/pont/lamp-cobra/model.glb", 0),
        ("guardrail-wbeam", "lieux/pont/guardrail-wbeam/model.glb", 0),
    ],
    "marina": [
        ("sailboat", "lieux/marina/sailboat/model.glb", 0),
        ("sailboat-38", "lieux/marina/sailboat-38/model.glb", 0),
        ("sport-cruiser", "lieux/marina/sport-cruiser/model.glb", 0),
        ("trawler-yacht", "lieux/marina/trawler-yacht/model.glb", 0),
        ("yacht-far", "lieux/marina/yacht-far/model.glb", 0),
        ("ocean-buoy (PH)", "lieux/marina/ocean-buoy/ocean_buoy.gltf", 0),
    ],
    "rue": [
        ("neon-motel", "lieux/rue/neon-motel/model.glb", 0),
        ("neon-cherry", "lieux/rue/neon-cherry/model.glb", 0),
        ("parking-meter", "lieux/rue/parking-meter/model.glb", 0),
        ("newspaper-box", "lieux/rue/newspaper-box/model.glb", 0),
        ("street-pack", "lieux/rue/street-pack/model.glb", 0),
        ("fire-hydrant (PH)", "lieux/rue/fire-hydrant/fire_hydrant.gltf", 0),
        ("road-signs", "lieux/rond-point/road-signs/model.glb", 0),
    ],
    "distribution": [
        ("jet-mig23", "cast/jet-mig23/model.glb", 0),
        ("jet-tu148", "cast/jet-tu148/model.glb", 0),
        ("barricade-set", "cast/barricade-set/model.glb", 0),
        ("barrier-crowd", "cast/barrier-crowd/model.glb", 0),
    ],
}

RES = (480, 360)
LENS = 40.0


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", default="port")
    ap.add_argument("--only", default="")
    ap.add_argument("--reuse", action="store_true", help="garde les cases déjà rendues")
    return ap.parse_args(argv)


def setup_workbench():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "TEXTURE"
    sh.show_cavity = True
    sh.cavity_type = "BOTH"
    sh.show_shadows = True
    sh.background_type = "WORLD"
    sc.display.render_aa = "8"
    sc.view_settings.view_transform = "Standard"


def ground(size):
    bpy.ops.mesh.primitive_plane_add(size=size)
    g = bpy.context.active_object
    g.name = "sol_neutre"
    g.data.materials.append(cv.mat_plain("sol_gris", "#58595c", rough=0.6))
    return g


def max_texture(objs):
    best = 0
    for o in objs:
        for m in o.data.materials:
            if m and m.node_tree:
                for n in m.node_tree.nodes:
                    if n.type == "TEX_IMAGE" and n.image:
                        best = max(best, *n.image.size)
    return best


def build_cell(name, path, rot_z):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    w = bpy.data.worlds.new("gris")
    w.color = (0.05, 0.055, 0.07)
    bpy.context.scene.world = w
    t0 = time.time()
    objs = cv.import_model(path)
    tex = max_texture(objs)
    cv.downscale_images(objs, 2048)
    tris = cv.tris(objs)
    # le modèle tourné pour la vue (autour de l'origine du fichier), puis posé au sol et centré
    if rot_z:
        for o in objs:
            o.rotation_euler.z += math.radians(rot_z)
    mn, mx = cv.bbox(objs)
    c = (mn + mx) / 2
    for o in objs:
        o.location -= Vector((c.x, c.y, mn.z))
    mn, mx = cv.bbox(objs)
    dims = mx - mn
    r = max(dims.length / 2, 0.05)
    ground(max(40.0, 8 * r))
    # trois quarts avant, un peu au-dessus, la sphère englobante tient dans le petit côté du cadre
    half = math.atan(18.0 / LENS) * RES[1] / RES[0]
    d = r * 1.08 / math.sin(half)
    az, el = math.radians(-35.0), math.radians(12.0)
    tgt = Vector((0, 0, dims.z / 2))
    cam = cvr.camera(tgt + d * Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el))), tgt, lens=LENS)
    cam.data.clip_start = max(0.01, d / 2000)
    cam.data.clip_end = d * 20
    caption = f"{name}  {tris / 1000:.1f}k tri  {dims.x:.1f} x {dims.y:.1f} x {dims.z:.1f} m  tex {tex or '-'}"
    cvr.cam_label(cv, cam, caption, RES)
    print(f"[lieux] {caption}  (import {time.time() - t0:.0f} s)", flush=True)
    return caption


def render_sheet(sheet, only, reuse):
    lab = os.path.join(cv.REF, "lab")
    cells = os.path.join(lab, "lieux", sheet)
    os.makedirs(cells, exist_ok=True)
    paths = []
    for name, rel, rot in SHEETS[sheet]:
        path = os.path.join(cv.ASSETS, rel)
        out = os.path.join(cells, name.split(" ")[0] + ".png")
        if not os.path.exists(path):
            print(f"[lieux] absent, sauté : {rel}", flush=True)
            continue
        paths.append(out)
        if (only and name.split(" ")[0] not in only) or (reuse and os.path.exists(out)):
            continue
        t0 = time.time()
        build_cell(name, path, rot)
        setup_workbench()
        sc = bpy.context.scene
        sc.render.filepath = out
        bpy.ops.render.render(write_still=True)
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e9
        print(f"[lieux] écrit {out} en {time.time() - t0:.0f} s, mémoire de pointe {peak:.2f} Go", flush=True)
    if paths:
        cvr.compose([p for p in paths if os.path.exists(p)], 3, os.path.join(lab, f"lieux-{sheet}.png"), RES)


def main():
    a = args()
    only = set(a.only.split(",")) if a.only else None
    # plusieurs planches par lancement (--sheet port,pont) : un seul Blender, un modèle chargé à la fois
    for sheet in a.sheet.split(","):
        render_sheet(sheet, only, a.reuse)


main()
