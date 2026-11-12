# Scène C, le pont : la lagune franchie par un pont routier de 320 m, de la ville au port (quatre voies, deux
# rampes droites à 6 %, crête arrondie à 7,2 m), puis 100 m plats sur le terre-plein du port ; et son plan P4,
# la meute (docs/cinematique-poursuite.md §2.4). P5 est au port (scene_e), P6 sur la jetée (scene_d).
#
# Construire et rendre un plan (une seule commande, sous le verrou commun) :
#
#   FILM3D_HERO=w111 lockf -k <verrou> nice -n 19 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
#     --factory-startup -P tools/film3d/render_lieux.py -- --lieu pont --plan P4 [--engine cycles --samples 32]
#
# écrit Azerit/design/film/ref/lieux/pont-P4-socle[-cadrage].png (render_lieux.py).
#
# Repère : le monde de l'eau de lieux.py. Axe du pont x = 0, la poursuite roule vers +y, de la ville vers le port.
#
#   y -420..-320   la rue de la ville, sur la promenade (lieux.distant_city laisse l'ouverture)
#   y -320..-255   le plat côté ville (60 m, le pied de la rampe en -255)
#   y -255..-130   la rampe à 6 %, crête arrondie sur 20 m en -130, à 7,2 m
#   y -130..  -5   la descente à 6 % (vue de P4), le pied en -5
#   y   -5.. 100   le plat : le tablier jusqu'au mur du port (y -20), puis le terre-plein (scene_e)
#
# Le profil en travers est celui de lieux.roadway : chaussée de 14 m bombée, trottoirs de 2 m, glissière en W,
# parapet en béton et garde-corps à 1,1 m, poutre de rive et caisson ; lampadaires des deux côtés tous les 30 m.
# Paliers : « socle » ; « haubans », le pylône en H à la crête et ses quatre éventails de câbles, sans rien
# changer au tablier (build_bridge(haubans=True), build_haubans).
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lieux as L  # noqa: E402

S, road = L.S, L.road

# ---------------------------------------------------------------- le tracé

Y_CITY_END = -1000.0  # l'avenue continue dans la ville, dans l'axe du pont (le fond de P4)
Y_START = -320.0      # le tablier quitte le quai de la ville
Y_FOOT_CITY = -255.0
Y_CREST = -130.0
Y_FOOT = -5.0         # pied de la rampe côté port
Y_PORT = -20.0        # le mur du quai du port : le tablier s'arrête là, le terre-plein prend la suite
Y_END = 100.0
GRADE = 0.06
T_SAG, T_CREST = 12.0, 20.0     # longueurs des raccords (pied, crête) : 6 % × (125 − 20/4) = 7,2 m

HALF = 7.0
WALK = 2.0
LAMP_YS = [Y_START + 10.0 + 30.0 * k for k in range(11)]     # -310 .. -10
PIERS = [Y_START + 20.0 + 35.0 * k for k in range(9)]        # -300 .. -20 : la dernière est la culée du port


def _grade(y):
    """La pente du tablier, raccords adoucis (linéaires en pente, donc paraboliques en hauteur)."""
    def ramp(y, a, t):
        return min(1.0, max(0.0, (y - (a - t / 2)) / t))
    return GRADE * (ramp(y, Y_FOOT_CITY, T_SAG) - 2 * ramp(y, Y_CREST, T_CREST) + ramp(y, Y_FOOT, T_SAG))


_Z = {}


def deck_z(y):
    """La hauteur de l'axe du tablier en y (intégrée par pas de 0,25 m, puis lue)."""
    if not _Z:
        z, yy, step = 0.0, Y_CITY_END - 10.0, 0.25
        while yy <= Y_END + 10.0:
            _Z[round(yy * 4)] = z
            z += _grade(yy + step / 2) * step
            yy += step
    k = y * 4
    k0 = math.floor(k)
    a, b = _Z.get(k0, 0.0), _Z.get(k0 + 1, _Z.get(k0, 0.0))
    return max(0.0, a + (b - a) * (k - k0))


def deck_slope(y):
    return deck_z(y + 0.5) - deck_z(y - 0.5)


def samples(y0, y1, fine=1.0, coarse=4.0):
    """Les stations du balayage : fines dans les raccords, plus lâches ailleurs."""
    out, y = [], y0
    while y < y1:
        out.append(y)
        curv = any(abs(y - c) < t * 0.7 for c, t in ((Y_FOOT_CITY, T_SAG), (Y_CREST, T_CREST), (Y_FOOT, T_SAG)))
        y += fine if curv else coarse
    out.append(y1)
    return out


