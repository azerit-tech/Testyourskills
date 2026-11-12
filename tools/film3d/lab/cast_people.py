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
# Au 12 nov. : matières, visages, variantes et conducteur vérifiés au banc (lab/people_bench.py, 256 éch.) :
# agents de face, de trois quarts et de dos, en joue, accroupis et en garde, sous des phares puis des néons ;
# conducteur au volant et mains levées, seul et derrière le pare-brise de la berline.
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


def _cached(name):
    try:
        if name in _MATS and _MATS[name].name in bpy.data.materials:
            return _MATS[name]
    except ReferenceError:
        pass
    return None


class _Nodes:
    """Une matière Principled vide et quelques raccourcis de nœuds (texture d'image, carte de normales, bruit)."""

    def __init__(self, name):
        m = bpy.data.materials.new(name)
        if hasattr(m, "use_nodes"):
            m.use_nodes = True
        self.m, self.nt = m, m.node_tree
        for n in list(self.nt.nodes):
            self.nt.nodes.remove(n)
        self.out = self.nt.nodes.new("ShaderNodeOutputMaterial")
        self.p = self.nt.nodes.new("ShaderNodeBsdfPrincipled")
        self.link(self.p.outputs[0], self.out.inputs[0])
        self._co = None

    def link(self, a, b):
        self.nt.links.new(a, b)

    def new(self, kind, **inputs):
        n = self.nt.nodes.new(kind)
        for k, v in inputs.items():
            if k.startswith("_"):
                setattr(n, k[1:], v)
            else:
                n.inputs[k].default_value = v
        return n

    def obj(self):
        if self._co is None:
            self._co = self.new("ShaderNodeTexCoord").outputs["Object"]
        return self._co

    def image(self, img, data=False):
        n = self.new("ShaderNodeTexImage")
        n.image = img
        if data:
            img.colorspace_settings.name = "Non-Color"
        return n

    def noise(self, scale, detail=2.0, lo=0.0, hi=1.0):
        nz = self.new("ShaderNodeTexNoise", Scale=scale, Detail=detail)
        self.link(self.obj(), nz.inputs["Vector"])
        mr = self.new("ShaderNodeMapRange", **{"From Min": 0.3, "From Max": 0.7, "To Min": lo, "To Max": hi})
        self.link(nz.outputs["Fac"], mr.inputs["Value"])
        return mr.outputs["Result"]

    def tinted(self, color, lo, hi, scale=8.0):
        """Couleur unie multipliée par un bruit à grande échelle (lo..hi) : la teinte d'un vrai tissu n'est pas égale."""
        self.link(self.scaled(color, self.noise(scale, 3.0, lo, hi)), self.p.inputs["Base Color"])

    def scaled(self, color, fac):
        """`color` (constante) multipliée par la valeur `fac` (une sortie de nœud)."""
        vm = self.new("ShaderNodeVectorMath", _operation="SCALE")
        vm.inputs[0].default_value = color[:3]
        self.link(fac, vm.inputs["Scale"])
        return vm.outputs["Vector"]

    def normal(self, nrm_img=None, strength=1.0, bumps=()):
        """Normale : la carte du modèle (s'il y en a une), puis des bosses de bruit (échelle, force, distance)."""
        nrm = None
        if nrm_img is not None:
            t = self.image(nrm_img, data=True)
            nm = self.new("ShaderNodeNormalMap", Strength=strength)
            self.link(t.outputs["Color"], nm.inputs["Color"])
            nrm = nm.outputs["Normal"]
        for scale, force, dist in bumps:
            nz = self.new("ShaderNodeTexNoise", Scale=scale, Detail=3.0)
            self.link(self.obj(), nz.inputs["Vector"])
            b = self.new("ShaderNodeBump", Strength=force, Distance=dist)
            self.link(nz.outputs["Fac"], b.inputs["Height"])
            if nrm is not None:
                self.link(nrm, b.inputs["Normal"])
            nrm = b.outputs["Normal"]
        if nrm is not None:
            self.link(nrm, self.p.inputs["Normal"])
        return nrm

    def done(self, name, preview):
        self.m.diffuse_color = preview
        _MATS[name] = self.m
        return self.m


