# Les gens du film 3D : le conducteur (capuche relevée, gants de cuir) et les
# policiers (silhouettes à contre-jour), des rigs posés par code.
#
# À importer depuis une scène Blender (cast.py de la session principale) :
#
#   sys.path.insert(0, "tools/film3d/lab"); import cast_people as cp
#   arm = cp.load_driver()                                  # rig + maillages, 1,78 m, matières unies
#   cp.place_driver(arm, hip_point, forward)                # bassin sur le siège, regard vers l'avant
#   cp.pose_driver_wheel(arm, wheel_center, wheel_radius, wheel_normal)
#   cp.pose_driver_hands_up(arm)                            # l'arrestation, assis
#   cop = cp.load_officer("spp"); cp.pose_officer(cop, "aim"|"crouch"|"guard", style=0|1|2)
#   gun = cp.load_handgun(); cp.attach_handgun(cop, gun)
#   objs = cp.cast_driver_seated(wheel_center, seat_point)  # conducteur posé, mains au volant, dans le coupé
#   objs = cp.cast_lineup()                                 # conducteur mains levées + trois policiers armés
#
# État au 11 nov. : vérifié en rendu (GPU, 128 éch.) sauf, NON TESTÉS : la casquette de Tuzzy liée par
# _skin_to_bone (vérifiée en chiffres seulement, suit la tête dans les trois poses), les styles 1 et 2 de
# pose_officer, le buste à 20° du « crouch », la coupe des faces étirées du sweat (_cut_stretched, vue en
# Workbench), et dans cast_people_render.py : l'habitacle repris de cast.py et la planche « situation ».
#
# Les modèles (licences CC0 / CC BY, crédits dans le rapport du laboratoire) sont
# lus dans $FILM3D_ASSETS/cast/<dossier>/. Aucun code venu d'un téléchargement
# n'est exécuté : on ne fait qu'importer des glTF.
#
# Tout est en espace armature : après chargement, le personnage est debout à
# l'origine, pieds au sol, face à -Y (sa gauche en +X). On le place ensuite en
# déplaçant l'objet armature ; les fonctions de pose prennent leurs cibles en
# coordonnées monde et les ramènent dans l'espace de l'armature.
import math
import os
import re

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.environ.get("FILM3D_ASSETS") or os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "design", "film", "assets"))
CAST = os.path.join(ASSETS, "cast")
HEIGHT = 1.78

# rôles des os (noms Mixamo sans préfixe ni suffixe numérique)
FINGERS = ("Thumb", "Index", "Middle", "Ring", "Pinky")

# les candidats, par rôle ; « route » : A = modèle habillé et riggé, re-posé ;
# R = modèle habillé statique, riggé ici (squelette Mixamo d'un autre modèle, recalé sur ses articulations,
# puis poids automatiques de Blender, nettoyés) ; B = corps riggé habillé d'une pièce séparée liée à un os
# (la capuche du conducteur). Le corps neutre « Basic Human Male » (DNC44) a été essayé et écarté : son rig
# se déforme mal (doigts étirés) et le mannequin ne tient pas la comparaison.
DONOR = "cop-spp/model.glb"   # le squelette Mixamo du policier SPP, éprouvé par les poses ci-dessous
DRIVERS = {
    # « JayB3e Rapper (Rigged) » (route A) est écarté : à l'import glTF de Blender, ses vêtements restent
    # détachés du squelette (liaisons de peau incohérentes, maillages à des milliers d'unités).
    # bras le long du corps : articulations relevées sur le maillage (tranches horizontales, 1,78 m, face à -Y)
    "hoodie": dict(path="drv-hoodie-lp/model.glb", route="R", donor=DONOR, joints={
        "Left": dict(shoulder=(0.185, 0.02, 1.42), elbow=(0.235, 0.0, 1.12), wrist=(0.19, -0.11, 0.90),
                     tip=(0.17, -0.14, 0.75), across=(0, -1, 0)),
        "Right": dict(shoulder=(-0.20, 0.06, 1.42), elbow=(-0.275, 0.14, 1.12), wrist=(-0.265, 0.05, 0.86),
                      tip=(-0.26, 0.04, 0.73), across=(0, -1, 0)),
    }),
    # route B : le corps riggé du policier TUZZY, tout en noir, coiffé d'une capuche nouée (scan d'un vêtement)
    "hooded": dict(path="cop-tuzzy/model.glb", route="B", hood="hood-scarf/model.glb", hood_yaw=180.0),
}
OFFICERS = {
    "spp": dict(path="cop-spp/model.glb", route="A"),
    "tuzzy": dict(path="cop-tuzzy/model.glb", route="A", cap=True),
    "aayush": dict(path="cop-aayush/model.glb", route="R", donor=DONOR),
    "mystery": dict(path="cop-mystery/model.glb", route="R", donor=DONOR, cap=True),
}
CAP = "cap-aramuor/model.glb"
HANDGUNS = {
    "service": "gun-service/service_pistol.gltf",
    "t77": "gun-t77/model.glb",
}


def lin(hexcolor, a=1.0):
    h = hexcolor.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, a)


def _upd():
    bpy.context.view_layer.update()


# ---------------------------------------------------------------- matières

_MATS = {}


def _principled(name, color, rough, sheen=0.0, coat=0.0, spec=0.5, bump=0.0, bump_scale=900.0):
    try:
        if name in _MATS and _MATS[name].name in bpy.data.materials:
            return _MATS[name]
    except ReferenceError:   # fichier rechargé entre deux scènes
        pass
    m = bpy.data.materials.new(name)
    if hasattr(m, "use_nodes"):
        m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    p = nt.nodes.new("ShaderNodeBsdfPrincipled")
    p.inputs["Base Color"].default_value = color
    p.inputs["Roughness"].default_value = rough
    p.inputs["Specular IOR Level"].default_value = spec
    if sheen:
        p.inputs["Sheen Weight"].default_value = sheen
        p.inputs["Sheen Roughness"].default_value = 0.6
    if coat:
        p.inputs["Coat Weight"].default_value = coat
        p.inputs["Coat Roughness"].default_value = 0.35
    if bump:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        no = nt.nodes.new("ShaderNodeTexNoise")
        no.inputs["Scale"].default_value = bump_scale
        no.inputs["Detail"].default_value = 2.0
        nt.links.new(tc.outputs["Object"], no.inputs["Vector"])
        b = nt.nodes.new("ShaderNodeBump")
        b.inputs["Strength"].default_value = bump
        b.inputs["Distance"].default_value = 0.0005
        nt.links.new(no.outputs["Fac"], b.inputs["Height"])
        nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    nt.links.new(p.outputs[0], out.inputs[0])
    m.diffuse_color = color
    _MATS[name] = m
    return m


def mat_cotton():
    """Coton noir mat du sweat à capuche : presque noir, très rugueux, un voile de duvet (sheen)."""
    return _principled("ppl_cotton_black", lin("#151517"), 0.92, sheen=0.2, spec=0.3, bump=0.25, bump_scale=1400)


def mat_leather():
    """Cuir noir des gants : plus lisse, un vernis léger qui accroche les gyrophares."""
    return _principled("ppl_leather_black", lin("#0d0d0e"), 0.36, coat=0.25, spec=0.6, bump=0.15, bump_scale=600)


def mat_navy():
    """Uniforme marine sombre, sans aucun insigne."""
    return _principled("ppl_uniform_navy", lin("#1b2233"), 0.78, sheen=0.25, spec=0.35, bump=0.2, bump_scale=1200)


def mat_belt():
    return _principled("ppl_belt_black", lin("#0e0e10"), 0.42, coat=0.1, spec=0.55)


def mat_skin():
    """Peau neutre des policiers (jamais lisible à contre-jour)."""
    return _principled("ppl_skin_neutral", lin("#6e5a4e"), 0.55, spec=0.4)


def mat_hair():
    return _principled("ppl_hair_dark", lin("#1a1612"), 0.6, spec=0.3)


def mat_gun():
    return _principled("ppl_gun_black", lin("#131416"), 0.4, spec=0.6, coat=0.0)


def mat_gun_metal():
    m = _principled("ppl_gun_metal", lin("#2a2b2e"), 0.33, spec=0.5)
    m.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 1.0
    return m


def _set_all(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)


# ---------------------------------------------------------------- import

