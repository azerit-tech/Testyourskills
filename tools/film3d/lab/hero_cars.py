# La voiture poursuivie : deux berlines et coupés allemands d'époque, pris sur des modèles CC BY de
# leurs auteurs et remis au niveau du plan rapproché (matières, feux, nettoyage des marques, habitacle).
#
# Module importable depuis cast.py (Blender) :
#
#   import sys; sys.path.insert(0, "tools/film3d/lab"); import hero_cars as hc
#   car = hc.load_hero("w111", lights_on=True)   # dict : body, wheels, doors, lights, length, wheel_radius, axles, tris
#
# Repère : celui de cast_vehicles.py (l'avant vers +x, le haut +z, origine au centre de l'emprise et au sol,
# conduite à gauche côté +y). Échelle réelle, en mètres. Les roues sont des objets séparés, enfants de body,
# origine sur l'axe de la roue (elles tournent autour de leur y local).
#
# Variantes :
#   w111   berline des années 60 à ailerons (Elements Creative Studio), habitacle complet d'origine
#   slc    coupé des années 70 (Iv4sHka), carrosserie remise en forme, feux, chromes et habitacle écrits ici
#
# Le laboratoire (planches avant / après, finalistes) :
#   blender -b -t 2 -P tools/film3d/lab/hero_cars.py -- --sheet avant-apres --car w111
#   blender -b -t 2 -P tools/film3d/lab/hero_cars.py -- --sheet finalistes
# écrit Azerit/design/film/ref/lab/mercedes-<car>-avant-apres.png, voiture-heros-finalistes.png.
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cast_vehicles as cv  # noqa: E402

CAST = cv.CAST
REF = cv.REF
lin = cv.lin

LAMP = "#fff9cb"        # phares crème du film
TAIL = "#ff2a1a"        # feux arrière
AMBER = "#ffa21a"

# couleurs d'époque, choisies sur les nuanciers des photographies : foncées, lisibles à l'heure bleue,
# distinctes de la patrouille (marine presque noir) et du coupé actuel (prune)
PAINT = {
    "w111": "#2c0614",  # bordeaux profond (rouge rubis foncé du catalogue des années 60), tiré vers le pourpre
                        # pour ne pas virer à la brique sous les lampadaires ambre
    "slc": "#0c2a24",   # vert sapin foncé, teinte courante du coupé dans les années 70, tiré vers le bleu
                        # pour ne pas virer à l'olive sous les lampadaires ambre
}
LEATHER = {
    "w111": "#7a4a2c",  # cuir cognac
    "slc": "#6b4a32",   # cuir tabac
}


# ---------------------------------------------------------------- matières (départ : les réglages des modèles CC BY
# de référence, berline américaine des années 80 et limousine : vernis 1,0 rugosité 0,04, chrome rugosité 0,10-0,20,
# réflecteur de phare métal 1 rugosité 0,12, verre de phare strié par une carte de relief)

def _node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        if isinstance(v, bpy.types.NodeSocket):
            nt.links.new(v, n.inputs[k])
        else:
            n.inputs[k].default_value = v
    return n


def _glossy(nt):
    try:
        return nt.nodes.new("ShaderNodeBsdfGlossy")
    except RuntimeError:
        return nt.nodes.new("ShaderNodeBsdfAnisotropic")


def _gap_mask(nt, sep, gaps, width=0.0028):
    """Masque des joints de panneaux en coordonnées objet : chaque joint est (axe, valeur, boîte) — le plan
    coord[axe] = valeur, limité à la boîte ((x0, x1), (y0, y1), (z0, z1)) ; renvoie (masque, profil du creux)."""
    mask = None
    for axis, value, box in gaps:
        d = cv._math(nt, "ABSOLUTE", cv._math(nt, "SUBTRACT", sep.outputs[axis], value))
        line = cv._math(nt, "LESS_THAN", d, width)
        for i, (lo, hi) in enumerate(box):
            if i == axis:
                continue
            line = cv._math(nt, "MULTIPLY", line, cv._math(nt, "MULTIPLY", cv._math(nt, "GREATER_THAN", sep.outputs[i], lo),
                                                             cv._math(nt, "LESS_THAN", sep.outputs[i], hi)))
        mask = line if mask is None else cv._math(nt, "MAXIMUM", mask, line)
    return mask


def _rib_mask(nt, sep, ribs):
    """Bandes nervurées (le bas de caisse strié) : (axe des nervures, pas, boîte) -> hauteur 0..1."""
    h = None
    for axis, pitch, box in ribs:
        s = cv._math(nt, "ABSOLUTE", cv._math(nt, "SINE", cv._math(nt, "MULTIPLY", sep.outputs[axis], math.pi / pitch)))
        inb = None
        for i, (lo, hi) in enumerate(box):
            b = cv._math(nt, "MULTIPLY", cv._math(nt, "GREATER_THAN", sep.outputs[i], lo), cv._math(nt, "LESS_THAN", sep.outputs[i], hi))
            inb = b if inb is None else cv._math(nt, "MULTIPLY", inb, b)
        v = cv._math(nt, "MULTIPLY", s, inb)
        h = v if h is None else cv._math(nt, "MAXIMUM", h, v)
    return h