def _set(p, **kw):
    names = {"base": "Base Color", "rough": "Roughness", "spec": "Specular IOR Level", "metal": "Metallic",
             "sheen": "Sheen Weight", "sheen_rough": "Sheen Roughness", "sheen_tint": "Sheen Tint",
             "coat": "Coat Weight", "coat_rough": "Coat Roughness", "sss": "Subsurface Weight",
             "sss_radius": "Subsurface Radius", "sss_scale": "Subsurface Scale", "ior": "IOR", "alpha": "Alpha"}
    for k, v in kw.items():
        p.inputs[names[k]].default_value = v


def mat_fabric(name, color, nrm=None, rough=0.86, sheen=0.22, nstrength=1.0, weave=0.35, tint="#9aa0ad"):
    """Drap de laine ou sergé sombre : couleur unie (aucun motif ni insigne du modèle), les plis et les coutures
    de la carte de normales du modèle, un grain de tissage fin, un velouté (sheen) qui prend la lumière rasante,
    une rugosité qui varie un peu, une teinte qui varie à grande échelle (l'usure, les reprises)."""
    m = _cached(name)
    if m:
        return m
    N = _Nodes(name)
    N.tinted(color, 0.82, 1.12)
    N.link(N.noise(30.0, 2.0, rough - 0.06, min(1.0, rough + 0.06)), N.p.inputs["Roughness"])
    _set(N.p, spec=0.32, sheen=sheen, sheen_rough=0.5, sheen_tint=lin(tint))
    N.normal(nrm, nstrength, bumps=((1600.0, weave, 0.0004), (220.0, 0.12, 0.001)))
    return N.done(name, color)


def mat_leather_tex(name, color=None, nrm=None, rough=0.42, coat=0.35, nstrength=1.0):
    """Cuir noir (ceinturon, étuis, chaussures, gants, visière) : un grain fin, une patine (rugosité tachée),
    un vernis léger qui accroche les phares."""
    m = _cached(name)
    if m:
        return m
    color = color or lin("#0b0a0a")
    N = _Nodes(name)
    _set(N.p, base=color, spec=0.5, coat=coat, coat_rough=0.28)
    N.link(N.noise(40.0, 4.0, rough - 0.12, rough + 0.12), N.p.inputs["Roughness"])
    N.normal(nrm, nstrength, bumps=((900.0, 0.18, 0.0003),))
    return N.done(name, color)


def mat_plate():
    """Plaque métallique unie (là où le modèle portait un insigne) : nickel satiné, aucun relief, aucun texte."""
    m = _cached("ppl_plate")
    if m:
        return m
    N = _Nodes("ppl_plate")
    _set(N.p, base=lin("#6a6965"), metal=1.0, rough=0.5)
    return N.done("ppl_plate", lin("#8d8b86"))


def mat_cotton(nrm=None, name="ppl_cotton_black"):
    """Coton noir mat du sweat à capuche : presque noir, très rugueux, un duvet léger (sheen) qui dessine les
    formes, le grain du jersey ; les plis d'une carte de normales si on en donne une (la capuche scannée). Pas
    celle du corps : c'est la carte d'un uniforme, poches et écusson compris."""
    m = _cached(name)
    if m:
        return m
    N = _Nodes(name)
    N.tinted(lin("#26262a"), 0.8, 1.1, scale=6.0)
    N.link(N.noise(25.0, 2.0, 0.84, 0.96), N.p.inputs["Roughness"])
    _set(N.p, spec=0.25, sheen=0.35, sheen_rough=0.45, sheen_tint=lin("#9a9aa2"))
    N.normal(nrm, 0.8, bumps=((2200.0, 0.3, 0.0003), (140.0, 0.18, 0.0015)))
    return N.done(name, lin("#26262a"))


def mat_void():
    """Le dedans de la capuche, là où serait le visage : un noir de velours sans reflet. Il garantit qu'aucun
    visage ne se lit, même sous des phares de face qui entrent droit dans la capuche."""
    m = _cached("ppl_hood_void")
    if m:
        return m
    N = _Nodes("ppl_hood_void")
    _set(N.p, base=lin("#030303"), rough=1.0, spec=0.0)
    return N.done("ppl_hood_void", lin("#030303"))


def mat_leather():
    """Cuir noir des gants : satiné, un grain fin ; peu de vernis (à 0,4 de rugosité et 0,3 de vernis, sous des
    phares de face, les gants brillaient comme du latex et blanchissaient derrière le pare-brise)."""
    return mat_leather_tex("ppl_leather_black", lin("#0d0d0e"), rough=0.58, coat=0.08)