def _import(path):
    """Importe un glTF ; renvoie (armature ou None, maillages), sans les vides, la sphère d'environnement
    de Sketchfab, les animations ; poses remises au repos, transformations appliquées (tout en monde)."""
    before = set(bpy.data.objects)
    acts_before = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path if os.path.isabs(path) else os.path.join(CAST, path))
    new = [o for o in bpy.data.objects if o not in before]
    clips = sorted(a.name for a in bpy.data.actions if a not in acts_before)
    arms = [o for o in new if o.type == "ARMATURE"]
    arm = arms[0] if arms else None
    for o in new:
        if o.type == "MESH" and (o.name.startswith("Icosphere") or not o.data.polygons):
            bpy.data.objects.remove(o)
    new = [o for o in bpy.data.objects if o not in before]
    if arm:
        act = arm.animation_data.action if arm.animation_data else None
        single = act is not None and act.frame_range[1] - act.frame_range[0] < 1.0
        if single:
            # une seule image (la T-pose de l'export) : c'est elle qui recale les maillages sur le
            # squelette ; on la fige comme pose de repos
            bpy.context.scene.frame_set(int(act.frame_range[0]))
            _upd()
            _bake_rest(arm, [o for o in new if o.type == "MESH"])
        if arm.animation_data:
            arm.animation_data_clear()
        for pb in arm.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)
    _upd()
    meshes = [o for o in new if o.type == "MESH"]
    for o in [arm] + meshes if arm else meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in new:
        if o.type not in ("MESH", "ARMATURE"):
            bpy.data.objects.remove(o)
    for o in meshes:
        if o.data.users > 1:
            o.data = o.data.copy()
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
        if arm:
            for md in o.modifiers:
                if md.type == "ARMATURE":
                    md.object = arm
    if arm:
        arm.data.transform(arm.matrix_world)
        arm.matrix_world = Matrix.Identity(4)
        for o in meshes:
            o.parent = arm
            o.matrix_parent_inverse = Matrix.Identity(4)
        for b in arm.data.bones:
            if b.name == "_rootJoint" or re.search(r"(HeadTop_End|4|_End|ToeEnd)$", canon(b.name)):
                b.use_deform = False
        arm["clips"] = ", ".join(clips)
    _upd()
    return arm, meshes


def _bake_rest(arm, meshes):
    """Fige la pose courante : modificateurs Armature appliqués, pose appliquée comme repos, modificateurs remis."""
    for o in meshes:
        for md in list(o.modifiers):
            if md.type == "ARMATURE":
                with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
                    bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.context.view_layer.objects.active = arm
    with bpy.context.temp_override(object=arm, active_object=arm, selected_objects=[arm]):
        bpy.ops.object.mode_set(mode="POSE")
        bpy.ops.pose.select_all(action="SELECT")
        bpy.ops.pose.armature_apply(selected=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    for o in meshes:
        if o.vertex_groups:
            md = o.modifiers.new("Armature", "ARMATURE")
            md.object = arm
    _upd()


def _bbox(meshes):
    pts = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in meshes:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        mw = o.matrix_world
        pts += [mw @ v.co for v in me.vertices]
        ev.to_mesh_clear()
    mn = Vector(map(min, *pts))
    mx = Vector(map(max, *pts))
    return mn, mx


def _transform_all(arm, meshes, M):
    for o in meshes:
        o.data.transform(M)
    if arm:
        arm.data.transform(M)
    _upd()


def _normalise(arm, meshes, height=HEIGHT):
    """Debout à l'origine, pieds à z = 0, face à -Y, hauteur réelle."""
    if arm:
        bm = bone_map(arm)
        if "LeftArm" in bm and "RightArm" in bm:
            L = arm.data.bones[bm["LeftArm"]].head_local
            R = arm.data.bones[bm["RightArm"]].head_local
            H = arm.data.bones[bm["Head"]].head_local
            Hp = arm.data.bones[bm["Hips"]].head_local
            up = (H - Hp).normalized()
            if up.z < 0.7:   # couché : on le relève
                q = up.rotation_difference(Vector((0, 0, 1)))
                _transform_all(arm, meshes, q.to_matrix().to_4x4())
                L, R = arm.data.bones[bm["LeftArm"]].head_local, arm.data.bones[bm["RightArm"]].head_local
            right = R - L
            right.z = 0
            fwd = Vector((0, 0, 1)).cross(right.normalized())
            ang = math.atan2(fwd.x, -fwd.y)   # angle de fwd par rapport à -Y
            if abs(ang) > 1e-3:
                _transform_all(arm, meshes, Matrix.Rotation(ang, 4, "Z"))
    mn, mx = _bbox(meshes)
    s = height / (mx.z - mn.z)
    c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    if arm:
        hp = arm.data.bones[bone_map(arm)["Hips"]].head_local
        c.x, c.y = hp.x, hp.y
    _transform_all(arm, meshes, Matrix.Scale(s, 4) @ Matrix.Translation(-c))
    return s


def _join(meshes, name):
    if len(meshes) == 1:
        meshes[0].name = name
        return meshes[0]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    return ob


# ---------------------------------------------------------------- os

def canon(name):
    n = name.split(":")[-1]
    return re.sub(r"_\d+$", "", n)


def bone_map(arm):
    return {canon(b.name): b.name for b in arm.data.bones}


def pb(arm, role):
    return arm.pose.bones[bone_map(arm)[role]]


def _side(s):
    return "Left" if s in ("L", "Left", "l") else "Right"


def _rotate_about(p, q, pivot):
    T = Matrix.Translation(pivot)
    p.matrix = T @ q.to_matrix().to_4x4() @ Matrix.Translation(-pivot) @ p.matrix
    _upd()


def _rot(arm, role, axis, deg):
    p = pb(arm, role)
    _rotate_about(p, Quaternion(Vector(axis).normalized(), math.radians(deg)), p.head.copy())


def _child_head(arm, role):
    """Tête du premier os enfant (ou la queue de l'os) : sert de « direction » de l'os."""
    p = pb(arm, role)
    kids = [c for c in p.children if c.bone.use_deform or canon(c.name).endswith(("4", "End"))]
    order = {"Hand": "HandMiddle1", "Spine2": "Neck", "Hips": "Spine", "Neck": "Head"}
    want = None
    for k, v in order.items():
        if canon(p.name).endswith(k):
            want = v
    if want:
        for c in p.children:
            if canon(c.name).endswith(want):
                return c.head.copy()
    if kids:
        return kids[0].head.copy()
    return p.tail.copy()


def aim(arm, role, direction, ref=None):
    """Tourne l'os pour que sa direction (vers son enfant) suive `direction` (espace armature), rotation minimale."""
    p = pb(arm, role)
    cur = (ref if ref is not None else _child_head(arm, role)) - p.head
    if cur.length < 1e-6 or direction.length < 1e-6:
        return
    q = cur.normalized().rotation_difference(direction.normalized())
    _rotate_about(p, q, p.head.copy())


def _rest_dir(arm, role, child_role):
    bm = bone_map(arm)
    return (arm.data.bones[bm[child_role]].head_local - arm.data.bones[bm[role]].head_local).normalized()


def two_bone(arm, upper, lower, end, target, pole):
    """IK analytique à deux os : la tête de `end` va sur `target`, le coude/genou vers `pole` (espace armature)."""
    A = pb(arm, upper).head.copy()
    B = pb(arm, lower).head.copy()
    C = pb(arm, end).head.copy()
    l1, l2 = (B - A).length, (C - B).length
    d = target - A
    dist = min(max(d.length, abs(l1 - l2) + 1e-4), (l1 + l2) * 0.9995)
    u = d.normalized()
    cosa = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)
    sina = math.sqrt(max(0.0, 1 - cosa * cosa))
    v = pole - u * pole.dot(u)
    if v.length < 1e-6:
        v = Vector((0, 0, 1)) - u * u.z
    v.normalize()
    E = A + u * (l1 * cosa) + v * (l1 * sina)
    aim(arm, upper, E - A, ref=B)
    B = pb(arm, lower).head.copy()
    aim(arm, lower, (A + u * dist) - B, ref=pb(arm, end).head.copy())
    return d.length - dist   # > 0 : la cible est hors de portée (m)


def _calibrate_palms(arm):
    """Signe de la normale de paume par côté, mesuré au repos (T-pose Mixamo : paumes vers le bas)."""
    for s in ("Left", "Right"):
        n = _palm_raw(arm, s)
        ref = Vector((0, 0, -1))
        hand_dir = (pb(arm, s + "HandMiddle1").head - pb(arm, s + "Hand").head).normalized()
        if abs(hand_dir.z) > 0.7:   # bras le long du corps : paumes vers les cuisses
            ref = Vector((-1 if s == "Left" else 1, 0, 0))
        arm["palm_" + s] = 1.0 if n.dot(ref) >= 0 else -1.0


def _palm_raw(arm, s):
    s = _side(s)
    across = pb(arm, s + "HandIndex1").head - pb(arm, s + "HandPinky1").head
    d = pb(arm, s + "HandMiddle1").head - pb(arm, s + "Hand").head
    return across.cross(d).normalized()


def palm_normal(arm, s):
    s = _side(s)
    return _palm_raw(arm, s) * arm.get("palm_" + s, 1.0)


def set_hand(arm, s, direction, palm):
    """Main : direction poignet → jointures, puis rotation autour de cet axe pour que la paume regarde `palm`."""
    s = _side(s)
    aim(arm, s + "Hand", direction)
    d = direction.normalized()
    want = palm - d * palm.dot(d)
    if want.length < 1e-6:
        return
    want.normalize()
    have = palm_normal(arm, s)
    have = (have - d * have.dot(d)).normalized()
    ang = math.atan2(d.dot(have.cross(want)), have.dot(want))
    p = pb(arm, s + "Hand")
    # l'avant-bras prend une part de la torsion, pour ne pas vriller le poignet
    fa = pb(arm, s + "ForeArm")
    fa_axis = (p.head - fa.head).normalized()
    _rotate_about(fa, Quaternion(fa_axis, ang * 0.45), fa.head.copy())
    have = palm_normal(arm, s)
    d = (_child_head(arm, s + "Hand") - p.head).normalized()
    have = (have - d * have.dot(d)).normalized()
    ang = math.atan2(d.dot(have.cross(want)), have.dot(want))
    _rotate_about(p, Quaternion(d, ang), p.head.copy())