# ---------------------------------------------------------------- le pont

def build_bridge(hidden, lamp_src, far=False, haubans=False):
    """Le pont entier : tablier, rampes, crête, glissières, parapets, garde-corps, caisson, piles, joints,
    lampadaires ; la rue de la ville en amont, le plat du port en aval. `far` : la version vue de loin (scènes D
    et E) sans les petites pièces. Rien ne change quand on ajoute le pylône (`haubans`, palier suivant)."""
    ys = samples(Y_START, Y_PORT)
    out = L.roadway("pont", ys, deck_z, half=HALF, walk=WALK, rail="parapet", glissiere=True, under="caisson",
                    lamp_src=lamp_src, lamp_ys=LAMP_YS, far=far)
    M = out["M"]
    edge = out["edge"]
    # le tablier, exposé au vent, sèche plus vite que l'avenue : un film d'eau plus mince (vernis à 0,3). À 1,5 m
    # au-dessus, l'enrobé tout mouillé étalait phares, lampadaires et flaques en un voile laiteux (P4)
    for m in (M["asphalt"], M["pan"]):
        for n in m.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED" and not n.inputs["Coat Weight"].is_linked:
                n.inputs["Coat Weight"].default_value = min(n.inputs["Coat Weight"].default_value, 0.3)
    # la rue de la ville et le plat du port : la même chaussée, sans bord (posée sur la promenade, sur le terre-plein)
    # l'avenue de la ville éclairée tous les 30 m (au 200 mm, la file de lampadaires au fond de la crête) ; le plat
    # du port suit le tablier : la rampe ne touche le niveau du terre-plein qu'en y = 1 (en y = -20 elle est encore à
    # 0,7 m ; plate, la chaussée du port y montrait la tranche du tablier en travers de P4)
    ave = [Y_START - 15.0 - 30.0 * k for k in range(int((Y_START - Y_CITY_END) / 30.0))]
    L.roadway("pont_ville", [Y_CITY_END, Y_START], half=HALF, walk=WALK, rail=None, M=M, far=far,
              lamp_src=None if far else lamp_src, lamp_ys=ave)
    L.roadway("pont_port", samples(Y_PORT, Y_END), deck_z, half=HALF, walk=WALK, rail=None, M=M, far=far)
    bm = L.bmesh.new()
    L.box_bm(bm, (-12.5, Y_START - 45.0, L.WATER_Z - 1.5), (12.5, Y_START, -0.01))  # la culée de la ville
    L.box_bm(bm, (-40.0, Y_CITY_END, -0.4), (40.0, Y_START - 45.0, -0.02))         # le sol de l'avenue
    L.mesh_object("pont_culee_ville", bm, [M["concrete"]])
    # les piles tous les 35 m : un chevêtre sous le caisson, deux fûts dans l'eau
    bm = L.bmesh.new()
    for y in PIERS[:-1]:
        zt = deck_z(y) - 1.9
        L.box_bm(bm, (-6.2, y - 1.0, zt - 1.3), (6.2, y + 1.0, zt))
        for x in (-4.2, 4.2):
            L.tube_bm(bm, (x, y, L.WATER_Z - 4.0), (x, y, zt - 1.2), 0.85, seg=20)
    L.mesh_object("pont_piles", bm, [M["concrete"]])
    if not far:
        # les joints : une bande d'acier mouillé qui épouse le bombé de la chaussée, 3 mm au-dessus. En boîte plate
        # à la hauteur de l'axe, le joint passait sous l'enrobé bombé et barrait tout le cadre de P4 d'un trait
        # noir au 200 mm (une fente dans l'image)
        joint = S.mat_plain("joint_dilatation", (0.42, 0.42, 0.44, 1), 0.22, 1.0)
        bm = L.bmesh.new()
        xs = [-HALF + 0.5 + (2 * HALF - 1.0) * k / 40 for k in range(41)]
        for yj in (Y_START + 1.0, -282.5, -177.5, -72.5, Y_PORT + 0.5):
            row = [(bm.verts.new((x, yj - 0.12, deck_z(yj - 0.12) + road.road_z(x) + 0.003)),
                    bm.verts.new((x, yj + 0.12, deck_z(yj + 0.12) + road.road_z(x) + 0.003))) for x in xs]
            for (a0, a1), (b0, b1) in zip(row, row[1:]):
                bm.faces.new((a0, b0, b1, a1))
        L.mesh_object("pont_joints", bm, [joint])
    if haubans:
        build_haubans(out)
    print(f"[pont] tablier {Y_START:.0f}..{Y_PORT:.0f} m, crête {deck_z(Y_CREST):.2f} m en y {Y_CREST:.0f}, "
          f"{len(out['lamps'])} lampadaires, {'vu de loin' if far else 'complet'}", flush=True)
    return out