def mat_glove_driver():
    """Les gants du conducteur : cuir fauve clair (albédo vers 0,3), satiné. Noirs, ils disparaissaient derrière le
    reflet du ciel dans le pare-brise : les mains levées sont le sens du plan final, elles doivent se lire."""
    return mat_leather_tex("ppl_glove_tan", lin("#b39575"), rough=0.6, coat=0.05)


def mat_navy():
    """Uniforme marine sombre, sans aucun insigne (sans carte de normales : la casquette rapportée de Tuzzy)."""
    return mat_fabric("ppl_uniform_navy", lin("#1b2233"))


def mat_belt():
    return mat_leather_tex("ppl_belt_black")


def mat_skin(base=None, nrm=None, tone=(0.0, 1.0, 1.0), name="ppl_skin_neutral"):
    """Peau : la texture du modèle (si donnée) passée par une teinte (décalage de teinte, saturation, valeur),
    une diffusion sous la surface courte (pas de cire), une rugosité qui varie, les pores de la carte de
    normales ; sans texture, une peau unie."""
    m = _cached(name)
    if m:
        return m
    N = _Nodes(name)
    if base is not None:
        t = N.image(base)
        hsv = N.new("ShaderNodeHueSaturation", Hue=0.5 + tone[0], Saturation=tone[1], Value=tone[2], Fac=1.0)
        N.link(t.outputs["Color"], hsv.inputs["Color"])
        N.link(hsv.outputs["Color"], N.p.inputs["Base Color"])
    else:
        _set(N.p, base=lin("#6e5a4e"))
    _set(N.p, sss=0.18, sss_radius=(1.0, 0.38, 0.2), sss_scale=0.004, ior=1.4, spec=0.45)
    N.link(N.noise(14.0, 3.0, 0.42, 0.6), N.p.inputs["Roughness"])
    N.normal(nrm, 0.6, bumps=((2600.0, 0.08, 0.0002),))
    return N.done(name, lin("#6e5a4e"))


def mat_eye(base, name="ppl_eye"):
    """Les yeux : la texture du modèle (iris, pupille), le blanc éteint, un film humide (vernis) qui attrape un
    reflet ; ni trou noir ni bille blanche."""
    m = _cached(name)
    if m:
        return m
    N = _Nodes(name)
    t = N.image(base)
    hsv = N.new("ShaderNodeHueSaturation", Hue=0.5, Saturation=0.9, Value=0.62, Fac=1.0)
    N.link(t.outputs["Color"], hsv.inputs["Color"])
    N.link(hsv.outputs["Color"], N.p.inputs["Base Color"])
    _set(N.p, rough=0.35, spec=0.3, coat=1.0, coat_rough=0.03)
    return N.done(name, lin("#cfc6bd"))


def mat_hair(base=None, alpha=None, nrm=None, tint="#2a2420", name="ppl_hair_dark"):
    """Cheveux, barbe, moustache, cils : la texture du modèle ramenée vers `tint` (sa luminance garde les
    mèches), une carte d'opacité si on en donne une ; sans texture, un brun noir uni."""
    m = _cached(name)
    if m:
        return m
    N = _Nodes(name)
    col = lin(tint)
    if base is not None:
        t = N.image(base)
        bw = N.new("ShaderNodeRGBToBW")
        N.link(t.outputs["Color"], bw.inputs["Color"])
        mr = N.new("ShaderNodeMapRange", **{"To Min": 0.55, "To Max": 1.6})
        N.link(bw.outputs["Val"], mr.inputs["Value"])
        N.link(N.scaled(col, mr.outputs["Result"]), N.p.inputs["Base Color"])
    else:
        _set(N.p, base=col)
    if alpha is not None:
        a = N.image(alpha, data=True)
        N.link(a.outputs["Color"], N.p.inputs["Alpha"])
    _set(N.p, rough=0.55, spec=0.35, sheen=0.2, sheen_rough=0.3)
    N.normal(nrm, 0.5)
    return N.done(name, col)


def mat_gun():
    """Carcasse de l'arme : polymère noir mat, un grain fin."""
    m = _cached("ppl_gun_black")
    if m:
        return m
    N = _Nodes("ppl_gun_black")
    _set(N.p, base=lin("#111113"), spec=0.45)
    N.link(N.noise(60.0, 2.0, 0.5, 0.62), N.p.inputs["Roughness"])
    N.normal(None, bumps=((3000.0, 0.1, 0.0001),))
    return N.done("ppl_gun_black", lin("#111113"))