def curl(arm, s, angles=(70, 80, 60), thumb=(20, 25, 20), spread=0.0):
    """Doigts repliés vers la paume (degrés par phalange) ; `spread` écarte les doigts (degrés)."""
    s = _side(s)
    bm = bone_map(arm)
    for f in FINGERS:
        angs = thumb if f == "Thumb" else angles
        for i, a in enumerate(angs, start=1):
            role = f"{s}Hand{f}{i}"
            if role not in bm or not a:
                continue
            p = pb(arm, role)
            nxt = f"{s}Hand{f}{i + 1}"
            d = ((pb(arm, nxt).head if nxt in bm else p.tail) - p.head).normalized()
            n = palm_normal(arm, s)
            if f == "Thumb":   # le pouce se replie vers l'index, au-dessus de la paume
                n = (n + (pb(arm, s + "HandIndex1").head - p.head).normalized()).normalized()
            axis = d.cross(n)
            if axis.length < 1e-6:
                continue
            _rotate_about(p, Quaternion(axis.normalized(), math.radians(a)), p.head.copy())
        if spread and f != "Thumb" and f"{s}Hand{f}1" in bm:
            k = {"Index": -1.0, "Middle": -0.3, "Ring": 0.4, "Pinky": 1.0}[f]
            p = pb(arm, f"{s}Hand{f}1")
            _rotate_about(p, Quaternion(palm_normal(arm, s), math.radians(spread * k * (1 if s == "Left" else -1))), p.head.copy())


def reset_pose(arm):
    for p in arm.pose.bones:
        p.matrix_basis = Matrix.Identity(4)
    _upd()


def _to_arm(arm, v, point=True):
    M = arm.matrix_world.inverted()
    return M @ Vector(v) if point else (M.to_3x3() @ Vector(v))


# repère du personnage (espace armature, après _normalise)
F, B, L, R, U, D = (Vector((0, -1, 0)), Vector((0, 1, 0)), Vector((1, 0, 0)), Vector((-1, 0, 0)),
                    Vector((0, 0, 1)), Vector((0, 0, -1)))


def _out(s):
    return L if _side(s) == "Left" else R


def _move_hips(arm, delta):
    p = pb(arm, "Hips")
    M = p.matrix.copy()
    M.translation = M.translation + delta
    p.matrix = M
    _upd()


def _spine_bend(arm, deg_forward, deg_side=0.0, deg_twist=0.0):
    """Courbe la colonne vers l'avant (degrés, répartis sur Spine, Spine1, Spine2)."""
    for role, k in (("Spine", 0.4), ("Spine1", 0.3), ("Spine2", 0.3)):
        if deg_forward:
            _rot(arm, role, L, deg_forward * k)
        if deg_side:
            _rot(arm, role, F, deg_side * k)
        if deg_twist:
            _rot(arm, role, U, deg_twist * k)


def _head_look(arm, direction):
    """Oriente la tête (et un peu le cou) vers une direction : l'axe cou → sommet suit la verticale
    penchée vers `direction`."""
    up = pb(arm, "Head").tail - pb(arm, "Head").head
    want = (U * 1.0 + direction.normalized() * 0.0)
    # inclinaison : on fait pointer l'avant du visage vers direction (plan sagittal)
    fwd_now = F.copy()
    q = fwd_now.rotation_difference(direction.normalized())
    for role, k in (("Neck", 0.4), ("Head", 0.6)):
        p = pb(arm, role)
        _rotate_about(p, Quaternion(q.axis, q.angle * k) if q.angle > 1e-4 else Quaternion(), p.head.copy())
    return up, want


def _leg(arm, s, ankle, knee_dir, foot_dir=None):
    s = _side(s)
    two_bone(arm, s + "UpLeg", s + "Leg", s + "Foot", ankle, knee_dir)
    rest = _rest_dir(arm, s + "Foot", s + "ToeBase")
    if foot_dir is None:
        foot_dir = rest
    aim(arm, s + "Foot", foot_dir)


def _ankle_h(arm):
    bm = bone_map(arm)
    return arm.data.bones[bm["LeftFoot"]].head_local.z


def _hip_w(arm):
    bm = bone_map(arm)
    return abs(arm.data.bones[bm["LeftUpLeg"]].head_local.x - arm.data.bones[bm["RightUpLeg"]].head_local.x)


# ---------------------------------------------------------------- chargement

def _classify_by_texture(ob):
    """Couleur de base moyenne par face (texture échantillonnée aux UV) : pour repeindre un atlas par zones."""
    import numpy as np
    me = ob.data
    if not me.uv_layers or not me.materials:
        return None
    out = np.zeros((len(me.polygons), 3))
    imgs = {}
    for mi, m in enumerate(me.materials):
        img = _find_image(m) if m else None
        if img is not None and img.size[0] > 0:
            w, h = img.size
            px = np.empty(w * h * 4, dtype=np.float32)
            img.pixels.foreach_get(px)
            imgs[mi] = (px.reshape(h, w, 4), w, h)
        elif m is not None:
            imgs[mi] = tuple(m.diffuse_color)
    uv = np.empty(len(me.loops) * 2, dtype=np.float64)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    for i, poly in enumerate(me.polygons):
        src = imgs.get(poly.material_index)
        if src is None:
            continue
        if len(src) == 4:
            out[i] = src[:3]
            continue
        px, w, h = src
        cs = []
        idx = list(range(poly.loop_start, poly.loop_start + poly.loop_total))
        cu = uv[idx].mean(axis=0)
        for u, v in [tuple(cu)] + [tuple(uv[j] * 0.6 + cu * 0.4) for j in idx]:
            x = int((u % 1.0) * (w - 1))
            y = int((v % 1.0) * (h - 1))
            cs.append(px[y, x, :3])
        out[i] = np.median(np.array(cs), axis=0)
    return out


def _find_image(mat):
    if not mat or not mat.node_tree:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            src = n.inputs["Base Color"].links
            while src:
                node = src[0].from_node
                if node.type == "TEX_IMAGE":
                    return node.image
                ins = [i for i in node.inputs if i.links]
                src = ins[0].links if ins else None
    return None


def _hsv(c):
    import colorsys
    # linéaire → sRGB approximatif, pour juger les teintes
    c = [max(0.0, min(1.0, x)) ** (1 / 2.2) for x in c]
    return colorsys.rgb_to_hsv(*c)


def _assign_by_faces(ob, classes, mats):
    """classes : une clé par face ; mats : clé → matière."""
    keys = sorted(set(classes))
    ob.data.materials.clear()
    slot = {}
    for k in keys:
        slot[k] = len(ob.data.materials)
        ob.data.materials.append(mats[k])
    for poly, k in zip(ob.data.polygons, classes):
        poly.material_index = slot[k]


def _hand_faces(ob, arm, thresh=0.5, extra=()):
    """Faces dont les sommets sont surtout pondérés sur les os de la main (pour les gants)."""
    names = {b.name for b in arm.data.bones if re.search(r"Hand", canon(b.name))}
    names |= {b.name for b in arm.data.bones if canon(b.name) in extra}
    gi = {g.index for g in ob.vertex_groups if g.name in names}
    if not gi:
        return set()
    wv = []
    for v in ob.data.vertices:
        tot = sum(g.weight for g in v.groups)
        hw = sum(g.weight for g in v.groups if g.group in gi)
        wv.append(hw / tot if tot > 0 else 0.0)
    return {p.index for p in ob.data.polygons if sum(wv[i] for i in p.vertices) / len(p.vertices) > thresh}


def _remove_faces(ob, idx):
    if not idx:
        return
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in idx], context="FACES")
    bm.to_mesh(ob.data)
    bm.free()