# ---------------------------------------------------------------- le pylône et les haubans

PY_X = 11.0           # les deux jambes de part et d'autre du tablier (entraxe 22 m), 3 × 2 m
PY_H = 45.0           # hauteur au-dessus de la chaussée de crête
PY_BEAMS = (28.0, PY_H)                                   # les traverses
STAY_D = [16.0 + 12.0 * k for k in range(8)]              # les ancrages sur le tablier, 16 .. 100 m du pylône
STAY_R = 0.1


def build_haubans(out):
    """Le palier « haubans » : le pylône en H à la crête (deux jambes de 3 × 2 m qui montent de l'eau à 45 m
    au-dessus de la chaussée, une traverse sous le caisson, une à 28 m, une au sommet), deux nappes de huit
    haubans de chaque côté (Ø 0,2 m, ancrés tous les 12 m de 16 à 100 m du pylône, en éventail serré en tête de
    jambe), quatre projecteurs ambre au pied qui lèchent les jambes, un feu corail fixe au sommet. Le tablier
    ne change pas : les haubans tiennent la poutre de rive, juste au-dehors du parapet."""
    z0 = deck_z(Y_CREST)
    z_top = z0 + PY_H
    concrete = L.mat_concrete("pylone", tint=(0.66, 0.64, 0.61), streaks=1.4, scale=0.3)
    bm = L.bmesh.new()
    for sx in (-1, 1):
        x = sx * PY_X
        L.box_bm(bm, (x - 1.5, Y_CREST - 1.0, L.WATER_Z - 4.0), (x + 1.5, Y_CREST + 1.0, z_top))
        # le chapiteau : la tête de jambe un peu plus large, où s'ancrent les haubans
        L.box_bm(bm, (x - 1.7, Y_CREST - 1.2, z_top - 14.0), (x + 1.7, Y_CREST + 1.2, z_top + 0.6))
    # la traverse basse porte le caisson ; les deux autres raidissent le portique
    L.box_bm(bm, (-PY_X - 1.5, Y_CREST - 1.4, z0 - 4.2), (PY_X + 1.5, Y_CREST + 1.4, z0 - 1.9))
    for h in PY_BEAMS:
        L.box_bm(bm, (-PY_X + 1.5, Y_CREST - 0.9, z0 + h - 2.2), (PY_X - 1.5, Y_CREST + 0.9, z0 + h))
    L.mesh_object("pont_pylone", bm, [concrete])
    # les haubans : quatre éventails de huit, le plus long ancré le plus haut
    steel = L.mat_steel("hauban", color=(0.8, 0.81, 0.82), rough=0.28, rust=0.04, paint=True)
    xd = out["edge"] + 0.2
    bm = L.bmesh.new()
    n = len(STAY_D)
    for sx in (-1, 1):
        for sy in (-1, 1):
            for k, d in enumerate(STAY_D):
                zt = z_top - 1.6 - 1.5 * (n - 1 - k)
                y = Y_CREST + sy * d
                L.tube_bm(bm, (sx * PY_X, Y_CREST + sy * 1.25, zt), (sx * xd, y, deck_z(y) + 0.05), STAY_R, seg=8)
                # le culot d'ancrage sur la poutre de rive
                L.box_bm(bm, (sx * xd - 0.25, y - 0.4, deck_z(y) - 0.5), (sx * xd + 0.25, y + 0.4, deck_z(y) + 0.15))
    L.mesh_object("pont_haubans", bm, [steel], smooth=True)
    # quatre projecteurs ambre au pied, de part et d'autre de chaque jambe, le faisceau rasant la face
    housing = S.mat_plain("projecteur_boitier", (0.05, 0.05, 0.055, 1), 0.4, 0.6)
    bm = L.bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = Vector((sx * PY_X, Y_CREST + sy * 1.9, z0 + 0.25))
            L.box_bm(bm, (p.x - 0.35, p.y - 0.3, p.z - 0.25), (p.x + 0.35, p.y + 0.3, p.z + 0.15))
            Ld = bpy.data.lights.new(f"pylone_projecteur_{sx}_{sy}", "SPOT")
            Ld.color = L.lin(L.AMBER)[:3]
            Ld.energy = 25000.0
            Ld.spot_size = math.radians(22.0)
            Ld.spot_blend = 0.35
            Ld.shadow_soft_size = 0.2
            o = bpy.data.objects.new(Ld.name, Ld)
            bpy.context.scene.collection.objects.link(o)
            o.location = p + Vector((0, 0, 0.2))
            up = Vector((sx * PY_X, Y_CREST + sy * 1.0, z_top)) - o.location
            o.rotation_euler = up.to_track_quat("-Z", "Y").to_euler()
            o.visible_camera = False
    L.mesh_object("pont_projecteurs", bm, [housing])
    # le feu corail fixe au sommet, au milieu de la traverse haute
    bm = L.bmesh.new()
    L.bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.35,
                                matrix=L.Matrix.Translation((0.0, Y_CREST, z_top + 0.35)))
    L.mesh_object("pont_feu_sommet", bm, [L.emit_mat("feu_sommet", L.lin(L.CORAL), 60.0)]).visible_shadow = False
    Ld = bpy.data.lights.new("pont_feu_sommet_light", "POINT")
    Ld.color = L.lin(L.CORAL)[:3]
    Ld.energy = 400.0
    Ld.shadow_soft_size = 0.35
    o = bpy.data.objects.new(Ld.name, Ld)
    bpy.context.scene.collection.objects.link(o)
    o.location = (0.0, Y_CREST, z_top + 1.0)
    o.visible_camera = False
    print(f"[pont] haubans : pylône en H à {z_top:.1f} m, {4 * n} haubans de {STAY_D[0]:.0f} à {STAY_D[-1]:.0f} m",
          flush=True)


