# Le décor de la route vu de la caméra de poursuite, hors du rendu du film : des images grises fixes (Workbench,
# 360 × 640) prises de dos, 7,5 m derrière un point de la route, à 2,4 m au-dessus du sol, au cap de la route, sur la
# ville assemblée à partir des lieux en cache (ville.py --cache). Une berline grise (une boîte) marque le point.
#
#   python3 tools/film3d/ville.py --cache --out VILLE [--lieux …]          # les lieux en cache, d'abord
#   blender -b --factory-startup -P tools/film3d/diag/vue_route.py -- --ville VILLE --out DIR --tag avant \
#     [--vues f001,f025] [--groupe eau] [--pas 12] [--vie]
#
# --vie : la vie de la ville (vie.py : circulation, garées, passants, palmiers, bateaux) posée à l'image du film de
# chaque vue (la scène est la ville, son image f est l'image f du film).
#
# Écrit DIR/<vue>-<tag>.png. Chaque vue a son lieu « propre » : comme render_film --ville, ses faux lointains restent
# (ceux des autres lieux sont cachés), puis la seule mer et le seul ciel de la ville (ville.mer). Les vues d'un même
# groupe partagent un chargement ; un groupe charge les lieux qu'il voit, pas plus (le Mac a 8 Go).
import argparse
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

# Les groupes : (lieux chargés), et le groupe de chaque tronçon (ce que CHARGE lui donne, réuni en trois chargements).
# Les vues (le trajet roulé, 17 novembre au soir : une vue toutes les `pas` images du film, nommée fNNN) : (nom,
# groupe, lieu propre, x, y, cap) dans la ville (repère du pont ; cap 0 vers +y, positif vers −x, comme lieux.put),
# la berline à cette image (ville.hero_city) et le cap du bras commun (ville.cam_cap_city).
GROUPES = {
    "ville": ("avenue", "rond-point", "rue", "pont", "port"),
    "quai": ("rue", "pont", "port", "jetee"),
    "eau": ("pont", "port", "jetee"),
}
GROUPE_PLAN = {"OUV": "ville", "P1": "ville", "P2": "ville", "P3": "ville", "P4": "quai", "P5": "eau", "P6": "eau"}


def vues(pas=24):
    import parcours as P
    import ville as V
    out = []
    for f in sorted(set(range(1, P.TOTAL + 1, pas)) | {P.TOTAL}):
        shot, _fr = V.shot_of(f)
        x, y = V.hero_city(f)[:2]
        out.append((f"f{f:03d}", GROUPE_PLAN[shot], V.lieu_of_shot(shot)[0], x, y, V.cam_cap_city(f)))
    return out


def sonde(scene, cam, nom, cols=9, rows=16):
    """Les objets que la caméra voit, une ligne par bande horizontale de l'image (du haut vers le bas) : nom, lieu et
    distance au point touché, sur une grille de cols × rows rayons."""
    import bpy
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    fr = cam.data.view_frame(scene=scene)        # coins du cadre dans le repère caméra : haut droit, bas droit, bas gauche, haut gauche
    mw = cam.matrix_world
    o = mw.translation
    for j in range(rows):
        v = (j + 0.5) / rows
        seen = []
        for i in range(cols):
            u = (i + 0.5) / cols
            top = fr[3].lerp(fr[0], u)
            bot = fr[2].lerp(fr[1], u)
            d = (mw.to_3x3() @ top.lerp(bot, v)).normalized()
            ok, loc, _n, _k, ob, _m = scene.ray_cast(dg, o, d, distance=5000.0)
            if not ok:
                seen.append("ciel")
                continue
            ob = ob.original if ob else ob
            seen.append(f"{ob.name}<{ob.get('ville_lieu', '?')}>@{(loc - o).length:.0f}")
        print(f"[sonde] {nom} v{v:.2f} : " + " | ".join(seen), flush=True)