def mat_paint(name, color, metal=0.45, rough=0.3, flake=0.1, peel=0.012, gaps=(), ribs=(), inside=None):
    """Peinture vernie : base pigmentée à paillettes fines (bruit très serré sur la rugosité et le métal),
    vernis brillant à peau d'orange légère (bruit doux sur la normale du vernis).

    gaps : joints de panneaux dessinés en coordonnées objet (creux sombre et relief), pour une caisse dont le maillage
    n'a pas de vraies découpes ; ribs : bandes nervurées."""
    m, nt, out = cv._mat(name)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    if gaps or ribs:
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(tc.outputs["Object"], sep.inputs[0])
        gm = _gap_mask(nt, sep, gaps) if gaps else None
        rm = _rib_mask(nt, sep, ribs) if ribs else None
    fl = _node(nt, "ShaderNodeTexNoise", Scale=2600.0, Detail=0.0)
    nt.links.new(tc.outputs["Object"], fl.inputs["Vector"])
    r = _node(nt, "ShaderNodeMapRange", **{"To Min": rough - flake, "To Max": rough + flake})
    nt.links.new(fl.outputs["Fac"], r.inputs["Value"])
    mm = _node(nt, "ShaderNodeMapRange", **{"To Min": metal - 0.25, "To Max": metal + 0.25})
    nt.links.new(fl.outputs["Fac"], mm.inputs["Value"])
    op = _node(nt, "ShaderNodeTexNoise", Scale=90.0, Detail=2.0)
    nt.links.new(tc.outputs["Object"], op.inputs["Vector"])
    bump = _node(nt, "ShaderNodeBump", Strength=peel, Distance=0.002)
    nt.links.new(op.outputs["Fac"], bump.inputs["Height"])
    p = cv._principled(nt, **{"Base Color": lin(color), "Coat Weight": 1.0, "Coat Roughness": 0.025, "Coat IOR": 1.5})
    nt.links.new(r.outputs[0], p.inputs["Roughness"])
    nt.links.new(mm.outputs[0], p.inputs["Metallic"])
    nt.links.new(bump.outputs[0], p.inputs["Coat Normal"])
    if gaps or ribs:
        # le creux des joints : noir, sans vernis (le vernis ne ponte pas un joint), relief en V ; nervures en relief
        h = None
        if rm is not None:
            h = cv._math(nt, "MULTIPLY", rm, 1.0)
        if gm is not None:
            g = cv._math(nt, "MULTIPLY", gm, -3.0)
            h = g if h is None else cv._math(nt, "ADD", h, g)
            col = nt.nodes.new("ShaderNodeMix")
            col.data_type = "RGBA"
            nt.links.new(gm, col.inputs["Factor"])
            col.inputs[6].default_value = lin(color)
            col.inputs[7].default_value = (0.002, 0.002, 0.002, 1)
            nt.links.new(col.outputs[2], p.inputs["Base Color"])
            nt.links.new(cv._math(nt, "SUBTRACT", 1.0, gm), p.inputs["Coat Weight"])
        gb = _node(nt, "ShaderNodeBump", Strength=0.6, Distance=0.002)
        nt.links.new(h, gb.inputs["Height"])
        nt.links.new(gb.outputs[0], p.inputs["Normal"])
        cb = _node(nt, "ShaderNodeBump", Strength=0.6, Distance=0.002)
        nt.links.new(h, cb.inputs["Height"])
        nt.links.new(bump.outputs[0], cb.inputs["Normal"])
        nt.links.new(cb.outputs[0], p.inputs["Coat Normal"])
    sh = p.outputs[0]
    if inside:
        # une caisse d'une seule feuille vue de l'intérieur (pavillon, panneaux) : drap de garniture mat
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        cloth = _node(nt, "ShaderNodeBsdfDiffuse", Color=lin(inside))
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(geo.outputs["Backfacing"], mix.inputs[0])
        nt.links.new(sh, mix.inputs[1])
        nt.links.new(cloth.outputs[0], mix.inputs[2])
        sh = mix.outputs[0]
    nt.links.new(sh, out.inputs[0])
    return m


def mat_metal(name, color=(0.9, 0.9, 0.92, 1), rough=0.06, aniso=0.0):
    m, nt, out = cv._mat(name)
    p = cv._principled(nt, **{"Base Color": color, "Metallic": 1.0, "Roughness": rough})
    if aniso and "Anisotropic" in p.inputs:
        p.inputs["Anisotropic"].default_value = aniso
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


def mat_rubber(name, color=(0.018, 0.018, 0.02, 1), rough=0.62, grain=0.15):
    """Caoutchouc et plastique noir : un peu de satin, grain fin en relief."""
    m, nt, out = cv._mat(name)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = _node(nt, "ShaderNodeTexNoise", Scale=700.0, Detail=1.0)
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    bump = _node(nt, "ShaderNodeBump", Strength=grain, Distance=0.0005)
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"])
    p = cv._principled(nt, **{"Base Color": color, "Roughness": rough, "Specular IOR Level": 0.35})
    nt.links.new(bump.outputs[0], p.inputs["Normal"])
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