def _fit_donor(arm, meshes, joints=None):
    """Recale le squelette Mixamo d'un corps neutre sur un modèle statique en T-pose : bras orientés et
    allongés selon le nuage de points des bras, jambes selon celui des jambes."""
    import numpy as np
    pts = []
    for o in meshes:
        pts += [tuple(o.matrix_world @ v.co) for v in o.data.vertices]
    P = np.array(pts)
    bm = bone_map(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones

    def chain(prefix_roles):
        return [eb[bm[r]] for r in bm if any(r.startswith(p) for p in prefix_roles)]

    def slice_centre(sg, z, dz=0.015, xmin=0.02):
        s = P[(P[:, 0] * sg > xmin) & (np.abs(P[:, 2] - z) < dz)]
        return Vector(s.mean(axis=0)) if len(s) > 10 else None

    def move_chain(roles, M):
        for b in chain(roles):
            b.transform(M, scale=True, roll=True)

    def frame(d, a):
        d = d.normalized()
        a = (a - d * a.dot(d)).normalized()
        return Matrix((d, a, d.cross(a))).transposed()

    # jambes : genou et cheville sur l'axe des jambes du modèle (tranches horizontales)
    for s, sg in (("Left", 1), ("Right", -1)):
        hip = eb[bm[s + "UpLeg"]].head.copy()
        knee_z = eb[bm[s + "Leg"]].head.z
        ank_z = eb[bm[s + "Foot"]].head.z
        k = slice_centre(sg, knee_z)
        a = slice_centre(sg, ank_z + 0.03)
        if k is None or a is None:
            continue
        a.z = ank_z
        old_a = eb[bm[s + "Foot"]].head.copy()
        eb[bm[s + "UpLeg"]].tail = k
        eb[bm[s + "Leg"]].head = k
        eb[bm[s + "Leg"]].tail = a
        move_chain([s + "Foot", s + "ToeBase", s + "Toe_End"], Matrix.Translation(a - old_a))
        eb[bm[s + "Leg"]].tail = a
    for s, sg in (("Left", 1), ("Right", -1)):
        sh = eb[bm[s + "Arm"]].head.copy()
        wrist = eb[bm[s + "Hand"]].head.copy()
        hand_d = (eb[bm[s + "HandMiddle1"]].head - wrist)
        hand_a = eb[bm[s + "HandIndex1"]].head - eb[bm[s + "HandPinky1"]].head
        if joints and s in joints:
            # bras donnés à la main (modèle bras le long du corps) : épaule, coude, poignet, bout des doigts
            J = {k_: Vector(v) for k_, v in joints[s].items()}
            eb[bm[s + "Shoulder"]].tail = J["shoulder"]
            eb[bm[s + "Arm"]].head = J["shoulder"]
            eb[bm[s + "Arm"]].tail = J["elbow"]
            eb[bm[s + "ForeArm"]].head = J["elbow"]
            eb[bm[s + "ForeArm"]].tail = J["wrist"]
            hd = J["tip"] - J["wrist"]
            ha = Vector(J.get("across", (0, -1, 0)))
            R_ = frame(hd, ha) @ frame(hand_d, hand_a).inverted()
            sc = hd.length / ((hand_d.length) * 1.9)
            M = Matrix.Translation(J["wrist"]) @ R_.to_4x4() @ Matrix.Scale(sc, 4) @ Matrix.Translation(-wrist)
            move_chain([s + "Hand"], M)
            eb[bm[s + "ForeArm"]].tail = J["wrist"]
            continue
        # T-pose : axe des bras par ACP des points au-delà de l'épaule
        sel = P[(P[:, 0] * sg > abs(sh.x) + 0.08) & (P[:, 2] > 1.0)]
        if len(sel) < 50:
            continue
        c = sel.mean(axis=0)
        _, _, vt = np.linalg.svd(sel - c)
        axis = Vector(vt[0])
        if axis.x * sg < 0:
            axis = -axis
        reach = float(((sel - np.array(sh)) @ np.array(axis)).max())
        donor_axis = (wrist - sh).normalized()
        tip = max((b.tail for b in chain([s + "Hand"])), key=lambda t: (t - sh).dot(donor_axis))
        donor_reach = (tip - sh).dot(donor_axis)
        k = reach / donor_reach
        q = donor_axis.rotation_difference(axis)
        line_pt = Vector(c) + axis * (sh - Vector(c)).dot(axis)
        off = line_pt - sh
        off.x = 0
        M = Matrix.Translation(sh + off) @ q.to_matrix().to_4x4() @ Matrix.Scale(k, 4) @ Matrix.Translation(-sh)
        move_chain([s + "Arm", s + "ForeArm", s + "Hand"], M)
        eb[bm[s + "Shoulder"]].tail = eb[bm[s + "Arm"]].head
    bpy.ops.object.mode_set(mode="OBJECT")


def _auto_weights(arm, ob):
    """Poids automatiques (chaleur des os) ; les sommets restés sans poids prennent ceux du plus proche voisin pondéré."""
    bm_ = bmesh.new()
    bm_.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm_, verts=bm_.verts, dist=1e-5)
    bm_.to_mesh(ob.data)
    bm_.free()
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    vs = ob.data.vertices
    weighted = [v.index for v in vs if any(g.weight > 1e-4 for g in v.groups)]
    empty = [v.index for v in vs if not any(g.weight > 1e-4 for g in v.groups)]
    if empty and weighted:
        kd = KDTree(len(weighted))
        for i in weighted:
            kd.insert(vs[i].co, i)
        kd.balance()
        groups = ob.vertex_groups
        for i in empty:
            _, j, _ = kd.find(vs[i].co)
            for g in vs[j].groups:
                groups[g.group].add([i], g.weight, "REPLACE")
    return len(empty), len(vs)


def _donor_rig(donor_path):
    arm, meshes = _import(donor_path)
    _normalise(arm, meshes)
    for o in meshes:
        bpy.data.objects.remove(o)
    return arm


def _rig_static(meshes, donor, joints=None):
    """Route R : rigge un modèle habillé statique avec le squelette recalé d'un corps neutre."""
    ob = _join(meshes, "body")
    _normalise(None, [ob])
    arm = _donor_rig(donor)
    _fit_donor(arm, [ob], joints)
    for md in list(ob.modifiers):
        ob.modifiers.remove(md)
    n_empty, n = _auto_weights(arm, ob)
    how = "heat"
    if n_empty > 0.3 * n:   # la chaleur a échoué : poids au plus proche segment d'os
        for g in list(ob.vertex_groups):
            ob.vertex_groups.remove(g)
        _segment_weights(arm, ob)
        how = "segments"
    stripped = _clean_arm_bleed(arm, ob)
    stripped += _clean_far(arm, ob)
    stripped += _island_hands(arm, ob)
    arm["weights_filled"] = f"{how}, {n_empty}/{n} vides, {stripped} sommets rendus au corps"
    return arm, [ob]


def _island_hands(arm, ob):
    """Pièces séparées du maillage (gant, poche, cuisse) : une pièce surtout pondérée sur une main n'est tenue
    que par cette main ; une pièce qui ne l'est presque pas perd tout poids de main (la main posée sur la
    hanche n'emporte plus la hanche)."""
    import numpy as np
    me = ob.data
    n = len(me.vertices)
    parent = np.arange(n)

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for e in me.edges:
        a, b = find(e.vertices[0]), find(e.vertices[1])
        if a != b:
            parent[a] = b
    roots = np.array([find(i) for i in range(n)])
    bones = {b.name: canon(b.name) for b in arm.data.bones}
    changed = 0
    for s in ("Left", "Right"):
        hand = {g.index for g in ob.vertex_groups if bones.get(g.name, "").startswith(s + "Hand")}
        keep_arm = hand | {g.index for g in ob.vertex_groups if bones.get(g.name) == s + "ForeArm"}
        if not hand:
            continue
        frac = np.zeros(n)
        for v in me.vertices:
            tot = sum(g.weight for g in v.groups)
            if tot > 0:
                frac[v.index] = sum(g.weight for g in v.groups if g.group in hand) / tot
        for r in np.unique(roots):
            idx = np.nonzero(roots == r)[0]
            if len(idx) < 20:
                continue
            m = frac[idx].mean()
            if m < 0.25 and frac[idx].max() > 0:
                for i in idx[frac[idx] > 0]:
                    v = me.vertices[int(i)]
                    others = [(g.group, g.weight) for g in v.groups if g.group not in hand and g.weight > 1e-4]
                    for gidx in [g.group for g in v.groups if g.group in hand]:
                        ob.vertex_groups[gidx].remove([int(i)])
                    if not others:
                        fa = [g.index for g in ob.vertex_groups if bones.get(g.name) == s + "ForeArm"]
                        if fa:
                            ob.vertex_groups[fa[0]].add([int(i)], 1.0, "REPLACE")
                    changed += 1
            elif m > 0.75:
                for i in idx:
                    v = me.vertices[int(i)]
                    drop = [g.group for g in v.groups if g.group not in keep_arm]
                    if not drop:
                        continue
                    if not any(g.group in keep_arm and g.weight > 1e-4 for g in v.groups):
                        ob.vertex_groups[next(iter(hand))].add([int(i)], 1.0, "REPLACE")
                    for gidx in drop:
                        ob.vertex_groups[gidx].remove([int(i)])
                    changed += 1
    return changed


def _clean_far(arm, ob, limit=0.2):
    """Retire tout poids d'un os dont le segment est à plus de `limit` m du sommet (fuites lointaines)."""
    import numpy as np
    V = np.array([tuple(v.co) for v in ob.data.vertices])
    bones = {b.name: b for b in arm.data.bones}
    dist = {}
    n = 0
    for g in ob.vertex_groups:
        b = bones.get(g.name)
        if b is None:
            continue
        dist[g.index] = _seg_dist(V, np.array(b.head_local), np.array(b.tail_local))
    for i, v in enumerate(ob.data.vertices):
        bad = [g.group for g in v.groups if g.group in dist and dist[g.group][i] > limit]
        if not bad:
            continue
        keep = [g.group for g in v.groups if g.group not in bad and g.weight > 1e-4]
        j = None
        if not keep:
            j = min(dist, key=lambda k: dist[k][i])
            ob.vertex_groups[j].add([i], 1.0, "REPLACE")
        for k in bad:
            if k != j:
                ob.vertex_groups[k].remove([i])
        n += 1
    return n