def road_point(x, y, lift=0.0):
    """Un point sur la chaussée (bombé compris)."""
    return Vector((x, y, deck_z(y) + road.road_z(x) + lift))


def place_on_deck(rig, x, y, heading=0.0):
    """Pose un véhicule sur le tablier : la hauteur et la pente du tablier sous lui."""
    pitch = math.degrees(math.atan(deck_slope(y)))
    return L.put(rig, x, y, deck_z(y) + road.road_z(x), heading, pitch)


# ---------------------------------------------------------------- le plan

SPEED = 30.0          # m/s, pleine vitesse (108 km/h)


def pack(entries, speed=SPEED, beams=True, on=None):
    """La meute : une patrouille chargée, les autres en copies liées ; (genre, x, y, cap) par véhicule ; `on`,
    la pose (place_on_deck par défaut). Renvoie la liste des rigs."""
    on = on or place_on_deck
    out, src = [], {}
    for i, (kind, x, y, heading) in enumerate(entries):
        if kind not in src:
            src[kind] = L.patrol("patrol") if kind == "patrol" else L.van("van")
            r = src[kind]
        else:
            r = L.clone(src[kind], f"{kind}_{i}")
        on(r, x, y, heading)
        if beams:
            yaw = 25 + 70 * ((i * 37) % 5) / 4
            L.bar_beams(r, f"{kind}_{i}", yaws=((yaw, L.CORAL), (yaw - 180 + 25 * (i % 3), L.LILAC)))
        L.drive(r, speed)
        out.append(r)
    return out


def p4_deck_puddles():
    """Les flaques du tablier pour P4 : sous le vernis plafonné à 0,3 du tablier (build_bridge), elles faisaient
    des taches noires dans le tiers bas, un miroir sombre qui ne renvoyait que le ciel. La recette de P2 et P3, dans
    les seules flaques de l'enrobé (le facteur de flaque de road.mat_asphalt) : fond 0,018, vernis plein, rugosité
    0,05, une ride fine ; elles renvoient les phares et les rampes. Le reste du tablier ne change pas."""
    done = []
    for m in bpy.data.materials:
        if not m.node_tree or not m.name.startswith("asphalt"):
            continue
        nt = m.node_tree
        mix = next((n for n in nt.nodes if n.type == "MIX" and n.data_type == "FLOAT" and not n.inputs[3].is_linked
                    and abs(n.inputs[3].default_value - 0.035) < 1e-6 and n.inputs["Factor"].is_linked), None)
        p = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED" and n.inputs["Coat Normal"].is_linked), None)
        if mix is None or p is None:
            continue
        N = S.Nodes(nt)
        w = mix.inputs["Factor"].links[0].from_socket          # la flaque, de 0 (humide) à 1
        mix.inputs[3].default_value = 0.05
        N.link(N.mixf(w, p.inputs["Coat Weight"].default_value, 1.0), p.inputs["Coat Weight"])
        col = p.inputs["Base Color"].links[0].from_socket
        N.link(N.mix(w, col, (0.018, 0.017, 0.018, 1)), p.inputs["Base Color"])
        cn = p.inputs["Coat Normal"].links[0].from_socket
        N.link(road.vmix(N, w, cn, road.ripples(N, road.coords(N)[0], scale=22.0, strength=0.12)), p.inputs["Coat Normal"])
        done.append(m.name)
    print(f"[P4] flaques du tablier à la recette de P3 : {done}", flush=True)