def mat_tyre(name, r_rim=0.19, r_out=0.31):
    """Pneu, en coordonnées de l'objet roue (origine sur l'axe, axe selon y local) : gomme noire, flanc à fines
    stries concentriques, un bandeau de marquages moulés illisibles (relief seul, aucun texte) et le liseré du talon ;
    la bande de roulement reste mate."""
    m, nt, out = cv._mat(name)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    x, z = sep.outputs[0], sep.outputs[2]
    r = cv._math(nt, "SQRT", cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", x, x), cv._math(nt, "MULTIPLY", z, z)))
    ang = cv._math(nt, "ARCTAN2", z, x)
    side = cv._math(nt, "MULTIPLY", cv._math(nt, "GREATER_THAN", r, r_rim + 0.01),
                    cv._math(nt, "LESS_THAN", r, r_out - 0.025))
    rings = cv._math(nt, "MULTIPLY", cv._math(nt, "SINE", cv._math(nt, "MULTIPLY", r, 900.0)), 0.25)
    # bandeau des marquages : bruit cellulaire étiré le long de la circonférence, seuillé en petits blocs
    band_c = r_rim + 0.62 * (r_out - r_rim)
    band = cv._math(nt, "LESS_THAN", cv._math(nt, "ABSOLUTE", cv._math(nt, "SUBTRACT", r, band_c)), 0.008)
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(cv._math(nt, "MULTIPLY", ang, 40.0), comb.inputs[0])
    nt.links.new(cv._math(nt, "MULTIPLY", r, 400.0), comb.inputs[1])
    vo = nt.nodes.new("ShaderNodeTexVoronoi")
    vo.inputs["Scale"].default_value = 1.0
    nt.links.new(comb.outputs[0], vo.inputs["Vector"])
    marks = cv._math(nt, "MULTIPLY", cv._math(nt, "GREATER_THAN", vo.outputs["Distance"], 0.35), band)
    bead = cv._math(nt, "LESS_THAN", cv._math(nt, "ABSOLUTE", cv._math(nt, "SUBTRACT", r, r_rim + 0.022)), 0.003)
    h = cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", rings, cv._math(nt, "SUBTRACT", side, band)),
                 cv._math(nt, "ADD", marks, bead))
    nz = _node(nt, "ShaderNodeTexNoise", Scale=700.0, Detail=1.0)
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    h = cv._math(nt, "ADD", h, cv._math(nt, "MULTIPLY", nz.outputs["Fac"], 0.3))
    bump = _node(nt, "ShaderNodeBump", Strength=0.5, Distance=0.0008)
    nt.links.new(h, bump.inputs["Height"])
    rough = cv._math(nt, "SUBTRACT", 0.78, cv._math(nt, "MULTIPLY", cv._math(nt, "ADD", side, marks), 0.08))
    p = cv._principled(nt, **{"Base Color": (0.018, 0.018, 0.02, 1), "Specular IOR Level": 0.35})
    nt.links.new(rough, p.inputs["Roughness"])
    nt.links.new(bump.outputs[0], p.inputs["Normal"])
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


