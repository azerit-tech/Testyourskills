# Le carrefour de la scène A, seul (docs/cinematique-poursuite.md §2.4, « le rond-point », le socle) : le plan P2,
# vu du drone. La voiture en fuite quitte l'avenue par un grand virage à gauche vers la rue transversale, deux
# patrouilles derrière. Seulement le croisement (y 120 à 134) et ses quatre angles, jamais l'avenue entière.
#
#   lockf -k <verrou> nice -n 10 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup \
#     -P tools/film3d/scene_carrefour.py
#   ... -P tools/film3d/render_b.py -- --scene scene-carrefour.blend [--engine workbench|cycles] [--samples 32]
#
# Écrit assets/scene-carrefour.blend, la caméra du plan posée. Variables : FILM3D_BLEND, FILM3D_HERO, FILM3D_DRIVER.
#
# Repère : celui de la scène A (l'avenue file vers +y, la ville à x < 0, l'océan à x > 0). La trajectoire et la
# caméra viennent de p2_arc.py, écrits une fois pour le socle et pour le rond-point (scène F) : ici, seulement la
# pose de l'arc. Le décor reprend les pièces de la scène A sans les modifier : la chaussée (road.build_street), les
# deux immeubles d'angle (facade_mix, dessins « liner » et « flats »), palmiers, feux, lampadaires, terrasses.
import math
import os
import random
import sys
import types

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.join(HERE, "lab")
for p in (HERE, LAB):
    if p not in sys.path:
        sys.path.insert(0, p)

import scene_a as A          # noqa: E402
import road                  # noqa: E402
import p2_arc as P           # noqa: E402

ASSETS = A.ASSETS
BLEND = os.environ.get("FILM3D_BLEND", "scene-carrefour.blend")
lin = A.lin
CORAL, LILAC, AMBER = A.CORAL, A.LILAC, A.AMBER
H, WALK, FRONT_X = A.ROAD_HALF, A.WALK, A.FRONT_X
STREET = (120.0, 134.0)       # la rue transversale
Y0, Y1 = 70.0, 175.0          # le décor : le carrefour et ses quatre angles, rien d'autre

# Où tombe l'arc de p2_arc.py : il quitte la voie extérieure côté océan (x = +5, road.LANES) et passe à 4 m de la
# bordure de l'angle côté ville (x = -7,2, y = 119,8) : centre du virage en (-25, 101), sortie dans la voie de droite
# de la rue transversale (y = 131).
POSE = (5.0, 101.0, 0.0)


def log(*a):
    print("[carrefour]", *a, flush=True)


def road_proxy():
    """scene_a vu par road.py, avec une seule rue transversale : la chaussée de l'avenue reste d'un seul tenant
    (quelques faces), les rues, regards et passages des autres carrefours ne sont pas construits."""
    Px = types.SimpleNamespace(**{k: getattr(A, k) for k in dir(A) if not k.startswith("__")})
    Px.SIDE_STREETS = [STREET]
    a, b = STREET

    def segments(y0, y1):
        return [(y0, a), (b, y1)]
    Px.segments = segments
    Px.in_street = lambda y, m=2.0: a - m < y < b + m
    return Px


def build_ground(M):
    road.build_street(road_proxy(), M, A.ROUTE)
    wall = A.mat_plain("sea_wall", lin("#d9d2c4"), 0.6)
    A.box("sea_wall", H + WALK, H + WALK + 0.35, Y0, Y1, 0.0, 0.85, wall)
    A.box("sea_wall_cap", H + WALK - 0.08, H + WALK + 0.45, Y0, Y1, 0.85, 0.95, M["trim"])
    A.box("beach", H + WALK, 34, Y0, Y1, -1.6, -1.5, A.mat_plain("wet_sand", lin("#3a332d"), 0.3))
    A.box("sea", 34, 120, Y0 - 40, Y1 + 40, -1.7, -1.6, A.mat_sea())


