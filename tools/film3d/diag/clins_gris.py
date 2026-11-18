# Les clins d'œil (clins.py, SPEC §18.65) vus de la caméra du film, en gris : la scène d'un plan reprise du cache
# (debit.py), la vie et les clins posés comme render_film --ville les pose, des images Workbench 360 × 640 aux images
# du film demandées. Sans la ville voisine (ville.py --cache) : chaque plan montre son lieu propre.
#
#   blender -b --factory-startup -P tools/film3d/diag/clins_gris.py -- --blend CACHE/P1-….blend --plan P1 \
#     --g 80,100 --out DIR [--tag v1] [--gros] [--couleur TEXTURE|MATERIAL]
#
# --gros : en plus, chaque clin du lieu vu de près (un plan fixe de face, à l'image du début du plan), pour juger le
# modèle, son sens et ses textes. Écrit aussi la sonde du sol : sous chaque clin posé au sol, ce qu'il y a.
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if HERE not in sys.path:
    sys.path.insert(0, HERE)


def main():
    import bpy
    from mathutils import Vector
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--blend", required=True)
    ap.add_argument("--plan", required=True)
    ap.add_argument("--g", default="")
    ap.add_argument("--out", required=True)
    ap.add_argument("--tag", default="clins")
    ap.add_argument("--gros", action="store_true")
    ap.add_argument("--couleur", default="TEXTURE")
    a = ap.parse_args(argv)
    os.makedirs(a.out, exist_ok=True)
    import clins
    import parcours as P
    if a.blend == "vide":
        # sans décor : une scène vide, un sol, tous les clins (le banc d'essai des modèles)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        scene.frame_start, scene.frame_end = 1, P.START[a.plan] + 1
        bpy.ops.mesh.primitive_plane_add(size=4000)
        clins.poser(scene, plan="vide", images=[scene.frame_start])
    else:
        bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend), load_ui=False)
        scene = bpy.context.scene
        import vie
        vie.poser_plan(scene, a.plan)
        clins.poser_plan(scene, a.plan)
    r = scene.render
    r.engine = "BLENDER_WORKBENCH"
    r.resolution_x, r.resolution_y, r.resolution_percentage = 360, 640, 100
    r.use_motion_blur = False
    r.film_transparent = False
    sh = scene.display.shading
    sh.light = "STUDIO"
    sh.color_type = a.couleur
    sh.show_shadows = True
    scene.display.shading.show_cavity = False
    fs = scene.frame_start
    g0 = P.START[a.plan] if a.blend != "vide" else 0
    root = bpy.data.objects["clins_racine"]
    # la sonde du sol : sous chaque clin au sol, l'objet touché et sa hauteur (les clins et la vie ignorés)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    own = {o for o in scene.objects if o.get("clins") or o.name.startswith("vie_") or o.name.startswith("clin")}
    for c in clins.clins():
        if bpy.data.objects.get(f"clin_{c['nom']}") is None:
            continue
        g = max(g0, (c.get("fenetre") or (0, 0))[0] or 0)
        x, y, z = c["pose"](g)[:3]
        o = root.matrix_world @ Vector((x, y, z + 40.0))
        d = root.matrix_world.to_3x3() @ Vector((0, 0, -1))
        hit, hits = o, []
        for _ in range(12):
            ok, loc, _n, _i, ob, _m = scene.ray_cast(dg, hit, d)
            if not ok:
                break
            if ob not in own and not any(k in ob.name.lower() for k in ("haze", "brume", "volume")):
                hits.append((ob.name, (root.matrix_world.inverted() @ loc).z))
                break
            hit = loc + d * 0.01
        print(f"[sonde] {c['nom']:16} z {z:6.2f} : " + (f"{hits[0][0]} à {hits[0][1]:.2f}" if hits else "rien (eau ?)"),
              flush=True)
    for gs in [s for s in a.g.split(",") if s]:
        g = int(gs)
        scene.frame_set(fs + g - g0)
        r.filepath = os.path.join(a.out, f"{a.plan}-g{g:03d}-{a.tag}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[gris] {r.filepath}", flush=True)
    if a.gros:
        cam = bpy.data.objects.new("clins_gros", bpy.data.cameras.new("clins_gros"))
        scene.collection.objects.link(cam)
        cam.data.lens = 35
        cam.data.sensor_fit = "VERTICAL"
        cam.data.sensor_height = 36
        cam.data.clip_end = 2000
        scene.camera = cam
        scene.frame_set(fs)
        for c in clins.clins():
            ob = bpy.data.objects.get(f"clin_{c['nom']}")
            if ob is None or (c["nom"].startswith("flamant_") and c["nom"] != "flamant_0"):
                continue
            x, y, z, cap = c["pose"](max(g0, (c.get("fenetre") or (0, 0))[0] or 0))[:4]
            h = c.get("hauteur", c["rayon"])
            zc = z + (c.get("hauteur", 0) / 2 if c["quoi"] == "panneau" else 0.5 * c["rayon"])
            dist = 2.6 * max(c["rayon"], h) + 1.5
            ca = math.radians(cap + 25.0)
            p = Vector((x - math.sin(ca) * dist, y + math.cos(ca) * dist, zc + 0.25 * dist))
            tgt = Vector((x, y, zc))
            M = root.matrix_world
            cam.location = M @ p
            cam.rotation_euler = ((M @ tgt) - (M @ p)).to_track_quat("-Z", "Y").to_euler()
            r.filepath = os.path.join(a.out, f"gros-{c['nom']}-{a.tag}.png")
            bpy.ops.render.render(write_still=True)
            print(f"[gros] {r.filepath}", flush=True)


main()