def _segments(arm, bones):
    import numpy as np
    return [(b.name, np.array(b.head_local), np.array(b.tail_local)) for b in bones]


def _seg_dist(V, a, c):
    import numpy as np
    ab = c - a
    t = np.clip(((V - a) @ ab) / max(ab @ ab, 1e-9), 0.0, 1.0)
    return np.linalg.norm(V - (a + t[:, None] * ab), axis=1)


def _segment_weights(arm, ob):
    """Poids par distance aux segments des os (repli quand la chaleur échoue)."""
    import numpy as np
    V = np.array([tuple(v.co) for v in ob.data.vertices])
    segs = _segments(arm, [b for b in arm.data.bones if b.use_deform])
    Dm = np.stack([_seg_dist(V, a, c) for _, a, c in segs], axis=1)
    dmin = Dm.min(axis=1, keepdims=True)
    W = np.where(Dm < dmin * 1.25 + 0.008, 1.0 / (Dm + 0.004) ** 4, 0.0)
    W /= W.sum(axis=1, keepdims=True)
    for j, (name, _, _) in enumerate(segs):
        vg = ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)
        for i in np.nonzero(W[:, j] > 0.01)[0]:
            vg.add([int(i)], float(W[i, j]), "REPLACE")
    if not any(m.type == "ARMATURE" for m in ob.modifiers):
        md = ob.modifiers.new("Armature", "ARMATURE")
        md.object = arm
    ob.parent = arm


def _clean_arm_bleed(arm, ob):
    """Bras le long du corps : la chaleur colle des cuisses et des flancs aux os du bras. Un sommet pondéré sur
    un bras mais plus proche du corps (bassin, colonne, jambes) que de ce bras est rendu au corps."""
    import numpy as np
    V = np.array([tuple(v.co) for v in ob.data.vertices])
    bones = arm.data.bones
    body = [b for b in bones if b.use_deform and re.match(r"(Hips|Spine\d?|Neck|(Left|Right)(UpLeg|Leg))$", canon(b.name))]
    bs = _segments(arm, body)
    Db = np.stack([_seg_dist(V, a, c) for _, a, c in bs], axis=1)
    d_body = Db.min(axis=1)
    near_body = [bs[j][0] for j in Db.argmin(axis=1)]
    stripped = 0
    for s in ("Left", "Right"):
        armb = [b for b in bones if re.match(s + r"(Arm|ForeArm|Hand.*)$", canon(b.name))]
        names = {b.name for b in armb}
        gi = {g.index: g for g in ob.vertex_groups if g.name in names}
        if not gi:
            continue
        # distance « relative » au bras : à chaque segment son rayon (manche ample du haut, main gantée)
        rel, Da = None, None
        for pat, radius in ((r"Arm$", 0.11), (r"ForeArm$", 0.09), (r"Hand.*$", 0.06)):
            part = [b for b in armb if re.match(s + pat, canon(b.name))]
            if not part:
                continue
            d = np.stack([_seg_dist(V, a, c) for _, a, c in _segments(arm, part)], axis=1).min(axis=1)
            rel = d / radius if rel is None else np.minimum(rel, d / radius)
            Da = d if Da is None else np.minimum(Da, d)
        for i, v in enumerate(ob.data.vertices):
            gs = [g.group for g in v.groups if g.group in gi and g.weight > 0]
            if not gs or (rel[i] <= 1.0 and Da[i] <= 0.75 * d_body[i]):
                continue
            for g in gs:
                gi[g].remove([i])
            if not any(g.weight > 1e-4 for g in v.groups):
                vg = ob.vertex_groups.get(near_body[i]) or ob.vertex_groups.new(name=near_body[i])
                vg.add([i], 1.0, "REPLACE")
            stripped += 1
    return stripped


def _paint_officer(arm, meshes, variant):
    """Uniforme marine uni, ceinture et chaussures noires, gants noirs, peau neutre ; aucun insigne."""
    navy, belt, skin, hair, glove = mat_navy(), mat_belt(), mat_skin(), mat_hair(), mat_leather()
    kept = []
    for ob in meshes:
        names = [m.name.lower() if m else "" for m in ob.data.materials]
        joined = " ".join(names)
        if variant == "spp" or re.search(r"top|bottom|shoe|hat|hair|beard|eye", joined):
            mn = names[0] if names else ""
            if re.search(r"eyewear|eyes|eyelash", mn):
                bpy.data.objects.remove(ob)
                continue
            kept.append(ob)
            if "top" in mn or "bottom" in mn or "hat" in mn:
                _set_all(ob, navy)
            elif "shoe" in mn:
                _set_all(ob, belt)
            elif re.search(r"hair|beard|moustache", mn):
                _set_all(ob, hair)
            else:
                _set_all(ob, skin)
            continue
        # atlas unique : on classe chaque face par la couleur de sa texture
        kept.append(ob)
        cols = _classify_by_texture(ob)
        classes = []
        for c in (cols if cols is not None else [(0.02, 0.02, 0.03)] * len(ob.data.polygons)):
            h, s, v = _hsv(c)
            if 0.0 <= h <= 0.12 and 0.18 < s < 0.75 and v > 0.3:
                classes.append("skin")
            elif v < 0.14:
                classes.append("belt")
            else:
                classes.append("navy")   # uniforme, et tout ce qui brille (badges, galons, boutons) repeint en marine
        hands = _hand_faces(ob, arm, 0.5) if arm else set()
        classes = ["glove" if i in hands else k for i, k in enumerate(classes)]
        _assign_by_faces(ob, classes, {"skin": skin, "belt": belt, "navy": navy, "glove": glove})
    meshes = kept
    # gants sur les maillages de corps séparés (spp)
    for ob in meshes:
        if ob.data.materials and ob.data.materials[0] == skin and arm:
            hands = _hand_faces(ob, arm, 0.5)
            if hands:
                classes = ["glove" if p.index in hands else "skin" for p in ob.data.polygons]
                _assign_by_faces(ob, classes, {"skin": skin, "glove": glove})
    return meshes


def _world_coords(o):
    """Sommets tels qu'affichés (après le modificateur d'armature), en repère monde : sur certains rigs le
    maillage de repos n'est pas à l'endroit où l'armature le pose."""
    _upd()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    pts = [ev.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return pts


def _bone_parent(ob, arm, bone_name):
    """Lie un objet à un os sans qu'il bouge : inverse de parent explicite (un parent d'os se rapporte à la
    queue de l'os dans sa pose courante)."""
    _upd()
    mw = ob.matrix_world.copy()
    pbone = arm.pose.bones[bone_name]
    P = arm.matrix_world @ pbone.matrix @ Matrix.Translation((0, pbone.bone.length, 0))
    ob.parent = arm
    ob.parent_type = "BONE"
    ob.parent_bone = bone_name
    ob.matrix_parent_inverse = P.inverted()
    ob.matrix_basis = mw
    _upd()


def _skin_to_bone(ob, arm, bone_name):
    """Lie un vêtement à un os par un modificateur d'armature (poids 1 sur cet os) : il suit l'os
    exactement comme les sommets du corps pesés sur lui, même quand l'os est mal placé dans le rig
    (Tuzzy : bout de tête au sol, os de tête de 3 m). La déformation de liaison est mesurée sur le maillage
    évalué puis compensée, pour que le vêtement ne bouge pas à la liaison."""
    import numpy as np
    _upd()
    before = np.array([tuple(ob.matrix_world @ v.co) for v in ob.data.vertices])
    mw = ob.matrix_world.copy()
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()
    ob.matrix_basis = arm.matrix_world.inverted() @ mw
    vg = ob.vertex_groups.new(name=bone_name)
    vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
    md = ob.modifiers.new("armature", "ARMATURE")
    md.object = arm
    after = np.array([tuple(c) for c in _world_coords(ob)])
    # affine A (monde) telle que after = A @ before, aux moindres carrés
    X = np.hstack([before, np.ones((len(before), 1))])
    sol, *_ = np.linalg.lstsq(X, after, rcond=None)
    A = Matrix(np.vstack([sol.T, [0, 0, 0, 1]]).tolist())
    M = ob.matrix_world.copy()
    ob.data.transform(M.inverted() @ A.inverted() @ M)
    _upd()
    err = max((Vector(p) - Vector(q)).length for p, q in zip(_world_coords(ob), before))
    ob["bind_error"] = err


def _static(path):
    """Un accessoire importé comme objet figé : son éventuel squelette et ses modificateurs sont retirés
    après avoir appliqué la déformation."""
    carm, ms = _import(path)
    dg = bpy.context.evaluated_depsgraph_get()
    for o in ms:
        if o.modifiers:
            ev = o.evaluated_get(dg)
            me = bpy.data.meshes.new_from_object(ev)
            me.transform(o.matrix_world)
            old = o.data
            o.modifiers.clear()
            o.data = me
            o.matrix_world = Matrix.Identity(4)
            bpy.data.meshes.remove(old)
        o.parent = None
    if carm:
        bpy.data.objects.remove(carm)
    return ms


def _head_top(arm, meshes):
    """Sommet du crâne pris sur le maillage affiché (l'os de bout de tête est mal placé sur certains rigs)."""
    h = arm.matrix_world @ pb(arm, "Head").head
    pts = []
    for o in meshes:
        gi = [g.index for g in o.vertex_groups if canon(g.name) == "Head"]
        if not gi:
            continue
        co = _world_coords(o)
        if len(co) != len(o.data.vertices):
            continue
        for v in o.data.vertices:
            if any(e.group == gi[0] and e.weight > 0.5 for e in v.groups):
                pts.append(co[v.index])
    if len(pts) > 50:
        # sur certains rigs (Tuzzy) l'os de la tête n'est pas dans la tête du maillage : on prend la tête
        # telle que pesée
        zs = sorted(p.z for p in pts)
        return Vector((sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts),
                       zs[int(len(zs) * 0.995)]))
    zs = []
    for o in meshes:
        zs += [co.z for co in _world_coords(o)
               if abs(co.x - h.x) < 0.12 and abs(co.y - h.y) < 0.15 and h.z - 0.05 < co.z < h.z + 0.35]
    zs.sort()
    # quelques sommets égarés au-dessus du crâne (Tuzzy) : on prend le 99,5e centile
    zt = zs[int(len(zs) * 0.995)] if zs else h.z + 0.12
    return Vector((h.x, h.y, zt))