def build_corners(M, hidden):
    """Les deux immeubles des angles côté ville, de part et d'autre de la rue transversale, comme dans la scène A."""
    import scene_b as B
    protos = {}
    for key in ("liner", "flats"):
        ob, props, lights, spec = A.prototypes_one(M, key)
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        hidden.objects.link(ob)
        protos[key] = (ob, props, lights, spec)
    ac_parts = A.import_glb("exterior_aircon_unit/exterior_aircon_unit.gltf")
    ac_src = [A.source([o], f"ac_src_{i}", hidden) for i, o in enumerate(ac_parts)]
    tank_src = A.source(A.import_glb("water-tank.glb"), "tank_src", hidden)
    B.place(protos, "liner", (FRONT_X, 88.0, 0), 0.0, "#c8dcef", (ac_src, tank_src))
    B.place(protos, "flats", (FRONT_X, 136.0, 0), 0.0, "#f6efe0", (ac_src, tank_src))
    # derrière eux, le long de la rue transversale, un second rang qui ferme le coin gauche du cadre (vu du ciel,
    # des toits : sans lumières)
    B.place(protos, "flats", (FRONT_X - 16.0, 136.0, 0), 0.0, "#f2c6cf", (ac_src, tank_src), lights=False)
    B.place(protos, "liner", (FRONT_X - 18.0, 88.0, 0), 0.0, "#bfe3d6", (ac_src, tank_src), lights=False)
    log("4 immeubles d'angle")


