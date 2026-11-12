# Le commun des lieux au bord de l'eau, scènes C (le pont), D (la jetée et la pointe) et E (le port) : le
# panorama (le ciel tourné, la lagune, la brume, la ville lointaine, l'autre rive, le pont et le port vus de loin),
# la chaussée sur pilotis ou sur quai (`roadway`, la même pour le pont, la jetée et les voies du port), les quais
# de pierre, les lampadaires, la voiture poursuivie et les poursuivants, les agents figés, les caméras, le rendu.
# Rien ici ne construit un lieu : scene_c.py, scene_d.py (et le futur scene_e.py) s'en servent ; render_lieux.py
# les assemble et rend (docs/cinematique-poursuite.md §2.4).
#
# À importer depuis Blender (les scripts du dossier sont déjà sur sys.path) :
#
#   import lieux as L
#   scene, hidden = L.new_scene()                      # scène vide, réglages de rendu du film (scene_a.render_settings)
#   lamp_src = L.panorama(scene, hidden, bridge="loin", port="loin", all_lit=False)
#   L.roadway("jetee", ys, x0=80.0, half=4.0, rail="quai", lamp_src=lamp_src)
#   L.haze((-300, 300), (-400, 470), (L.WATER_Z, 60), 0.0012)
#   hero = L.hero()                                    # la berline (FILM3D_HERO), conducteur assis : un rig
#   pat = L.patrol(); van = L.van(); heli, h = L.helicopter(); jet = L.jet()
#   L.put(rig, x, y, z, heading, pitch); L.drive(rig, speed); L.clone(rig, "patrol_2"); L.bar_beams(rig, "tag")
#   cop = L.officer("guard"); L.face(cop, cible)
#   L.camera("cam_P4", loc, target, lens=200, fstop=2.8, focus=...)
#
# Le repère commun des scènes C, D et E (le « monde de l'eau ») : z en haut, z = 0 au niveau du tablier plat, des
# quais, de la jetée et de la pointe, l'eau à WATER_Z = -1,5 m. La voiture en fuite roule vers +y dans toutes les
# scènes, x positif à sa droite ; les cotes du §2.4 se lisent directement :
#
#   le pont (scene_c)    axe x = 0, de y = -320 (quai de la ville) à y = 0 (pied de la rampe, côté port)
#   le port (scene_e)    terre-plein x -60..100, y -20..100 ; la voie du pont jusqu'à y = 80, la voie du quai
#                        (axe y = 70) de x = 0 à x = 80, puis le virage à gauche vers la jetée
#   la jetée (scene_d)   axe x = 80, de y = 100 à y = 400 ; la pointe centrée en (80, 430), rayon 30
#   la ville             au-delà du quai de la ville (y < -325), vers -y ; l'autre rive loin vers +y
#
# Un « rig » est un vide dont le +y local est l'avant du véhicule ; le corps en est l'enfant, tourné une fois pour
# toutes. `heading` en degrés, sens trigonométrique : 0 vers +y, 90 vers -x. Les rigs se posent par put(), se
# clonent par clone() (maillages et lumières partagés : vingt patrouilles pèsent le poids d'une).
#
# Le ciel : celui de scene_a.make_world, tourné de 180° (yaw = pi) : la bande corail passe derrière la ville, vers
# -y (la triche assumée du §2.4). Toutes les caméras des scènes C, D et E regardent la ville.
#
# Les modèles et textures : $FILM3D_ASSETS (Azerit/design/film/assets), crédités dans CREDITS.md.
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.join(HERE, "lab")
for p in (HERE, LAB):
    if p not in sys.path:
        sys.path.insert(0, p)

import scene_a as S  # noqa: E402  (matières, nœuds, ciel, réglages de rendu ; rien ne s'exécute à l'import)
import road  # noqa: E402

road.S = S
ASSETS = S.ASSETS
FILM = os.path.dirname(ASSETS)
lin = S.lin
CORAL, LILAC, AMBER, CREAM, NAVY, INDIGO = S.CORAL, S.LILAC, S.AMBER, S.CREAM, S.NAVY, S.INDIGO
ST = road.STYLES["sechage"]        # la chaussée qui sèche, le choix de Jacques

WATER_Z = -1.5                     # le plan d'eau, 1,5 m sous le tablier plat, les quais, la jetée et la pointe

# le monde de l'eau (voir l'en-tête)
BRIDGE_X, BRIDGE_Y = 0.0, (-320.0, 0.0)
PORT_XS, PORT_YS = (-60.0, 100.0), (-20.0, 100.0)
QUAY_Y = 70.0                      # l'axe de la voie du quai, au port
JETTY_X, JETTY_YS = 80.0, (100.0, 400.0)
POINTE = (80.0, 430.0)
POINTE_R = 30.0
CITY_SHORE_Y = -325.0              # le quai de la ville, au bout du pont
FAR_SHORE_Y = 3600.0


# ---------------------------------------------------------------- la scène

def new_scene():
    """Scène vide, collection cachée des sources, réglages de rendu du film."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    hidden = bpy.data.collections.new("sources")
    scene.collection.children.link(hidden)
    hidden.hide_render = True
    hidden.hide_viewport = True
    S.render_settings(scene)
    scene.render.use_motion_blur = False
    scene.render.motion_blur_shutter = 0.5
    scene.frame_start, scene.frame_end = 1, 3
    return scene, hidden


def sky(scene, yaw=math.pi):
    """Le ciel du film (scene_a.make_world), tourné de `yaw` autour de z : la bande corail, d'abord vers +y,
    passe vers (−sin yaw, cos yaw). L'HDRI tourne avec elle."""
    S.make_world(scene)
    if not yaw:
        return scene.world
    nt = scene.world.node_tree
    tc = next(n for n in nt.nodes if n.type == "TEX_COORD")
    rot = nt.nodes.new("ShaderNodeVectorRotate")
    rot.rotation_type = "Z_AXIS"
    rot.inputs["Angle"].default_value = -yaw
    links = [l for l in nt.links if l.from_node == tc and l.from_socket.name == "Generated"]
    targets = [l.to_socket for l in links]
    for l in links:
        nt.links.remove(l)
    nt.links.new(tc.outputs["Generated"], rot.inputs["Vector"])
    for t in targets:
        nt.links.new(rot.outputs["Vector"], t)
    return scene.world


# ---------------------------------------------------------------- petites géométries