def mat_window(name, tint=(0.80, 0.86, 0.84, 1), dark=0.0):
    """Verre de vitre : sans réfraction (les vitres du modèle sont des feuilles minces), reflet de Fresnel
    du verre réel (IOR 1,52) sur une transparence à peine verte, comme le verre trempé d'époque."""
    m, nt, out = cv._mat(name)
    fr = _node(nt, "ShaderNodeFresnel", IOR=1.52)
    tr = _node(nt, "ShaderNodeBsdfTransparent", Color=tuple(c * (1 - dark) for c in tint[:3]) + (1,))
    gl = _glossy(nt)
    gl.inputs["Roughness"].default_value = 0.0
    mix = nt.nodes.new("ShaderNodeMixShader")
    # un plancher de reflet : la vitre reste lisible de face
    f = cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", fr.outputs[0], 0.9), 0.04)
    nt.links.new(f, mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(gl.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    m.use_backface_culling = False
    return m


def mat_lens(name, tint=(1, 1, 1, 1), emit_color=None, strength=0.0, flutes=0.0, flute_axis="Y"):
    """Verre de feu : transparence teintée et reflet, stries verticales du verre moulé (relief sur le reflet seul),
    allumé par une émission ajoutée (la lumière vient surtout de l'ampoule et du réflecteur derrière)."""
    m, nt, out = cv._mat(name)
    fr = _node(nt, "ShaderNodeFresnel", IOR=1.5)
    tr = _node(nt, "ShaderNodeBsdfTransparent", Color=tint)
    gl = _glossy(nt)
    gl.inputs["Roughness"].default_value = 0.02
    if flutes:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        wv = nt.nodes.new("ShaderNodeTexWave")
        wv.wave_type = "BANDS"
        wv.bands_direction = flute_axis
        wv.wave_profile = "SIN"
        wv.inputs["Scale"].default_value = flutes
        nt.links.new(tc.outputs["Object"], wv.inputs["Vector"])
        bump = _node(nt, "ShaderNodeBump", Strength=0.6, Distance=0.002)
        nt.links.new(wv.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs[0], gl.inputs["Normal"])
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(cv._math(nt, "ADD", fr.outputs[0], 0.06), mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(gl.outputs[0], mix.inputs[2])
    sh = mix.outputs[0]
    if strength > 0:
        em = _node(nt, "ShaderNodeEmission", Color=lin(emit_color), Strength=strength)
        add = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(sh, add.inputs[0])
        nt.links.new(em.outputs[0], add.inputs[1])
        sh = add.outputs[0]
    nt.links.new(sh, out.inputs[0])
    return m


def mat_reflector(name, emit_color=LAMP, strength=0.0):
    """Réflecteur parabolique : aluminium poli (métal 1, rugosité 0,12), une lueur quand le feu est allumé."""
    m, nt, out = cv._mat(name)
    p = cv._principled(nt, **{"Base Color": (0.85, 0.85, 0.86, 1), "Metallic": 1.0, "Roughness": 0.12,
                              "Emission Color": lin(emit_color), "Emission Strength": strength})
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


def mat_leather(name, color, rough=0.48):
    m, nt, out = cv._mat(name)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    vo = nt.nodes.new("ShaderNodeTexVoronoi")
    vo.inputs["Scale"].default_value = 900.0
    nt.links.new(tc.outputs["Object"], vo.inputs["Vector"])
    bump = _node(nt, "ShaderNodeBump", Strength=0.25, Distance=0.0006)
    nt.links.new(vo.outputs["Distance"], bump.inputs["Height"])
    nz = _node(nt, "ShaderNodeTexNoise", Scale=14.0, Detail=3.0)
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    tone = _node(nt, "ShaderNodeMapRange", **{"To Min": 0.8, "To Max": 1.15})
    nt.links.new(nz.outputs["Fac"], tone.inputs["Value"])
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    mul.inputs[6].default_value = lin(color)
    nt.links.new(tone.outputs[0], mul.inputs[7])
    p = cv._principled(nt, **{"Roughness": rough, "Sheen Weight": 0.15})
    nt.links.new(mul.outputs[2], p.inputs["Base Color"])
    nt.links.new(bump.outputs[0], p.inputs["Normal"])
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


def mat_walnut(name):
    """Ronce de noyer vernie : veines (bandes déformées par du bruit), deux bruns, vernis brillant."""
    m, nt, out = cv._mat(name)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    wv = nt.nodes.new("ShaderNodeTexWave")
    wv.wave_type = "RINGS"
    wv.inputs["Scale"].default_value = 9.0
    wv.inputs["Distortion"].default_value = 9.0
    wv.inputs["Detail"].default_value = 4.0
    nt.links.new(tc.outputs["Object"], wv.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = lin("#2a140a")
    ramp.color_ramp.elements[1].color = lin("#7a4321")
    nt.links.new(wv.outputs["Fac"], ramp.inputs[0])
    p = cv._principled(nt, **{"Roughness": 0.35, "Coat Weight": 1.0, "Coat Roughness": 0.03})
    nt.links.new(ramp.outputs[0], p.inputs["Base Color"])
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


def mat_plain(name, color, rough=0.5, metal=0.0, coat=0.0, emit=0.0):
    m = cv.mat_plain(name, color, rough=rough, metal=metal, coat=coat)
    if emit:
        p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        p.inputs["Emission Color"].default_value = lin(color) if isinstance(color, str) else color
        p.inputs["Emission Strength"].default_value = emit
    return m


def mat_plate(name="hero_plate"):
    """Plaque vierge : tôle émaillée crème, bord embouti (aucun texte)."""
    return mat_plain(name, "#dcd8c6", rough=0.38, coat=0.3)


# ---------------------------------------------------------------- géométrie

def islands(ob):
    """Morceaux disjoints d'un maillage : liste de (indices de sommets, min, max) en coordonnées locales."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    seen = set()
    out = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, idx = [v], []
        seen.add(v.index)
        while stack:
            x = stack.pop()
            idx.append(x.index)
            for e in x.link_edges:
                o = e.other_vert(x)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        pts = [bm.verts[i].co for i in idx]
        out.append((idx, Vector(map(min, *pts)), Vector(map(max, *pts))))
    bm.free()
    return out


def delete_islands(ob, boxes, max_size=0.3, min_verts=0, max_verts=10 ** 9):
    """Supprime les morceaux dont le centre tombe dans une des boîtes ((x0, x1), (y0, y1), (z0, z1)) et dont
    la plus grande dimension est sous max_size. Renvoie le nombre de morceaux supprimés."""
    kill = []
    n = 0
    for idx, a, b in islands(ob):
        c = (a + b) / 2
        if max((b - a)) > max_size or not (min_verts <= len(idx) <= max_verts):
            continue
        for (x0, x1), (y0, y1), (z0, z1) in boxes:
            if x0 <= c.x <= x1 and y0 <= c.y <= y1 and z0 <= c.z <= z1:
                kill += idx
                n += 1
                break
    if kill:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.verts[i] for i in kill], context="VERTS")
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
    return n


def ray_x(objs, y, z, from_front=True):
    """Premier point de la carrosserie touché par un rayon horizontal le long de x, à (y, z)."""
    best = None
    for ob in objs:
        inv = ob.matrix_world.inverted()
        o = inv @ Vector((50.0 if from_front else -50.0, y, z))
        d = (inv.to_3x3() @ Vector((-1.0 if from_front else 1.0, 0, 0))).normalized()
        hit, loc, nor, _ = ob.ray_cast(o, d)
        if hit:
            p = ob.matrix_world @ loc
            if best is None or (p.x > best.x if from_front else p.x < best.x):
                best = p
    return best


def add_plate(name, at, facing, size=(0.52, 0.11), coll=None):
    """Plaque vierge (tôle de 4 mm, bord relevé), posée à `at`, tournée vers +x (facing=1) ou -x (-1)."""
    bm = bmesh.new()
    w, h = size
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal((0.004, w, h, 1)))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat_plate())
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    ob.location = at + Vector((0.004 * facing, 0, 0))
    return ob


def _mesh_object(name, bm, mats, coll=None, smooth=False):
    me = bpy.data.meshes.new(name)
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


def _box(bm, lo, hi, mat=0):
    """Pavé aligné (lo, hi) ajouté à bm ; renvoie ses faces."""
    c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
    s = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]
    r = bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(c) @ Matrix.Diagonal((*s, 1)))
    faces = list({f for v in r["verts"] for f in v.link_faces})
    for f in faces:
        f.material_index = mat
    return faces


def _dish(bm, x_back, y0, y1, z0, z1, depth, n=14, mat=0, sign=1):
    """Réflecteur : coque parabolique dans le rectangle (y0..y1, z0..z1), creusée de `depth` vers l'arrière ;
    sign = 1 si l'avant de la voiture est vers +x (l'ouverture regarde +x)."""
    cy, cz = (y0 + y1) / 2, (z0 + z1) / 2
    ry, rz = (y1 - y0) / 2, (z1 - z0) / 2
    grid = []
    for i in range(n + 1):
        row = []
        for j in range(n + 1):
            y = y0 + (y1 - y0) * j / n
            z = z0 + (z1 - z0) * i / n
            u = ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2
            x = x_back + sign * depth * min(u, 1.6) / 1.6
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for i in range(n):
        for j in range(n):
            f = bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
            f.material_index = mat
            f.smooth = True


def _ribbed_lens(bm, x_front, y0, y1, z0, z1, ribs, depth=0.012, mat=0, sign=1):
    """Verre nervuré horizontalement (les feux arrière d'époque) : un profil en dents de scie extrudé le long de y."""
    prof = []
    for k in range(ribs + 1):
        z = z0 + (z1 - z0) * k / ribs
        prof.append((x_front, z))
        if k < ribs:
            prof.append((x_front - sign * depth, z + (z1 - z0) / ribs * 0.35))
    a = [bm.verts.new((x, y0, z)) for x, z in prof]
    b = [bm.verts.new((x, y1, z)) for x, z in prof]
    for i in range(len(prof) - 1):
        f = bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]) if sign > 0 else (a[i], b[i], b[i + 1], a[i + 1]))
        f.material_index = mat


def solidify(ob, thickness=0.004):
    """Épaisseur réelle d'une feuille (verre)."""
    m = ob.modifiers.new("solidify", "SOLIDIFY")
    m.thickness = thickness
    m.offset = 0.0
    m.use_even_offset = True
    return m


def point_light(parent, name, loc, color, energy, radius=0.05):
    d = bpy.data.lights.new(name, "POINT")
    d.energy = energy
    d.color = lin(color)[:3]
    d.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, d)
    parent.users_collection[0].objects.link(ob)
    ob.parent = parent
    ob.location = loc
    return ob