def build_street_life(M, hidden):
    """Palmiers, feux du carrefour, lampadaires, terrasses : les pièces de la scène A, sur la fenêtre du décor."""
    a, b = STREET
    # --- les palmiers : royaux côté ville, cocotiers côté océan, grille au pied
    cocos = A.coconut_sources(hidden)
    royal = A.royal_source(hidden)
    sea = [(ob, ang) for ob, top, ang, off in cocos if 8.0 < top < 15.5 and off < 6.0]
    for o, *_ in cocos:
        if all(o is not s for s, _ in sea):
            bpy.data.objects.remove(o)
    k = 0
    rng = random.Random(4)
    for side, x, start, step in ((1, H + 2.4, 84.0, 13.0), (-1, -H - 1.6, 80.0, 17.0)):
        y = start
        while y < Y1 - 5:
            if side < 0 and a - 2.5 < y < b + 2.5:
                y += 6.0
                continue
            px, py = x + rng.uniform(-0.3, 0.3), y + rng.uniform(-1.5, 1.5)
            if side < 0:
                ob = A.instance(royal, f"palm_{k}", (px, py, 0.15), rng.uniform(0, math.tau), rng.uniform(0.85, 1.12))
            else:
                src, ang = rng.choice(sea)
                ob = A.instance(src, f"palm_{k}", (px, py, 0.15), -ang + rng.uniform(-0.6, 0.6), rng.uniform(0.9, 1.1))
            A.tree_grate(f"palm_{k}_grate", px, py)
            y += step
            k += 1
    # --- les feux du carrefour, à l'orange clignotant
    tl = A.import_glb("traffic-light.glb")
    amber = A.mat_emit("signal_amber", lin("#ffb347"), 30.0)
    dark = A.mat_plain("signal_off", (0.02, 0.02, 0.02, 1), 0.2)
    body = A.mat_plain("signal_body", lin("#2d3a2f"), 0.5, 0.4)
    for o in tl:
        o.data.materials.clear()
        o.data.materials.append(amber if "light_yellow" in o.name else dark if "light_" in o.name else body)
    head = A.source(tl, "signal_src", hidden)
    for side, yy, face in ((-1, a - 1.2, math.pi), (1, b + 1.2, 0.0)):
        xp = side * (H + 0.7)
        A.cyl(f"signal_pole_{side}", (xp, yy, 0.15), (xp, yy, 7.0), 0.13, body)
        A.cyl(f"signal_arm_{side}", (xp, yy, 6.4), (side * 1.0, yy, 6.4), 0.07, body)
        for hx in (side * 4.6, side * 2.0):
            A.instance(head, f"signal_{side}_{hx}", (hx, yy, 5.45), face, 1.0)
    # --- les lampadaires, tous les 30 m en quinconce, comme sur l'avenue
    parts = A.import_glb("streetlights.glb")
    mine = [o for o in parts if o.name.startswith("polySurface102")]
    for o in [o for o in parts if o not in mine]:
        bpy.data.objects.remove(o)
    lamp = A.join(mine, "lamp_src")
    metal, lhead = A.mat_plain("lamp_metal", (0.05, 0.05, 0.055, 1), 0.35, 0.8), A.mat_emit("lamp_head", lin(AMBER), 40.0)
    for i, m in enumerate(lamp.data.materials):
        lamp.data.materials[i] = lhead if m.name.startswith("light") else metal
    A.recentre(lamp)
    for c in list(lamp.users_collection):
        c.objects.unlink(lamp)
    hidden.objects.link(lamp)
    S = 1.75
    for k, (side, yy) in enumerate(((-1, 104.0), (-1, 142.0), (1, 88.0), (1, 118.0), (1, 148.0))):
        x = side * (H + 0.6)
        rot = math.pi / 2 if side < 0 else -math.pi / 2
        A.instance(lamp, f"lamp_{k}", (x, yy, 0.15), rot, S)
        hd = Vector((0, -1.68 * S, 4.68 * S))
        hd.rotate(Matrix.Rotation(rot, 3, "Z"))
        lo = A.add_light(f"lamp_light_{k}", "SPOT", Vector((x, yy, 0.15)) + hd - Vector((0, 0, 0.12)), (0, 0, -1),
                         lin(AMBER), 2600.0, spot=130)
        lo.data.spot_blend = 0.5
        lo.data.shadow_soft_size = 0.25
    # --- les terrasses de l'angle : tables, parasols, lampe chaude dessous ; jardinières le long de la rue
    terrace = A.source(A.import_glb("outdoor_table_chair_set_01/outdoor_table_chair_set_01.gltf"), "terrace_src", hidden)
    canvas = [A.mat_plain("parasol_cream", lin("#efe4cf"), 0.85), A.mat_plain("parasol_coral", lin("#e0704f"), 0.85)]
    for k, (xx, yy, c) in enumerate(((FRONT_X + 1.6, 94.0, 1), (FRONT_X + 1.6, 99.0, 1), (FRONT_X + 1.6, 104.0, 0),
                                     (FRONT_X + 1.6, 141.0, 0), (FRONT_X + 1.6, 146.0, 1))):
        A.instance(terrace, f"terrace_{k}", (xx, yy, 0.15), rng.uniform(-0.3, 0.3))
        A.parasol(f"parasol_{k}", xx, yy, canvas[c], M["metal"], light=True)
    conc = A.mat_concrete()
    soil = A.mat_plain("planter_soil", lin("#1c1612"), 0.9)
    shrub = A.source(A.import_glb("shrub_01/shrub_01.gltf"), "shrub_src", hidden)
    sd = shrub.dimensions
    ss = 1.0 / max(sd.x, sd.y, 0.01)
    for k, (yy) in enumerate((86.0, 112.0, 152.0)):
        A.box(f"planter_{k}", -H - 2.6, -H - 1.3, yy - 1.2, yy + 1.2, 0.15, 0.62, conc)
        A.box(f"planter_soil_{k}", -H - 2.5, -H - 1.4, yy - 1.1, yy + 1.1, 0.62, 0.64, soil)
        for j, dy in enumerate((-0.6, 0.15, 0.75)):
            A.instance(shrub, f"shrub_{k}_{j}", (-H - 1.95, yy + dy, 0.6), rng.uniform(0, math.tau), ss * rng.uniform(0.9, 1.25))
    # la lumière douce sur les deux angles, invisible à la caméra et dans les reflets (celle de l'avenue)
    for k, yy in enumerate((98.0, 146.0)):
        f = A.add_light(f"fill_{k}", "AREA", (0.5, yy, 9.0), (-1, 0, -0.18), lin("#ffd2c0"), 1200.0, (32.0, 9.0))
        f.visible_camera = f.visible_glossy = f.visible_transmission = False
    log("palmiers, feux, 5 lampadaires, 5 terrasses, 3 jardinières")