def mesh_object(name, bm, mats, coll=None, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def sweep(name, profile, ys, zfun, mat, closed=False, smooth=False, xfun=None):
    """Un profil (x, z) tiré le long de y, posé à la hauteur zfun(y) (et décalé de xfun(y) en x) : les rampes du
    pont, ses glissières, ses garde-corps. Les normales sont remises vers l'extérieur."""
    bm = bmesh.new()
    rows = []
    for y in ys:
        dz = zfun(y)
        dx = xfun(y) if xfun else 0.0
        rows.append([bm.verts.new((x + dx, y, z + dz)) for x, z in profile])
    n = len(profile)
    for a, b in zip(rows, rows[1:]):
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if closed and n > 2:
        bm.faces.new(rows[0][::-1])
        bm.faces.new(rows[-1])
    ob = mesh_object(name, bm, [mat], smooth=smooth)
    me = ob.data
    if not closed and sum(p.normal.z for p in me.polygons) < 0:
        me.flip_normals()
    return ob


def tube_bm(bm, p0, p1, r, seg=8, mat=0):
    """Un cylindre dans un bmesh, de p0 à p1."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    q = d.to_track_quat("Z", "Y")
    M = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4()
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=d.length, matrix=M)
    for v in res["verts"]:
        for f in v.link_faces:
            f.material_index = mat
            f.smooth = True


def box_bm(bm, lo, hi, mat=0):
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    vs = [bm.verts.new((x, y, z)) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
    for f in [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]:
        bm.faces.new([vs[i] for i in f]).material_index = mat


def emit_mat(name, color, strength):
    return S.mat_emit(name, color if len(color) == 4 else (*color, 1), strength)


# ---------------------------------------------------------------- matières communes

def coords(N):
    return road.coords(N)


def mat_concrete(name, tint=(0.62, 0.6, 0.57), wet_foot=None, streaks=1.0, scale=0.45):
    """Béton coulé (photo Concrete Floor 01 projetée en boîte) : coulures verticales sous les arêtes,
    taches, pied mouillé et plus sombre sous `wet_foot` (z monde)."""
    m, N, out = S.material(name)
    P, O = coords(N)
    _, _, pz = N.sep(P)
    f = os.path.join(ASSETS, "concrete_floor_01")
    uv = road.mapping(N, P, scale=(scale,) * 3)
    diff = road.tex(N, os.path.join(f, "diff_1k.jpg"), uv, box=True)
    rough = road.tex(N, os.path.join(f, "rough_1k.jpg"), uv, color=False, box=True)
    bw = N.new("ShaderNodeRGBToBW")
    N.link(diff, bw.inputs[0])
    var = N.mixf(0.65, 1.0, N.math("DIVIDE", bw.outputs[0], 0.18))
    col = N.mix(1.0, (*tint, 1), road.grey(N, var), "MULTIPLY")
    # coulures : un bruit très étiré en z, plus fort en haut des faces
    st = road.smooth(N, road.noise(N, P, 1.4, 3.0, stretch=(1.0, 1.0, 0.04)), 0.52, 0.72)
    col = N.mix(N.math("MULTIPLY", st, 0.55 * streaks), col, N.mix(1.0, col, (0.42, 0.42, 0.42, 1), "MULTIPLY"))
    stain = road.smooth(N, road.noise(N, P, 0.35, 4.0), 0.45, 0.75)
    col = N.mix(N.math("MULTIPLY", stain, 0.4), col, N.mix(1.0, col, (0.7, 0.68, 0.66, 1), "MULTIPLY"))
    r = N.math("MULTIPLY", rough, 0.95)
    if wet_foot is not None:
        foot = road.inv(N, road.smooth(N, pz, wet_foot - 0.4, wet_foot + 0.6))
        col = N.mix(N.math("MULTIPLY", foot, 0.8), col, N.mix(1.0, col, (0.38, 0.4, 0.38, 1), "MULTIPLY"))
        r = N.mixf(foot, r, 0.25)
    geo = N.new("ShaderNodeNewGeometry").outputs["Normal"]
    n = road.bump(N, N.math("ADD", bw.outputs[0], N.math("MULTIPLY", st, -0.3)), geo, 0.25, 0.01)
    p = S.principled(N)
    N.link(col, p.inputs["Base Color"])
    N.link(r, p.inputs["Roughness"])
    N.link(n, p.inputs["Normal"])
    p.inputs["Coat Weight"].default_value = 0.35
    p.inputs["Coat IOR"].default_value = 1.33
    p.inputs["Coat Roughness"].default_value = 0.25
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_steel(name, color=(0.5, 0.52, 0.53), rough=0.38, rust=0.25, paint=False):
    """Acier galvanisé (ou peint, `paint`) : rugosité qui varie, voile de saleté, piqûres de rouille."""
    m, N, out = S.material(name)
    P, _ = coords(N)
    v = road.noise(N, P, 3.0, 5.0, 0.6)
    dirt = road.smooth(N, road.noise(N, P, 0.8, 4.0, stretch=(1.0, 1.0, 0.25)), 0.45, 0.75)
    rs = road.smooth(N, road.noise(N, P, 9.0, 6.0, 0.7), 0.66, 0.74)
    col = N.mix(N.math("MULTIPLY", dirt, 0.5), (*color, 1), (color[0] * 0.45, color[1] * 0.43, color[2] * 0.4, 1))
    col = N.mix(N.math("MULTIPLY", rs, rust), col, lin("#4a2a18"))
    p = S.principled(N)
    N.link(col, p.inputs["Base Color"])
    N.link(N.mixf(v, rough * 0.7, rough * 1.4), p.inputs["Roughness"])
    p.inputs["Metallic"].default_value = 0.0 if paint else 0.85
    if paint:
        p.inputs["Coat Weight"].default_value = 0.5
        p.inputs["Coat Roughness"].default_value = 0.2
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_water(name="lagune", kind="lagune"):
    """L'eau calme de nuit : presque noire, un miroir que des rides cassent en traînées. Les rides sont plus
    longues en travers (x) qu'en long : vus depuis le pont ou la pointe, les reflets des lampadaires, des
    gyrophares et des fenêtres s'étirent vers la caméra. `kind` : « lagune » (plate) ou « ocean » (houle)."""
    m, N, out = S.material(name)
    P = N.new("ShaderNodeNewGeometry").outputs["Position"]
    k = 1.0 if kind == "lagune" else 2.2
    swell = road.noise(N, P, 0.035 / k, 3.0, 0.5, stretch=(0.35, 1.0, 1.0))
    mid = road.noise(N, P, 0.45, 3.0, 0.55, stretch=(0.3, 1.0, 1.0))
    fine = road.noise(N, P, 3.2, 2.0, 0.5, stretch=(0.5, 1.0, 1.0))
    geo = N.new("ShaderNodeNewGeometry").outputs["Normal"]
    n = road.bump(N, swell, geo, 0.12 * k, 0.6)
    n = road.bump(N, mid, n, 0.10 * k, 0.08)
    n = road.bump(N, fine, n, 0.05, 0.01)
    # plaques plus lisses (nappes d'huile, zones à l'abri) et plus ridées
    calm = road.smooth(N, road.noise(N, P, 0.012, 2.0), 0.4, 0.62)
    r = N.mixf(calm, 0.055, 0.018)
    p = S.principled(N, **{"Base Color": (0.0035, 0.0055, 0.008, 1), "IOR": 1.33, "Specular IOR Level": 0.5})
    N.link(r, p.inputs["Roughness"])
    N.link(n, p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def water(name, xs, ys, z=WATER_Z, kind="lagune", mat=None):
    """Un plan d'eau rectangulaire (un seul quadrilatère, la matière fait tout)."""
    bm = bmesh.new()
    (x0, x1), (y0, y1) = xs, ys
    vs = [bm.verts.new(v) for v in ((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z))]
    bm.faces.new(vs)
    ob = mesh_object(name, bm, [mat or mat_water(f"{name}_water", kind)])
    ob.visible_shadow = False
    return ob


def haze(xs, ys, zs, density=0.0012, name="haze", color="#b8b4d8", anisotropy=0.45):
    """La brume d'après la pluie : un volume homogène (les faisceaux et les halos y prennent corps)."""
    m, N, out = S.material(name)
    vol = N.new("ShaderNodeVolumePrincipled", Color=lin(color), Density=density, Anisotropy=anisotropy)
    N.link(vol.outputs[0], out.inputs["Volume"])
    ob = S.box(name, xs[0], xs[1], ys[0], ys[1], zs[0], zs[1], m)
    # la boîte de scene_a a ses faces tournées vers l'intérieur : Cycles croirait la caméra hors du volume et ne
    # poserait la brume qu'au-delà de la boîte, jamais autour d'elle (les faisceaux ne s'y voyaient pas)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.visible_shadow = False
    return ob


# ---------------------------------------------------------------- la ville lointaine

def mat_city(name="city_far", haze_color="#4a4b8e", fade=1700.0, lit_frac=None):
    """Les immeubles vus de l'eau, la nuit : enduit sombre, fenêtres en grille dont la plupart sont noires.
    L'allumage se décide par immeuble (un sur cinq presque éteint), par étage (des étages entiers allumés ou
    noirs) et par fenêtre ; les fenêtres allumées varient en teinte (ambre surtout, quelques blanches, de rares
    froides ou d'un vert de néon) et en intensité (rideaux, lampes de bureau). Le pied des façades est lavé par
    la rue. La perspective aérienne est peinte dans la matière (la brume de 300 m à 1,5 km coûterait trop cher en
    volume) : plus c'est loin, plus c'est fondu dans la couleur de l'horizon.
    `lit_frac` : la part moyenne de fenêtres allumées (par défaut 6 à 32 % selon l'immeuble ; 0,5 pour la ville
    « toutes fenêtres allumées » de P6 et FIN6, qui reste une ville et pas un aplat)."""
    m, N, out = S.material(name)
    geo = N.new("ShaderNodeNewGeometry")
    P, Nn = geo.outputs["Position"], geo.outputs["Normal"]
    px, py, pz = N.sep(P)
    nx, ny, nz = N.sep(Nn)
    oi = N.new("ShaderNodeObjectInfo")
    rnd = oi.outputs["Random"]
    # la coordonnée horizontale le long de la façade
    face_y = N.math("GREATER_THAN", N.math("ABSOLUTE", ny), N.math("ABSOLUTE", nx))
    u = N.mixf(face_y, py, px)
    cw, ch = 3.4, 3.15
    fu = N.math("FRACT", N.math("DIVIDE", u, cw))
    fz = N.math("FRACT", N.math("DIVIDE", N.math("SUBTRACT", pz, 0.6), ch))
    win = N.math("MULTIPLY", N.math("MULTIPLY", N.math("GREATER_THAN", fu, 0.2), N.math("LESS_THAN", fu, 0.8)),
                 N.math("MULTIPLY", N.math("GREATER_THAN", fz, 0.28), N.math("LESS_THAN", fz, 0.82)))
    wall = N.math("LESS_THAN", N.math("ABSOLUTE", nz), 0.5)
    win = N.math("MULTIPLY", win, wall)
    win = N.math("MULTIPLY", win, N.math("GREATER_THAN", pz, 3.0))
    seed = N.math("ADD", N.math("MULTIPLY", rnd, 97.0), N.math("MULTIPLY", face_y, 13.0))
    floor_i = N.math("FLOOR", N.math("DIVIDE", pz, ch))
    cell = road.combine(N, N.math("FLOOR", N.math("DIVIDE", u, cw)), floor_i, seed)
    w1 = N.new("ShaderNodeTexWhiteNoise", _noise_dimensions="3D")
    N.link(cell, w1.inputs["Vector"])
    rgb = N.new("ShaderNodeSeparateColor")
    N.link(w1.outputs["Color"], rgb.inputs[0])
    r_on, r_hue, r_bri = w1.outputs["Value"], rgb.outputs[0], rgb.outputs[1]
    w2 = N.new("ShaderNodeTexWhiteNoise", _noise_dimensions="3D")       # le hasard de l'étage
    N.link(road.combine(N, floor_i, seed, 4.7), w2.inputs["Vector"])
    r_floor = w2.outputs["Value"]
    # la part allumée de l'immeuble, presque nulle pour un sur cinq
    if lit_frac is None:
        frac = N.math("ADD", 0.06, N.math("MULTIPLY", N.math("FRACT", N.math("MULTIPLY", rnd, 7.31)), 0.26))
    else:
        frac = N.math("ADD", lit_frac - 0.15, N.math("MULTIPLY", N.math("FRACT", N.math("MULTIPLY", rnd, 7.31)), 0.3))
    frac = N.math("MULTIPLY", frac, N.mixf(N.math("LESS_THAN", N.math("FRACT", N.math("MULTIPLY", rnd, 3.77)), 0.2), 1.0, 0.12))
    score = N.mixf(0.45, r_on, r_floor)
    lit = N.math("MULTIPLY", win, N.math("LESS_THAN", score, frac))
    wcol = N.ramp(r_hue, [(0.0, lin("#ffc36b")), (0.5, lin("#ffb257")), (0.66, lin("#ffd497")), (0.8, lin("#fff0d6")),
                          (0.87, lin("#cfdcff")), (0.94, lin("#aebcff")), (0.985, lin("#c4ffd8"))])
    bri = N.mixf(N.math("POWER", r_bri, 1.6), 0.5, 3.6)
    # l'enduit : très sombre, un peu pastel, la teinte de l'immeuble vient de son hasard
    tint = N.ramp(rnd, [(0.0, lin("#8f8a96")), (0.3, lin("#a59a8c")), (0.55, lin("#9aa3a8")),
                        (0.8, lin("#b0a3a8")), (1.0, lin("#8d8fa0"))])
    base = N.mix(1.0, tint, (0.16, 0.16, 0.17, 1), "MULTIPLY")
    glass = N.mix(win, base, (0.008, 0.01, 0.014, 1))
    p = S.principled(N)
    N.link(glass, p.inputs["Base Color"])
    N.link(N.mixf(win, 0.85, 0.12), p.inputs["Roughness"])
    # le pied des façades lavé d'ambre par l'éclairage de la rue, jusqu'à 8 m
    foot = N.math("MULTIPLY", road.inv(N, road.smooth(N, pz, 0.0, 8.0)), N.math("MULTIPLY", wall, 0.22))
    e_col = N.mix(lit, N.mix(1.0, lin("#ffb46a"), road.grey(N, foot), "MULTIPLY"),
                  N.mix(1.0, wcol, road.grey(N, bri), "MULTIPLY"))
    N.link(e_col, p.inputs["Emission Color"])
    p.inputs["Emission Strength"].default_value = 1.0
    # la perspective aérienne
    cam = N.new("ShaderNodeCameraData")
    d = cam.outputs["View Distance"]
    f = N.math("SUBTRACT", 1.0, N.math("EXPONENT", N.math("DIVIDE", N.math("MULTIPLY", d, -1.0), fade)))
    f = N.math("MULTIPLY", f, 0.85)
    hz = N.new("ShaderNodeEmission", Color=lin(haze_color), Strength=0.22)
    mx = N.new("ShaderNodeMixShader")
    N.link(f, mx.inputs[0])
    N.link(p.outputs[0], mx.inputs[1])
    N.link(hz.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


SIGN_COLORS = ("#ff4a3a", "#ff7ab0", "#4ad8ff", "#6dff9a", "#ffb03a", "#b07aff", "#ff6a3d")


def distant_city(name="ville", shore_y=CITY_SHORE_Y, xs=(-950.0, 1050.0), depth=900.0, gap=(-12.0, 12.0), seed=5,
                 bay=0.00012, all_lit=False):
    """La ville vue par-dessus la lagune, vers -y (la bande de 1,2 km du §2.4, élargie pour l'orbite de FIN6) :
    le quai et la promenade avec ses lampadaires (sources dans le cadre, reflétées par l'eau), une première rangée
    basse (deux à quatre étages), puis des rangs de trois à sept étages mêlés d'immeubles de dix étages, et des
    tours au fond (le haut des tours de P4, au-dessus de la crête). Les rangs se chevauchent (reculs au hasard)
    pour que la silhouette ait de la profondeur. Des enseignes sans texte (lames verticales, bandeaux de toit)
    sur les premiers rangs, que la distance et le flou rendent illisibles. Le rivage se courbe en baie vers les
    bords (il revient vers +y). `gap` : l'ouverture laissée à la route du pont.
    `all_lit` : bien plus de fenêtres allumées (P6, FIN6), mais une ville quand même. L'ouverture `gap` traverse
    toute la profondeur : c'est l'avenue dans l'axe du pont (scene_c la pave et l'éclaire)."""
    rng = random.Random(seed)
    xs0, xs1 = xs

    def shore(x):
        return shore_y + bay * x * x + 14.0 * math.sin(x / 190.0)

    mats = [mat_city(f"{name}_mat", lit_frac=0.5 if all_lit else None)]
    beacons = []
    signs = {c: bmesh.new() for c in SIGN_COLORS}
    n_bld = n_sign = 0
    # (recul depuis le quai, hauteurs, remplissage) ; un étage fait 3,15 m
    rows = [(16.0, (7, 14), 0.9), (52.0, (9, 22), 0.88), (100.0, (10, 26), 0.85), (165.0, (12, 30), 0.8),
            (245.0, (12, 34), 0.75), (340.0, (12, 38), 0.7), (460.0, (14, 38), 0.65), (600.0, (14, 34), 0.6)]
    objs = []
    for ri, (off, (h0, h1), fill) in enumerate(rows):
        if off > depth:
            break
        x = xs0 + rng.uniform(0, 20)
        while x < xs1:
            w = rng.uniform(14, 42)
            # l'ouverture du pont se prolonge en avenue sur toute la profondeur (au 200 mm de P4, un immeuble dans
            # l'axe bouchait tout le fond de la crête)
            mg = 6.0 if ri < 2 else 10.0
            if rng.random() < fill and not (gap[0] - mg < x + w / 2 and x - w / 2 < gap[1] + mg):
                d = rng.uniform(12, 30)
                y = shore(x) - off - d / 2 + rng.uniform(-12, 12 if ri else 4)
                h = rng.uniform(h0, h1)
                if ri >= 1 and rng.random() < 0.14:
                    h = rng.uniform(26, 44)          # un immeuble de huit à quatorze étages
                if ri >= 2 and rng.random() < 0.06:
                    h = rng.uniform(50, 95)          # une tour
                    w, d = rng.uniform(18, 28), rng.uniform(18, 28)
                ob_bm = bmesh.new()
                box_bm(ob_bm, (-w / 2, -d / 2, -1.0), (w / 2, d / 2, h))
                if h > 15 and rng.random() < 0.45:
                    s = rng.uniform(0.55, 0.8)       # gradins ou édicule au sommet
                    box_bm(ob_bm, (-w * s / 2, -d * s / 2, h), (w * s / 2, d * s / 2, h + rng.uniform(3, 7)))
                if rng.random() < 0.5:
                    box_bm(ob_bm, (w * 0.1, -d * 0.2, h), (w * 0.1 + 3, -d * 0.2 + 2.5, h + 2.2))
                ob = mesh_object(f"{name}_b{n_bld}", ob_bm, mats)
                ob.location = (x, y, 0.0)
                rot = math.radians(rng.choice([0, 0, 0, rng.uniform(-8, 8)]))
                ob.rotation_euler = (0, 0, rot)
                ob.visible_shadow = False
                objs.append(ob)
                n_bld += 1
                if h > 50:
                    beacons.append((x, y, h + 1.0))   # feu d'obstacle sur les tours
                # les enseignes, sans texte : une lame verticale sur la façade côté eau, ou un bandeau de toit
                if ri < 3 and rng.random() < 0.2:
                    sb = signs[rng.choice(SIGN_COLORS)]
                    M = Matrix.Translation((x, y, 0.0)) @ Matrix.Rotation(rot, 4, "Z")
                    if rng.random() < 0.6:
                        sx = rng.uniform(-w / 2 + 2, w / 2 - 2)
                        z0 = rng.uniform(4.0, min(10.0, h - 5.0)) if h > 10 else 3.5
                        lo, hi = (sx - 0.15, d / 2 + 0.1, z0), (sx + 0.15, d / 2 + 0.9, z0 + rng.uniform(3, 6))
                    else:
                        sw = rng.uniform(5, min(14, w - 2))
                        sx = rng.uniform(-w / 2 + sw / 2, w / 2 - sw / 2)
                        lo, hi = (sx - sw / 2, d / 2 - 0.4, h + 0.3), (sx + sw / 2, d / 2 - 0.2, h + rng.uniform(1.2, 2.2))
                    vs = [sb.verts.new(M @ Vector((a, b, c))) for c in (lo[2], hi[2]) for b in (lo[1], hi[1]) for a in (lo[0], hi[0])]
                    for f in [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]:
                        sb.faces.new([vs[i] for i in f])
                    n_sign += 1
            x += w + rng.uniform(3, 14)
    for c, sb in signs.items():
        if sb.verts:
            mesh_object(f"{name}_enseignes_{c[1:]}", sb, [emit_mat(f"{name}_enseigne_{c[1:]}", lin(c), 9.0)]).visible_shadow = False
        else:
            sb.free()
    # le quai et la promenade (le sol de la ville est à z = 0, 1,5 m au-dessus de l'eau)
    wall = mat_quay(f"{name}_quai_pierre")
    walk = mat_concrete(f"{name}_promenade", tint=(0.5, 0.48, 0.46))
    qb, pb = bmesh.new(), bmesh.new()
    step = 20.0
    xq = xs0
    while xq < xs1:
        if not (gap[0] - 2 < xq + step and xq < gap[1] + 2):
            ym = max(shore(xq), shore(xq + step))
            box_bm(qb, (xq, ym - 0.6, WATER_Z - 1.5), (xq + step + 0.05, ym, 0.0))
            box_bm(pb, (xq, ym - 40.0, -0.3), (xq + step + 0.05, ym - 0.6, 0.0))
        xq += step
    o = mesh_object(f"{name}_quai", qb, [wall])
    o.visible_shadow = False
    o = mesh_object(f"{name}_sol", pb, [walk])
    o.visible_shadow = False
    head = emit_mat(f"{name}_lamp", lin("#ffbf69"), 45.0)
    lb = bmesh.new()
    xq = xs0 + 7.0
    while xq < xs1:
        if not (gap[0] - 4 < xq < gap[1] + 4):
            bmesh.ops.create_uvsphere(lb, u_segments=8, v_segments=5, radius=0.38,
                                      matrix=Matrix.Translation((xq, shore(xq) - 2.0, 6.5)))
        xq += 24.0
    lamps = mesh_object(f"{name}_lampes", lb, [head])
    lamps.visible_shadow = False
    red = emit_mat(f"{name}_beacon", lin("#ff3020"), 30.0)
    rb = bmesh.new()
    for (bx, by, bz) in beacons:
        bmesh.ops.create_uvsphere(rb, u_segments=6, v_segments=4, radius=0.45, matrix=Matrix.Translation((bx, by, bz)))
    if beacons:
        mesh_object(f"{name}_balises", rb, [red]).visible_shadow = False
    else:
        rb.free()
    print(f"[lieux] ville lointaine : {n_bld} immeubles, {len(beacons)} balises, {n_sign} enseignes, fenêtres "
          f"{'très allumées' if all_lit else 'éparses'}", flush=True)
    return objs


def far_shore(y=FAR_SHORE_Y, xs=(-6000.0, 6000.0), n=220, seed=9, name="autre_rive"):
    """L'autre rive, derrière la pointe (vers +y) : une ligne basse et sombre et des feux épars (FIN6 tourne tout
    autour)."""
    rng = random.Random(seed)
    land = S.mat_plain(f"{name}_sol", lin("#0c0c16"), 0.9)
    b = bmesh.new()
    box_bm(b, (xs[0], y, WATER_Z - 1), (xs[1], y + 400, 6.0))
    for _ in range(40):
        x = rng.uniform(*xs)
        w, h = rng.uniform(40, 200), rng.uniform(8, 40)
        box_bm(b, (x, y + 10, 0), (x + w, y + 300, h))
    o = mesh_object(f"{name}_relief", b, [land])
    o.visible_shadow = False
    warm = emit_mat(f"{name}_feux", lin("#ffb866"), 60.0)
    lb = bmesh.new()
    for _ in range(n):
        x = rng.uniform(*xs)
        bmesh.ops.create_uvsphere(lb, u_segments=6, v_segments=4, radius=rng.uniform(0.6, 1.4),
                                  matrix=Matrix.Translation((x, y + rng.uniform(0, 5), rng.uniform(1, 18))))
    o = mesh_object(f"{name}_lampes", lb, [warm])
    o.visible_shadow = False


# ---------------------------------------------------------------- les quais de pierre

def mat_quay(name="quai_pierre"):
    """Le mur de quai : pierre corail (Coral Fort Wall 01, projetée en boîte), noircie et verdie au ras de l'eau
    (la marque des marées), coulures de sel et de rouille sous le couronnement."""
    m, N, out = S.material(name)
    P, _ = road.coords(N)
    _, _, pz = N.sep(P)
    f = os.path.join(ASSETS, "coral_fort_wall_01")
    uv = road.mapping(N, P, scale=(0.4,) * 3)
    diff = road.tex(N, os.path.join(f, "diff_2k.jpg"), uv, box=True)
    rough = road.tex(N, os.path.join(f, "rough_2k.jpg"), uv, color=False, box=True)
    disp = road.tex(N, os.path.join(f, "disp_2k.png"), uv, color=False, box=True)
    col = N.mix(1.0, diff, (0.6, 0.58, 0.56, 1), "MULTIPLY")
    tide = road.inv(N, road.smooth(N, pz, WATER_Z + 0.2, WATER_Z + 0.9))
    algae = road.inv(N, road.smooth(N, pz, WATER_Z - 0.2, WATER_Z + 0.35))
    col = N.mix(N.math("MULTIPLY", tide, 0.85), col, N.mix(1.0, col, (0.22, 0.24, 0.2, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", algae, 0.9), col, (0.012, 0.022, 0.012, 1))
    st = road.smooth(N, road.noise(N, P, 1.6, 3.0, stretch=(1.0, 1.0, 0.05)), 0.55, 0.75)
    col = N.mix(N.math("MULTIPLY", st, 0.5), col, N.mix(1.0, col, (0.55, 0.45, 0.38, 1), "MULTIPLY"))
    geo = N.new("ShaderNodeNewGeometry").outputs["Normal"]
    n = road.bump(N, disp, geo, 1.0, 0.06)
    p = S.principled(N)
    N.link(col, p.inputs["Base Color"])
    N.link(N.mixf(tide, rough, 0.18), p.inputs["Roughness"])
    N.link(n, p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_coping(name="couronnement"):
    """Le couronnement des quais : pierre claire, bouchardée, salie, mouillée."""
    return mat_concrete(name, tint=(0.72, 0.69, 0.64), streaks=0.5, scale=0.9)


# ---------------------------------------------------------------- lampadaires

LAMP_S = 1.75


def lamp_source(hidden):
    """Le lampadaire de la rue (streetlights.glb, un seul modèle gardé), source cachée ; le bras vers −y."""
    parts = S.import_glb("streetlights.glb")
    mine = [o for o in parts if o.name.startswith("polySurface102")]
    for o in [o for o in parts if o not in mine]:
        bpy.data.objects.remove(o)
    lamp = S.join(mine, "lamp_src")
    metal = mat_steel("lamp_metal", color=(0.07, 0.075, 0.08), rough=0.4, rust=0.15, paint=True)
    head = S.mat_emit("lamp_head", lin(AMBER), 40.0)
    for i, m in enumerate(lamp.data.materials):
        lamp.data.materials[i] = head if m.name.startswith("light") else metal
    S.recentre(lamp)
    for c in list(lamp.users_collection):
        c.objects.unlink(lamp)
    hidden.objects.link(lamp)
    return lamp


def lamp(src, loc, arm=(1.0, 0.0), energy=2600.0, name=None, scale=LAMP_S):
    """Un lampadaire au pied `loc`, le bras tourné vers `arm` (x, y), et son spot ambre sous la tête.
    Renvoie (mât, lumière, position de la tête)."""
    n = name or f"lamp_{len([o for o in bpy.data.objects if o.name.startswith('lamp_')])}"
    rot = math.atan2(arm[0], -arm[1])
    ob = S.instance(src, n, loc, rot, scale)
    headp = Vector((0, -1.68 * scale, 4.68 * scale))
    headp.rotate(Matrix.Rotation(rot, 3, "Z"))
    L = bpy.data.lights.new(f"{n}_light", "SPOT")
    L.energy = energy
    L.color = lin(AMBER)[:3]
    L.spot_size = math.radians(130)
    L.spot_blend = 0.5
    L.shadow_soft_size = 0.5          # dans la brume, une source plus large n'étoile pas la tête du lampadaire
    lo = bpy.data.objects.new(L.name, L)
    bpy.context.scene.collection.objects.link(lo)
    lo.location = Vector(loc) + headp - Vector((0, 0, 0.12))
    return ob, lo, Vector(loc) + headp


# ---------------------------------------------------------------- la chaussée au bord de l'eau

KERB = 0.2
WALK_Z = 0.15


class road_half:
    """Le temps d'un bloc, la chaussée de road.py prend une autre demi-largeur (`half`, cunettes comprises) :
    profils en travers, cunettes, bordures, trottoirs et enrobé suivent. Pour une chaussée à deux voies (la jetée,
    8 m), l'enrobé perd ses tirets de voie (câblés à |x| = 3,5 m dans road.mat_asphalt, voir two_lane_asphalt)."""

    def __init__(self, half, lanes=None, edge=None):
        self.half, self.lanes, self.edge = half, lanes, edge

    def __enter__(self):
        self.old = (S.ROAD_HALF, road.LANES, road.EDGE_X)
        S.ROAD_HALF = self.half
        if self.lanes:
            road.LANES = self.lanes
        road.EDGE_X = self.edge if self.edge else self.half - 0.8
        return self

    def __exit__(self, *exc):
        S.ROAD_HALF, road.LANES, road.EDGE_X = self.old
        return False


def _retune(mat, table):
    """Remplace des constantes (non reliées) des nœuds Math et Map Range d'une matière : {ancienne: nouvelle}."""
    n = 0
    for nd in mat.node_tree.nodes:
        if nd.type not in ("MATH", "MAP_RANGE"):
            continue
        for sock in nd.inputs:
            if sock.is_linked or not hasattr(sock, "default_value") or not isinstance(sock.default_value, float):
                continue
            for old, new in table.items():
                if abs(sock.default_value - old) < 1e-4:
                    sock.default_value = new
                    n += 1
    return n


def two_lane_asphalt(name, half=4.0):
    """L'enrobé qui sèche de road.py pour une chaussée à deux voies (deux fois une voie de 3,5 m, cunettes de
    0,5 m) : double axe et rives gardés, tirets de voie et joint longitudinal retirés, traces de roues au milieu de
    chaque voie, bord mouillé ramené au bord de cette chaussée."""
    with road_half(half, lanes=(half / 2 - 0.25, half / 2 - 0.25), edge=half - 0.8):
        if hasattr(road, "lane_layout"):        # le plan des voies de road.py (depuis le 12 novembre)
            m = road.mat_asphalt(ST, name, layout=road.lane_layout(half, 2, edge=True))
            _retune(m, {5.4: half - 1.6})
        else:
            m = road.mat_asphalt(ST, name)
            _retune(m, {3.5: 99.0, 3.74: 99.0, 5.4: half - 1.6})
    return m


def roadway_mats(half=7.0, tag=""):
    """Les matières d'une chaussée de demi-largeur `half` (celles de l'avenue : enrobé, cunette, bordure, dalles)."""
    with road_half(half):
        M = dict(asphalt=(road.mat_asphalt(ST, f"asphalt{tag}") if half >= 6.9 else two_lane_asphalt(f"asphalt{tag}", half)),
                 pan=road.mat_gutter_pan(ST, f"cunette{tag}"), kerb=road.mat_kerb(ST, f"bordure{tag}"),
                 walk=road.mat_pavement(ST, f"trottoir{tag}"))
    M["parapet"] = bpy.data.materials.get("parapet") or mat_concrete("parapet", tint=(0.66, 0.64, 0.6), streaks=1.4, scale=0.6)
    M["concrete"] = bpy.data.materials.get("beton") or mat_concrete("beton", tint=(0.6, 0.58, 0.55), wet_foot=WATER_Z + 0.5)
    M["wbeam"] = bpy.data.materials.get("glissiere") or mat_steel("glissiere", color=(0.56, 0.58, 0.59), rough=0.32, rust=0.18)
    M["rail"] = bpy.data.materials.get("garde_corps") or mat_steel("garde_corps", color=(0.32, 0.36, 0.36), rough=0.35, rust=0.3, paint=True)
    M["quay"] = bpy.data.materials.get("quai_pierre") or mat_quay("quai_pierre")
    M["coping"] = bpy.data.materials.get("couronnement") or mat_coping("couronnement")
    return M


def tube_profile(x0, z0, r, n=8):
    return [(x0 + r * math.cos(a), z0 + r * math.sin(a)) for a in (i * math.tau / n for i in range(n))]


def wbeam_profile(side, x0, z0):
    """La lisse de glissière en W, ondulée, vue en coupe (épaisseur 4 mm), face aux voies."""
    pts = []
    for i in range(13):
        t = i / 12
        pts.append((x0 + side * (0.045 * (0.5 - 0.5 * math.cos(t * 2 * math.tau))), z0 + 0.31 * t))
    return pts + [(x + side * 0.004, z) for x, z in reversed(pts)]


def roadway(name, ys, zfun=None, x0=0.0, half=7.0, walk=2.0, rail="parapet", glissiere=False, under=None,
            lamp_src=None, lamp_ys=(), far=False, M=None, rail_ys=None):
    """Une chaussée droite le long de y, en x0, à la hauteur zfun(y) : le profil de l'avenue (enrobé bombé,
    cunettes, bordures de road.py) à la demi-largeur `half`, trottoirs de `walk` m en dalles, puis au bord :
      rail « parapet » : parapet en béton à larmier et garde-corps tubulaire dessus (1,1 m, le pont) ;
      rail « quai »    : couronnement de pierre, garde-corps bas (0,95 m) et mur de quai jusque sous l'eau
                         (la jetée, les quais du port) ;
      rail None        : rien (la voie continue sur un terre-plein).
    `glissiere` : une glissière en W au bord des voies ; `under` « caisson » : la poutre de rive et le dessous du
    tablier (le pont). `rail_ys` : (y0, y1), où poser le bord (par défaut toute la longueur).
    Les lampadaires (`lamp_src`, aux `lamp_ys`) des deux côtés, bras vers les voies.
    `far` : la version vue de loin, sans montants, poteaux ni lisses (les grandes formes et les lumières).
    Renvoie dict(M, lamps : [(mât, lumière, tête)], edge : x du bord extérieur)."""
    zfun = zfun or (lambda y: 0.0)
    before = set(bpy.data.objects)
    with road_half(half):
        M = M or roadway_mats(half, f"_{name}")
        wi, wo = half + KERB, half + KERB + walk
        sweep(f"{name}_chaussee", road.road_profile(), ys, zfun, M["asphalt"])
        for side in (-1, 1):
            tag = "g" if side < 0 else "d"
            sweep(f"{name}_cunette_{tag}", road.pan_profile(side), ys, zfun, M["pan"])
            sweep(f"{name}_bordure_{tag}", road.kerb_profile(side), ys, zfun, M["kerb"], smooth=True)
            w = [(side * wi, WALK_Z), (side * wo, WALK_Z)]
            sweep(f"{name}_trottoir_{tag}", w if side > 0 else w[::-1], ys, zfun, M["walk"])
    edge = wo
    rys = [y for y in ys if rail_ys is None or rail_ys[0] <= y <= rail_ys[1]]
    if rail_ys is not None:
        rys = sorted(set([max(ys[0], rail_ys[0])] + rys + [min(ys[-1], rail_ys[1])]))
    for side in (-1, 1):
        tag = "g" if side < 0 else "d"
        if rail == "parapet" and len(rys) > 1:
            p0, p1 = wo, wo + 0.42
            edge = p1 + 0.06
            prof = [(p0, WALK_Z), (p0, 0.62), (p0 + 0.04, 0.68), (p1, 0.68), (p1, 0.1), (edge, 0.06)]
            if under == "caisson":
                prof += [(edge, -1.55), (edge - 0.9, -1.55), (edge - 0.9, -0.3)]
            else:
                prof += [(edge, WATER_Z - 1.0)]
            prof = [(side * x, z) for x, z in prof]
            sweep(f"{name}_parapet_{tag}", prof if side > 0 else prof[::-1], rys, zfun, M["parapet"])
            if not far:
                xr = side * (p0 + p1) / 2
                sweep(f"{name}_main_courante_{tag}", tube_profile(xr, 1.12, 0.03), rys, zfun, M["rail"], closed=True,
                      smooth=True)
                sweep(f"{name}_lisse_{tag}", tube_profile(xr, 0.9, 0.018), rys, zfun, M["rail"], closed=True,
                      smooth=True)
                bm = bmesh.new()
                y = rys[0] + 1.0
                while y < rys[-1]:
                    z = zfun(y)
                    box_bm(bm, (xr - 0.025, y - 0.025, z + 0.66), (xr + 0.025, y + 0.025, z + 1.12))
                    y += 2.0
                mesh_object(f"{name}_montants_{tag}", bm, [M["rail"]])
        elif rail == "quai" and len(rys) > 1:
            c0, c1 = wo, wo + 0.5
            edge = c1
            prof = [(c0, WALK_Z), (c0, 0.27), (c1, 0.27), (c1, 0.0)]
            prof = [(side * x, z) for x, z in prof]
            sweep(f"{name}_couronnement_{tag}", prof if side > 0 else prof[::-1], rys, zfun, M["coping"])
            wall = [(side * c1, 0.0), (side * c1, WATER_Z - 1.5)]
            sweep(f"{name}_mur_{tag}", wall if side > 0 else wall[::-1], rys, zfun, M["quay"])
            if not far:
                xr = side * (c0 + 0.25)
                sweep(f"{name}_main_courante_{tag}", tube_profile(xr, 1.22, 0.028), rys, zfun, M["rail"], closed=True,
                      smooth=True)
                sweep(f"{name}_lisse_{tag}", tube_profile(xr, 0.75, 0.016), rys, zfun, M["rail"], closed=True,
                      smooth=True)
                bm = bmesh.new()
                y = rys[0] + 1.2
                while y < rys[-1]:
                    z = zfun(y)
                    tube_bm(bm, (xr, y, z + 0.27), (xr, y, z + 1.22), 0.024, seg=8)
                    y += 2.4
                mesh_object(f"{name}_montants_{tag}", bm, [M["rail"]])
        if glissiere and len(rys) > 1:
            xg = side * (wi + 0.18)
            sweep(f"{name}_glissiere_{tag}", wbeam_profile(-side, xg, 0.5), rys, zfun, M["wbeam"], smooth=True)
            if not far:
                bm = bmesh.new()
                y = rys[0] + 2.0
                while y < rys[-1]:
                    z = zfun(y) + WALK_Z
                    box_bm(bm, (xg + side * 0.02, y - 0.04, z), (xg + side * 0.14, y + 0.04, z + 0.78))
                    box_bm(bm, (xg + side * 0.004, y - 0.09, z + 0.52), (xg + side * 0.05, y + 0.09, z + 0.76))
                    y += 4.0
                mesh_object(f"{name}_poteaux_{tag}", bm, [M["wbeam"]])
    if under == "caisson":
        u = [(-edge + 0.9, -0.3), (-edge + 0.9, -1.3), (-4.5, -1.9), (4.5, -1.9), (edge - 0.9, -1.3), (edge - 0.9, -0.3)]
        sweep(f"{name}_caisson", u, rys, zfun, M["concrete"])
    lamps = []
    if lamp_src is not None:
        lx = half + KERB + walk - 0.55
        for k, y in enumerate(lamp_ys):
            for side in (-1, 1):
                lamps.append(lamp(lamp_src, (side * lx, y, zfun(y) + WALK_Z), arm=(-side, 0.0),
                                  name=f"lamp_{name}_{k}_{'g' if side < 0 else 'd'}"))
        if far and lamps:
            # vue de loin, la tête du lampadaire fait moins d'un pixel : un halo émissif la rend lisible (la file
            # de lumières qui dessine le pont ou la jetée sur l'eau)
            hb = bmesh.new()
            for _, _, h in lamps:
                bmesh.ops.create_uvsphere(hb, u_segments=8, v_segments=5, radius=0.55,
                                          matrix=Matrix.Translation(h - Vector((0, 0, 0.15))))
            mesh_object(f"{name}_halos", hb, [emit_mat(f"{name}_halo", lin("#ffbf69"), 60.0)]).visible_shadow = False
    # tout est bâti autour de x = 0 (l'enrobé lit ses marquages en coordonnées objet), puis glissé en x0
    for ob in set(bpy.data.objects) - before:
        if ob.parent is None:
            ob.location.x += x0
    lamps = [(a, b, h + Vector((x0, 0, 0))) for a, b, h in lamps]
    return dict(M=M, lamps=lamps, edge=edge)


# ---------------------------------------------------------------- le panorama

def port_placeholder(lamp_src, far=True, name="port"):
    """Le port tant que la scène E n'existe pas (ou sa version lointaine n'est pas écrite) : le terre-plein de béton
    (x -60..100, y -20..100) et son mur de quai, la voie du quai (axe y = 70) jusqu'à la jetée, les quatre mâts
    d'éclairage de 25 m aux angles. Les cotes du §2.4."""
    conc = bpy.data.materials.get("terre_plein") or mat_concrete("terre_plein", tint=(0.5, 0.49, 0.47), streaks=0.3, scale=0.25)
    (x0, x1), (y0, y1) = PORT_XS, PORT_YS
    bm = bmesh.new()
    box_bm(bm, (x0, y0, WATER_Z - 1.5), (x1, y1, -0.002))
    mesh_object(f"{name}_terre_plein", bm, [conc])
    wall = bpy.data.materials.get("quai_pierre") or mat_quay("quai_pierre")
    bm = bmesh.new()
    for (a, b) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
        v = [bm.verts.new((a[0], a[1], 0.0)), bm.verts.new((b[0], b[1], 0.0)), bm.verts.new((b[0], b[1], WATER_Z - 1.5)),
             bm.verts.new((a[0], a[1], WATER_Z - 1.5))]
        bm.faces.new(v)
    mesh_object(f"{name}_quai", bm, [wall])
    # la voie du quai, de la voie du pont à la jetée (asphalte du pont, tournée : son y local file vers +x)
    M = roadway_mats(7.0, "_port")
    with road_half(7.0):
        ob = sweep(f"{name}_voie_quai", road.road_profile(), [0.0, 40.0, 87.0], lambda y: 0.0, M["asphalt"])
    ob.rotation_euler = (0, 0, -math.pi / 2)
    ob.location = (BRIDGE_X - 7.0, QUAY_Y, 0.0)
    # les mâts d'éclairage aux angles
    mast = bpy.data.materials.get("lamp_metal") or mat_steel("lamp_metal", color=(0.07, 0.075, 0.08), paint=True)
    head = emit_mat(f"{name}_mat_tete", lin(AMBER), 30.0)
    bm, hb = bmesh.new(), bmesh.new()
    for (x, y) in ((x0 + 6, y0 + 6), (x1 - 6, y0 + 6), (x0 + 6, y1 - 6), (x1 - 6, y1 - 6)):
        tube_bm(bm, (x, y, 0.0), (x, y, 25.0), 0.3, seg=12)
        box_bm(hb, (x - 1.6, y - 0.4, 25.0), (x + 1.6, y + 0.4, 25.5))
        Ld = bpy.data.lights.new(f"{name}_mat_{x:.0f}_{y:.0f}", "SPOT")
        Ld.energy = 60000.0
        Ld.color = lin(AMBER)[:3]
        Ld.spot_size = math.radians(120)
        Ld.spot_blend = 0.6
        Ld.shadow_soft_size = 0.8
        lo = bpy.data.objects.new(Ld.name, Ld)
        bpy.context.scene.collection.objects.link(lo)
        lo.location = (x, y, 24.8)
    mesh_object(f"{name}_mats", bm, [mast])
    mesh_object(f"{name}_tetes", hb, [head])
    print("[lieux] port provisoire (terre-plein, voie du quai, quatre mâts)", flush=True)


def _container_blocks(hidden):
    """Les conteneurs vus de loin : un bloc par type (six faces, aux cotes des modèles de scene_e), sans tôle
    ondulée ni numéros, la teinte de l'instance par la couleur de l'objet, un vernis d'eau mince. Au format de
    scene_e.container_sources : {type: (source, longueur, largeur, hauteur)}."""
    m = bpy.data.materials.get("conteneur_bloc")
    if m is None:
        m, N, out = S.material("conteneur_bloc")
        oi = N.new("ShaderNodeObjectInfo")
        p = S.principled(N, **{"Roughness": 0.55})
        N.link(N.mix(1.0, oi.outputs["Color"], (0.7, 0.7, 0.7, 1), "MULTIPLY"), p.inputs["Base Color"])
        p.inputs["Coat Weight"].default_value = 0.3
        p.inputs["Coat IOR"].default_value = 1.33
        N.link(p.outputs[0], out.inputs[0])
    out = {}
    for key, (ln, w, h) in {"40": (12.19, 2.44, 2.59), "20": (6.06, 2.44, 2.59), "40hc": (12.19, 2.44, 2.9)}.items():
        bm = bmesh.new()
        box_bm(bm, (-w / 2, -ln / 2, 0.0), (w / 2, ln / 2, h))
        out[key] = (mesh_object(f"src_conteneur_bloc_{key}", bm, [m], coll=hidden), ln, w, h)
    return out


def port_far(hidden, lamp_src):
    """Le port vu de loin (pont, jetée, pointe), allégé : le terre-plein, les mâts et l'axe fermé de
    scene_e.build_port au palier « socle », puis les mêmes piles de conteneurs en blocs (scene_e.build_containers
    posé sur _container_blocks au lieu des modèles de tôle) et le portique en silhouette (build_gantry vu de loin :
    un seul feu). Rien ne change dans scene_e : ses sources sont seulement remplacées le temps de l'appel."""
    import scene_e
    scene_e.build_port(hidden, lamp_src, far=True, palier="socle")
    if hasattr(scene_e, "build_containers") and hasattr(scene_e, "container_sources"):
        blocks = _container_blocks(hidden)
        full = scene_e.container_sources
        scene_e.container_sources = lambda h: blocks
        try:
            scene_e.build_containers(hidden, far=True)
        finally:
            scene_e.container_sources = full
    if hasattr(scene_e, "build_gantry"):
        scene_e.build_gantry(far=True)


def panorama(scene, hidden, yaw=math.pi, all_lit=False, bridge="loin", port="loin", jetty=None, water_kind="lagune",
             haubans=False):
    """Tout ce qu'on voit de loin par-dessus l'eau, commun aux scènes C, D et E : le ciel tourné de `yaw` (la bande
    corail derrière la ville), la lagune, la ville lointaine (`all_lit` : toutes fenêtres allumées), l'autre rive.
    `bridge`, `port`, `jetty` : None, « loin » (grandes formes et lumières) ou « près » (le lieu entier) ; le port
    vient de scene_e.build_port s'il existe, sinon du terre-plein provisoire. `haubans` : le pont avec son pylône
    (palier « haubans » de scene_c). Renvoie la source des lampadaires."""
    sky(scene, yaw)
    water("lagune", (-7000, 7000), (-7000, 7000), WATER_Z, kind=water_kind)
    distant_city(all_lit=all_lit)
    far_shore()
    lamp_src = lamp_source(hidden)
    if bridge:
        import scene_c
        scene_c.build_bridge(hidden, lamp_src, far=(bridge == "loin"), haubans=haubans)
    if port:
        try:
            import scene_e
            if port == "loin":
                port_far(hidden, lamp_src)
            else:
                scene_e.build_port(hidden, lamp_src, far=False)
        except (ImportError, AttributeError):
            port_placeholder(lamp_src, far=(port == "loin"))
    if jetty:
        import scene_d
        scene_d.build_jetty(hidden, lamp_src, far=(jetty == "loin"))
        scene_d.build_pointe(hidden, lamp_src, far=(jetty == "loin"))
    return lamp_src


def face(ob, target):
    """Tourne un objet dont l'avant est -y (les agents de cast_people) vers `target` (x, y)."""
    d = Vector(target[:2]) - Vector(ob.location[:2])
    ob.rotation_euler = (0, 0, math.atan2(d.x, -d.y))


# ---------------------------------------------------------------- les véhicules : rigs

def rig(body, name, yaw=0.0):
    """Un vide dont le +y local est l'avant ; `body` en devient l'enfant, tourné de `yaw`."""
    root = bpy.data.objects.new(name, None)
    root.empty_display_size = 2.0
    bpy.context.scene.collection.objects.link(root)
    bpy.context.view_layer.update()
    body.parent = root
    body.matrix_parent_inverse = Matrix.Identity(4)
    body.location = (0, 0, 0)
    body.rotation_mode = "XYZ"
    body.rotation_euler = (0, 0, yaw)
    root.rotation_mode = "XYZ"
    root["body"] = body.name
    return root


def put(root, x, y, z=0.0, heading=0.0, pitch=0.0, roll=0.0):
    """Pose un rig : `heading` en degrés, sens trigonométrique (0 : l'avant vers +y, 90 : vers -x, -90 : vers +x),
    `pitch` en degrés (positif : l'avant monte), `roll` en degrés."""
    root.location = (x, y, z)
    root.rotation_euler = (math.radians(pitch), math.radians(roll), math.radians(heading))
    return root


def forward(root):
    bpy.context.view_layer.update()
    return (root.matrix_world.to_3x3() @ Vector((0, 1, 0))).normalized()


def heading_to(direction):
    """Le cap (degrés, convention de put) qui tourne l'avant vers `direction` (x, y)."""
    return math.degrees(math.atan2(-direction[0], direction[1]))


def _keys_linear(ob):
    S.linear_keys(ob)


def drive(root, speed, wheels=(), wheel_r=0.33):
    """Le flou de bougé : le rig avance de `speed` m/s selon son avant autour de l'image 2 (images 1 et 3), les
    roues (`wheels`, tournant autour de leur x local) roulent."""
    d = forward(root) * speed / 24.0
    p = root.location.copy()
    for f, s in ((1, -1), (3, 1)):
        root.location = p + d * s
        root.keyframe_insert("location", frame=f)
    root.location = p
    _keys_linear(root)
    a = speed / wheel_r / 24.0
    for w in wheels:
        for f, s in ((1, -1), (3, 1)):
            w.rotation_euler.x = a * s
            w.keyframe_insert("rotation_euler", index=0, frame=f)
        w.rotation_euler.x = 0
        _keys_linear(w)


def clone(root, name):
    """Copie un rig et toute sa descendance, maillages et lumières partagés (copies liées). Les objets exclus de
    la lueur de la rampe (liaison de lumière de cast_vehicles.lightbar_lights) le sont aussi dans la copie."""
    made = {}

    def rec(ob, parent):
        if parent is not None and "_beam_" in ob.name:
            return None                         # les faisceaux figés sont propres à chaque véhicule (bar_beams)
        c = ob.copy()
        if c.animation_data:
            c.animation_data.action = None      # les pilotes (rotors) restent, les clés de flou se reposent
        c.name = f"{name}:{ob.name}" if parent else name
        for col in ob.users_collection:
            col.objects.link(c)
        if parent is not None:
            c.parent = parent
            c.matrix_parent_inverse = ob.matrix_parent_inverse.copy()
        made[ob] = c
        for ch in ob.children:
            rec(ch, c)
        return c

    r = rec(root, None)
    for col in bpy.data.collections:
        if col.name.endswith("_glow_exclude"):
            for co in col.collection_objects:
                co.light_linking.link_state = "EXCLUDE"
    return r


def hero(lights_on=True):
    """La voiture poursuivie (FILM3D_HERO, la berline des années 60 par défaut ; usure FILM3D_USURE), conducteur
    assis, phares et feux allumés : scene_a.street_hero, qui la met l'avant vers −y. Renvoie le rig ; ses roues
    (`wheel_*`, autour de x local) et son rayon de roue sont notés sur le rig."""
    body = S.street_hero(bpy.context.scene)
    body.location = (0, 0, 0)
    body.rotation_euler = (0, 0, 0)
    root = rig(body, "hero", yaw=math.pi)            # street_hero la met l'avant vers -y
    root["wheel_r"] = body.get("wheel_r", 0.33)
    return root


def hero_wheels(root):
    body = bpy.data.objects[root["body"]]
    return [o for o in body.children if o.name.startswith("wheel_")]


def hero_driver(root):
    body = bpy.data.objects[root["body"]]
    for o in body.children_recursive:
        if o.type == "ARMATURE":
            return o
    return None


def hands_up(root, up=0.10, fwd=0.22, out=0.2):
    """Le conducteur lève les mains gantées derrière le pare-brise. La pose de cast_people.pose_driver_hands_up
    met les poignets 36 cm au-dessus des épaules : dans la berline, les doigts traversent le pavillon (vu au
    cadrage du 11 novembre). Ici les poignets restent sous le pavillon et avancent vers le pare-brise : coudes
    écartés, avant-bras dressés, paumes vers l'avant, mains à hauteur du visage."""
    import cast_people as cp
    arm = hero_driver(root)
    if arm is None:
        print("[lieux] pas de conducteur : mains levées impossibles", flush=True)
        return
    cp.reset_pose(arm)
    cp._seat(arm, recline=10)
    for s, sg in (("Left", 1), ("Right", -1)):
        cp._rot(arm, s + "Shoulder", cp.F, 6 * sg)
        sh = cp.pb(arm, s + "Arm").head
        side = cp.L if sg > 0 else cp.R
        wrist = sh + side * out + cp.U * up + cp.F * fwd
        cp.two_bone(arm, s + "Arm", s + "ForeArm", s + "Hand", wrist, side * 1.0 + cp.D * 0.8 + cp.B * 0.1)
        cp.set_hand(arm, s, (cp.U + side * 0.1 + cp.F * 0.08).normalized(), cp.F)
        cp.curl(arm, s, angles=(8, 10, 6), thumb=(-5, 5, 5), spread=6)
    cp._head_look(arm, (cp.F + cp.D * 0.05).normalized())


def patrol(name="patrol", lights_on=True):
    """La patrouille choisie (pare-buffle, grille d'habitacle : cast_vehicles.load_patrol « jeandiz »),
    rampe corail et lilas allumée, phares et feux arrière. Renvoie le rig."""
    import cast_vehicles as cv
    p = cv.load_patrol("jeandiz", lights_on=lights_on, name=name + "_body")
    root = rig(p["body"], name, yaw=math.pi / 2)
    root["height"] = p["height"]
    root["bar"] = p["lightbar"].name
    return root


def van(name="van", lights_on=True):
    """Le fourgon détaillé (cast_vehicles.load_van « vandura »), rampe allumée."""
    import cast_vehicles as cv
    v = cv.load_van("vandura", lights_on=lights_on)
    root = rig(v["body"], name, yaw=math.pi / 2)
    root["height"] = v["height"]
    root["bar"] = v["lightbar"].name
    return root


def helicopter(name="heli", searchlight=True):
    """L'hélicoptère détaillé (cast_vehicles.load_helicopter « solid »), projecteur allumé, rotors pilotés par
    l'image (flou de bougé). Renvoie (rig, dict du chargeur)."""
    import cast_vehicles as cv
    h = cv.load_helicopter("solid", searchlight_on=searchlight, name=name + "_body")
    root = rig(h["body"], name, yaw=math.pi / 2)
    cv.spin_rotors(h)
    return root, h


def aim(h, target):
    import cast_vehicles as cv
    cv.aim_searchlight(h, target)


def bar_beams(root, tag, yaws=((35, CORAL), (-150, LILAC)), energy=9000.0, size=26.0, tilt=10.0):
    """Les faisceaux de la rampe figés en plein balayage : un spot par couleur, presque à l'horizontale (`tilt`
    degrés sous l'horizon), tourné de `yaw` degrés par rapport à l'avant. Ils se lisent dans la brume."""
    bpy.context.view_layer.update()
    body = bpy.data.objects[root["body"]]
    bn = root.get("bar", "")
    bar = next((o for o in root.children_recursive if bn and (o.name == bn or o.name.endswith(":" + bn))), None)
    top = (bar.matrix_world.translation if bar else body.matrix_world @ Vector((0, 0, 1.6))) + Vector((0, 0, 0.18))
    fwd = forward(root)
    out = []
    for k, (yaw, col) in enumerate(yaws):
        d = fwd.copy()
        d.rotate(Matrix.Rotation(math.radians(yaw), 3, "Z"))
        d.z = -math.tan(math.radians(tilt))
        L = bpy.data.lights.new(f"{tag}_beam_{k}", "SPOT")
        L.color = lin(col)[:3]
        L.energy = energy
        L.spot_size = math.radians(size)
        L.spot_blend = 0.8
        L.shadow_soft_size = 0.06
        lo = bpy.data.objects.new(L.name, L)
        bpy.context.scene.collection.objects.link(lo)
        lo.location = top + Vector((d.x, d.y, 0)).normalized() * 0.25
        lo.rotation_mode = "QUATERNION"
        lo.rotation_quaternion = d.normalized().to_track_quat("-Z", "Y")
        bpy.context.view_layer.update()
        mw = lo.matrix_world.copy()
        lo.parent = root
        lo.matrix_world = mw
        out.append(lo)
    return out


def _bar_of(root):
    bn = root.get("bar", "")
    return next((o for o in root.children_recursive if bn and (o.name == bn or o.name.endswith(":" + bn))), None)


def bar_pools(root, energy=2000.0, out=0.9, radius=0.25):
    """Les flaques de couleur de la rampe sur la chaussée mouillée : un point corail à gauche, un lilas à droite,
    à 0,9 m hors de la caisse, au niveau de la rampe. Leur reflet sur l'eau dessine le ruban de gyrophares vu de
    haut (P6) ; la rampe et ses lentilles ne les reçoivent pas (même liaison que cast_vehicles.lightbar_lights).
    À poser sur le premier véhicule avant de le cloner : les copies en héritent."""
    bpy.context.view_layer.update()
    bar = _bar_of(root)
    if bar is None:
        return []
    shell = bpy.data.collections.get(f"{bar.name}_glow_exclude")
    lights = []
    for side, col in ((1, CORAL), (-1, LILAC)):
        d = bpy.data.lights.new(f"{bar.name}_pool_{'L' if side > 0 else 'R'}", "POINT")
        d.energy = energy
        d.color = lin(col)[:3]
        d.shadow_soft_size = radius
        ob = bpy.data.objects.new(d.name, d)
        cols = [c for c in bar.users_collection if not c.name.endswith("_glow_exclude")]
        (cols[0] if cols else bpy.context.scene.collection).objects.link(ob)
        ob.parent = bar
        ob.location = (0.0, side * (0.36 + out), 0.25)
        ob.visible_camera = False               # la boule de lumière ne se voit pas, son reflet sur l'eau oui
        ob.visible_volume_scatter = False       # ni dans la brume : vingt rampes la teintaient de rose sur 300 m
        if shell:
            ob.light_linking.receiver_collection = shell
        lights.append(ob)
    return lights


def bar_boost(root, factor):
    """Multiplie l'émission des lentilles de la rampe (matières partagées : toutes les copies suivent). Pour les
    plans vus de loin, où la rampe fait quelques pixels ; de près, AgX la blanchirait."""
    bar = _bar_of(root)
    done = set()
    for o in ([bar] + list(bar.children_recursive)) if bar else []:
        for m in getattr(o.data, "materials", []) or []:
            if m is None or m.name in done or not m.node_tree:
                continue
            done.add(m.name)
            # la lentille plus forte se voit, mais n'éclaire plus : vingt rampes échantillonnées comme lumières
            # teintaient toute la brume de rose au-dessus de l'eau (P6 du 12 novembre)
            m.cycles.emission_sampling = "NONE"
            for nd in m.node_tree.nodes:
                for key in ("Emission Strength", "Strength"):
                    s = nd.inputs.get(key)
                    if s is not None and not s.is_linked and isinstance(s.default_value, float) and s.default_value > 0:
                        s.default_value *= factor
    return done


def open_door(root, side=-1, angle=75.0, door_x=(-0.32, 0.99), door_z=(0.18, 1.42), inner=0.55, hinge=(0.96, 0.92)):
    """Ouvre la portière avant d'une patrouille (cast_vehicles « jeandiz » : caisse jointe, l'avant vers +x
    local, la gauche vers +y). La portière, sa vitre, sa poignée et son rétroviseur sont des îlots du maillage :
    on prend ceux dont la boîte tient dans la zone de la portière, et on les fait tourner autour de la charnière.
    `side` : +1 la portière du conducteur (gauche), -1 celle du passager. Le maillage est modifié : à faire sur une
    patrouille qu'on ne clone pas."""
    body = bpy.data.objects[root["body"]]
    me = body.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    seen, moved = set(), 0
    hx, hy = hinge[0], side * hinge[1]
    a = math.radians(-angle * side)
    ca, sa = math.cos(a), math.sin(a)
    for v in bm.verts:
        if v.index in seen:
            continue
        comp, stack = [], [v]
        seen.add(v.index)
        while stack:
            p = stack.pop()
            comp.append(p)
            for e in p.link_edges:
                q = e.other_vert(p)
                if q.index not in seen:
                    seen.add(q.index)
                    stack.append(q)
        xs = [c.co.x for c in comp]
        ys = [c.co.y * side for c in comp]
        zs = [c.co.z for c in comp]
        if (min(xs) >= door_x[0] and max(xs) <= door_x[1] and min(ys) >= inner and min(zs) >= door_z[0]
                and max(zs) <= door_z[1]):
            for c in comp:
                dx, dy = c.co.x - hx, c.co.y - hy
                c.co.x, c.co.y = hx + dx * ca - dy * sa, hy + dx * sa + dy * ca
            moved += len(comp)
    bm.to_mesh(me)
    bm.free()
    me.update()
    print(f"[lieux] portière ouverte ({'gauche' if side > 0 else 'droite'}, {angle:.0f}°) : {moved} sommets", flush=True)
    return moved


def cabin_light(root, energy=6.0, color="#ffcf9a"):
    """Un peu de lumière dans l'habitacle de la berline (le tableau de bord, une lampe de lecture) : les mains
    levées se lisent derrière le pare-brise. Repère du corps de scene_a.street_hero : l'avant vers -y local."""
    body = bpy.data.objects[root["body"]]
    d = bpy.data.lights.new("hero_habitacle", "POINT")
    d.energy = energy
    d.color = lin(color)[:3]
    d.shadow_soft_size = 0.12
    ob = bpy.data.objects.new(d.name, d)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = body
    ob.location = (0.15, -0.72, 1.08)
    return ob


def jet(name="jet"):
    """L'avion de chasse fictif (cast_vehicles.load_jet « concept »), silhouette lointaine seulement."""
    import cast_vehicles as cv
    j = cv.load_jet("concept", name=name + "_body")
    return rig(j["body"], name, yaw=math.pi / 2)


# ---------------------------------------------------------------- les agents, figés

def officer(pose="guard", style=0, name="officer", gun=True):
    """Un agent (cast_people, uniforme sans insigne), posé puis figé en maillage statique : on peut alors en
    poser plusieurs en copies liées. L'origine est au sol, il regarde vers −y (face() le tourne). Renvoie l'objet."""
    import cast_people as cp
    arm = cp.load_officer("spp", name=f"{name}_rig")
    cp.pose_officer(arm, pose, style=style)
    if gun:
        cp.attach_handgun(arm, cp.load_handgun("service"))
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    parts = []
    for o in [arm] + list(arm.children_recursive):
        if o.type != "MESH":
            continue
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=False, depsgraph=dg)
        me.transform(o.matrix_world)
        ob = bpy.data.objects.new(f"{name}_part", me)
        bpy.context.scene.collection.objects.link(ob)
        parts.append(ob)
    for o in [arm] + list(arm.children_recursive):
        bpy.data.objects.remove(o, do_unlink=True)
    body = S.join(parts, name)
    S.recentre(body)
    return body


# ---------------------------------------------------------------- volumes locaux

def smoke(name, loc, size, density=0.25, color="#cfcbe0", seed=0.0):
    """La fumée des pneus : un ellipsoïde de volume au bruit déchiqueté, plus dense au centre et au sol."""
    m, N, out = S.material(name)
    co = N.new("ShaderNodeTexCoord").outputs["Object"]
    nz = N.new("ShaderNodeTexNoise", _noise_dimensions="4D", Scale=2.2, Detail=8.0, Roughness=0.62, W=seed)
    N.link(co, nz.inputs["Vector"])
    vl = N.new("ShaderNodeVectorMath", _operation="LENGTH")
    N.link(co, vl.inputs[0])
    fall = N.math("POWER", N.math("MAXIMUM", N.math("SUBTRACT", 1.0, vl.outputs["Value"]), 0.0), 1.2)
    dens = N.math("MULTIPLY", N.math("MULTIPLY", N.math("MAXIMUM", N.math("SUBTRACT", nz.outputs["Factor"], 0.42), 0.0), fall),
                  density * 10.0)
    v = N.new("ShaderNodeVolumePrincipled", Color=lin(color), Anisotropy=0.35)
    N.link(dens, v.inputs["Density"])
    N.link(v.outputs[0], out.inputs["Volume"])
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1.0, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = size
    ob.data.materials.append(m)
    ob.visible_shadow = False
    return ob


# ---------------------------------------------------------------- caméras

def camera(name, loc, target, lens=35.0, fstop=2.8, focus=None, shift=(0.0, 0.0), roll=0.0, active=True):
    """Une caméra du film (capteur 36 mm sur la hauteur de l'image verticale), visée sur `target`,
    mise au point sur `focus` (un point, sinon la cible)."""
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    cam.sensor_fit = "AUTO"
    cam.sensor_width = 36
    cam.shift_x, cam.shift_y = shift
    cam.clip_start = 0.05
    cam.clip_end = 12000
    cam.dof.use_dof = fstop > 0
    cam.dof.aperture_fstop = max(fstop, 0.5)
    cam.dof.aperture_blades = 7
    ob = bpy.data.objects.new(name, cam)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_mode = "XYZ"
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if roll:
        ob.rotation_euler.rotate_axis("Z", math.radians(roll))
    cam.dof.focus_distance = (Vector(focus or target) - Vector(loc)).length
    if active:
        bpy.context.scene.camera = ob
    return ob


# ---------------------------------------------------------------- rendu

def use_gpu(scene):
    """Metal sur le Mac (OptiX ou CUDA sur une machine louée) ; CPU si rien."""
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        devs = [d for d in prefs.devices if d.type == kind]
        if devs:
            for d in prefs.devices:
                d.use = d.type == kind
            scene.cycles.device = "GPU"
            print(f"[lieux] GPU {kind} : {', '.join(d.name for d in devs)}", flush=True)
            return True
    print("[lieux] aucun GPU, rendu sur CPU", flush=True)
    return False


def _images_of(mats):
    out = set()
    for m in mats:
        if m and m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image:
                    out.add(n.image.name)
                elif n.type == "GROUP" and n.node_tree:
                    for g in n.node_tree.nodes:
                        if g.type == "TEX_IMAGE" and g.image:
                            out.add(g.image.name)
    return out


def cap_images(px=1024, keep_objects=()):
    """Ramène à `px` de côté toutes les images plus grandes de la scène, sauf celles des matières des objets
    `keep_objects` (et de leurs enfants) : le premier plan garde ses 2K. Blender et Cycles en tiennent chacun une
    copie : sur les plans de l'eau, les seize images 2K pesaient autant que tout le reste de la scène. Renvoie
    le nombre d'images réduites."""
    mats = []
    for ob in keep_objects:
        for o in [ob] + list(ob.children_recursive):
            if o.type == "MESH":
                mats += [s.material for s in o.material_slots]
    keep = _images_of(mats)
    n = 0
    for im in bpy.data.images:
        if im.name in keep or not im.users or im.source not in ("FILE", "GENERATED"):
            continue
        w, h = im.size
        if max(w, h) > px:
            f = px / max(w, h)
            im.scale(max(1, int(w * f)), max(1, int(h * f)))
            n += 1
    print(f"[lieux] {n} images ramenées à {px} px ({len(keep)} gardées au premier plan)", flush=True)
    return n


def car_fill(car, loc=(0.4, 8.0, 2.2), energy=500.0, color="#f2e4d4", size=4.0):
    """Une source douce de face qui n'éclaire que la voiture (liaison de lumière, mêmes collections que
    scene_d.split_for_car) : une lumière de surface accrochée au rig, en `loc` dans son repère (+y vers l'avant),
    tournée vers le milieu de la caisse, invisible à la caméra, à la brume et aux reflets du sol (le sol ne la
    reçoit pas). À contre-jour, la peinture se lit sans que le sol se rallume."""
    in_c = bpy.data.collections.get(f"{car.name}_lumiere_avec")
    if in_c is None:
        in_c = bpy.data.collections.new(f"{car.name}_lumiere_avec")
        for o in car.children_recursive:
            if o.type == "MESH":
                in_c.objects.link(o)
    d = bpy.data.lights.new(f"{car.name}_face", "AREA")
    d.shape = "DISK"
    d.size = size
    d.energy = energy
    d.color = lin(color)[:3]
    lo = bpy.data.objects.new(d.name, d)
    bpy.context.scene.collection.objects.link(lo)
    lo.parent = car
    lo.location = loc
    lo.rotation_mode = "QUATERNION"
    lo.rotation_quaternion = (Vector((0.0, 0.0, 0.8)) - Vector(loc)).to_track_quat("-Z", "Y")
    lo.visible_camera = False
    lo.visible_volume_scatter = False
    lo.light_linking.receiver_collection = in_c
    return lo


def stats():
    """Triangles et lumières de la scène (pour le journal)."""
    dg = bpy.context.evaluated_depsgraph_get()
    tri = 0
    seen = set()
    for inst in dg.object_instances:
        ob = inst.object
        if ob.type == "MESH" and ob.data.name not in seen:
            seen.add(ob.data.name)
            tri += sum(len(p.vertices) - 2 for p in ob.data.polygons)
    nl = len([o for o in bpy.context.scene.objects if o.type == "LIGHT"])
    return tri, nl