def p4_sky_veil(scene):
    """Le ciel de P4 : au 200 mm, l'objectif n'en voit que 10°, un aplat bleu sur le tiers haut. Un voile de nuages
    bas, étirés, éclairés par-dessous par la ville (mauve chaud), entre la crête du pont (site 2°) et 4,5° ; il
    s'efface avant les 12 % du haut (site 5°), qui restent calmes. Une lueur d'horizon sous le voile. Dans le ciel du
    monde, il passe aussi dans les reflets de la chaussée : pour eux (rayons réfléchis), voile et lueur montent
    jusqu'à 15°, car la rampe du pont incline les flaques vers le haut du ciel, le noir au-dessus du cadre."""
    nt = scene.world.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    sky = bg.inputs["Color"].links[0].from_socket
    N = S.Nodes(nt)
    tc = next(n for n in nt.nodes if n.type == "TEX_COORD")
    d = tc.outputs["Generated"]
    z = N.sep(d)[2]

    def ramp(a, b, v=z):
        r = N.new("ShaderNodeMapRange", _interpolation_type="SMOOTHSTEP")
        N.set(r.inputs["Value"], v)
        r.inputs["From Min"].default_value, r.inputs["From Max"].default_value = a, b
        return r.outputs[0]
    cam = N.new("ShaderNodeLightPath").outputs["Is Camera Ray"]
    band = N.math("MULTIPLY", ramp(0.028, 0.045), N.mixf(cam, ramp(0.30, 0.20), ramp(0.082, 0.062)))
    st = N.new("ShaderNodeMapping", Scale=(1.0, 1.0, 6.0))
    N.link(d, st.inputs[0])
    nz = N.new("ShaderNodeTexNoise", Scale=45.0, Detail=6.0, Roughness=0.6)
    N.link(st.outputs[0], nz.inputs["Vector"])
    fac = N.math("MULTIPLY", band, ramp(0.45, 0.72, nz.outputs["Fac"]))
    # le dessous des nuages pris par la ville : plus chaud et plus clair en bas du voile
    col = N.mix(ramp(0.07, 0.035), (0.16, 0.14, 0.30, 1), (0.42, 0.22, 0.32, 1))
    out = N.mix(N.math("MULTIPLY", fac, 0.9), sky, col)
    # la lueur d'horizon : une bande douce au-dessus de la crête, éteinte avant les 12 % du haut. Les flaques du
    # tablier, vues en rasant sur la rampe, renvoient ce ciel-là (site 2 à 15°) : mauves au lieu de noires
    glow = N.mixf(cam, N.math("MULTIPLY", ramp(0.30, 0.03), 0.45), N.math("MULTIPLY", ramp(0.085, 0.03), 0.6))
    out = N.mix(glow, out, (0.22, 0.13, 0.22, 1), "ADD")
    N.link(out, bg.inputs["Color"])
    print("[P4] voile de nuages bas et lueur d'horizon dans le ciel", flush=True)