def spray_material(name="spray", density=6.0, glow=0.0):
    """La gerbe d'eau (celle de la scène A) : un volume bruité qui s'éteint vers le bord de sa sphère. Vue du ciel,
    loin des lampes, elle ne prend presque aucune lumière : glow lui donne une faible lueur propre (l'eau
    pulvérisée qui renvoie le ciel), assez pour qu'elle se lise sur la chaussée sombre."""
    m, N, out = A.material(name)
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    no = N.new("ShaderNodeTexNoise", Scale=4.0, Detail=6.0)
    N.link(co, no.inputs["Vector"])
    vl = N.new("ShaderNodeVectorMath", _operation="LENGTH")
    N.link(co, vl.inputs[0])
    fall = N.math("POWER", N.math("MAXIMUM", N.math("SUBTRACT", 1.0, vl.outputs["Value"]), 0.0), 1.5)
    dens = N.math("MULTIPLY", N.math("MULTIPLY", N.math("MAXIMUM", N.math("SUBTRACT", no.outputs["Factor"], 0.45), 0.0), fall), density)
    sv = N.new("ShaderNodeVolumePrincipled", Color=lin("#d8d4ea"), Anisotropy=0.5)
    N.link(dens, sv.inputs["Density"])
    if glow:
        sv.inputs["Emission Color"].default_value = lin("#cfd2ee")
        N.link(N.math("MULTIPLY", dens, glow), sv.inputs["Emission Strength"])
    N.link(sv.outputs[0], out.inputs["Volume"])
    return m


def mat_wake():
    """La trace des pneus dans l'eau : la gomme déposée sur l'enrobé chassé de sa pellicule d'eau, mate et plus
    sombre que la chaussée mouillée, effilochée par un bruit et fondue à son départ (u de 0 au début de la trace à 1
    sous la roue). (Claire, #8d8781 à 0,45 de rugosité, elle renvoyait les lampadaires : vue du drone, des traits
    lumineux.)"""
    m, N, out = A.material("tyre_wake")
    uv = N.new("ShaderNodeTexCoord")
    sep = N.sep(uv.outputs["UV"])
    no = N.new("ShaderNodeTexNoise", Scale=9.0, Detail=4.0)
    N.link(uv.outputs["Object"], no.inputs["Vector"])
    fade = N.math("POWER", N.math("MINIMUM", N.math("MULTIPLY", sep[0], 1.6), 1.0), 1.5)
    edge = N.math("SUBTRACT", 1.0, N.math("POWER", N.math("ABSOLUTE", N.math("SUBTRACT", N.math("MULTIPLY", sep[1], 2.0), 1.0)), 3.0))
    mask = N.math("MULTIPLY", N.math("MULTIPLY", fade, edge), N.math("ADD", 0.6, N.math("MULTIPLY", no.outputs["Factor"], 0.8)), clamp=True)
    bs = A.principled(N, **{"Base Color": lin("#1d1b1a"), "Roughness": 0.8, "Specular IOR Level": 0.25})
    tr = N.new("ShaderNodeBsdfTransparent")
    mx = N.new("ShaderNodeMixShader")
    N.link(mask, mx.inputs["Fac"])
    N.link(tr.outputs[0], mx.inputs[1])
    N.link(bs.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs["Surface"])
    return m


