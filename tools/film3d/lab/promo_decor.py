# Les photos de décor pour la communication : un plan du film construit comme render_film --ville le construit (la
# scène du cache, ses voisins, la vie, les clins d'œil, le bras B), puis, au lieu de la série d'images du plan, des
# photos fixes à des instants choisis, chacune depuis une caméra de photo dérivée de la caméra du plan à cet instant
# (reculée, levée, décalée, autre focale, visée sur la berline, profondeur de champ), sans flou de bougé.
#
#   blender -b --factory-startup -P tools/film3d/lab/promo_decor.py -- --plan FIN6 --out /root/promo/decor \
#       --ville /root/ville-v11 --essai bras=B --res 1080x1350 --samples 128 --promo /root/promo/fin6.json
#
# Le fichier --promo : une liste de photos {"nom", "i" (l'image dans le plan, de 1 à sa longueur), et au choix
# "lens" (mm) ou "zoom" (facteur de la focale du plan), "back", "up", "right" (m, dans le repère de la caméra),
# "dz" (m, vertical), "pitch", "yaw" (°), "aim" (true : visée sur le centre de la berline, "aim_dz" au-dessus),
# "fstop" (profondeur de champ, mise au point sur la berline), "blur" (true : garde le flou de bougé)}.
# Images <out>/<nom>.png. Les autres options sont celles de render_film --worker.
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
FILM = os.path.dirname(HERE)
sys.path[:0] = [p for p in (FILM, HERE) if p not in sys.path]


def _hero_center(bpy):
    from mathutils import Vector
    hero = bpy.data.objects.get("hero")
    if hero is None:
        return None
    objs = [o for o in [hero, *hero.children_recursive] if o.type == "MESH" and not o.hide_render]
    # la caisse et ses roues seulement (ni gerbes ni fumées parentées au rig)
    objs = [o for o in objs if o.name.startswith(("coupe", "wheel_", "hero_"))] or objs
    if not objs:
        return hero.matrix_world.translation.copy()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    mn, mx = Vector(map(min, *pts)), Vector(map(max, *pts))
    return Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))


def shoot(bpy, scene, film_cam, spec, out, log):
    from mathutils import Euler, Matrix, Vector
    first = scene.frame_start
    scene.frame_set(first + int(spec["i"]) - 1)
    bpy.context.view_layer.update()
    M = film_cam.matrix_world.copy()
    loc = M.translation.copy()
    right, up, back = (M.col[0].xyz.normalized(), M.col[1].xyz.normalized(), M.col[2].xyz.normalized())
    loc += right * spec.get("right", 0.0) + up * spec.get("up", 0.0) + back * spec.get("back", 0.0)
    loc.z += spec.get("dz", 0.0)
    cd = film_cam.data.copy()
    cd.animation_data_clear()
    cam = bpy.data.objects.new("promo_" + spec["nom"], cd)
    scene.collection.objects.link(cam)
    cam.location = loc
    hc = _hero_center(bpy)
    if spec.get("aim") and hc is not None:
        tgt = hc + Vector((0, 0, spec.get("aim_dz", 0.6)))
        cam.rotation_euler = (tgt - loc).to_track_quat("-Z", "Y").to_euler()
    else:
        rot = M.to_3x3().normalized()
        cam.rotation_euler = rot.to_euler()
    if spec.get("pitch") or spec.get("yaw"):
        r = cam.rotation_euler.to_matrix()
        r = Matrix.Rotation(math.radians(spec.get("yaw", 0.0)), 3, "Z") @ r
        r = r @ Matrix.Rotation(math.radians(spec.get("pitch", 0.0)), 3, "X")
        cam.rotation_euler = r.to_euler()
    if "lens" in spec:
        cd.lens = spec["lens"]
    elif "zoom" in spec:
        cd.lens = film_cam.data.lens * spec["zoom"]
    cd.dof.use_dof = bool(spec.get("fstop")) and hc is not None
    if cd.dof.use_dof:
        cd.dof.focus_object = None
        cd.dof.focus_distance = (hc + Vector((0, 0, 0.6)) - loc).length
        cd.dof.aperture_fstop = spec["fstop"]
    scene.camera = cam
    scene.render.use_motion_blur = bool(spec.get("blur", False))
    p = os.path.join(out, spec["nom"] + ".png")
    scene.render.filepath = p[:-4] + ".part.png"
    t = time.time()
    bpy.ops.render.render(write_still=True)
    os.replace(p[:-4] + ".part.png", p)
    log(f"promo {spec['nom']} (image {spec['i']}, {cd.lens:.0f} mm) : {p} en {time.time() - t:.1f} s")
    scene.camera = film_cam


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    k = argv.index("--promo")
    specs = json.load(open(argv[k + 1], encoding="utf-8"))
    del argv[k:k + 2]
    sys.argv = [sys.argv[0], "--", "--worker", "--mode", "render", *argv]
    import render_film as RF
    orig = RF.setup_render

    def patched(bpy, scene, a):
        res = orig(bpy, scene, a)
        out = a.out
        os.makedirs(out, exist_ok=True)
        film_cam = scene.camera
        for spec in specs:
            if os.path.exists(os.path.join(out, spec["nom"] + ".png")):
                continue
            try:
                shoot(bpy, scene, film_cam, spec, out, RF.log)
            except Exception as e:      # une photo ratée n'arrête pas les autres
                RF.log(f"! promo {spec.get('nom')} : {e!r}")
        RF.log("promo : fini")
        sys.stdout.flush()
        os._exit(0)
        return res

    RF.setup_render = patched
    RF.main()


if __name__ == "__main__":
    main()