def main():
    import bpy
    from mathutils import Vector

    import ouv_avenue as O
    import parcours as P
    import ville as V
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--ville", required=True, help="le dossier de ville.py --cache")
    ap.add_argument("--out", required=True)
    ap.add_argument("--tag", default="avant")
    ap.add_argument("--groupe", default=None)
    ap.add_argument("--vues", default=None)
    ap.add_argument("--pas", type=int, default=24, help="une vue toutes les N images du film")
    ap.add_argument("--sonde", action="store_true", help="les objets vus, par bande de l'image (lancers de rayons)")
    ap.add_argument("--vie", action="store_true", help="la vie de la ville (vie.py), à l'image de chaque vue")
    ap.add_argument("--avant", default=None,
                    help="avec --vie : rend aussi chaque vue sans la vie d'abord, sous ce tag (un seul chargement)")
    ap.add_argument("--cycles", type=int, default=0,
                    help="N : en éclairé, Cycles à N échantillons sur la carte graphique (machine louée seulement)")
    a = ap.parse_args(argv)
    os.makedirs(a.out, exist_ok=True)
    todo = [v for v in vues(a.pas)
            if (a.groupe is None or v[1] == a.groupe) and (a.vues is None or v[0] in a.vues.split(","))]
    groupes = sorted({v[1] for v in todo}, key=list(GROUPES).index)
    for g in groupes:
        t0 = time.time()
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        scene.name = "ville"
        noms = [n for n in V.NOMS if n in GROUPES[g]]
        infos = {}
        for n in noms:
            with open(os.path.join(a.ville, "lieux", f"{n}.json"), encoding="utf-8") as f:
                infos[n] = json.load(f)
        V.assembler(scene, infos, noms)
        V.mer(scene)
        V.volumes(scene, False)
        r = scene.render
        r.engine = "BLENDER_WORKBENCH"
        r.resolution_x, r.resolution_y, r.resolution_percentage = 360, 640, 100
        r.use_motion_blur = False
        r.use_simplify, r.simplify_subdivision_render = True, 0
        r.image_settings.file_format = "PNG"
        r.image_settings.color_mode = "RGB"
        sh = scene.display.shading
        sh.light, sh.color_type, sh.show_shadows, sh.show_cavity = "STUDIO", "RANDOM", False, False
        sh.show_object_outline = False
        scene.compositing_node_group = None
        if a.cycles:
            # l'éclairé : les réglages de rendu du film (scene_a.render_settings : AgX, rebonds, débruiteur), les
            # lampes des lieux, le ciel et la mer de la ville (ville.mer), sans brume (comme le gris)
            import scene_a as SA
            SA.render_settings(scene)
            r.resolution_x, r.resolution_y, r.resolution_percentage = 360, 640, 100
            r.threads_mode = "AUTO"
            c = scene.cycles
            c.samples = a.cycles
            if sys.platform != "darwin":                # jamais la carte graphique du Mac (règle machine)
                prefs = bpy.context.preferences.addons["cycles"].preferences
                for kind in ("OPTIX", "CUDA"):
                    try:
                        prefs.compute_device_type = kind
                    except TypeError:
                        continue
                    prefs.get_devices()
                    if any(d.type == kind for d in prefs.devices):
                        for d in prefs.devices:
                            d.use = d.type == kind
                        c.device = "GPU"
                        break
            r.use_persistent_data = True
        cam_d = bpy.data.cameras.new("vue")
        cam_d.lens, cam_d.sensor_fit, cam_d.sensor_width = O.LENS, "AUTO", 36.0
        cam_d.clip_start, cam_d.clip_end = 0.05, 12000.0
        cam = bpy.data.objects.new("vue", cam_d)
        scene.collection.objects.link(cam)
        scene.camera = cam
        me = bpy.data.meshes.new("berline_reperee")
        me.from_pydata([(x, y, z) for x in (-0.9, 0.9) for y in (-2.4, 2.4) for z in (0.25, 1.4)], [],
                       [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)])
        car = bpy.data.objects.new("berline_reperee", me)
        scene.collection.objects.link(car)
        print(f"[vue] groupe {g} : {', '.join(noms)} posés en {time.time() - t0:.0f} s", flush=True)
        passes = [(a.avant, False), (a.tag, True)] if (a.vie and a.avant) else [(a.tag, a.vie)]
        for tag, avec_vie in passes:
            if avec_vie:
                import vie
                fs = sorted({int(v[0][1:]) + d for v in todo if v[1] == g for d in (-1, 0, 1)})
                vie.poser(scene, plan=f"vues {g}", presents=set(noms), images=fs)
            for nom, _g, propre, hx, hy, cap in [v for v in todo if v[1] == g]:
                scene.frame_set(int(nom[1:]))
                # les faux lointains du lieu propre restent (son plan les rend), ceux des autres lieux sont cachés
                for ob in scene.objects:
                    if ob.get("ville_lointain"):
                        hide = ob.get("ville_lieu") != propre or bool(ob.get("ville_cache0"))
                        ob.hide_render = ob.hide_viewport = hide
                V.volumes(scene, False)                     # (les brumes sont des lointains de nom : cachées après)
                bpy.context.view_layer.update()
                dg = bpy.context.evaluated_depsgraph_get()
                ca = math.radians(cap)
                fx, fy = -math.sin(ca), math.cos(ca)
                cx = hx - P.CAM_BACK * fx - P.CAM_LEFT * fy
                cy = hy - P.CAM_BACK * fy + P.CAM_LEFT * fx

                def sol(x, y):
                    guess = P.sol_ville(x, y)              # le tablier du pont sur son emprise (motion.pont_profil)
                    hit = V._cast_down(scene, dg, x, y, guess + 3.0, depth=12.0)
                    return hit[0] if hit else guess

                gc, gh = sol(cx, cy), sol(hx, hy)
                car.location = (hx, hy, gh)
                car.rotation_euler = (0.0, 0.0, ca)
                out = O.aim(cx, cy, P.CAM_Z + gc - gh, hx, hy)
                yaw, pitch = math.radians(out[3]), math.radians(out[4])
                d = Vector((-math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
                cam.location = (cx, cy, gc + P.CAM_Z)
                cam.rotation_mode = "QUATERNION"
                cam.rotation_quaternion = d.to_track_quat("-Z", "Y")
                r.filepath = os.path.join(a.out, f"{nom}-{tag}.png")
                if a.sonde:
                    sonde(scene, cam, nom)
                bpy.ops.render.render(write_still=True)
                print(f"[vue] {nom} ({propre}) : berline ({hx:.1f} ; {hy:.1f} ; {gh:.2f}) cap {cap:.0f}°, caméra "
                      f"({cx:.1f} ; {cy:.1f} ; {gc + P.CAM_Z:.2f}) -> {r.filepath}", flush=True)
        print(f"[vue] groupe {g} en {time.time() - t0:.0f} s", flush=True)


if __name__ == "__main__":
    main()