def wake(scene, wheels, spray_m, pose=POSE, anim=False):
    """Le sillage de la glissade, écrit depuis p2_arc.wheel_track : quatre traces de pneus posées sur la chaussée
    (lancer de rayon vers le bas, la bordure et le bombé suivis), et derrière la roue arrière extérieure une traîne
    de gerbes qui retombent. anim : les traces vont jusqu'au bout du plan et se dévoilent sous les roues
    (modificateur Construction, une face après l'autre, à la vitesse de la berline) ; la traîne suit la roue."""
    dg = bpy.context.evaluated_depsgraph_get()
    mat = mat_wake()
    t_end = 1.0 + 1.0 / (P.FRAMES - 1) if anim else P.STILL

    def ground(x, y):
        hit, loc, *_ = scene.ray_cast(dg, Vector((x, y, 0.12)), Vector((0, 0, -1)), distance=1.0)
        return (loc.z if hit else 0.0) + 0.004

    for name, (lx, ly, _) in wheels.items():
        rear = name.endswith(("BL", "BR"))
        pts = [P.to_scene(pose, x, y)[:2] for x, y in P.wheel_track(lx, ly, t=t_end)]
        s0, s1 = P.S0, P.s_of(P.THETA0) + t_end * (P.s_of(P.THETA1) - P.s_of(P.THETA0))
        if not rear:
            s0 += (s1 - s0) * (len(pts) // 3) / (len(pts) - 1)
            pts = pts[len(pts) // 3:]          # les roues avant ne marquent qu'une fois la caisse en travers
        w = 0.24 if rear else 0.2
        me = bpy.data.meshes.new(f"wake_{name}")
        verts, faces, uvs = [], [], []
        n = len(pts)
        for i, (x, y) in enumerate(pts):
            ax, ay = pts[min(i + 1, n - 1)][0] - pts[max(i - 1, 0)][0], pts[min(i + 1, n - 1)][1] - pts[max(i - 1, 0)][1]
            ln = math.hypot(ax, ay) or 1.0
            nx, ny = -ay / ln * w / 2, ax / ln * w / 2
            verts += [(x - nx, y - ny, ground(x - nx, y - ny)), (x + nx, y + ny, ground(x + nx, y + ny))]
            if i:
                faces.append((2 * i - 2, 2 * i, 2 * i + 1, 2 * i - 1))
        me.from_pydata(verts, [], faces)
        uv = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                uv.data[li].uv = ((vi // 2) / (n - 1), vi % 2)
        me.materials.append(mat)
        ob = bpy.data.objects.new(f"wake_{name}", me)
        scene.collection.objects.link(ob)
        ob.visible_shadow = False
        if anim:
            # la face i (de s0 à s1) paraît quand la roue y passe : le centre de la caisse à la même abscisse
            b = ob.modifiers.new("devoile", "BUILD")
            b.frame_start = P.frame_of_s(s0)
            b.frame_duration = max(1.0, P.frame_of_s(s1) - P.frame_of_s(s0))
    # la traîne : la roue arrière extérieure (à droite, -x dans le repère de la caisse) laisse retomber l'eau
    lx, ly, _ = wheels.get("wheel_BR", wheels.get("wheel_BL"))
    lx = -abs(lx)
    pts = [P.to_scene(pose, x, y)[:2] for x, y in P.wheel_track(lx - 0.4, ly)]
    for k, back in enumerate((5, 9, 14, 20)):
        x, y = pts[max(0, len(pts) - 1 - back)]
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=1.0, location=(x, y, 0.25))
        sp = bpy.context.active_object
        sp.name = f"spray_trail_{k}"
        sp.data.materials.append(spray_m)
        sc = 1.0 - 0.18 * k
        sp.scale = (0.9 * sc, 0.9 * sc, 0.35 * sc)
        sp.visible_shadow = False
        if anim:
            # la gerbe suit la roue à `back` pas de 0,5 m derrière elle, image par image (clés simples)
            for f in range(P.F0 - 1, P.F0 + P.FRAMES + 1):
                q = P.wheel_track(lx - 0.4, ly, t=(f - P.F0) / (P.FRAMES - 1))
                sp.location = (*P.to_scene(pose, *q[max(0, len(q) - 1 - back)])[:2], 0.25)
                sp.keyframe_insert("location", frame=f)


def place_cars(scene, pose=POSE, anim=False):
    """La berline et les deux patrouilles de p2_arc posées sur le décor (pose : voir p2_arc.to_scene). anim : le
    plan animé (28 images, motion.py), posé à l'image de l'instant STILL comme l'image fixe."""
    import cast_vehicles as cv
    import scene_b as B
    poses = {k: P.to_scene(pose, x, y, h) + (yb + pose[2],) for k, (x, y, h, yb) in P.cars().items()}
    # la berline : l'avant vers -y dans son repère, la caisse tournée du contre-braquage, roues avant braquées
    # vers l'extérieur, gerbes d'eau des roues arrière qui s'étirent le long de l'arc
    car = A.street_hero(scene)
    x, y, h, yb = poses["hero"]
    car.location = (x, y, 0.0)
    car.rotation_euler = (0, 0, math.radians(yb + 180.0))
    for w in car.children:
        if w.name in ("wheel_FL", "wheel_FR"):
            w.rotation_euler.z = math.radians(-16.0)
    for lo in [c for c in car.children_recursive if c.type == "LIGHT" and c.data.type == "SPOT"]:
        lo.data.energy = 1400.0
        lo.data.spot_size = math.radians(50)
    sm = spray_material("spray", 14.0, 0.08)
    sx, sy = car["half_track"] + 0.25, car["length"] / 2 + 0.9
    for side in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1.0)
        sp = bpy.context.active_object
        sp.name = f"spray_{side}"
        sp.data.materials.append(sm)
        sp.parent = car
        # la gerbe extérieure (à droite dans le virage à gauche) plus large : l'arrière glisse de ce côté
        sp.location = (side * sx + (0.35 if side < 0 else 0.0), sy, 0.3)
        sp.scale = (1.0 if side < 0 else 0.6, 2.6, 0.55)
        sp.visible_shadow = False
    wheels = {w.name: Vector(w.location) for w in car.children if w.name.startswith("wheel_")}
    wake(scene, wheels, sm, pose, anim=anim)
    # une lumière douce au-dessus de la berline, invisible à la caméra et dans les reflets : le bordeaux de la
    # caisse se lit du ciel (la rue n'y pose que des taches ambre)
    f = A.add_light("hero_fill", "AREA", (x, y, 7.0), (0, 0, -1), lin("#ffd8c8"), 260.0, (3.0, 5.0))
    f.visible_camera = f.visible_glossy = f.visible_transmission = False
    # les deux patrouilles (l'avant vers +x dans leur repère), rampes allumées, leurs flaques de couleur
    pat = cv.load_patrol("jeandiz", lights_on=True, name="patrol_1")
    cars = [pat["body"], B.dup_tree(pat["body"], None, "2")]
    for sh in [c for c in bpy.data.collections if c.name.endswith("_glow_exclude")]:
        for co in sh.collection_objects:
            co.light_linking.link_state = "EXCLUDE"
    for body, key in zip(cars, ("patrol_1", "patrol_2")):
        x, y, h, yb = poses[key]
        body.location = (x, y, 0.0)
        body.rotation_euler = (0, 0, math.radians(yb + 90.0))
        B.bar_glow(body, key)
        # vues du ciel, les rampes posent sur le mouillé une flaque corail d'un côté, lilas de l'autre
        bpy.context.view_layer.update()
        for side, col in ((1, CORAL), (-1, LILAC)):
            p = body.matrix_world @ Vector((-0.1, side * 0.6, 2.1))
            t = body.matrix_world @ Vector((1.5, side * 4.5, 0.0))
            lo = A.add_light(f"pool_{key}_{side}", "SPOT", p, t - p, lin(col), 9000.0, spot=70)
            lo.data.spot_blend = 0.9
            lo.visible_glossy = False
    log("berline : " + ", ".join(f"{k} ({v[0]:.1f}, {v[1]:.1f}) cap {v[2]:.0f}°" for k, v in poses.items()))
    if anim:
        animate(scene, car, f, cars, pose)
    return car


def animate(scene, car, fill, patrols, pose=POSE):
    """Le plan P2 en clés calculées (motion.py) depuis la trajectoire de p2_arc, inchangée : chaque véhicule mis
    sur un rig (ses lumières posées à part le suivent), la berline en glisse (roulis vers l'extérieur, roues qui
    tournent, avant braqué du contre-braquage), les patrouilles derrière, rampes clignotantes. Les roues des
    patrouilles sont séparées (cast_vehicles.split_wheels) : elles tournent et l'avant braque."""
    import motion as M
    frames = range(P.F0 - 1, P.F0 + P.FRAMES + 1)
    scene.frame_start, scene.frame_end = P.F0, P.F0 + P.FRAMES - 1

    def in_scene(fn):
        return lambda t: P.to_scene(pose, *fn(t))[:2]

    t0 = P.STILL * P.T_END
    wheels = [w for w in car.children if w.name.startswith("wheel_")]
    d = [Vector(w.location).y for w in wheels]
    wb = (max(d) - min(d)) if d else 2.9
    head = P.to_scene(pose, 0.0, 0.0, P.point(P.s_hero(t0))[2] + P.hero_slip(t0))[2]
    rig = M.rig_up(car, head, "rig_berline", extras=[fill])
    poses = M.sample(in_scene(P.hero_pos), frames, slip=P.hero_slip, wheel_r=car["wheel_r"], wheelbase=wb)
    M.key_vehicle(rig, poses, wheels=wheels, body=car)
    M.wheel_marks(wheels, car["wheel_r"])
    rigs = []
    for i, (body, key) in enumerate(zip(patrols, ("patrol_1", "patrol_2"))):
        s = P.s_hero(t0) - P.patrol_gap(i)
        lights = [o for o in bpy.data.objects if o.name.startswith((f"bar_glow_{key}_", f"pool_{key}_"))]
        r = M.rig_up(body, P.to_scene(pose, 0.0, 0.0, P.point(s)[2] + P.patrol_slip(i)(t0))[2], f"rig_{key}",
                     extras=lights)
        # (ses roues sont séparées, cast_vehicles.split_wheels : elles tournent et l'avant braque ; la trajectoire,
        # le roulis et le tangage ne dépendent pas du rayon ni de l'empattement)
        wh, wr = M.wheels_of(body), body.get("wheel_r", 0.36)
        ps = M.sample(in_scene(P.patrol_pos(i)), frames, slip=P.patrol_slip(i), wheel_r=wr, seed=float(i + 1),
                      wheelbase=body.get("wheelbase", 2.9), front=body.get("front_axle"))
        M.key_vehicle(r, ps, wheels=wh, pivot=(0.0, 0.0, 0.36), body=body)
        M.wheel_marks(wh, wr, axis="Y")
        rigs.append(r)
    n = M.flash_bars(rigs, frames)
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.5
    scene.frame_set(int(round(P.F0 + t0 * P.FPS)))
    a, b = poses[1], poses[-2]
    log(f"P2 animé : {len(frames)} images de clés, berline {a['speed'] * 3.6:.0f} km/h, roulis {a['roll']:.1f} à "
        f"{b['roll']:.1f}°, braquage {a['steer']:.1f} à {b['steer']:.1f}°, {n} lumières de rampe clignotantes")


def drone(scene, pose=POSE, anim=False):
    """Le drone de p2_arc : à la verticale, le haut du cadre tourné vers le cap de la voiture ; anim : il tourne
    de CAM_TURN degrés pendant le plan (clés de motion.py)."""
    cx, cy, cz, yaw, lens = P.camera()
    x, y, a = P.to_scene(pose, cx, cy, yaw)
    cam = bpy.data.cameras.new("cam")
    cam.lens = lens
    cam.sensor_fit = "AUTO"
    cam.sensor_width = 36
    cam.clip_start = 0.5
    cam.clip_end = 2000
    co = bpy.data.objects.new("cam", cam)
    scene.collection.objects.link(co)
    co.location = (x, y, cz)
    co.rotation_euler = (0, 0, math.radians(a))
    scene.camera = co
    if anim:
        import motion as M
        M.key_object(co, range(P.F0 - 1, P.F0 + P.FRAMES + 1),
                     lambda t: (x, y, cz, P.to_scene(pose, 0.0, 0.0, P.drone_yaw(t))[2], 0.0, 0.0))
        scene.frame_set(scene.frame_current)
    return co


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    random.seed(7)
    hidden = bpy.data.collections.new("sources")
    scene.collection.children.link(hidden)
    M = A.city_mats()
    build_ground(M)
    build_corners(M, hidden)
    build_street_life(M, hidden)
    place_cars(scene)
    for c in bpy.data.collections:
        if c.name == "sources" or c.name.startswith("sources."):
            c.hide_render = True
            c.hide_viewport = True
    A.make_world(scene)

    co = drone(scene)
    x, y, cz = co.location
    a, lens = math.degrees(co.rotation_euler.z), co.data.lens
    A.render_settings(scene)
    scene.render.use_motion_blur = False
    out = os.path.join(ASSETS, BLEND)
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    log(f"écrit {out} (drone à ({x:.1f}, {y:.1f}, {cz:.0f}), lacet {a:.0f}°, {lens:.0f} mm ; "
        f"{len(bpy.data.objects)} objets, {len([o for o in bpy.data.objects if o.type == 'LIGHT'])} lumières)")


if __name__ == "__main__":
    build()