def _assign_by(parts, table):
    """Remplace chaque matériau d'origine par celui de la table (clé = nom d'origine sans suffixe)."""
    for o in parts:
        for i, m in enumerate(o.data.materials):
            if m is None:
                continue
            base = m.name.split(".")[0]
            if base in table and table[base] is not None:
                o.data.materials[i] = table[base]


# ---------------------------------------------------------------- la berline des années 60

def _w111_clean(parts):
    """Retire les marques (coordonnées du fichier : avant vers -y, mètres) : l'étoile dressée du capot et son socle,
    l'écusson de calandre, l'étoile et le lettrage du coffre, l'étoile des enjoliveurs."""
    report = {}
    keep = []
    for o in parts:
        if "small badge" in o.name:
            report[o.name] = "supprimé"
            bpy.data.objects.remove(o)
            continue
        keep.append(o)
    for o in keep:
        if o.name.startswith("w111_body_chrome"):
            n = delete_islands(o, [
                ((-0.06, 0.06), (-2.30, -2.22), (0.88, 1.02)),   # étoile du capot, anneau, tige, socle
                ((-0.09, 0.09), (2.27, 2.33), (0.76, 0.90)),     # étoile du coffre et son anneau
                ((0.36, 0.75), (2.29, 2.34), (0.70, 0.80)),      # lettrage du modèle à droite du coffre
                ((-0.75, -0.36), (2.29, 2.34), (0.70, 0.80)),    # lettrage éventuel à gauche
            ], max_size=0.16)
            report[o.name] = f"{n} morceaux supprimés"
        elif "_rim_" in o.name and "chrome" in o.name:
            # l'étoile au centre de l'enjoliveur (72 sommets, 10 cm) ; le disque nu reste
            n = delete_islands(o, [((-2, 2), (-3, 3), (-1, 2))], max_size=0.11, max_verts=100)
            report[o.name] = f"{n} morceaux supprimés"
    return keep, report