def mat_gun_metal():
    """Culasse et pièces d'acier : métal bronzé mat, une rugosité tachée (l'usure)."""
    m = _cached("ppl_gun_metal")
    if m:
        return m
    N = _Nodes("ppl_gun_metal")
    _set(N.p, base=lin("#2c2d30"), metal=1.0)
    N.link(N.noise(80.0, 3.0, 0.38, 0.55), N.p.inputs["Roughness"])
    return N.done("ppl_gun_metal", lin("#2c2d30"))


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


def _bone_faces(ob, arm, roles, thresh=0.5):
    """Faces dont les sommets sont surtout pondérés sur les os de rôles `roles` (noms Mixamo sans préfixe)."""
    names = {b.name for b in arm.data.bones if canon(b.name) in roles}
    gi = {g.index for g in ob.vertex_groups if g.name in names}
    if not gi:
        return set()
    wv = []
    for v in ob.data.vertices:
        tot = sum(g.weight for g in v.groups)
        wv.append(sum(g.weight for g in v.groups if g.group in gi) / tot if tot > 0 else 0.0)
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


def _orig_images(mat):
    """Les images d'une matière importée : couleur de base, carte de normales, opacité (branchée sur un mélange)."""
    out = {}
    if not mat or not mat.node_tree:
        return out
    for n in mat.node_tree.nodes:
        if n.type != "TEX_IMAGE" or not n.image:
            continue
        for l in n.outputs[0].links:
            to = l.to_node
            if to.type == "BSDF_PRINCIPLED" and l.to_socket.name == "Base Color":
                out["base"] = n.image
            elif to.type == "NORMAL_MAP":
                out["normal"] = n.image
            elif to.type in ("MIX", "MIX_SHADER", "MATH") or l.to_socket.name == "Alpha":
                out["alpha"] = n.image
    return out