def _head_half_width(meshes, top, lo, hi):
    hw = 0.0
    for o in meshes:
        for co in _world_coords(o):
            if top.z - hi < co.z < top.z - lo and abs(co.y - top.y) < 0.15 and abs(co.x - top.x) < 0.15:
                hw = max(hw, abs(co.x - top.x))
    return hw or 0.085


def _add_cap(arm, meshes):
    """Casquette d'uniforme (modèle séparé) posée sur la tête, liée à l'os de la tête."""
    cm = _static(CAP)
    cap = _join(cm, "cap")
    mn, mx = _bbox([cap])
    head = pb(arm, "Head")
    top = _head_top(arm, meshes)
    # tour de tête : largeur des sommets du crâne
    hw = _head_half_width(meshes, top, 0.03, 0.09)
    s = (2 * hw * 1.12) / (mx.x - mn.x)
    c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    cap.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation(-c))
    # visière vers l'avant : l'avancée la plus longue du bord
    mn, mx = _bbox([cap])
    if abs(mx.y) > abs(mn.y):
        cap.data.transform(Matrix.Rotation(math.pi, 4, "Z"))
    cap.location = Vector((top.x, top.y + 0.005, top.z - 0.075))
    cap.rotation_euler = (math.radians(-6), 0, 0)
    _upd()
    _set_all(cap, mat_navy())
    _skin_to_bone(cap, arm, head.name)
    return cap


def load_officer(variant="spp", name=None):
    """Un policier riggé, 1,78 m, uniforme marine uni sans insigne, ceinture noire, casquette, gants noirs.
    Renvoie l'objet armature (les maillages en sont les enfants)."""
    spec = OFFICERS[variant]
    arm, meshes = _import(spec["path"])
    if spec["route"] == "R":
        arm, meshes = _rig_static(meshes, spec["donor"], spec.get("joints"))
    _normalise(arm, meshes)
    _calibrate_palms(arm)
    meshes = _paint_officer(arm, meshes, variant)
    if spec.get("cap"):
        meshes.append(_add_cap(arm, meshes))
    arm.name = name or f"officer_{variant}"
    arm["variant"] = variant
    arm["route"] = spec["route"]
    arm["tris"] = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    return arm


def _add_hood(arm, meshes, path, yaw_deg=0.0):
    """Route B : une capuche (vêtement séparé) posée sur la tête, liée à l'os de la tête, coton noir."""
    hm = _static(path)
    hood = _join(hm, "hood")
    if yaw_deg:
        hood.data.transform(Matrix.Rotation(math.radians(yaw_deg), 4, "Z"))
    mn, mx = _bbox([hood])
    top = _head_top(arm, meshes)
    hw = _head_half_width(meshes, top, 0.04, 0.10)
    s = (2 * hw * 1.45) / (mx.x - mn.x)
    c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mx.z))
    hood.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation(-c))
    hood.location = Vector((top.x, top.y + 0.02, top.z + 0.03))
    _upd()
    _set_all(hood, mat_cotton())
    _skin_to_bone(hood, arm, pb(arm, "Head").name)
    return hood


