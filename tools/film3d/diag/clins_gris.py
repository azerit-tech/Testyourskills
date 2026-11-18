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
    ap.add_argument("--carte", default="", help="x0,x1,y0,y1,pas : le sol en caractères (ville, m)")
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
    # les brumes (boîtes de volume) sont des murs gris en Workbench : cachées
    for ob in scene.objects:
        mats = [s.material for s in getattr(ob, "material_slots", []) if s.material and s.material.use_nodes]
        vol = any(n.type in ("PRINCIPLED_VOLUME", "VOLUME_ABSORPTION", "VOLUME_SCATTER")
                  for m in mats for n in m.node_tree.nodes)
        if vol or any(k in ob.name.lower() for k in ("haze", "brume", "fog")):
            ob.hide_render = True
    fs = scene.frame_start
    g0 = P.START[a.plan] if a.blend != "vide" else 0
    root = bpy.data.objects["clins_racine"]
    # la sonde du sol : sous chaque clin au sol, l'objet touché et sa hauteur (les clins et la vie ignorés)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    own = {o for o in scene.objects if o.get("clins") or o.name.startswith("vie_") or o.name.startswith("clin")}
    inv = root.matrix_world.inverted()
    d = root.matrix_world.to_3x3() @ Vector((0, 0, -1))

    def sol(x, y, z):
        """Ce qu'il y a sous (x, y) en ville, en descendant de z + 40 : (nom, hauteur) ou None (les clins, la
        vie et les brumes traversés)."""
        hit = root.matrix_world @ Vector((x, y, z + 40.0))
        for _ in range(12):
            ok, loc, _n, _i, ob, _m = scene.ray_cast(dg, hit, d)
            if not ok:
                return None
            if ob not in own and not any(k in ob.name.lower() for k in ("haze", "brume", "volume")):
                return ob.name, (inv @ loc).z
            hit = loc + d * 0.01
        return None

    for c in clins.clins():
        if bpy.data.objects.get(f"clin_{c['nom']}") is None:
            continue
        g = max(g0, (c.get("fenetre") or (0, 0))[0] or 0)
        x, y, z = c["pose"](g)[:3]
        h = sol(x, y, z)
        print(f"[sonde] {c['nom']:16} z {z:6.2f} : " + (f"{h[0]} à {h[1]:.2f}" if h else "rien"), flush=True)
    if a.carte:
        # --carte x0,x1,y0,y1,pas : le sol vu de haut en caractères (# : sol, ~ : eau, . : rien), le nord en haut
        x0, x1, y0, y1, pas = map(float, a.carte.split(","))
        print(f"[carte] x {x0:g}..{x1:g}, y {y1:g} (haut) .. {y0:g} (bas), pas {pas:g} m", flush=True)
        y = y1
        while y >= y0:
            row, x = "", x0
            while x <= x1:
                h = sol(x, y, 30.0)
                row += "." if h is None else ("~" if h[1] < -0.8 else "#")
                x += pas
            print(f"[carte] {y:7.1f} {row}", flush=True)
            y -= pas
    for gs in [s for s in a.g.split(",") if s]:
        g = int(gs)
        scene.frame_set(fs + g - g0)
        # la caméra du plan en ville, et où tombe chaque clin dans l'image (pixels, 360 × 640)
        from bpy_extras.object_utils import world_to_camera_view
        cm = inv @ scene.camera.matrix_world
        fwd = cm.to_3x3() @ Vector((0, 0, -1))
        print(f"[camera] g {g} : ({cm.translation.x:.1f}, {cm.translation.y:.1f}, {cm.translation.z:.1f}), "
              f"vers ({fwd.x:.2f}, {fwd.y:.2f}, {fwd.z:.2f}), focale {scene.camera.data.lens:.0f}", flush=True)
        for c in clins.clins():
            ob = bpy.data.objects.get(f"clin_{c['nom']}")
            if ob is None:
                continue
            q = world_to_camera_view(scene, scene.camera, ob.matrix_world.translation)
            print(f"[cadre] g {g} {c['nom']:16} u {q.x * 360:6.0f} v {(1 - q.y) * 640:6.0f} à {q.z:5.1f} m", flush=True)
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