def _w111_materials(parts, lights_on, tag="hero_w111", paint_color=PAINT["w111"], leather=LEATHER["w111"],
                    wheel_rim="#e6dcc2"):
    """Les matières de la berline ; reprises par le coupé pour l'habitacle emprunté (tag, peinture, cuir, jante)."""
    on = 1.0 if lights_on else 0.0
    paint = mat_paint(f"{tag}_paint", paint_color)
    chrome = mat_metal(f"{tag}_chrome", (0.92, 0.92, 0.93, 1), 0.05)
    table = {
        "Carpaint_Simple_Ruby0": paint,
        "chrome": chrome,
        "Silver_Clean": mat_metal(f"{tag}_grille", (0.86, 0.86, 0.87, 1), 0.14),
        "metal": mat_metal(f"{tag}_steel", (0.10, 0.10, 0.105, 1), 0.5),
        "Rubber": mat_rubber(f"{tag}_seal", rough=0.5, grain=0.05),
        "Rubber0": mat_tyre(f"{tag}_tyre"),
        "PVC_Black_Matte": mat_rubber(f"{tag}_black", (0.012, 0.012, 0.013, 1), 0.55, 0.05),
        "PVC_Black_Matte0": mat_rubber(f"{tag}_black0", (0.012, 0.012, 0.013, 1), 0.6, 0.05),
        "PVC_Black_Matte1": mat_rubber(f"{tag}_black1", (0.015, 0.014, 0.014, 1), 0.5, 0.05),
        "Material_26": mat_window(f"{tag}_glass"),
        # les ampoules (dans l'assemblage des feux) : allumées à l'avant, sombres à l'arrière sauf le feu de position
        "Material_38": None,
        "light_reflector": None,
        "front_light_glass": mat_lens(f"{tag}_head_lens", (0.97, 0.97, 0.95, 1), LAMP, 0.35 * on, flutes=60.0),
        "back_light_glass": mat_lens(f"{tag}_tail_lens", lin("#5a0402"), "#ff1205", 0.9 * on, flutes=40.0, flute_axis="Z"),
        "reverse_light_glass": mat_lens(f"{tag}_reverse_lens", (0.95, 0.95, 0.95, 1)),
        "Acrylic_Transparent_Orange": mat_lens(f"{tag}_amber", lin("#ff8a1a"), AMBER, 0.0),
        "Walnut_Matte": mat_walnut(f"{tag}_walnut"),
        "Leather_Top_Grain_Beige": mat_leather(f"{tag}_leather", leather),
        # le volant d'époque : jante ivoire en bakélite (noire sur le coupé)
        "Leather_Top_Grain_Beige0": mat_plain(f"{tag}_wheel_rim", wheel_rim, rough=0.22, coat=0.6),
        "interior_textured": mat_plain(f"{tag}_dash_face", "#141516", rough=0.4),
        "interior_carpet": mat_rubber(f"{tag}_carpet", lin("#2a1d16"), 0.95, 0.6),
        "interior_tan_color": mat_leather(f"{tag}_tan", "#8a6a48", 0.55),
        "interior_glass": mat_window(f"{tag}_gauge_glass", (0.9, 0.9, 0.9, 1)),
        "mirror": mat_metal(f"{tag}_mirror", (0.95, 0.95, 0.95, 1), 0.0),
    }
    # ampoules et réflecteurs : l'avant (x de fichier < 0 dans y, l'avant est vers -y) s'allume crème, l'arrière rouge
    head_ref = mat_reflector(f"{tag}_head_reflector", LAMP, 2.5 * on)
    # réflecteur arrière teinté rouge (le chrome nu blanchissait le feu en rose)
    tail_ref = mat_reflector(f"{tag}_tail_reflector", "#ff1205", 0.25 * on)
    tail_ref.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = lin("#a01008")
    head_bulb = mat_plain(f"{tag}_head_bulb", LAMP, rough=0.2, emit=30.0 * on)
    tail_bulb = mat_plain(f"{tag}_tail_bulb", "#ff1a0a", rough=0.2, emit=3.0 * on)
    _assign_by(parts, table)
    for o in [o for o in parts if o.name.startswith("w111_lights_assembly")]:
        base = o.data.materials[0].name.split(".")[0] if o.data.materials else ""
        if base not in ("light_reflector", "Material_38"):
            continue
        front, rear = (head_ref, tail_ref) if base == "light_reflector" else (head_bulb, tail_bulb)
        o.data.materials.clear()
        o.data.materials.append(front)
        o.data.materials.append(rear)
        for p in o.data.polygons:
            p.material_index = 0 if p.center.y < 0 else 1
    return paint


def _load_w111(collection, lights_on, raw):
    parts = cv.import_model(os.path.join(CAST, "hero-mercedes-w111", "model.glb"), collection)
    report = {}
    if not raw:
        parts, report = _w111_clean(parts)
        _w111_materials(parts, lights_on)
    # le fichier pose l'avant vers -y : un quart de tour met l'avant vers +x
    cv.normalise(parts, rot_z=90)
    return parts, report


# ---------------------------------------------------------------- assemblage commun

def _group(parts, key):
    return [o for o in parts if key in o.name]


def _finish(variant, parts, collection, lights_on, raw, wheel_keys, door_keys, report):
    tag = f"hero_{variant}" + ("_raw" if raw else "")
    # les groupes d'abord, par nom (une jonction invalide les objets qu'elle absorbe)
    names = {o.name: o for o in parts}
    taken = set()
    wgroups, dgroups = {}, {}
    for k, pats in wheel_keys.items():
        wgroups[k] = [n for n in names if n not in taken and any(p in n for p in pats)]
        taken |= set(wgroups[k])
    for k, pats in door_keys.items():
        dgroups[k] = [n for n in names if n not in taken and any(p in n for p in pats)]
        taken |= set(dgroups[k])
    rest = [names[n] for n in names if n not in taken]
    wheels = {}
    for k, ns in wgroups.items():
        if not ns:
            continue
        w = cv.join([names[n] for n in ns], f"{tag}_wheel_{k}")
        a, b = cv.bbox([w])
        cv.set_origin(w, (a + b) / 2)
        wheels[k] = w
    doors = {}
    for k, ns in dgroups.items():
        if not ns:
            continue
        d = cv.join([names[n] for n in ns], f"{tag}_door_{k}")
        a, b = cv.bbox([d])
        # charnière : bord avant, côté extérieur, à mi-hauteur
        side = b.y if (a.y + b.y) > 0 else a.y
        cv.set_origin(d, (b.x, side, (a.z + b.z) / 2))
        doors[k] = d
    body = cv.join(rest, tag)
    for o in list(wheels.values()) + list(doors.values()):
        cv.parent_keep(o, body)
    mn, mx = cv.bbox([body] + list(wheels.values()))
    axles = {k: tuple(round(c, 3) for c in w.matrix_world.translation) for k, w in wheels.items()}
    radius = max((cv.bbox([w])[1].z - cv.bbox([w])[0].z) / 2 for w in wheels.values()) if wheels else 0.0
    allobj = [body] + list(wheels.values()) + list(doors.values())
    return dict(body=body, wheels=wheels, doors=doors, lights=[], length=mx.x - mn.x, width=mx.y - mn.y,
                height=mx.z - mn.z, wheel_radius=radius, axles=axles, tris=cv.tris(allobj), report=report)