def _islands(o):
    """Îlots de faces connexes (par sommets partagés)."""
    parent = list(range(len(o.data.vertices)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for poly in o.data.polygons:
        vs = list(poly.vertices)
        for v in vs[1:]:
            a, b = find(vs[0]), find(v)
            if a != b:
                parent[a] = b
    groups = {}
    for poly in o.data.polygons:
        groups.setdefault(find(poly.vertices[0]), []).append(poly.index)
    return list(groups.values())


def _island_sizes(o):
    return {len(isl) for isl in _islands(o)}


def _cut_stretched(arm, meshes, ratio=2.2, min_len=0.05):
    """Route R : là où la main de repos touchait la hanche, des faces relient la main au corps et
    s'étirent en baguettes quand le bras se lève. On lève les bras pour les repérer, on les supprime
    (le trou reste dans le noir du sweat), puis on revient au repos."""
    pose_driver_hands_up(arm, seated=False)
    _upd()
    dg = bpy.context.evaluated_depsgraph_get()
    cut = 0
    for o in meshes:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        posed = [v.co.copy() for v in me.vertices]
        ev.to_mesh_clear()
        rest = [v.co for v in o.data.vertices]
        if len(posed) != len(rest):
            continue
        bad = []
        for poly in o.data.polygons:
            vs = list(poly.vertices)
            for a, b in zip(vs, vs[1:] + vs[:1]):
                lp = (posed[a] - posed[b]).length
                lr = (rest[a] - rest[b]).length
                if lp > min_len and lp > ratio * max(lr, 1e-4):
                    bad.append(poly.index)
                    break
        before = _island_sizes(o)
        _remove_faces(o, bad)
        cut += len(bad)
        # les bouts détachés par la coupe (restes de la main collée à la hanche) flottent : on les retire
        after = _islands(o)
        small = [f for isl in after if len(isl) < 300 and len(isl) not in before for f in isl]
        _remove_faces(o, small)
        cut += len(small)
    reset_pose(arm)
    _upd()
    arm["stretched_cut"] = cut
    return cut


def load_driver(variant="hooded", name=None):
    """Le conducteur : capuche relevée, tout en coton noir mat, gants de cuir noir, aucune peau.
    Renvoie l'objet armature."""
    spec = DRIVERS[variant]
    arm, meshes = _import(spec["path"])
    if spec["route"] == "R":
        arm, meshes = _rig_static(meshes, spec["donor"], spec.get("joints"))
    _normalise(arm, meshes)
    _calibrate_palms(arm)
    if spec["route"] == "R":
        _cut_stretched(arm, meshes)
    cotton, leather = mat_cotton(), mat_leather()
    for ob in list(meshes):
        names = " ".join(m.name.lower() for m in ob.data.materials if m)
        if spec["route"] == "B" and re.search(r"eye|lash", names):
            bpy.data.objects.remove(ob)
            meshes.remove(ob)
            continue
        hands = _hand_faces(ob, arm, 0.45)
        classes = ["glove" if p.index in hands else "cotton" for p in ob.data.polygons]
        _assign_by_faces(ob, classes, {"cotton": cotton, "glove": leather})
    if spec.get("hood"):
        meshes.append(_add_hood(arm, meshes, spec["hood"], spec.get("hood_yaw", 0.0)))
    arm.name = name or f"driver_{variant}"
    arm["variant"] = variant
    arm["route"] = spec["route"]
    arm["tris"] = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    return arm


def load_handgun(variant="service"):
    """Pistolet générique (sans marquage), noir mat ; origine au centre de la poignée, canon vers +X,
    dessus vers +Z, taille réelle (~19 cm)."""
    arm, meshes = _import(HANDGUNS[variant])
    if variant == "service":
        keep = [o for o in meshes if re.search(r"(pistol|slide|hammer|trigger)_a$", o.name)]
        for o in meshes:
            if o not in keep:
                bpy.data.objects.remove(o)
        meshes = keep
    else:
        for o in meshes:
            for md in list(o.modifiers):
                o.modifiers.remove(md)
        if arm:
            bpy.data.objects.remove(arm)
    for o in meshes:
        o.parent = None
    gun = _join(meshes, f"handgun_{variant}")
    _set_all(gun, mat_gun())
    # longueur canon : axe le plus long ; poignée : les sommets les plus bas
    mn, mx = _bbox([gun])
    size = mx - mn
    ax = max(range(3), key=lambda i: size[i])
    vs = [v.co.copy() for v in gun.data.vertices]
    if ax != 0:   # canon sur X
        rot = Matrix.Rotation(math.pi / 2, 4, "Z") if ax == 1 else Matrix.Rotation(-math.pi / 2, 4, "Y")
        gun.data.transform(rot)
        vs = [v.co.copy() for v in gun.data.vertices]
    zs = sorted(v.z for v in vs)
    zmin, zmax = zs[0], zs[-1]
    up_ax = 2
    # la poignée descend sous le canon : la moitié basse est décalée d'un côté
    low = [v for v in vs if v.z < zmin + 0.3 * (zmax - zmin)]
    high = [v for v in vs if v.z > zmax - 0.2 * (zmax - zmin)]
    if len(low) < len(high) * 0.3:   # à l'envers : poignée en haut
        gun.data.transform(Matrix.Rotation(math.pi, 4, "X"))
        vs = [v.co.copy() for v in gun.data.vertices]
        zmin, zmax = min(v.z for v in vs), max(v.z for v in vs)
        low = [v for v in vs if v.z < zmin + 0.3 * (zmax - zmin)]
    gx = sum(v.x for v in low) / len(low)
    xs = [v.x for v in vs]
    if abs(max(xs) - gx) < abs(min(xs) - gx):   # le canon est du côté le plus loin de la poignée
        gun.data.transform(Matrix.Rotation(math.pi, 4, "Z"))
        vs = [v.co.copy() for v in gun.data.vertices]
        low = [v for v in vs if v.z < zmin + 0.3 * (zmax - zmin)]
        gx = sum(v.x for v in low) / len(low)
    length = max(v.x for v in vs) - min(v.x for v in vs)
    s = 0.19 / length
    gy = sum(v.y for v in vs) / len(vs)
    gz = zmin + 0.55 * (zmax - zmin)   # centre de la paume sur la poignée
    gun.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation(-Vector((gx, gy, gz))))
    gun.matrix_world = Matrix.Identity(4)
    gun["muzzle"] = (max(v.co.x for v in gun.data.vertices), 0.0,
                     max(v.co.z for v in gun.data.vertices) - 0.012)
    return gun


def attach_handgun(arm, gun, side="Right"):
    """Met le pistolet dans la main (poignée dans la paume, canon dans l'axe de la main), lié à l'os de la main.
    Le point de sortie du canon (pour l'éclair) est `gun["muzzle"]` en coordonnées locales du pistolet."""
    s = _side(side)
    h = pb(arm, s + "Hand")
    d = (_child_head(arm, s + "Hand") - h.head).normalized()
    n = palm_normal(arm, s)
    n = (n - d * n.dot(d)).normalized()
    up = d.cross(n) if s == "Right" else n.cross(d)
    # le canon monte un peu au-dessus de l'axe de la main (la poignée est inclinée de ~18°)
    bx = (d * math.cos(math.radians(14)) + up * math.sin(math.radians(14))).normalized()
    up = bx.cross(n).normalized() if s == "Right" else n.cross(bx).normalized()
    if up.dot(d.cross(n) if s == "Right" else n.cross(d)) < 0:
        up = -up
    y = up.cross(bx)
    rot = Matrix((bx, y, up)).transposed().to_4x4()
    grip = h.head + d * 0.075 + n * 0.025
    M = arm.matrix_world @ Matrix.Translation(grip) @ rot
    gun.parent = arm
    gun.parent_type = "BONE"
    gun.parent_bone = h.name
    _upd()
    gun.matrix_world = M
    _upd()
    return gun


# ---------------------------------------------------------------- poses

def _arms_aim(arm, low_ready=False):
    """Visée à deux mains (isocèle) : bras tendus, mains jointes devant l'axe des yeux ; ou position basse."""
    sh = (pb(arm, "LeftArm").head + pb(arm, "RightArm").head) / 2
    if low_ready:
        g = sh + F * 0.36 + D * 0.42 + R * 0.02
        gun_dir = (F + D * 0.85).normalized()
    else:
        g = sh + F * 0.56 + D * 0.03 + R * 0.025
        gun_dir = F.copy()
    # main droite : la poignée ; main gauche : enveloppe la droite par dessous et par le côté
    hand_len = 0.075
    rw = g - gun_dir * hand_len + U * 0.0 + L * 0.0
    lw = g - gun_dir * (hand_len - 0.01) + L * 0.05 + D * 0.02
    two_bone(arm, "RightArm", "RightForeArm", "RightHand", rw, R * 0.9 + D * 1.0)
    two_bone(arm, "LeftArm", "LeftForeArm", "LeftHand", lw, L * 0.9 + D * 1.0)
    set_hand(arm, "R", gun_dir, L)
    set_hand(arm, "L", (gun_dir + R * 0.35).normalized(), (R + U * 0.6).normalized())
    curl(arm, "R", angles=(75, 85, 55), thumb=(10, 20, 15))
    bm = bone_map(arm)
    # l'index reste presque tendu le long de la carcasse (hors détente)
    if "RightHandIndex1" in bm:
        for i, a in ((1, -60), (2, -60), (3, -40)):
            p = pb(arm, f"RightHandIndex{i}")
            dd = (p.tail - p.head).normalized()
            ax = dd.cross(palm_normal(arm, "R"))
            if ax.length > 1e-6:
                _rotate_about(p, Quaternion(ax.normalized(), math.radians(a)), p.head.copy())
    curl(arm, "L", angles=(70, 75, 50), thumb=(15, 15, 10))


def _stand(arm, crouch=0.0, stagger=0.12, width=1.25, shift=0.0):
    """Pieds au sol (écart de bassin × width), pied droit reculé de `stagger`, genoux légèrement fléchis ;
    `shift` déporte le bassin vers la gauche du personnage (+) ou sa droite (-) : le poids sur une jambe.
    Les pieds sont placés depuis le bassin d'avant le déport."""
    hw = _hip_w(arm) * 0.5 * width
    ah = _ankle_h(arm)
    hp = pb(arm, "Hips").head.copy()
    _move_hips(arm, D * (0.035 + crouch + abs(shift) * 0.25) + L * shift)
    _leg(arm, "L", Vector((hp.x + hw, hp.y - 0.06, ah)), F + U * 0.2, (F + D * 0.45).normalized())
    _leg(arm, "R", Vector((hp.x - hw, hp.y + stagger, ah)), F + U * 0.2 + R * 0.25, (F + R * 0.35 + D * 0.45).normalized())


# Variantes d'attitude (NON TESTÉ en rendu, 11 nov.) : poids sur une jambe, buste penché et tourné,
# écart et recul de pied ; style 0 = l'attitude d'origine (celle des planches).
STYLES = [
    dict(shift=0.0, lean=0.0, twist=0.0, stagger=0.0, width=0.0, fwd=0.0),
    dict(shift=0.055, lean=-4.0, twist=-8.0, stagger=0.07, width=0.25, fwd=3.0),
    dict(shift=-0.045, lean=3.5, twist=6.0, stagger=-0.05, width=-0.3, fwd=-2.0),
]


def pose_officer(arm, pose="aim", style=0):
    """« aim » : debout, visée à deux mains ; « crouch » : un genou au sol, derrière une portière, buste
    penché sur le haut de la portière ; « guard » : debout, arme basse à deux mains. `style` (0, 1, 2…)
    varie l'attitude d'un policier à l'autre (voir STYLES ; 1 et 2 non testés en rendu)."""
    st = STYLES[style % len(STYLES)]
    reset_pose(arm)
    if pose == "aim":
        _stand(arm, crouch=0.0, stagger=0.16 + st["stagger"], width=1.9 + st["width"], shift=st["shift"])
        _spine_bend(arm, 7 + st["fwd"], deg_side=st["lean"], deg_twist=-6 + st["twist"])
        _arms_aim(arm)
        _head_look(arm, (F + D * 0.12).normalized())
    elif pose == "guard":
        _stand(arm, crouch=-0.015, stagger=0.05 + st["stagger"], width=1.8 + st["width"], shift=st["shift"] * 1.3)
        _spine_bend(arm, 4 + st["fwd"], deg_side=st["lean"] * 1.2, deg_twist=st["twist"])
        _arms_aim(arm, low_ready=True)
        _head_look(arm, (F + D * 0.08 + L * 0.1 * style).normalized())
    elif pose == "crouch":
        hp0 = pb(arm, "Hips").head.copy()
        ah = _ankle_h(arm)
        thigh = (pb(arm, "LeftLeg").head - pb(arm, "LeftUpLeg").head).length
        shin = (pb(arm, "LeftFoot").head - pb(arm, "LeftLeg").head).length
        # genou droit au sol, sous le bassin ; pied gauche à plat devant
        hip_z = thigh * 0.97 + 0.07 + st["fwd"] * 0.008
        _move_hips(arm, Vector((0, 0, hip_z - hp0.z)) + L * st["shift"] * 0.6)
        hp = pb(arm, "Hips").head
        hw = _hip_w(arm) * 0.5
        _leg(arm, "R", Vector((hp.x - hw * 1.1, hp.y + shin * 0.92, ah + 0.03)), F + D * 0.2,
             (B * 0.2 + D * 1.0).normalized())
        _leg(arm, "L", Vector((hp.x + hw * 1.3, hp.y - thigh * 0.95, ah)), F + U * 1.0, (F + D * 0.4).normalized())
        # buste penché en appui sur la portière (plus en avant qu'avant : 20° au lieu de 14°)
        _spine_bend(arm, 20 + st["fwd"], deg_side=st["lean"] * 0.6, deg_twist=-4 + st["twist"] * 0.6)
        _arms_aim(arm)
        _head_look(arm, (F + D * 0.05).normalized())
    else:
        raise ValueError(pose)


def place_driver(arm, hip_point, forward=(0, -1, 0)):
    """Pose l'armature pour que le bassin (au repos) tombe sur `hip_point` (monde), regard vers `forward`."""
    fwd = Vector(forward)
    fwd.z = 0
    fwd.normalize()
    ang = math.atan2(fwd.x, -fwd.y)
    hp = arm.data.bones[bone_map(arm)["Hips"]].head_local
    arm.matrix_world = Matrix.Translation(Vector(hip_point)) @ Matrix.Rotation(ang, 4, "Z") @ Matrix.Translation(-hp)
    _upd()


def _seat(arm, recline=18, pedal=None):
    """Assis : cuisses vers l'avant (légèrement relevées), pieds vers les pédales, dos incliné."""
    hp = pb(arm, "Hips").head
    hw = _hip_w(arm) * 0.5
    thigh = (pb(arm, "LeftLeg").head - pb(arm, "LeftUpLeg").head).length
    shin = (pb(arm, "LeftFoot").head - pb(arm, "LeftLeg").head).length
    for s, sg in (("L", 1), ("R", -1)):
        if pedal is not None:
            ank = pedal + (L if sg > 0 else R) * hw * 1.1
        else:
            ank = hp + F * (thigh * 0.95 + shin * 0.55) + D * (shin * 0.62) + (L if sg > 0 else R) * hw * 1.15
        _leg(arm, s, ank, U * 1.0 + F * 0.3 + (L if sg > 0 else R) * 0.15, (F * 0.8 + D * 0.4).normalized())
    _spine_bend(arm, -recline)
    _head_look(arm, (F + U * math.tan(math.radians(0))).normalized())
    # la tête revient à la verticale du regard malgré le dossier
    for role, k in (("Neck", 0.5), ("Head", 0.5)):
        _rot(arm, role, L, recline * 0.75 * k)


def pose_driver_wheel(arm, wheel_center, wheel_radius, wheel_normal, grip_deg=62.0, clench=0.0, pedal=None,
                      recline=18):
    """Assis, les deux mains gantées serrées sur le volant à « dix heures dix » (grip_deg depuis le haut).
    wheel_center, wheel_normal (vers le conducteur) en coordonnées monde ; `clench` 0..1 crispe les doigts
    (la peur du plan P1). Renvoie l'écart de portée (m) par main, 0 si les mains touchent."""
    reset_pose(arm)
    Mi = arm.matrix_world.inverted()
    C = Mi @ Vector(wheel_center)
    N = (Mi.to_3x3() @ Vector(wheel_normal)).normalized()
    if pedal is not None:
        pedal = Mi @ Vector(pedal)
    _seat(arm, recline=recline, pedal=pedal)
    chest = pb(arm, "Spine2").head
    if N.dot(chest - C) < 0:
        N = -N
    wu = (U - N * U.dot(N)).normalized()
    wl = N.cross(wu)          # vers la gauche du conducteur, dans le plan du volant
    if wl.dot(L) < 0:
        wl = -wl
    miss = {}
    for s, sg in (("Left", 1), ("Right", -1)):
        a = math.radians(grip_deg)
        r_out = (wu * math.cos(a) + wl * math.sin(a) * sg).normalized()
        G = C + r_out * wheel_radius
        hand_dir = (-N * 0.78 - r_out * 0.35 + wu * 0.12).normalized()
        palm = (-r_out * 0.8 + N * 0.35).normalized()
        palm = (palm - hand_dir * palm.dot(hand_dir)).normalized()
        wrist = G - hand_dir * 0.07 - palm * 0.032
        pole = D * 1.0 + (L if sg > 0 else R) * 0.9 + B * 0.3
        miss[s] = two_bone(arm, s + "Arm", s + "ForeArm", s + "Hand", wrist, pole)
        set_hand(arm, s, hand_dir, palm)
        k = 1.0 + 0.15 * clench
        curl(arm, s, angles=(62 * k, 78 * k, 55 * k), thumb=(18, 30, 25))
    return miss


def pose_driver_hands_up(arm, seated=True, recline=10):
    """Les mains levées derrière le pare-brise : coudes à hauteur d'épaules, avant-bras droits, paumes vers l'avant."""
    reset_pose(arm)
    if seated:
        _seat(arm, recline=recline)
    else:
        _stand(arm, crouch=0.0, stagger=0.0, width=1.1)
    for s, sg in (("Left", 1), ("Right", -1)):
        _rot(arm, s + "Shoulder", F, 8 * sg)
        sh = pb(arm, s + "Arm").head
        out = L if sg > 0 else R
        wrist = sh + out * 0.30 + U * 0.36 + F * 0.12
        two_bone(arm, s + "Arm", s + "ForeArm", s + "Hand", wrist, out * 1.0 + D * 0.7 + B * 0.2)
        set_hand(arm, s, (U + out * 0.12 + F * 0.05).normalized(), F)
        curl(arm, s, angles=(8, 10, 6), thumb=(-5, 5, 5), spread=6)
    _head_look(arm, (F + D * 0.05).normalized())


def stats(arm):
    """Résumé : variante, route, triangles, clips d'animation fournis."""
    return dict(name=arm.name, variant=arm.get("variant"), route=arm.get("route"), tris=arm.get("tris"),
                clips=arm.get("clips", ""), weights_filled=arm.get("weights_filled", ""))


# ---------------------------------------------------------------- intégration

# l'habitacle du coupé (coupe-hd.glb), en coordonnées glTF brutes (avant vers -Y, conduite à gauche, côté +X) :
# volant mesuré par ACP des sommets de « steering-wheel-rim », bassin 7 cm devant le dossier conducteur et
# 8,5 cm sous le haut des bourrelets de l'assise, pédales 42 cm devant le volant, 6 cm au-dessus du plancher
COUPE_WHEEL_CENTER = (0.439, 0.274, 0.841)   # centre de la jante (ACP sur steering-wheel-rim)
COUPE_WHEEL_NORMAL = (0.0, 0.912, 0.411)     # vers le conducteur, colonne inclinée de 24°
COUPE_WHEEL_RADIUS = 0.21                   # rayon médian de la jante
COUPE_HIP = (0.439, 0.592, 0.479)             # bassin : 7 cm devant le dossier, 8,5 cm sous le haut de l'assise
COUPE_PEDAL = (0.439, -0.146, 0.422)


def _objects(arm):
    return [arm] + [c for c in arm.children_recursive]


def cast_driver_seated(wheel_center=COUPE_WHEEL_CENTER, seat_point=COUPE_HIP, variant="hooded",
                       wheel_normal=COUPE_WHEEL_NORMAL, wheel_radius=COUPE_WHEEL_RADIUS, pedal=COUPE_PEDAL,
                       clench=0.0):
    """Le conducteur assis dans le coupé, mains gantées sur le volant, en coordonnées glTF brutes du coupé
    (le main l'emboîte ensuite dans le repère de la voiture). `seat_point` est le point de bassin (articulation
    des hanches). Renvoie la liste des objets (armature d'abord)."""
    arm = load_driver(variant)
    place_driver(arm, seat_point, (0, -1, 0))
    miss = pose_driver_wheel(arm, wheel_center, wheel_radius, wheel_normal, pedal=pedal, clench=clench)
    arm["wheel_miss"] = str({k: round(v, 3) for k, v in miss.items()})
    return _objects(arm)


def cast_lineup(driver="hooded", officer="spp", gun="service", gap=1.4):
    """La planche des gens : le conducteur mains levées, puis un policier dans chacune des trois poses,
    arme en main ; côte à côte autour de l'origine, tous face à -Y. Renvoie la liste des objets."""
    out = []
    xs = [(i - 1.5) * gap for i in range(4)]
    d = load_driver(driver)
    d.location.x = xs[0]
    _upd()
    pose_driver_hands_up(d, seated=False)   # debout dans la planche ; assis : pose_driver_hands_up(arm)
    out += _objects(d)
    for i, (x, pose) in enumerate(zip(xs[1:], ("aim", "crouch", "guard"))):
        a = load_officer(officer, name=f"officer_{officer}_{pose}")
        pose_officer(a, pose, style=i)
        attach_handgun(a, load_handgun(gun))
        a.location.x = x
        _upd()
        out += _objects(a)
    return out