def _pos_islands(o, digits=5):
    """Îlots de faces connexes, les sommets confondus (coutures d'UV) comptés comme un seul : numéro d'îlot par face."""
    key = {}
    vid = []
    for v in o.data.vertices:
        k = tuple(round(c, digits) for c in v.co)
        vid.append(key.setdefault(k, len(key)))
    parent = list(range(len(key)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for poly in o.data.polygons:
        vs = [vid[i] for i in poly.vertices]
        for v in vs[1:]:
            a, b = find(vs[0]), find(v)
            if a != b:
                parent[a] = b
    return [find(vid[p.vertices[0]]) for p in o.data.polygons]


def _texture_classes(ob, small=400):
    """Chaque face d'un vêtement de l'atlas SPP classée par la couleur de sa texture (sRGB tel que stocké) :
    « plate » (doré ou argenté, sur une petite pièce rapportée : insigne, plaque, bouton, boucle : repeint en
    plaque unie), « leather » (noir ou gris peu saturé : ceinturon, étuis, visière, mentonnière), « fabric »
    (le reste : le drap). Un doré peint sur une grande pièce (les écussons d'épaule) reste du drap : la couleur
    du modèle n'est jamais rendue, l'écusson disparaît avec elle."""
    import colorsys
    cols = _classify_by_texture(ob)
    isl = _pos_islands(ob)
    size = {}
    for i in isl:
        size[i] = size.get(i, 0) + 1
    out = []
    for fi, c in enumerate(cols if cols is not None else [(0.15, 0.18, 0.25)] * len(ob.data.polygons)):
        h, s, v = colorsys.rgb_to_hsv(*[max(0.0, min(1.0, x)) for x in c])
        piece = size[isl[fi]] < small
        if piece and ((0.05 < h < 0.2 and s > 0.35 and v > 0.3) or (s < 0.2 and v >= 0.42)):
            out.append("plate")
        elif s < 0.25 and v < 0.42:
            out.append("leather")
        else:
            out.append("fabric")
    return out


# les variantes bon marché des agents (load_officer, `look`) : teinte de peau (décalage de teinte, saturation,
# valeur de la texture), barbe et moustache, teinte du drap, carrure (largeur des épaules et du torse, la taille
# ne change pas), teinte des cheveux, port de tête (lacet, inclinaison, en degrés : pose_officer)
LOOKS = [
    dict(tone=(0.0, 1.0, 0.92), beard=True, moustache=True, cloth="#1b2233", width=1.0, hair="#2a2420"),
    dict(tone=(-0.005, 1.08, 0.5), beard=True, moustache=False, cloth="#191d29", width=1.06, hair="#121010",
         head_yaw=7.0, head_tilt=3.0),
    dict(tone=(0.012, 0.85, 0.8), beard=False, moustache=False, cloth="#1e2536", width=0.95, hair="#3b2c21",
         head_yaw=-6.0, head_tilt=-4.0),
]
_LOOK_COUNT = [0]


def _paint_spp(arm, meshes, look):
    """L'agent SPP : chaque vêtement garde la carte de normales de son modèle (plis, coutures, poches, surpiqûres)
    mais jamais sa couleur (écussons, insigne de casquette, plaque de poitrine, mots) ; les pièces rapportées
    dorées ou argentées deviennent des plaques unies sans relief ; ceinturon, étuis, chaussures et visière en
    cuir noir ; la peau, les yeux, les cheveux, la barbe et les cils prennent leurs textures, teintées selon
    `look` ; gants de cuir noir ; les lunettes de soleil et les cils sont retirés."""
    L_ = LOOKS[look % len(LOOKS)]
    tag = f"spp{look % len(LOOKS)}"
    kept = []
    for ob in meshes:
        part = _spp_part(ob)
        mat0 = ob.data.materials[0] if ob.data.materials else None
        im = _orig_images(mat0)
        # les cils aussi : sans opacité utilisable (l'image du modèle est un reflet), leurs cartes faisaient un trait
        # noir épais autour des yeux sous un ciel clair
        if part in ("eyewear", "eyelashes") or (part == "beards" and not L_["beard"]) or \
                (part == "moustaches" and not L_["moustache"]):
            bpy.data.objects.remove(ob)
            continue
        kept.append(ob)
        if part in ("tops", "bottoms", "hats"):
            cls = _texture_classes(ob)
            print(f"[gens] {part} : " + ", ".join(f"{k} {cls.count(k)}" for k in sorted(set(cls))), flush=True)
            fab =mat_fabric(f"ppl_{part}_{tag}", lin(L_["cloth"]), nrm=im.get("normal"),
                             rough=0.82 if part != "hats" else 0.78)
            lea = mat_leather_tex(f"ppl_{part}_leather", nrm=im.get("normal"),
                                  rough=0.3 if part == "hats" else 0.42, coat=0.55 if part == "hats" else 0.35)
            _assign_by_faces(ob, cls, {"fabric": fab, "leather": lea, "plate": mat_plate()})
        elif part == "shoes":
            cols = _classify_by_texture(ob)
            import colorsys
            cls = []
            for c in (cols if cols is not None else [(0.05, 0.05, 0.05)] * len(ob.data.polygons)):
                h, s, v = colorsys.rgb_to_hsv(*[max(0.0, min(1.0, x)) for x in c])
                cls.append("sole" if s > 0.3 else "leather")
            _assign_by_faces(ob, cls, {
                "leather": mat_leather_tex("ppl_shoes_leather", lin("#0a0909"), nrm=im.get("normal"), rough=0.32,
                                           coat=0.6),
                "sole": mat_leather_tex("ppl_shoes_sole", lin("#0e0d0c"), rough=0.75, coat=0.0)})
        elif part in ("hair", "beards", "moustaches", "eyelashes"):
            # (l'image que le modèle branche sur un mélange n'est pas une opacité mais un reflet gris-bleu : les
            # mèches restent pleines, la texture de couleur fait le cheveu)
            _set_all(ob, mat_hair(im.get("base"), None, im.get("normal") if part != "eyelashes" else None,
                                  tint=L_["hair"], name=f"ppl_{part}_{tag}"))
        elif part == "eyes":
            _set_all(ob, mat_eye(im.get("base")))
        else:   # le corps : la peau, les mains gantées
            skin = mat_skin(im.get("base"), im.get("normal"), tone=L_["tone"], name=f"ppl_skin_{tag}")
            hands = _hand_faces(ob, arm, 0.5) if arm else set()
            _assign_by_faces(ob, ["glove" if p.index in hands else "skin" for p in ob.data.polygons],
                             {"skin": skin, "glove": mat_leather()})
    return kept


def _widen(arm, meshes, k):
    """La carrure : maillages et squelette élargis de `k` en x (épaules, torse, hanches), un peu en y ; la
    hauteur, l'origine et les pieds au sol ne bougent pas."""
    if abs(k - 1.0) < 1e-3:
        return
    _transform_all(arm, meshes, Matrix.Diagonal((k, 1.0 + (k - 1.0) * 0.6, 1.0, 1.0)))


def _paint_officer(arm, meshes, variant, look=0):
    """Uniforme marine uni, ceinture et chaussures noires, gants noirs, peau neutre ; aucun insigne."""
    if variant == "spp":
        return _paint_spp(arm, meshes, look)
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


def _spp_part(ob):
    """La pièce d'un maillage SPP (« tops », « eyes »…), lue sur le nom du maillage glTF, sinon sur sa matière
    et sa taille (corps, yeux et cils partagent la matière « Bodymat »)."""
    m = re.match(r"(Body|Eyes|Eyelashes|Moustaches|Hair|Beards|Shoes|Bottoms|Hats|Tops|Eyewear)_", ob.data.name)
    if m:
        return m.group(1).lower()
    mn = (ob.data.materials[0].name.lower() if ob.data.materials and ob.data.materials[0] else "")
    for key, part in (("top", "tops"), ("bottom", "bottoms"), ("hat", "hats"), ("shoe", "shoes"),
                      ("eyewear", "eyewear"), ("moustache", "moustaches"), ("beard", "beards"), ("hair", "hair")):
        if key in mn:
            return part
    n = len(ob.data.vertices)
    return "eyelashes" if n < 300 else "eyes" if n < 2000 else "body"


def _smooth_mesh(ob, weld=True, subsurf=0):
    """Plus de facettes : sommets confondus soudés (les coutures d'UV restent dans les UV), normales
    recalculées lisses (les normales importées sont celles des faces sur certains modèles), et une subdivision
    légère après l'armature (les silhouettes arrondies ; la pose ne change pas, elle déforme la cage)."""
    if weld:
        bm_ = bmesh.new()
        bm_.from_mesh(ob.data)
        bmesh.ops.remove_doubles(bm_, verts=bm_.verts, dist=1e-5)
        bm_.to_mesh(ob.data)
        bm_.free()
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
            try:
                bpy.ops.mesh.customdata_custom_splitnormals_clear()
            except RuntimeError:
                pass
        ob.data.shade_smooth()
    if subsurf:
        md = ob.modifiers.new("lissage", "SUBSURF")
        md.levels = md.render_levels = subsurf
        md.quality = 2
        md.uv_smooth = "PRESERVE_BOUNDARIES"


def load_officer(variant="spp", name=None, look=None):
    """Un policier riggé, 1,78 m, uniforme marine uni sans insigne, ceinture noire, casquette, gants noirs.
    `look` (agent SPP) : la variante de LOOKS (peau, barbe, carrure, drap) ; par défaut chaque agent chargé prend
    la suivante (0, 1, 2, 0…), pour que deux agents d'une même scène ne soient pas des clones.
    Renvoie l'objet armature (les maillages en sont les enfants)."""
    spec = OFFICERS[variant]
    if look is None:
        look = _LOOK_COUNT[0]
        _LOOK_COUNT[0] += 1
    arm, meshes = _import(spec["path"])
    if spec["route"] == "R":
        arm, meshes = _rig_static(meshes, spec["donor"], spec.get("joints"))
    _normalise(arm, meshes)
    if variant == "spp":
        for o in meshes:
            o.data.name = _spp_part(o).capitalize() + "_" + o.data.name
        _widen(arm, meshes, LOOKS[look % len(LOOKS)]["width"])
    _calibrate_palms(arm)
    meshes = _paint_officer(arm, meshes, variant, look)
    if spec.get("cap"):
        meshes.append(_add_cap(arm, meshes))
    if variant == "spp":
        for o in meshes:
            if _spp_part(o) in ("body", "tops", "bottoms", "hats", "shoes"):
                _smooth_mesh(o, weld=False, subsurf=1)
    arm.name = name or f"officer_{variant}"
    arm["variant"] = variant
    arm["look"] = look % len(LOOKS)
    arm["route"] = spec["route"]
    arm["tris"] = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    return arm


def _add_hood(arm, meshes, path, yaw_deg=0.0):
    """Route B : une capuche (vêtement séparé) posée sur la tête, liée à l'os de la tête, coton noir."""
    hm = _static(path)
    nrm = _orig_images(hm[0].data.materials[0] if hm and hm[0].data.materials else None).get("normal")
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
    # les plis du vêtement scanné (sa carte de normales), pas son tartan
    _set_all(hood, mat_cotton(nrm, name="ppl_cotton_hood") if nrm is not None else mat_cotton())
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
    """Le conducteur : capuche relevée, tout en coton noir mat, gants de cuir fauve clair, aucune peau.
    Renvoie l'objet armature."""
    spec = DRIVERS[variant]
    arm, meshes = _import(spec["path"])
    if spec["route"] == "R":
        arm, meshes = _rig_static(meshes, spec["donor"], spec.get("joints"))
    _normalise(arm, meshes)
    _calibrate_palms(arm)
    if spec["route"] == "R":
        _cut_stretched(arm, meshes)
    cotton, leather, void = mat_cotton(), mat_glove_driver(), mat_void()
    for ob in list(meshes):
        names = " ".join(m.name.lower() for m in ob.data.materials if m)
        if spec["route"] == "B" and re.search(r"eye|lash", names):
            bpy.data.objects.remove(ob)
            meshes.remove(ob)
            continue
        if spec["route"] == "B":
            # le corps de Tuzzy est livré en faces à sommets séparés : soudé et relissé, plus de facettes
            _smooth_mesh(ob, weld=True)
        hands = _hand_faces(ob, arm, 0.45)
        # le visage, les oreilles, les cheveux (les faces pesées sur la tête) : le noir sans reflet du fond de
        # la capuche ; aucun visage ne se lit, même sous des phares de face
        head = (_bone_faces(ob, arm, ("Head", "HeadTop_End"), 0.5) - hands) if spec.get("hood") else set()
        classes = ["glove" if p.index in hands else "void" if p.index in head else "cotton" for p in ob.data.polygons]
        _assign_by_faces(ob, classes, {"cotton": cotton, "glove": leather, "void": void})
    if spec.get("hood"):
        meshes.append(_add_hood(arm, meshes, spec["hood"], spec.get("hood_yaw", 0.0)))
    if spec["route"] == "B":
        for o in meshes:
            if o.name != "hood":
                _smooth_mesh(o, weld=False, subsurf=1)
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
        # la culasse, le chien et la détente en acier mat, la carcasse en polymère ; aucune carte de normales (le
        # modèle y grave des marquages)
        _set_all(o, mat_gun_metal() if re.search(r"(slide|hammer|trigger)", o.name) else mat_gun())
    gun = _join(meshes, f"handgun_{variant}")
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
    # le port de tête de la variante (LOOKS) : quelques degrés de lacet et d'inclinaison, moitié moins en visée
    look = LOOKS[int(arm.get("look", 0)) % len(LOOKS)]
    k = 0.5 if pose in ("aim", "crouch") else 1.0
    if look.get("head_yaw"):
        _rot(arm, "Head", U, look["head_yaw"] * k)
    if look.get("head_tilt"):
        _rot(arm, "Head", F, look["head_tilt"] * k)


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


def _ray(origin, direction, dist=2.0):
    """Premier point touché dans la scène (monde), ou None."""
    dg = bpy.context.evaluated_depsgraph_get()
    hit, loc, *_ = bpy.context.scene.ray_cast(dg, Vector(origin), Vector(direction).normalized(), distance=dist)
    return loc if hit else None


def measure_rim(body, rim_prefix, hint, near=0.45):
    """Le volant d'une voiture jointe : faces de matière `rim_prefix…` à moins de `near` de `hint` (monde).
    Renvoie (centre, normale, rayon) en monde, par ACP des sommets, ou None."""
    import numpy as np
    me, mw = body.data, body.matrix_world
    idx = {i for i, m in enumerate(me.materials) if m and m.name.startswith(rim_prefix)}
    vs = set()
    for p in me.polygons:
        if p.material_index in idx:
            vs.update(p.vertices)
    P = [mw @ me.vertices[i].co for i in vs]
    P = np.array([tuple(v) for v in P if (v - Vector(hint)).length < near])
    if len(P) < 30:
        return None
    c = P.mean(axis=0)
    _, ev = np.linalg.eigh(np.cov((P - c).T))
    n = ev[:, 0]
    d = (P - c) - np.outer((P - c) @ n, n)
    r = np.linalg.norm(d, axis=1)
    return Vector(c), Vector(n).normalized(), float(np.median(r[r > 0.75 * r.max()]))


def cast_driver_in_car(body, rim_prefix, wheel_hint, variant="hooded", clench=0.0, log=print):
    """Le conducteur assis dans une voiture d'époque (lab/hero_cars.py), la voiture à l'origine, l'avant vers -y,
    conduite à gauche (côté +x). Le volant est mesuré sur sa matière ; l'assise, le dossier et le plancher sont
    trouvés par lancers de rayons sous le volant ; le bassin est posé 10 cm devant le dossier, 5 cm sous le haut de
    l'assise (le coussin s'enfonce ; le coupé : 8,5 cm sous ses bourrelets), puis avancé (le siège coulisse) tant que les mains n'atteignent pas la jante,
    et baissé si la capuche touche le pavillon. Renvoie la liste des objets (armature d'abord) ou [] si la mesure
    échoue."""
    rim = measure_rim(body, rim_prefix, wheel_hint)
    if rim is None:
        log("[conducteur] volant introuvable : voiture vide")
        return []
    C, N, rad = rim
    if not (0.15 < rad < 0.26 and 0.6 < C.z < 1.1):
        log(f"[conducteur] volant douteux (centre {tuple(round(v, 3) for v in C)}, rayon {rad:.3f}) : voiture vide")
        return []
    # l'assise : rayons verticaux de 35 à 60 cm derrière le volant
    zs = []
    for k in range(6):
        h = _ray((C.x, C.y + 0.35 + 0.05 * k, C.z + 0.15), (0, 0, -1))
        if h is not None and 0.3 < h.z < C.z - 0.05:
            zs.append(h.z)
    if not zs:
        log("[conducteur] assise introuvable : voiture vide")
        return []
    seat_z = sorted(zs)[len(zs) // 2]
    back = _ray((C.x, C.y + 0.2, seat_z + 0.3), (0, 1, 0), 1.2)
    back_y = back.y if back is not None and back.y - C.y > 0.3 else C.y + 0.75
    floor = _ray((C.x, C.y - 0.45, C.z - 0.25), (0, 0, -1), 1.0)
    floor_z = floor.z if floor is not None and 0.05 < floor.z < seat_z - 0.1 else seat_z - 0.3
    pedal = Vector((C.x, C.y - 0.45, floor_z + 0.08))
    # le pavillon au-dessus de la tête, mesuré avant que le conducteur ne soit là (un rayon le toucherait)
    roof = _ray((C.x, back_y - 0.2, seat_z + 0.4), (0, 0, 1), 1.0)
    arm = load_driver(variant)
    hip = Vector((C.x, back_y - 0.10, seat_z - 0.05))
    for step in range(8):
        place_driver(arm, hip, (0, -1, 0))
        miss = pose_driver_wheel(arm, C, rad, N, pedal=pedal, clench=clench)
        if max(miss.values()) < 0.01:
            break
        hip.y -= 0.03
    _upd()
    # le haut de la capuche : 25 cm au-dessus de la base du crâne (la queue de l'os de la tête, posée par
    # l'import glTF, ne dit rien de la taille de la tête)
    top = arm.matrix_world @ pb(arm, "Head").head + Vector((0, 0, 0.25))
    if roof is not None and top.z + 0.05 > roof.z:
        hip.z -= min(0.08, top.z + 0.05 - roof.z)
        place_driver(arm, hip, (0, -1, 0))
        miss = pose_driver_wheel(arm, C, rad, N, pedal=pedal, clench=clench)
        _upd()
        top = arm.matrix_world @ pb(arm, "Head").head + Vector((0, 0, 0.25))
    arm["wheel_miss"] = str({k: round(v, 3) for k, v in miss.items()})
    # la mesure du volant gardée (monde à la pose, la voiture à l'origine) : un plan qui anime les mains repose
    # pose_driver_wheel avec un autre grip_deg (P1 : deux ou trois degrés de volant)
    arm["wheel_fit"] = [*C, *N, rad, *pedal]
    log(f"[conducteur] volant {tuple(round(v, 3) for v in C)} r {rad:.3f} n {tuple(round(v, 2) for v in N)}, "
        f"assise {seat_z:.3f}, dossier {back_y:.3f}, plancher {floor_z:.3f}, bassin {tuple(round(v, 3) for v in hip)}, "
        f"tête {top.z:.3f} (pavillon {roof.z if roof is not None else float('nan'):.3f}), écart des mains {arm['wheel_miss']}")
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