def _lamp_centres(ob_names, body):
    """Centres des feux gauche et droit : morceaux de la carrosserie jointe portant les matériaux donnés."""
    me = body.data
    idx = {i for i, m in enumerate(me.materials) if m and m.name.split(".")[0] in ob_names}
    pts = {1: [], -1: []}
    for p in me.polygons:
        if p.material_index in idx:
            c = body.matrix_world @ p.center
            pts[1 if c.y > 0 else -1].append(c)
    out = []
    for s in (1, -1):
        if pts[s]:
            v = sum(pts[s], Vector()) / len(pts[s])
            out.append(v)
    return out


def _lights(car, lights_on, head_mats, tail_mats):
    if not lights_on:
        return []
    body = car["body"]
    mn, mx = cv.bbox([body])
    out = []
    heads = _lamp_centres(head_mats, body)
    tails = _lamp_centres(tail_mats, body)
    inv = body.matrix_world.inverted()
    pts = [inv @ (Vector((mx.x + 0.05, h.y, h.z))) for h in heads]
    out += cv.headlight_spots(body, pts, on=True, energy=550.0, angle=50.0)
    # une petite lueur derrière chaque verre (le réflecteur et la calandre en reçoivent un peu)
    for i, h in enumerate(heads):
        out.append(point_light(body, f"{body.name}_head_glow_{i}", inv @ (h + Vector((0.12, 0, 0))), LAMP, 4.0, 0.04))
    for i, t in enumerate(tails):
        out.append(point_light(body, f"{body.name}_tail_glow_{i}", inv @ (Vector((mn.x - 0.06, t.y, t.z))), TAIL, 3.0, 0.05))
    return out


def load_hero(variant="w111", collection=None, lights_on=True, raw=False):
    """La voiture poursuivie, au sol, l'avant vers +x. raw=True : le modèle tel que livré (matières d'origine,
    marques comprises), seulement remis dans le repère, pour les planches avant / après.

    Renvoie dict(body, wheels {FL, FR, BL, BR}, doors, lights, length, width, height, wheel_radius, axles, tris, report)."""
    if variant == "w111":
        parts, report = _load_w111(collection, lights_on, raw)
        car = _finish("w111", parts, collection, lights_on, raw,
                      {k: (f"_rim_{k}", f"_wheel_{k}") for k in ("FL", "FR", "BL", "BR")},
                      {k: (f"_door_{k}",) for k in ("FL", "FR", "BL", "BR")}, report)
        if not raw:
            body = car["body"]
            mn, mx = cv.bbox([body])
            # plaque vierge à l'arrière seulement (format américain 30,5 x 15,2 cm, pas de plaque avant dans l'État
            # du film), dans le logement entre les feux
            rear = ray_x([body], 0.0, 0.60, False)
            if rear is not None:
                pl = add_plate(f"{body.name}_plate_rear", rear, -1, size=(0.305, 0.152), coll=body.users_collection[0])
                cv.parent_keep(pl, body)
            car["lights"] = _lights(car, lights_on, ("hero_w111_head_lens",), ("hero_w111_tail_lens",))
        # repères de l'habitacle (conduite à gauche) : œil du conducteur, centre du volant
        car["cockpit"] = dict(eye=Vector((-0.55, 0.36, 1.22)), wheel=Vector((0.55, 0.42, 0.87)))
        return car
    if variant == "slc":
        return _load_slc(collection, lights_on, raw)
    if variant == "coupe":
        return _load_coupe(collection, lights_on)
    raise SystemExit(f"variante inconnue {variant}")


def _load_coupe(collection, lights_on):
    """Le coupé actuel de cast.py (référence des finalistes), remis l'avant vers +x."""
    sys.path.insert(0, os.path.dirname(HERE))
    import cast
    col = collection or bpy.context.scene.collection
    parts = cast.build_coupe(col)
    cv.normalise(parts, rot_z=90)
    body = cv.join(parts, "hero_coupe")
    mn, mx = cv.bbox([body])
    car = dict(body=body, wheels={}, doors={}, lights=[], length=mx.x - mn.x, width=mx.y - mn.y, height=mx.z - mn.z,
               wheel_radius=0.0, axles={}, tris=cv.tris([body]), report={})
    if lights_on:
        car["lights"] = cv.headlight_spots(body, [(mx.x + 0.05, 0.6, 0.62), (mx.x + 0.05, -0.6, 0.62)], energy=550.0)
    car["cockpit"] = dict(eye=Vector((-0.5, 0.35, 1.05)), wheel=Vector((0.3, 0.44, 0.83)))
    return car


def _load_slc(collection, lights_on, raw):
    raise SystemExit("slc : pas encore écrit")


# ---------------------------------------------------------------- planches

def _args():
    import argparse
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", default="avant-apres")
    ap.add_argument("--car", default="w111")
    ap.add_argument("--samples", type=int, default=128)
    ap.add_argument("--res", default="960x720")
    ap.add_argument("--only", default="", help="vues : avant,profil,arriere,interieur,debug")
    ap.add_argument("--reuse", action="store_true")
    ap.add_argument("--no-raw", action="store_true", help="ne refait pas le côté « livré »")
    return ap.parse_args(argv)


VIEWS = {
    # az : 0 = plein avant (+x), 90 = profil droit (-y) ; hauteur caméra ; focale
    "avant": (38.0, 1.15, 35.0, "trois quarts avant"),
    "profil": (90.0, 0.95, 50.0, "profil"),
    "arriere": (145.0, 1.15, 35.0, "trois quarts arrière"),
}


def _set_scene(cvr):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cvr.dusk_world(cv)
    cvr.wet_ground(cv)