def plan_P4(scene, hidden, haubans=False):
    """P4, la meute (découpage v3) : fixe en (1,2 ; 10 ; 1,2), face à la ville, 200 mm puis 212 mm, un léger suivi
    qui garde la berline au centre, à 54 % de la hauteur depuis le haut. Elle descend vers nous de 111 à 46 m (de 16
    à 44 % de large) ; derrière elle la meute empilée par la longue focale, quatre patrouilles de plus qui passent la
    crête (y -130) aux images 8, 18, 28 et 38 : six rampes au début, dix à la fin. Le tablier court jusqu'à y -320,
    l'avenue de la ville au-delà."""
    # la bande corail du ciel tournée à 70° de l'axe, vers la droite du cadre : dans l'axe, la chaussée mouillée,
    # vue en rasant à 1,5 m, la reflétait en un voile rose-blanc sur toute la moitié basse
    lamp_src = L.panorama(scene, hidden, yaw=math.pi - math.radians(70.0), bridge=None, port="loin")
    build_bridge(hidden, lamp_src, haubans=haubans)
    p4_deck_puddles()
    p4_sky_veil(scene)
    # --- animé (48 images, p4_pont.py, clés de motion.py)
    import motion as M
    import p4_pont as P4
    frames = range(P4.F0 - 1, P4.F0 + P4.FRAMES + 1)
    scene.frame_start, scene.frame_end = P4.F0, P4.F0 + P4.FRAMES - 1
    cam_y = P4.CAM[1]

    def ground(x, y):
        return deck_z(y) + road.road_z(x), math.degrees(math.atan(deck_slope(y)))

    hero = L.hero()
    wheels = L.hero_wheels(hero)
    d = [Vector(w.location).y for w in wheels]
    poses = M.sample(P4.hero_pos, frames, wheel_r=hero["wheel_r"], wheelbase=(max(d) - min(d)) if d else 2.9)
    M.key_vehicle(hero, poses, wheels=wheels, ground=ground)
    M.wheel_marks(wheels, hero["wheel_r"])
    # à contre-jour des lampadaires et des patrouilles, la berline n'était qu'une silhouette noire : une source
    # douce de face, à 8 m devant elle, accrochée à son rig (elle suit les clés), qui n'éclaire qu'elle (le sol
    # mouillé ne la reçoit pas)
    L.car_fill(hero, loc=(0.4, 8.0, 2.2), energy=500.0)
    y_hero = P4.hero_pos(P4.T_STILL)[1]
    entries = [(e[0], *P4.pack_pos(i)(P4.T_STILL), 0.0) for i, e in enumerate(P4.PACK)] + \
        [("van", *P4.van_pos(P4.T_STILL), 0.0)]
    rigs = pack(entries)
    fns = [P4.pack_pos(i) for i in range(len(P4.PACK))] + [P4.van_pos]
    for i, (r, fn) in enumerate(zip(rigs, fns)):
        # (roues séparées, cast_vehicles.split_wheels : elles tournent, l'avant braque ; trajectoire inchangée)
        body = M.body_of(r)
        wh, wr = M.wheels_of(body), body.get("wheel_r", 0.36)
        ps = M.sample(fn, frames, wheel_r=wr, seed=float(i + 1), wheelbase=body.get("wheelbase", 2.9),
                      front=body.get("front_axle"))
        M.key_vehicle(r, ps, wheels=wh, ground=ground, pivot=(0.0, 0.0, 0.36))
        M.wheel_marks(wh, wr, axis="Y")
    n = M.flash_bars(rigs, frames)
    # une brume légère et basse : au 200 mm, l'objectif regarde à travers 300 m d'air (à 0,0006 sur 70 m de haut,
    # les patrouilles du fond se voilaient)
    L.haze((-260, 260), (-420, 120), (L.WATER_Z, 30), 0.0002)
    cam = L.camera("cam_P4", P4.CAM, (P4.CAM[0], cam_y - 100.0, P4.CAM[2]), lens=P4.LENS, fstop=4.0,
                   focus=road_point(P4.HERO_X, y_hero, 0.8))     # sans décentrement : le site cadre la berline
    M.key_camera(cam, frames, P4.camera)
    cam.data.dof.focus_object = hero
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.5
    print(f"[P4] {len(frames)} images de clés ; berline de {cam_y - poses[1]['y']:.0f} à {cam_y - poses[-2]['y']:.0f} m "
          f"à {poses[1]['speed'] * 3.6:.0f} km/h, tangage {poses[1]['pitch']:.1f}° ; {n} lumières de rampe "
          f"clignotantes", flush=True)
    return cam


PLANS = {"P4": plan_P4}


def build(plan, palier="complet"):
    """« complet » (par défaut, celui du film : render_film.py n'en passe pas) prend tous les paliers validés, ici
    le pylône et ses haubans ; « socle » le pont nu (render_lieux.py --palier)."""
    scene, hidden = L.new_scene()
    cam = PLANS[plan](scene, hidden, haubans=(palier in ("haubans", "complet")))
    scene.camera = cam
    __import__("fx").dress(plan, scene)                 # les interactions (fx.py ; FILM3D_FX=0 les retire)
    import p4_pont as P4
    scene.frame_set(P4.STILL_FRAME if plan == "P4" else 2)
    return scene