def _street_light(cvr, car):
    mn, mx = cv.bbox([car["body"]] + list(car["wheels"].values()))
    c = (mn + mx) / 2
    L, W, H = mx.x - mn.x, mx.y - mn.y, mx.z - mn.z
    cvr.street_spot((c.x + 0.35 * L + 1.5, c.y - W / 2 - 4.5, 7.2), (c.x, c.y, mn.z + 0.5 * H), 5200.0)
    cvr.street_lamp((c.x - 2.0, c.y + 7.0, 7.5), 1400.0)
    cvr.street_lamp((c.x - 22.0, c.y + 6.0, 7.5), 2600.0)
    return mn, mx


def _view_camera(cvr, car, view, res):
    mn, mx = cv.bbox([car["body"]] + list(car["wheels"].values()))
    c = (mn + mx) / 2
    L, W, H = mx.x - mn.x, mx.y - mn.y, mx.z - mn.z
    if view == "interieur":
        ck = car["cockpit"]
        cam = cvr.camera(ck["eye"], ck["wheel"] + Vector((0.9, -0.05, 0.12)), lens=18.0)
        cam.data.clip_start = 0.02
        return cam, "habitacle, derrière le conducteur"
    # gros plans de contrôle (marques retirées, feux, roue)
    close = {
        "gros-phare": ((mx.x + 1.1, -0.75 * W, 1.0), (mx.x - 0.05, -0.33 * W, 0.68), 50.0, "phare"),
        "gros-capot": ((mx.x + 1.6, -0.25, 1.45), (mx.x - 0.2, 0.0, 0.85), 50.0, "calandre et capot"),
        "gros-coffre": ((mn.x - 1.5, -0.6, 1.3), (mn.x + 0.1, 0.0, 0.7), 40.0, "coffre"),
        "gros-roue": None,
    }
    if view in close:
        if view == "gros-roue":
            w = car["wheels"].get("FR") or next(iter(car["wheels"].values()))
            p = w.matrix_world.translation
            cam = cvr.camera((p.x + 0.4, p.y - 1.4, p.z + 0.15), p, lens=50.0)
            return cam, "roue"
        loc, tgt, lens, label = close[view]
        return cvr.camera(loc, tgt, lens=lens), label
    az, z, lens, label = VIEWS[view]
    a = math.radians(az)
    # largeur vue : la face (W) de face, la longueur (L) de profil
    seen = abs(W * math.cos(a)) + abs(L * math.sin(a))
    d = seen * 1.12 / (2 * 18.0 / lens) + W / 2
    return cvr.camera((c.x + d * math.cos(a), c.y - d * math.sin(a), z), (c.x, c.y, mn.z + 0.42 * H), lens=lens), label


def render_views(car_name, raw, views, out_dir, res, samples, reuse=False, tag=None):
    import cast_vehicles_render as cvr
    paths = []
    tag = tag or (f"{car_name}-{'livre' if raw else 'apres'}")
    todo = [v for v in views if not (reuse and os.path.exists(os.path.join(out_dir, f"{tag}-{v}.png")))]
    if not todo:
        return [os.path.join(out_dir, f"{tag}-{v}.png") for v in views]
    _set_scene(cvr)
    car = load_hero(car_name, lights_on=not raw, raw=raw)
    print(f"[hero] {car_name} {'livré' if raw else 'après'} : {car['length']:.2f} x {car['width']:.2f} x {car['height']:.2f} m, "
          f"roue r {car['wheel_radius']:.3f} m, essieux {car['axles']}, {car['tris']} triangles, {car['report']}", flush=True)
    _street_light(cvr, car)
    name = {"w111": "berline 60s", "slc": "coupé 70s", "coupe": "coupé actuel"}.get(car_name, car_name)
    for v in views:
        p = os.path.join(out_dir, f"{tag}-{v}.png")
        paths.append(p)
        if v not in todo:
            continue
        cam, label = _view_camera(cvr, car, v, res)
        bpy.context.scene.camera = cam
        state = "" if car_name == "coupe" else (" livrée" if raw else " retravaillée")
        cap = cvr.cam_label(cv, cam, f"{name}{state}  ·  {label}", res)
        cvr.setup_render(res[0], res[1], samples)
        bpy.context.scene.view_settings.exposure = 0.5 if v != "interieur" else 1.6
        bpy.context.scene.render.filepath = p
        import time
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"[hero] écrit {p} en {time.time() - t:.0f} s", flush=True)
        bpy.data.objects.remove(cap)
        bpy.data.objects.remove(cam)
    return paths


def main():
    a = _args()
    res = tuple(int(v) for v in a.res.split("x"))
    lab = os.path.join(REF, "lab")
    shots = os.path.join(lab, "plans")
    os.makedirs(shots, exist_ok=True)
    import cast_vehicles_render as cvr
    if a.sheet == "avant-apres":
        views = a.only.split(",") if a.only else ["avant", "profil", "arriere", "interieur"]
        before = [os.path.join(shots, f"{a.car}-livre-{v}.png") for v in views] if a.no_raw else \
            render_views(a.car, True, views, shots, res, a.samples, reuse=a.reuse)
        after = render_views(a.car, False, views, shots, res, a.samples, reuse=a.reuse)
        paths = [p for pair in zip(before, after) for p in pair]
        if all(os.path.exists(p) for p in paths) and not a.only:
            cvr.compose(paths, 2, os.path.join(lab, f"mercedes-{a.car}-avant-apres.png"), res)
    elif a.sheet == "finalistes":
        paths = []
        for car in ("w111", "slc", "coupe"):
            paths += render_views(car, False, ["avant"], shots, res, a.samples, reuse=a.reuse, tag=f"finaliste-{car}")
        if all(os.path.exists(p) for p in paths):
            cvr.compose(paths, 3, os.path.join(lab, "voiture-heros-finalistes.png"), res)


if __name__ == "__main__":
    main()
