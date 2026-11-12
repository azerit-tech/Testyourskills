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
#
# Réglages lus dans l'environnement (la berline w111) :
#   FILM3D_USURE=0..1        l'usure des matières (USURE par défaut)
#   FILM3D_PAINT=<hex>       la teinte de la peinture (PAINT["w111"] par défaut)
#   FILM3D_PAINT_METAL=0..1  la part métallique de sa base (PAINT_METAL["w111"] par défaut)
#   FILM3D_PAINT_COAT=0..1   le poids du vernis, en facteur (1 par défaut : inchangé)
#   FILM3D_PAINT_COAT_ROUGH=0..1  rugosité ajoutée au vernis (0 par défaut : inchangé)
#   FILM3D_PAINT_TINT=<hex>  la teinte du vernis (PAINT_TINT["w111"] par défaut, ffffff = incolore)
#   (lus à la construction : un plan rendu dans son propre Blender les prend pour lui seul, render_film.py --essai)
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
TAIL = "#ff6a3d"        # feux arrière : le corail du film (lueur portée)
AMBER = "#ffa21a"

# l'usure des matières de la berline (0 = la voiture de catalogue, 1 = la voiture de tous les jours, jamais une
# épave) : chromes voilés, vernis rayé dans les reflets, poussière de route en bas de caisse, gouttes qui sèchent
USURE = 0.5


def usure():
    """Dose d'usure, FILM3D_USURE=0..1 dans l'environnement, USURE sinon."""
    try:
        return max(0.0, min(1.0, float(os.environ.get("FILM3D_USURE", USURE))))
    except ValueError:
        return USURE

# couleurs d'époque, choisies sur les nuanciers des photographies : foncées, lisibles à l'heure bleue,
# distinctes de la patrouille (marine presque noir) et du coupé actuel (prune)
PAINT = {
    "w111": "#4e0a28",  # bordeaux profond (rouge rubis foncé du catalogue des années 60), tiré vers le pourpre
                        # pour ne pas virer à la brique sous les lampadaires ambre. Albédo relevé (rouge linéaire
                        # 0,075 au lieu de 0,033), vert presque nul (pas d'orange sous l'ambre), bleu au quart du
                        # rouge (lie-de-vin et pas rose sous le crème) : #330516 était une silhouette noire de nuit,
                        # #5a0c22 (métal 0,25) tire au rouge vif ; avant : #2c0614, brun-noir à l'heure bleue
    "slc": "#0c2a24",   # vert sapin foncé, teinte courante du coupé dans les années 70, tiré vers le bleu
                        # pour ne pas virer à l'olive sous les lampadaires ambre
}
# la part métallique de la base de la berline (moins que la peinture par défaut : la part diffuse garde le rouge ;
# 0,38 d'abord, la caisse ne renvoyait que son environnement)
PAINT_METAL = {"w111": 0.2}


def w111_paint():
    """La teinte et le métal de la peinture de la berline : FILM3D_PAINT=<hex> et FILM3D_PAINT_METAL=0..1 dans
    l'environnement (pour essayer une teinte sur un plan sans toucher au défaut), PAINT et PAINT_METAL sinon."""
    col = os.environ.get("FILM3D_PAINT", "").strip() or PAINT["w111"]
    if not col.startswith("#"):
        col = "#" + col
    try:
        metal = max(0.0, min(1.0, float(os.environ.get("FILM3D_PAINT_METAL", PAINT_METAL["w111"]))))
    except ValueError:
        metal = PAINT_METAL["w111"]
    return col, metal


def w111_coat():
    """Le vernis de la berline, pour un essai par plan : FILM3D_PAINT_COAT (facteur du poids, 1 = inchangé) et
    FILM3D_PAINT_COAT_ROUGH (rugosité ajoutée, 0 = inchangé). Sans ces variables, la matière ne change pas."""
    def num(key, default):
        try:
            return max(0.0, min(1.0, float(os.environ.get(key, default))))
        except ValueError:
            return default
    return num("FILM3D_PAINT_COAT", 1.0), num("FILM3D_PAINT_COAT_ROUGH", 0.0)


# la teinte du vernis de la berline (Coat Tint, sRGB) : un vernis chaud qui absorbe le bleu et un peu le vert, deux
# fois (aller et retour) et davantage sous les angles rasants. Sous l'ambre de l'avenue (presque sans bleu) la caisse
# ne bouge presque pas et ne tourne pas à l'orange (le vert baisse avec le bleu) ; sous le projecteur froid, la part
# bleue du pourpre de la base ne remonte plus : la portière éclairée passe de 330° (fuchsia) à 346° (bordeaux),
# banc hero_bench.py ; les flancs fuyants foncent, le vernis dessine les volumes. Essayés : fff6da (340°), ffdcc8
# (342°). FILM3D_PAINT_TINT=<hex> pour un essai (ffffff : vernis incolore, l'état d'avant).
PAINT_TINT = {"w111": "#ffd0b4"}


def w111_tint():
    col = os.environ.get("FILM3D_PAINT_TINT", "").strip() or PAINT_TINT["w111"]
    try:
        return lin(col if col.startswith("#") else "#" + col)[:3]
    except ValueError:
        return lin(PAINT_TINT["w111"])[:3]
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


# ---------------------------------------------------------------- l'usure
#
# Tout se lit sur la position de repos des sommets (attribut « rest », posé par _finish dans le repère de la voiture,
# l'avant vers +x, le sol à z = 0) : la poussière et les gouttes restent collées à la caisse quand la voiture roule,
# portes et roues comprises (leur origine a bougé, pas leurs sommets). Les cartes d'imperfections sont des niveaux de
# gris CC0 d'ambientCG (fetch.py) : traces d'essuyage (SurfaceImperfections003), taches d'eau séchée (013), grain de
# poussière (017) ; sans elles, un bruit de même échelle les remplace.

REST = "rest"           # position de repos, repère de la voiture
REST_N = "rest_n"       # normale de repos, même repère
REST_WHEEL = "rest_wheel"   # position dans le repère de la roue (origine sur l'axe, axe selon y), pour le pneu
DUST = "#5f564e"        # poussière de route sèche, grise et chaude


def _rest(nt):
    a = nt.nodes.new("ShaderNodeAttribute")
    a.attribute_type = "GEOMETRY"
    a.attribute_name = REST
    return a.outputs["Vector"]


def _xyz(nt, vec):
    s = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(vec, s.inputs[0])
    return s.outputs


def _scaled(nt, vec, s):
    vm = nt.nodes.new("ShaderNodeVectorMath")
    vm.operation = "MULTIPLY"
    nt.links.new(vec, vm.inputs[0])
    vm.inputs[1].default_value = s if isinstance(s, (tuple, list)) else (s, s, s)
    return vm.outputs[0]


def _ramp(nt, x, a, b):
    """Rampe douce de 0 (en a) à 1 (en b) ; a > b donne une rampe descendante."""
    n = nt.nodes.new("ShaderNodeMapRange")
    n.interpolation_type = "SMOOTHSTEP"
    lo, hi = (a, b) if a < b else (b, a)
    n.inputs["From Min"].default_value = lo
    n.inputs["From Max"].default_value = hi
    n.inputs["To Min"].default_value = 0.0 if a < b else 1.0
    n.inputs["To Max"].default_value = 1.0 if a < b else 0.0
    nt.links.new(x, n.inputs["Value"])
    return n.outputs[0]


def _mix(nt, a, b, f):
    """a + (b - a) × f, en nombres."""
    return cv._math(nt, "ADD", a, cv._math(nt, "MULTIPLY", cv._math(nt, "SUBTRACT", b, a), f))


def _mix_rgb(nt, a, b, f, blend="MIX"):
    n = nt.nodes.new("ShaderNodeMix")
    n.data_type = "RGBA"
    n.blend_type = blend
    for sock, v in ((n.inputs["Factor"], f), (n.inputs[6], a), (n.inputs[7], b)):
        if isinstance(v, bpy.types.NodeSocket):
            nt.links.new(v, sock)
        else:
            sock.default_value = v
    return n.outputs[2]


def _rest_n(nt):
    a = nt.nodes.new("ShaderNodeAttribute")
    a.attribute_type = "GEOMETRY"
    a.attribute_name = REST_N
    return a.outputs["Vector"]


def _imperfection(nt, coord, asset, size, lo=0.0, hi=1.0):
    """Carte d'imperfection ambientCG (niveaux de gris), une tuile pour `size` mètres, ramenée de [lo, hi] à [0, 1].
    Projection sur trois plans pondérés par la normale de repos (« rest_n ») et non la projection en boîte de Blender :
    la rue tourne les maillages d'un quart de tour, la normale de l'objet ne serait plus dans le repère de « rest ».
    Sans le fichier, un bruit de même échelle."""
    path = os.path.join(cv.ASSETS, asset, f"{asset}_2K-JPG_Color.jpg")
    v = _scaled(nt, coord, 1.0 / size)
    if os.path.exists(path):
        img = bpy.data.images.load(path, check_existing=True)
        img.colorspace_settings.name = "Non-Color"
        px, py, pz = _xyz(nt, v)
        nx, ny, nz = _xyz(nt, _rest_n(nt))
        acc = wsum = None
        for (a, b), n in (((py, pz), nx), ((px, pz), ny), ((px, py), nz)):
            uv = nt.nodes.new("ShaderNodeCombineXYZ")
            nt.links.new(a, uv.inputs[0])
            nt.links.new(b, uv.inputs[1])
            t = nt.nodes.new("ShaderNodeTexImage")
            t.image = img
            nt.links.new(uv.outputs[0], t.inputs["Vector"])
            w = cv._math(nt, "POWER", cv._math(nt, "ABSOLUTE", n), 4.0)
            term = cv._math(nt, "MULTIPLY", t.outputs["Color"], w)
            acc = term if acc is None else cv._math(nt, "ADD", acc, term)
            wsum = w if wsum is None else cv._math(nt, "ADD", wsum, w)
        src = cv._math(nt, "DIVIDE", acc, cv._math(nt, "MAXIMUM", wsum, 1e-4))
    else:
        src = _node(nt, "ShaderNodeTexNoise", Vector=v, Scale=6.0, Detail=4.0).outputs["Fac"]
        lo, hi = 0.45, 0.75
    r = nt.nodes.new("ShaderNodeMapRange")
    r.inputs["From Min"].default_value = lo
    r.inputs["From Max"].default_value = hi
    nt.links.new(src, r.inputs["Value"])
    return r.outputs[0]


def _noise(nt, coord, scale, detail=2.0, lo=0.3, hi=0.7):
    """Bruit doux ramené à [0, 1]."""
    n = _node(nt, "ShaderNodeTexNoise", Vector=coord, Scale=scale, Detail=detail)
    return _ramp(nt, n.outputs["Fac"], lo, hi)


def _up(nt, a=0.55, b=0.85):
    """1 sur les surfaces tournées vers le ciel (capot, toit, coffre), 0 sur les flancs : normale de repos."""
    return _ramp(nt, _xyz(nt, _rest_n(nt))[2], a, b)


def _drops(nt, coord, scale, size, density):
    """Gouttes posées : un dôme par cellule de Voronoï (cellule de 1/scale m) tirée au sort avec la probabilité
    `density`, rayon de 0,45 à 1 × size cellule. Renvoie (hauteur 0..1, masque 0/1)."""
    vo = nt.nodes.new("ShaderNodeTexVoronoi")
    vo.inputs["Scale"].default_value = scale
    nt.links.new(coord, vo.inputs["Vector"])
    sc = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(vo.outputs["Color"], sc.inputs[0])
    r = cv._math(nt, "MULTIPLY", cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", sc.outputs[0], 0.55), 0.45), size)
    q = cv._math(nt, "SUBTRACT", 1.0, cv._math(nt, "POWER", cv._math(nt, "DIVIDE", vo.outputs["Distance"], r), 2.0))
    keep = cv._math(nt, "LESS_THAN", sc.outputs[1], density)
    h = cv._math(nt, "MULTIPLY", cv._math(nt, "SQRT", cv._math(nt, "MAXIMUM", q, 0.0)), keep)
    return h, cv._math(nt, "MULTIPLY", cv._math(nt, "GREATER_THAN", q, 0.0), keep)


def _hairlines(nt, coord, along=(6.0, 6.0, 900.0), thresh=0.72):
    """Traces fines et longues (essuyage, micro-rayures) : un bruit étiré, fin selon un axe et long selon les
    deux autres, seuillé en filaments clairsemés ; renvoie 0..1."""
    n = _node(nt, "ShaderNodeTexNoise", Vector=_scaled(nt, coord, along), Scale=1.0, Detail=3.0, Roughness=0.6)
    return _ramp(nt, n.outputs["Fac"], thresh, thresh + 0.06)


def _swirls(nt, coord, scale=5.0, pitch=0.006):
    """Micro-rayures circulaires du lustrage : des cercles concentriques fins (un tous les `pitch` m) autour de centres
    tirés au sort (Voronoï, cellule de 1/scale m), coupés en arcs par un bruit ; ne se voient que dans les reflets."""
    out = None
    for k, (s, seed) in enumerate(((scale, 0.0), (scale * 1.7, 13.7))):
        # deux réseaux décalés : les cercles se chevauchent comme les passes d'un vrai lustrage
        off = nt.nodes.new("ShaderNodeVectorMath")
        off.operation = "ADD"
        nt.links.new(coord, off.inputs[0])
        off.inputs[1].default_value = (seed, -seed, seed * 0.5)
        vo = nt.nodes.new("ShaderNodeTexVoronoi")
        vo.inputs["Scale"].default_value = s
        nt.links.new(off.outputs[0], vo.inputs["Vector"])
        sc = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(vo.outputs["Color"], sc.inputs[0])
        # distance en mètres au centre, phase tirée par cellule
        d = cv._math(nt, "DIVIDE", vo.outputs["Distance"], s)
        ph = cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", d, 2 * math.pi / pitch), cv._math(nt, "MULTIPLY", sc.outputs[2], 40.0))
        ring = _ramp(nt, cv._math(nt, "SINE", ph), 0.85, 0.97)
        # des arcs, pas des cercles entiers, et pas trop près du centre (le tampon ne laisse rien au milieu)
        arcs = _noise(nt, coord, 60.0 + 25.0 * k, 1.0, 0.5, 0.62)
        ring = cv._math(nt, "MULTIPLY", cv._math(nt, "MULTIPLY", ring, arcs), _ramp(nt, d, 0.01, 0.04))
        out = ring if out is None else cv._math(nt, "MAXIMUM", out, ring)
    return out


def _grime(nt, rest, axles=None, top=0.6):
    """Voile de route sur le bas de caisse et en gerbe derrière chaque roue (projections) ; renvoie 0..1 avant la dose.
    axles : (x de l'essieu avant, x de l'essieu arrière), des nœuds Valeur nommés « axle_front », « axle_rear »
    que load_hero recale sur la voiture."""
    x, _, z = _xyz(nt, rest)
    low = _ramp(nt, z, top, 0.10)
    mask = cv._math(nt, "MULTIPLY", low, 0.75)
    if axles:
        for key, ax in zip(("axle_front", "axle_rear"), axles):
            v = nt.nodes.new("ShaderNodeValue")
            v.name = key
            v.outputs[0].default_value = ax
            # la gerbe part vers l'arrière de la roue (-x) et monte peu
            dx = cv._math(nt, "DIVIDE", cv._math(nt, "SUBTRACT", x, cv._math(nt, "SUBTRACT", v.outputs[0], 0.50)), 0.62)
            dz = cv._math(nt, "DIVIDE", cv._math(nt, "SUBTRACT", z, 0.22), 0.36)
            d = cv._math(nt, "SQRT", cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", dx, dx), cv._math(nt, "MULTIPLY", dz, dz)))
            mask = cv._math(nt, "MAXIMUM", mask, _ramp(nt, d, 1.0, 0.25))
    # le grain : poussière fine (017) et mouchetures de projections
    grain = _imperfection(nt, rest, "SurfaceImperfections017", 0.6, 0.15, 0.55)
    spk, _ = _drops(nt, rest, 420.0, 0.5, 0.35)
    pat = cv._math(nt, "MAXIMUM", cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", grain, 0.7), 0.3),
                   cv._math(nt, "MULTIPLY", cv._math(nt, "GREATER_THAN", spk, 0.0), 1.0))
    return cv._math(nt, "MULTIPLY", mask, pat)


def mat_paint(name, color, metal=0.45, rough=0.3, flake=0.1, peel=0.012, gaps=(), ribs=(), inside=None, wear=0.0,
              axles=(1.40, -1.40), coat=(1.0, 0.0), tint=None):
    """Peinture vernie : base pigmentée à paillettes fines (bruit très serré sur la rugosité et le métal),
    vernis brillant à peau d'orange légère (bruit doux sur la normale du vernis).

    gaps : joints de panneaux dessinés en coordonnées objet (creux sombre et relief), pour une caisse dont le maillage
    n'a pas de vraies découpes ; ribs : bandes nervurées ; coat : (facteur du poids du vernis, rugosité ajoutée),
    (1, 0) par défaut, sans aucun nœud de plus ; tint : la teinte du vernis (Coat Tint, linéaire), None = incolore.

    wear (0..1, la berline) : le vernis garde son brillant mais n'est plus parfait : rugosité qui varie par zones,
    micro-rayures circulaires du lustrage visibles dans les reflets, taches d'eau séchée et gouttes qui perlent encore
    sur le dessus, ondulation légère des panneaux, voile de route sur le bas de caisse et derrière les roues."""
    if wear > 0:
        return _mat_paint_worn(name, color, metal, rough, flake, peel, wear, axles, coat, tint)
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
    p = cv._principled(nt, **{"Base Color": lin(color), "Coat Weight": coat[0], "Coat Roughness": 0.025 + coat[1],
                              "Coat IOR": 1.5})
    if tint:
        p.inputs["Coat Tint"].default_value = (*tint[:3], 1.0)
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
            cw = cv._math(nt, "SUBTRACT", 1.0, gm)
            nt.links.new(cw if coat[0] == 1.0 else cv._math(nt, "MULTIPLY", cw, coat[0]), p.inputs["Coat Weight"])
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


def _mat_paint_worn(name, color, metal, rough, flake, peel, w, axles, coat=(1.0, 0.0), tint=None):
    """La peinture de la berline, usée de `w` (voir mat_paint)."""
    m, nt, out = cv._mat(name)
    rest = _rest(nt)
    up = _up(nt)
    # la base : paillettes comme la peinture neuve
    fl = _node(nt, "ShaderNodeTexNoise", Vector=rest, Scale=2600.0, Detail=0.0)
    base_r = _node(nt, "ShaderNodeMapRange", Value=fl.outputs["Fac"], **{"To Min": rough - flake, "To Max": rough + flake})
    mm = _node(nt, "ShaderNodeMapRange", Value=fl.outputs["Fac"], **{"To Min": metal - 0.25, "To Max": metal + 0.25})
    # le vernis : rugosité qui varie par zones (lustré ici, un peu terne là), micro-rayures circulaires, taches d'eau
    # séchée sur le dessus
    zones = _noise(nt, rest, 1.3, 2.0)
    swirl = _swirls(nt, rest)
    spots = _imperfection(nt, rest, "SurfaceImperfections013", 0.45, 0.08, 0.6)
    coat_r = cv._math(nt, "ADD", 0.022, cv._math(nt, "MULTIPLY", w, cv._math(
        nt, "ADD", cv._math(nt, "MULTIPLY", zones, 0.09),
        cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", swirl, 0.25),
                 cv._math(nt, "MULTIPLY", cv._math(nt, "MULTIPLY", spots, up), 0.12)))))
    # le voile de route en bas de caisse : la poussière ternit le vernis et éclaircit la teinte
    g = cv._math(nt, "MINIMUM", cv._math(nt, "MULTIPLY", _grime(nt, rest, axles), 2.0 * w), 0.8)
    coat_r = _mix(nt, coat_r, 0.42, g)
    base_col = _mix_rgb(nt, lin(color), lin(DUST), cv._math(nt, "MULTIPLY", g, 0.8))
    # les gouttes : grosses perles sur le dessus, fines gouttelettes, quelques-unes sur les flancs ; un dôme d'eau
    # lisse dans le vernis, et une auréole de calcaire autour des grosses
    dens = min(1.0, 1.4 * w)
    h1, m1 = _drops(nt, rest, 70.0, 0.36, cv._math(nt, "MULTIPLY", up, 0.32 * dens))
    h2, m2 = _drops(nt, rest, 210.0, 0.33,
                    cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", up, 0.5 * dens), 0.05 * dens))
    h = cv._math(nt, "MAXIMUM", h1, h2)
    wet = cv._math(nt, "MAXIMUM", m1, m2)
    coat_r = _mix(nt, coat_r, 0.0, wet)
    # le relief du vernis : ondulation des panneaux (tôle emboutie), peau d'orange, gouttes
    rip = _node(nt, "ShaderNodeTexNoise", Vector=rest, Scale=3.5, Detail=1.0)
    b0 = _node(nt, "ShaderNodeBump", Height=rip.outputs["Fac"], Strength=0.5 * w, Distance=0.01)
    op = _node(nt, "ShaderNodeTexNoise", Vector=rest, Scale=90.0, Detail=2.0)
    op2 = _node(nt, "ShaderNodeTexNoise", Vector=rest, Scale=320.0, Detail=1.0)
    peel_h = cv._math(nt, "ADD", op.outputs["Fac"], cv._math(nt, "MULTIPLY", op2.outputs["Fac"], 0.5))
    b1 = _node(nt, "ShaderNodeBump", Height=peel_h, Strength=peel * (1.0 + 0.8 * w), Distance=0.002, Normal=b0.outputs[0])
    b2 = _node(nt, "ShaderNodeBump", Height=h, Strength=1.0, Distance=0.0022, Normal=b1.outputs[0])
    p = cv._principled(nt, **{"Coat IOR": 1.5})
    if tint:
        p.inputs["Coat Tint"].default_value = (*tint[:3], 1.0)
    nt.links.new(base_col, p.inputs["Base Color"])
    nt.links.new(cv._math(nt, "ADD", base_r.outputs[0], cv._math(nt, "MULTIPLY", g, 0.4)), p.inputs["Roughness"])
    nt.links.new(mm.outputs[0], p.inputs["Metallic"])
    if coat[1] > 0.0:
        coat_r = cv._math(nt, "ADD", coat_r, coat[1])
    nt.links.new(coat_r, p.inputs["Coat Roughness"])
    cw = cv._math(nt, "SUBTRACT", 1.0, cv._math(nt, "MULTIPLY", g, 0.55))
    nt.links.new(cw if coat[0] == 1.0 else cv._math(nt, "MULTIPLY", cw, coat[0]), p.inputs["Coat Weight"])
    nt.links.new(b0.outputs[0], p.inputs["Normal"])
    nt.links.new(b2.outputs[0], p.inputs["Coat Normal"])
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


def mat_chrome(name, color=(0.92, 0.92, 0.93, 1), rough=0.05, wear=0.0):
    """Chrome poli d'époque. Avec wear : jamais un miroir parfait sur les grandes surfaces : rugosité qui varie par
    zones, traces d'essuyage (003) et micro-rayures fines le long des pièces, léger ternissement dans les creux
    (occlusion locale), ondulation du placage, voile de route sur ce qui est bas (pare-chocs, enjoliveurs)."""
    if wear <= 0:
        return mat_metal(name, color, rough)
    m, nt, out = cv._mat(name)
    rest = _rest(nt)
    zones = _noise(nt, rest, 2.2, 2.0)
    wipe = _imperfection(nt, rest, "SurfaceImperfections003", 0.7, 0.12, 0.38)
    hair = cv._math(nt, "MAXIMUM", _hairlines(nt, rest, (5.0, 5.0, 700.0)), _hairlines(nt, rest, (500.0, 7.0, 7.0), 0.75))
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.only_local = True
    ao.samples = 8
    ao.inputs["Distance"].default_value = 0.035
    tarnish = _ramp(nt, ao.outputs["AO"], 0.95, 0.45)
    x, _, z = _xyz(nt, rest)
    low = cv._math(nt, "MULTIPLY", _ramp(nt, z, 0.42, 0.12),
                   _imperfection(nt, rest, "SurfaceImperfections017", 0.6, 0.1, 0.55))
    r = cv._math(nt, "ADD", rough, cv._math(nt, "MULTIPLY", wear, cv._math(
        nt, "ADD", cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", zones, 0.16), cv._math(nt, "MULTIPLY", wipe, 0.30)),
        cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", hair, 0.16),
                 cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", tarnish, 0.35), cv._math(nt, "MULTIPLY", low, 0.6))))))
    # le chrome terni tire vers un gris chaud, plus sombre ; le placage n'est pas tout à fait uniforme
    dull = cv._math(nt, "MINIMUM", cv._math(nt, "MULTIPLY", cv._math(nt, "ADD", tarnish, low), 1.0 * wear), 0.7)
    col = _mix_rgb(nt, color, (0.50, 0.47, 0.43, 1), dull)
    col = _mix_rgb(nt, col, cv._math(nt, "ADD", 0.82, cv._math(nt, "MULTIPLY", zones, 0.18)), 1.0, "MULTIPLY")
    rip = _node(nt, "ShaderNodeTexNoise", Vector=rest, Scale=4.0, Detail=2.0)
    bump = _node(nt, "ShaderNodeBump", Height=rip.outputs["Fac"], Strength=0.9 * wear, Distance=0.03)
    hb = _node(nt, "ShaderNodeBump", Height=hair, Strength=0.15 * wear, Distance=0.0003, Normal=bump.outputs[0])
    p = cv._principled(nt, **{"Metallic": 1.0})
    nt.links.new(col, p.inputs["Base Color"])
    nt.links.new(r, p.inputs["Roughness"])
    nt.links.new(hb.outputs[0], p.inputs["Normal"])
    nt.links.new(hb.outputs[0], ao.inputs["Normal"])
    nt.links.new(p.outputs[0], out.inputs[0])
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


def mat_tyre(name, r_rim=0.19, r_out=0.31, wear=0.0):
    """Pneu, dans le repère de la roue (attribut « rest_wheel » : origine sur l'axe, axe selon y ; il reste juste quand
    la rue tourne les maillages d'un quart de tour) : gomme noire, flanc à fines
    stries concentriques, un bandeau de marquages moulés illisibles (relief seul, aucun texte) et le liseré du talon ;
    la bande de roulement reste mate.

    wear : gomme vieillie, flancs mats (le satin du neuf part), poussière grise dans les stries et sur la bande."""
    m, nt, out = cv._mat(name)
    at = nt.nodes.new("ShaderNodeAttribute")
    at.attribute_type = "GEOMETRY"
    at.attribute_name = REST_WHEEL
    pos = at.outputs["Vector"]
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(pos, sep.inputs[0])
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
    nt.links.new(pos, nz.inputs["Vector"])
    h = cv._math(nt, "ADD", h, cv._math(nt, "MULTIPLY", nz.outputs["Fac"], 0.3))
    bump = _node(nt, "ShaderNodeBump", Strength=0.5, Distance=0.0008)
    nt.links.new(h, bump.inputs["Height"])
    rough = cv._math(nt, "SUBTRACT", 0.78 + 0.1 * wear, cv._math(nt, "MULTIPLY", cv._math(nt, "ADD", side, marks),
                                                                   0.08 * (1.0 - wear)))
    p = cv._principled(nt, **{"Base Color": (0.018, 0.018, 0.02, 1), "Specular IOR Level": 0.35 - 0.12 * wear})
    if wear > 0:
        # la poussière se loge dans les creux (stries, marquages) et couvre la bande de roulement
        dust = _imperfection(nt, pos, "SurfaceImperfections017", 0.5, 0.1, 0.55)
        tread = cv._math(nt, "GREATER_THAN", r, r_out - 0.03)
        f = cv._math(nt, "MULTIPLY", cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", dust, 0.6),
                                              cv._math(nt, "MULTIPLY", tread, 0.35)), 0.55 * wear)
        nt.links.new(_mix_rgb(nt, (0.018, 0.018, 0.02, 1), lin("#4a443d"), cv._math(nt, "MINIMUM", f, 0.5)),
                     p.inputs["Base Color"])
    nt.links.new(rough, p.inputs["Roughness"])
    nt.links.new(bump.outputs[0], p.inputs["Normal"])
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


# la lunette (attribut de face « lunette » des vitres, mark_rear_window) : la part de son reflet retirée. Vue de dos,
# couchée vers le ciel, elle en renvoyait un aplat clair où la silhouette du conducteur se perdait ; et sans gouttes
# ni voile d'essuyage, qui la ternissaient en gris devant l'habitacle
REAR_WINDOW = "lunette"
REAR_REFL_CUT = 0.6


def mat_window(name, tint=(0.80, 0.86, 0.84, 1), dark=0.0, wear=0.0):
    """Verre de vitre : sans réfraction (les vitres du modèle sont des lames minces à deux faces), reflet de Fresnel
    du verre réel (IOR 1,52) sur une transparence à peine verte, comme le verre trempé d'époque.

    La face vue de dos (la face intérieure d'une lame vue du dehors, une vitre vue de l'habitacle) garde le reflet du
    verre vu de l'air : le nœud Fresnel y prendrait 1/1,52 et passerait en réflexion totale au-delà de 41°, les
    vitres du côté opposé devenaient des miroirs noirs à travers l'habitacle. Le rayon ne réfracte pas : il arrive sur
    la face intérieure sous l'angle extérieur, et une lame à faces parallèles y renvoie ce que renvoie sa face
    extérieure. L'IOR passe donc à 1/1,52 sur la face de dos (le nœud l'inverse), un peu moins fort que la face
    avant (0,06 de face, environ 0,1 sous 60°).

    wear : un voile d'essuyage (003) qui ternit le reflet par endroits, des taches d'eau séchée (013), et des
    gouttes, nombreuses sur les vitres couchées (pare-brise, lunette), rares sur les vitres de côté."""
    m, nt, out = cv._mat(name)
    bf = nt.nodes.new("ShaderNodeNewGeometry").outputs["Backfacing"]
    fr = _node(nt, "ShaderNodeFresnel", IOR=_mix(nt, 1.52, 1.0 / 1.52, bf))
    tr = _node(nt, "ShaderNodeBsdfTransparent", Color=tuple(c * (1 - dark) for c in tint[:3]) + (1,))
    gl = _glossy(nt)
    gl.inputs["Roughness"].default_value = 0.0
    mix = nt.nodes.new("ShaderNodeMixShader")
    rw = nt.nodes.new("ShaderNodeAttribute")
    rw.attribute_type = "GEOMETRY"
    rw.attribute_name = REAR_WINDOW
    clear = cv._math(nt, "SUBTRACT", 1.0, rw.outputs["Fac"])        # 0 sur la lunette, 1 ailleurs
    # un plancher de reflet : la vitre reste lisible de face
    floor = 0.04
    if wear > 0:
        rest = _rest(nt)
        haze = _imperfection(nt, rest, "SurfaceImperfections003", 0.8, 0.04, 0.4)
        spots = _imperfection(nt, rest, "SurfaceImperfections013", 0.4, 0.08, 0.6)
        veil = cv._math(nt, "MULTIPLY", cv._math(nt, "MAXIMUM", haze, spots), clear)
        nt.links.new(cv._math(nt, "MULTIPLY", veil, 0.10 * wear), gl.inputs["Roughness"])
        floor = cv._math(nt, "ADD", 0.04, cv._math(nt, "MULTIPLY", veil, 0.07 * wear))
        up = _up(nt, 0.25, 0.65)
        dens = min(1.0, 1.4 * wear)
        h1, m1 = _drops(nt, rest, 80.0, 0.34, cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", up, 0.35 * dens), 0.03 * dens))
        h2, m2 = _drops(nt, rest, 230.0, 0.3, cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", up, 0.3 * dens), 0.04 * dens))
        b = _node(nt, "ShaderNodeBump", Height=cv._math(nt, "MULTIPLY", cv._math(nt, "MAXIMUM", h1, h2), clear),
                  Strength=1.0, Distance=0.0025)
        nt.links.new(b.outputs[0], gl.inputs["Normal"])
        nt.links.new(b.outputs[0], fr.inputs["Normal"])
    # la face de dos : la moitié du plancher (la lame a déjà reçu celui de sa face avant)
    f = cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", fr.outputs[0], 0.9),
                 cv._math(nt, "MULTIPLY", floor, cv._math(nt, "SUBTRACT", 1.0, cv._math(nt, "MULTIPLY", bf, 0.5))))
    f = cv._math(nt, "MULTIPLY", f, cv._math(nt, "SUBTRACT", 1.0, cv._math(nt, "MULTIPLY", rw.outputs["Fac"], REAR_REFL_CUT)))
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
        if flutes:
            # allumé, chaque strie renvoie la lumière par son flanc : l'émission suit les stries (55 à 100 %),
            # le verre se lit en bandes au lieu d'un aplat blanc
            nt.links.new(cv._math(nt, "MULTIPLY", strength,
                                  cv._math(nt, "ADD", 0.55, cv._math(nt, "MULTIPLY", wv.outputs["Fac"], 0.45))),
                         em.inputs["Strength"])
        add = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(sh, add.inputs[0])
        nt.links.new(em.outputs[0], add.inputs[1])
        sh = add.outputs[0]
    nt.links.new(sh, out.inputs[0])
    return m


# le feu arrière allumé : émission du cœur du verre et son intensité, calées pour que l'image (AgX, exposition 0,5
# du laboratoire) lise le corail du film et non un rose saumon (un rouge pur trop fort blanchit dans AgX)
TAIL_GLOW = ("#ff4a1c", 1.3)
TAIL_DEEP = "#9c0c06"   # le rouge profond du plastique vu en biais, là où la lumière traverse plus d'épaisseur

# les feux stop : la propriété d'objet « stop » de la caisse (0 éteints, 1 allumés), animable (stop_lamps). Le même
# verre et les mêmes ampoules que le feu de position (ampoule à deux filaments d'époque : 5 W de position, 21 W de
# stop) : la lueur du verre, des ampoules, des réflecteurs et des lumières de boîtier est multipliée par 1 + STOP_GAIN
STOP = "stop"
STOP_GAIN = 3.0
# la carte UV des feux : (|y|, z) du sommet au repère de la caisse au chargement, en mètres ; le cœur de chaque feu se
# calcule dessus, au pixel, autour des ampoules (tail_cores). Elle suit les sommets quand la rue tourne la caisse
TAIL_UV = "feu"
CORE_R = (0.075, 0.05)   # demi-axes du cœur autour d'une ampoule (latéral, vertical), m : le verre fait 40 × 12 cm


def _stop_gain(nt, gain=STOP_GAIN):
    """1 + gain × la propriété « stop » de l'objet (0 sans la propriété)."""
    at = nt.nodes.new("ShaderNodeAttribute")
    at.attribute_type = "OBJECT"
    at.attribute_name = STOP
    return cv._math(nt, "ADD", 1.0, cv._math(nt, "MULTIPLY", at.outputs["Fac"], gain))


def _tail_core(nt, bulbs):
    """Le cœur des feux, 1 sur l'ampoule et 0 au-delà de 1,2 fois CORE_R : la plus proche des ampoules `bulbs`
    ((|y|, z) au repère de la caisse), lue sur la carte TAIL_UV."""
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = TAIL_UV
    sep = _node(nt, "ShaderNodeSeparateXYZ", Vector=uv.outputs["UV"])
    d2 = None
    for by, bz in bulbs:
        dy = cv._math(nt, "DIVIDE", cv._math(nt, "SUBTRACT", sep.outputs["X"], by), CORE_R[0])
        dz = cv._math(nt, "DIVIDE", cv._math(nt, "SUBTRACT", sep.outputs["Y"], bz), CORE_R[1])
        e = cv._math(nt, "ADD", cv._math(nt, "MULTIPLY", dy, dy), cv._math(nt, "MULTIPLY", dz, dz))
        d2 = e if d2 is None else cv._math(nt, "MINIMUM", d2, e)
    r = cv._math(nt, "SQRT", d2)
    return _ramp(nt, r, 1.2, 0.0)


def mat_tail_lens(name, on=True, glow=None, ribs=40.0, bulbs=()):
    """Cabochon de feu arrière d'époque : plastique rouge moulé épais (PMMA, IOR 1,49) à stries horizontales.
    Éteint : un rouge profond presque noir où l'on devine le réflecteur, un reflet net qui casse sur les stries.
    Allumé : un cœur corail qui fonce vers le rouge profond sur les bords vus en biais, une strie sur deux plus claire
    (les prismes renvoient la lumière de l'ampoule).

    bulbs : les ampoules derrière le verre rouge ((|y|, z) au repère de la caisse, carte TAIL_UV, voir tail_cores).
    Avec elles, la lueur se ramasse en un cœur corail autour de chaque ampoule et retombe au rouge profond sur le
    reste du verre (de 6 m, le feu se lisait en aplat corail uniforme). La propriété « stop » de l'objet la multiplie
    par 1 + STOP_GAIN, le cœur tirant vers l'orangé chaud du filament."""
    color, strength = glow or TAIL_GLOW
    m, nt, out = cv._mat(name)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    wv = nt.nodes.new("ShaderNodeTexWave")
    wv.wave_type = "BANDS"
    wv.bands_direction = "Z"
    wv.wave_profile = "SIN"
    wv.inputs["Scale"].default_value = ribs
    nt.links.new(tc.outputs["Object"], wv.inputs["Vector"])
    bump = _node(nt, "ShaderNodeBump", Height=wv.outputs["Fac"], Strength=0.5, Distance=0.002)
    fr = _node(nt, "ShaderNodeFresnel", IOR=1.49, Normal=bump.outputs[0])
    tr = _node(nt, "ShaderNodeBsdfTransparent", Color=lin("#4a0302"))
    gl = _glossy(nt)
    gl.inputs["Roughness"].default_value = 0.04
    nt.links.new(bump.outputs[0], gl.inputs["Normal"])
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(cv._math(nt, "ADD", fr.outputs[0], 0.05), mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(gl.outputs[0], mix.inputs[2])
    sh = mix.outputs[0]
    if on and strength > 0:
        lw = _node(nt, "ShaderNodeLayerWeight", Blend=0.45)
        edge = _ramp(nt, lw.outputs["Facing"], 0.15, 0.85)
        rib = cv._math(nt, "ADD", 0.72, cv._math(nt, "MULTIPLY", wv.outputs["Fac"], 0.28))
        stop = _stop_gain(nt)
        if bulbs:
            core = _tail_core(nt, bulbs)
            at = nt.nodes.new("ShaderNodeAttribute")
            at.attribute_type = "OBJECT"
            at.attribute_name = STOP
            hot = _mix_rgb(nt, lin(color), lin("#ff6a30"), at.outputs["Fac"])
            col = _mix_rgb(nt, _mix_rgb(nt, lin(TAIL_DEEP), hot, core), lin(TAIL_DEEP), cv._math(nt, "MULTIPLY", edge, 0.6))
            # 0,35 sur le verre loin des ampoules, 1,95 sur elles
            shape = cv._math(nt, "ADD", 0.35, cv._math(nt, "MULTIPLY", core, 1.6))
            rib = cv._math(nt, "MULTIPLY", rib, shape)
        else:
            col = _mix_rgb(nt, lin(color), lin(TAIL_DEEP), edge)
        s = cv._math(nt, "MULTIPLY", cv._math(nt, "MULTIPLY", cv._math(nt, "MULTIPLY", rib, strength), stop),
                     cv._math(nt, "SUBTRACT", 1.0, cv._math(nt, "MULTIPLY", edge, 0.5)))
        em = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(col, em.inputs["Color"])
        nt.links.new(s, em.inputs["Strength"])
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


def _stop_emission(m, gain=STOP_GAIN):
    """La lueur d'une matière à émission fixe multipliée par 1 + gain × « stop » (feux stop)."""
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    s = p.inputs["Emission Strength"]
    if s.default_value <= 0 or s.is_linked:
        return
    nt.links.new(cv._math(nt, "MULTIPLY", _stop_gain(nt, gain), s.default_value), s)


def mat_plain(name, color, rough=0.5, metal=0.0, coat=0.0, emit=0.0):
    m = cv.mat_plain(name, color, rough=rough, metal=metal, coat=coat)
    if emit:
        p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        p.inputs["Emission Color"].default_value = lin(color) if isinstance(color, str) else color
        p.inputs["Emission Strength"].default_value = emit
    return m


def mat_plate(name="hero_plate"):
    """Plaque vierge : tôle peinte crème passée sous la crasse de la route, mate, aucun caractère. En crème émaillée
    claire (#dcd8c6, vernis 0,3), c'était le point le plus clair de la voiture de dos : un rectangle blanc entre les
    feux (OUV), qui éblouissait sous le projecteur de l'hélicoptère (P5). Sombre à présent (albédo 0,03 à 0,10, sous
    la carrosserie éclairée et loin sous les feux), une crasse en nuages, plus épaisse vers le bas où l'eau la dépose."""
    m, nt, out = cv._mat(name)
    tc = nt.nodes.new("ShaderNodeTexCoord").outputs["Object"]
    dirt = _noise(nt, tc, 28.0, detail=4.0, lo=0.35, hi=0.65)
    low = _ramp(nt, _xyz(nt, tc)[2], 0.02, -0.07)            # 1 au bas de la plaque (hauteur 15 cm, centre 0)
    f = cv._math(nt, "MAXIMUM", cv._math(nt, "MULTIPLY", dirt, 0.6), low)
    col = _mix_rgb(nt, lin("#5a5548"), lin("#35312b"), f)
    p = cv._principled(nt, **{"Roughness": 0.78})
    nt.links.new(col, p.inputs["Base Color"])
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


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


PLATE_TAG = "plaque"


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
    # l'appoint de poursuite (lieux.car_fill) ne l'éclaire pas : la plaque reste sombre, jamais une étiquette claire
    ob[PLATE_TAG] = True
    return ob


def add_antenna(body, chrome, at=(1.30, -0.80), height=0.78, rake=9.0):
    """L'antenne d'aile d'époque, sur l'aile avant droite au pied du pare-brise (repère de la voiture : l'avant vers +x,
    la droite vers -y) : une embase chromée bombée, un fouet de laiton chromé qui s'affine de 2,5 à 1,5 mm, penché
    vers l'arrière, et sa boule. Posée au sol de l'aile par un rayon vertical ; None si l'aile n'est pas trouvée."""
    inv = body.matrix_world.inverted()
    hit, loc, nor, _ = body.ray_cast(inv @ Vector((at[0], at[1], 3.0)), Vector((0, 0, -1)), distance=4.0)
    if not hit:
        return None
    base = body.matrix_world @ loc
    tilt = Matrix.Rotation(math.radians(-rake), 4, "Y")       # le haut du fouet part vers l'arrière (-x)
    bm = bmesh.new()
    for z0, z1, r0, r1, seg in ((-0.004, 0.012, 0.013, 0.009, 24), (0.012, 0.030, 0.005, 0.004, 16),
                                (0.030, height, 0.00125, 0.00075, 8)):
        res = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=z1 - z0,
                                    matrix=Matrix.Translation(base) @ tilt @ Matrix.Translation((0, 0, (z0 + z1) / 2)))
        for f in {f for v in res["verts"] for f in v.link_faces}:
            f.smooth = True
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.0022,
                              matrix=Matrix.Translation(base) @ tilt @ Matrix.Translation((0, 0, height)))
    ob = _mesh_object(f"{body.name}_antenna", bm, [chrome], body.users_collection[0], smooth=True)
    _stamp_rest([ob])
    cv.parent_keep(ob, body)
    return ob


def add_trunk_handle(body, chrome, z=0.727, width=0.135, height=0.024, depth=0.018):
    """La poignée du coffre, à la place du barillet : une barre chromée oblongue aux bouts arrondis (13,5 × 2,4 cm,
    1,8 cm de saillie), posée sur la face arrière au milieu, au-dessus de la plaque (repère de la voiture : l'arrière
    vers -x). None si la face arrière n'est pas trouvée."""
    at = ray_x([body], 0.0, z, False)
    if at is None:
        return None
    bm = bmesh.new()
    c = at + Vector((-(depth / 2 - 0.003), 0.0, 0.0))     # enfoncée de 3 mm dans la tôle
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(c) @ Matrix.Diagonal((depth, width, height, 1)))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.45 * min(height, depth), segments=4, affect="EDGES",
                    profile=0.5)
    ob = _mesh_object(f"{body.name}_trunk_handle", bm, [chrome], body.users_collection[0], smooth=True)
    _stamp_rest([ob])
    cv.parent_keep(ob, body)
    return ob


# la propriété d'objet des vitres : une lumière d'appoint de scène (lieux.car_fill, les nappes liées à la voiture)
# ne doit pas les compter parmi ses receveurs, sinon elles la renvoient en miroir
GLASS_TAG = "vitre"
HEAD_HERO = "#ffe6b8"     # les phares de la berline, plus chauds que ceux des poursuivants (cv.HEAD_CODES)


def split_glass(body, mat_names):
    """Sort de la caisse jointe les faces aux matières de vitre `mat_names` (pare-brise, lunette, verres des feux) en un
    objet enfant « <caisse>_vitres », marqué GLASS_TAG. Une nappe d'appoint liée à la voiture, invisible à la caméra,
    se reflétait en aplat blanc dans la lunette vue de dos (P3, images 1 à 13) : la tôle doit la recevoir et la
    refléter, les vitres non. Renvoie l'objet, ou None s'il n'y a aucune face de vitre."""
    me = body.data
    idx = {i for i, m in enumerate(me.materials) if m and m.name in mat_names}
    if not idx or not any(f.material_index in idx for f in me.polygons):
        return None
    gm = me.copy()
    gm.name = f"{body.name}_vitres"
    for mesh, keep_glass in ((gm, True), (me, False)):
        bm = bmesh.new()
        bm.from_mesh(mesh)
        kill = [f for f in bm.faces if (f.material_index in idx) != keep_glass]
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
    ob = bpy.data.objects.new(gm.name, gm)
    for c in body.users_collection:
        c.objects.link(ob)
    ob.matrix_world = body.matrix_world.copy()
    cv.parent_keep(ob, body)
    ob[GLASS_TAG] = True
    return ob


def mark_rear_window(glass):
    """L'attribut de face REAR_WINDOW (1) sur la lunette de l'objet des vitres (repère de la voiture au chargement :
    l'arrière vers -x) : les faces de la moitié arrière tournées vers l'arrière et le ciel. Les verres des feux,
    verticaux, n'en sont pas ; les carreaux des portes sont dans les portes. Renvoie le nombre de faces."""
    me = glass.data
    a = me.attributes.get(REAR_WINDOW) or me.attributes.new(REAR_WINDOW, "FLOAT", "FACE")
    vals = [1.0 if (p.center.x < 0.0 and p.normal.x < -0.3 and p.normal.z > 0.2) else 0.0 for p in me.polygons]
    a.data.foreach_set("value", vals)
    return int(sum(vals))


def dark_shelf(body, mats=("hero_w111_leather", "hero_w111_carpet"), x_max=-0.85, z_min=0.8):
    """La plage arrière sombre : la moquette de la plage et le dessus du dossier arrière (le bourrelet de cuir cognac
    tourné vers le ciel, sous la lunette) prennent une moquette brun noir mate, sans reflet. Sous le projecteur de
    l'hélicoptère, ils faisaient une bande beige (0,77 de luminance) au pied de la lunette, plus claire que le toit
    (0,54) : la silhouette du conducteur s'y perdait. Repère de la voiture au chargement (l'arrière vers -x). Renvoie
    le nombre de faces."""
    me = body.data
    idx = {i for i, m in enumerate(me.materials) if m and m.name in mats}
    if not idx:
        return 0
    m, nt, out = cv._mat("hero_w111_shelf")
    p = cv._principled(nt, **{"Base Color": lin("#120c09"), "Roughness": 1.0, "Specular IOR Level": 0.05})
    nt.links.new(p.outputs[0], out.inputs[0])
    me.materials.append(m)
    k = len(me.materials) - 1
    n = 0
    for f in me.polygons:
        if f.material_index in idx and f.center.x < x_max and f.center.z > z_min and f.normal.z > 0.5:
            f.material_index = k
            n += 1
    return n


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
            # la barrette du lettrage de modèle sur le coffre (trois lames de 23 cm, d'un seul côté, à la place du
            # nom du modèle) : trop longue pour la boîte du lettrage ci-dessus, retirée à part
            n += delete_islands(o, [((0.36, 0.75), (2.29, 2.34), (0.73, 0.78))], max_size=0.25, max_verts=40)
            # le barillet de la serrure et son anneau, au-dessus de la plaque (quatre morceaux de 2 à 4 cm) : de dos
            # à 6 m, l'anneau se lisait comme un emblème rond ; add_trunk_handle pose une poignée oblongue à sa place
            n += delete_islands(o, [((-0.03, 0.03), (2.31, 2.38), (0.69, 0.76))], max_size=0.06)
            report[o.name] = f"{n} morceaux supprimés"
        elif "_rim_" in o.name and "chrome" in o.name:
            # l'étoile au centre de l'enjoliveur (72 sommets, 10 cm) ; le disque nu reste
            n = delete_islands(o, [((-2, 2), (-3, 3), (-1, 2))], max_size=0.11, max_verts=100)
            report[o.name] = f"{n} morceaux supprimés"
    return keep, report


# le chrome de la berline : la réflectance mesurée du chrome (0,55 à 0,65), pas celle de l'argent ou de l'aluminium
# poli (0,92) ; il reflète le décor sans le rendre plus clair qu'il n'est. À 0,92, la calandre (lames serrées qui se
# renvoient la lumière de l'une à l'autre) et les pare-chocs brûlaient en blanc dès qu'un phare ou le projecteur les
# touchait. La calandre, plus sombre et un peu satinée : des lames d'acier chromé, pas un miroir.
CHROME = (0.64, 0.64, 0.65, 1)
GRILLE = (0.56, 0.56, 0.57, 1)


def _w111_materials(parts, lights_on, tag="hero_w111", paint_color=None, leather=LEATHER["w111"],
                    wheel_rim="#e6dcc2", wear=0.0):
    """Les matières de la berline ; reprises par le coupé pour l'habitacle emprunté (tag, peinture, cuir, jante).
    wear : l'usure (0..1, voir usure()), la berline seule. Sans paint_color : la peinture de w111_paint()."""
    on = 1.0 if lights_on else 0.0
    # moins de métal dans la base que la peinture par défaut : la part diffuse garde le rouge lisible quand le reflet
    # (le ciel bleu de l'heure bleue) l'emporte
    coat, tint = (1.0, 0.0), None
    if paint_color is None:
        paint_color, metal = w111_paint()
        coat, tint = w111_coat(), w111_tint()
    else:
        metal = PAINT_METAL["w111"]
    paint = mat_paint(f"{tag}_paint", paint_color, metal=metal, wear=wear, coat=coat, tint=tint)
    chrome = mat_chrome(f"{tag}_chrome", CHROME, 0.05, wear=wear)
    table = {
        "Carpaint_Simple_Ruby0": paint,
        "chrome": chrome,
        "Silver_Clean": mat_chrome(f"{tag}_grille", GRILLE, 0.16, wear=wear),
        "metal": mat_metal(f"{tag}_steel", (0.10, 0.10, 0.105, 1), 0.5),
        "Rubber": mat_rubber(f"{tag}_seal", rough=0.5 + 0.15 * wear, grain=0.05),
        "Rubber0": mat_tyre(f"{tag}_tyre", wear=wear),
        "PVC_Black_Matte": mat_rubber(f"{tag}_black", (0.012, 0.012, 0.013, 1), 0.55, 0.05),
        "PVC_Black_Matte0": mat_rubber(f"{tag}_black0", (0.012, 0.012, 0.013, 1), 0.6, 0.05),
        "PVC_Black_Matte1": mat_rubber(f"{tag}_black1", (0.015, 0.014, 0.014, 1), 0.5, 0.05),
        "Material_26": mat_window(f"{tag}_glass", wear=wear),
        # les ampoules (dans l'assemblage des feux) : allumées à l'avant, sombres à l'arrière sauf le feu de position
        "Material_38": None,
        "light_reflector": None,
        "front_light_glass": mat_lens(f"{tag}_head_lens", (0.97, 0.97, 0.95, 1), LAMP, 0.15 * on, flutes=60.0),
        "back_light_glass": mat_tail_lens(f"{tag}_tail_lens", lights_on),
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
    # le phare allumé : le cœur est l'ampoule (30) et ce que la parabole en renvoie ; la parabole n'émet qu'un fond
    # (1,0) et le verre un voile strié (0,15). À 2,5 et 0,35, tout le verre faisait un disque blanc plein de près,
    # sans stries ni ampoule ; de loin le phare reste un point blanc
    head_ref = mat_reflector(f"{tag}_head_reflector", LAMP, 1.0 * on)
    # réflecteur arrière teinté rouge (le chrome nu blanchissait le feu en rose) ; sa lueur et l'ampoule restent
    # sous le cœur du verre, sinon le feu repasse au saumon
    tail_ref = mat_reflector(f"{tag}_tail_reflector", TAIL_GLOW[0], 0.12 * on)
    tail_ref.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = lin("#a01008")
    head_bulb = mat_plain(f"{tag}_head_bulb", LAMP, rough=0.2, emit=30.0 * on)
    tail_bulb = mat_plain(f"{tag}_tail_bulb", TAIL_GLOW[0], rough=0.2, emit=0.5 * on)
    for mt in (tail_ref, tail_bulb):
        _stop_emission(mt)
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
        _w111_materials(parts, lights_on, wear=usure())
        report["usure"] = usure()
    # le fichier pose l'avant vers -y : un quart de tour met l'avant vers +x
    cv.normalise(parts, rot_z=90)
    return parts, report


# ---------------------------------------------------------------- assemblage commun

def _group(parts, key):
    return [o for o in parts if key in o.name]


def _stamp_rest(parts):
    """Position et normale de repos de chaque sommet (repère de la voiture) dans les attributs « rest » et « rest_n »,
    lus par les matières usées : ils suivent les sommets quand la rue tourne ou déplace les maillages."""
    for o in parts:
        me = o.data
        if REST in me.attributes:
            continue
        mw = o.matrix_world
        rot = mw.to_3x3()
        a = me.attributes.new(REST, "FLOAT_VECTOR", "POINT")
        a.data.foreach_set("vector", [c for v in me.vertices for c in (mw @ v.co)])
        a = me.attributes.new(REST_N, "FLOAT_VECTOR", "POINT")
        a.data.foreach_set("vector", [c for v in me.vertices for c in (rot @ v.normal).normalized()])


def _stamp_wheel(w):
    """Position dans le repère de la roue (« rest_wheel »), pour le pneu : à poser une fois l'origine sur l'axe."""
    me = w.data
    if REST_WHEEL in me.attributes:
        me.attributes.remove(me.attributes[REST_WHEEL])
    a = me.attributes.new(REST_WHEEL, "FLOAT_VECTOR", "POINT")
    a.data.foreach_set("vector", [c for v in me.vertices for c in v.co])


def _add_valve(w, side, r=0.178, angle=35.0):
    """La valve de gonflage, qui sort par une fente de l'enjoliveur côté extérieur : le seul détail qui n'est pas
    répété autour de la roue, il laisse voir qu'elle tourne. Tige de caoutchouc noir et capuchon chromé, 3 cm,
    penchée vers le bord de la roue comme une vraie valve. side : +1 si l'extérieur de la roue est vers +y."""
    mats = [m.name.split(".")[0] if m else "" for m in w.data.materials]
    try:
        black = next(i for i, n in enumerate(mats) if n.endswith("_steel"))
        chrome = next(i for i, n in enumerate(mats) if n.endswith("_chrome"))
    except StopIteration:
        return False
    a = math.radians(angle)
    radial = Vector((math.cos(a), 0.0, math.sin(a)))
    hit, loc, _, _ = w.ray_cast(radial * r + Vector((0, side * 1.0, 0)), Vector((0, -side, 0)), distance=2.0)
    if not hit:
        return False
    axis = (Vector((0, side, 0)) * 0.9 + radial * 0.42).normalized()
    rot = axis.to_track_quat("Z", "Y").to_matrix().to_4x4()
    bm = bmesh.new()
    bm.from_mesh(w.data)
    for d0, d1, rad, mi in ((-0.004, 0.022, 0.0045, black), (0.022, 0.032, 0.0042, chrome)):
        c = loc + axis * ((d0 + d1) / 2)
        res = bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=rad, radius2=rad, depth=d1 - d0,
                                    matrix=Matrix.Translation(c) @ rot)
        for f in {f for v in res["verts"] for f in v.link_faces}:
            f.material_index = mi
            f.smooth = True
    bm.to_mesh(w.data)
    bm.free()
    w.data.update()
    return True


def _set_axles(car):
    """Recale les gerbes de route de la peinture usée sur les essieux réels (nœuds « axle_front », « axle_rear »)."""
    xs = sorted({round(p[0], 3) for p in car["axles"].values()})
    if len(xs) < 2:
        return
    for m in {s.material for o in [car["body"]] + list(car["doors"].values()) + list(car["wheels"].values())
              for s in o.material_slots if s.material}:
        if not m.node_tree:
            continue
        for key, x in (("axle_front", xs[-1]), ("axle_rear", xs[0])):
            n = m.node_tree.nodes.get(key)
            if n:
                n.outputs[0].default_value = x


def _finish(variant, parts, collection, lights_on, raw, wheel_keys, door_keys, report):
    tag = f"hero_{variant}" + ("_raw" if raw else "")
    if not raw:
        _stamp_rest(parts)
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
        if not raw:
            if variant == "w111":
                report[f"valve {k}"] = "posée" if _add_valve(w, 1 if (a.y + b.y) > 0 else -1) else "manquée"
            _stamp_wheel(w)
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
    out += cv.headlight_spots(body, pts, on=True, color=HEAD_HERO)          # en codes, le réglage commun
    # une petite lueur derrière chaque verre, dans le boîtier (le réflecteur en reçoit, le verre la diffuse), 1,5 W :
    # le réflecteur la concentre, à 4 W le verre virait au blanc plein et ses stries ne se lisaient plus de près. Elle
    # était posée 12 cm devant le verre et éclairait de près la tôle voisine. Les deux plaques gris rosé entre phare
    # et calandre au 200 mm (P4) ne viennent pas d'elle : c'est le reflet du disque d'appoint de lieux.car_fill
    # (visible en glossy), banc hero_bench.py --fill on / noglossy
    for i, h in enumerate(heads):
        out.append(point_light(body, f"{body.name}_head_glow_{i}", inv @ (h - Vector((0.05, 0, 0))), LAMP, 1.5, 0.03))
    for i, t in enumerate(tails):
        lo = point_light(body, f"{body.name}_tail_glow_{i}", inv @ (Vector((mn.x - 0.06, t.y, t.z))), TAIL, 3.0, 0.05)
        _drive_stop(lo.data, "energy", 3.0, body)
        out.append(lo)
    return out


def _drive_stop(idb, path, base, body, gain=STOP_GAIN):
    """`path` de `idb` piloté par la propriété « stop » de `body` : base × (1 + gain × stop). Expression simple
    (évaluée sans Python, le rendu en --factory-startup la lit)."""
    if STOP not in body:
        body[STOP] = 0.0
    d = idb.driver_add(path).driver
    d.type = "SCRIPTED"
    v = d.variables.new()
    v.name = "stop"
    v.type = "SINGLE_PROP"
    v.targets[0].id_type = "OBJECT"
    v.targets[0].id = body
    v.targets[0].data_path = f'["{STOP}"]'
    d.expression = f"{base} * (1 + {gain} * stop)"


def stop_lamps(body, first, last, value=1.0):
    """Les feux stop de la berline allumés des images `first` à `last` comprises, éteints avant et après : clés
    constantes sur la propriété « stop » de la caisse (objet `coupe`). À poser après la trajectoire (une scène qui
    remplace l'action de la caisse effacerait ces clés). Exemple, OUV : hero_cars.stop_lamps(car, 37, 40)."""
    import motion as M
    for f, v in ((first - 1, 0.0), (first, value), (last, value), (last + 1, 0.0)):
        body[STOP] = v
        body.keyframe_insert(f'["{STOP}"]', frame=f)
    for fc in M.fcurves(body):
        if fc.data_path == f'["{STOP}"]':
            for k in fc.keyframe_points:
                k.interpolation = "CONSTANT"
    body[STOP] = 0.0


def tail_cores(body, lens="hero_w111_tail_lens", bulb="hero_w111_tail_bulb", reverse="hero_w111_reverse_lens",
               on=True):
    """Le cœur des feux arrière : repère les ampoules derrière le verre rouge (îlots de la matière `bulb`, hors de
    celles du feu de recul, sous le verre `reverse`), écrit la carte TAIL_UV ((|y|, z) de chaque sommet au repère de
    la caisse) et refait la matière `lens` autour d'elles. Renvoie le compte rendu."""
    me = body.data
    mats = {m.name: i for i, m in enumerate(me.materials) if m}
    if lens not in mats or bulb not in mats:
        return "feux : matières introuvables"
    pts = {lens: [], bulb: [], reverse: []}
    for p in me.polygons:
        n = me.materials[p.material_index].name if me.materials[p.material_index] else ""
        if n in pts:
            pts[n].append(Vector((abs(p.center.y), p.center.z)))
    # les ampoules : regroupées à 3 cm près (un seul côté, la carte est symétrique)
    groups = []
    for q in pts[bulb]:
        for g in groups:
            if (g[0] / g[1] - q).length < 0.03:
                g[0] += q
                g[1] += 1
                break
        else:
            groups.append([q.copy(), 1])
    centres = [g[0] / g[1] for g in groups]
    rev = pts[reverse]
    if rev:
        lo = Vector((min(v.x for v in rev), min(v.y for v in rev)))
        hi = Vector((max(v.x for v in rev), max(v.y for v in rev)))
        centres = [c for c in centres if not (lo.x <= c.x <= hi.x and lo.y <= c.y <= hi.y)]
    if not centres:
        return "feux : aucune ampoule"
    act = me.uv_layers.active_index
    rend = next((i for i, u in enumerate(me.uv_layers) if u.active_render), 0)
    uv = me.uv_layers.get(TAIL_UV) or me.uv_layers.new(name=TAIL_UV, do_init=False)
    co = [(abs(v.co.y), v.co.z) for v in me.vertices]
    uv.data.foreach_set("uv", [c for li in me.loops for c in co[li.vertex_index]])
    me.uv_layers.active_index = act
    me.uv_layers[rend].active_render = True
    old = me.materials[mats[lens]]
    new = mat_tail_lens(lens, on, bulbs=[(c.x, c.y) for c in centres])
    me.materials[mats[lens]] = new
    if old.users == 0:
        bpy.data.materials.remove(old)
    new.name = lens
    return "cœurs : " + ", ".join(f"{c.x:.2f}/{c.y:.2f}" for c in centres)


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
            _set_axles(car)
            mn, mx = cv.bbox([body])
            # plaque vierge à l'arrière seulement (format américain 30,5 x 15,2 cm, pas de plaque avant dans l'État
            # du film), dans le logement entre les feux
            rear = ray_x([body], 0.0, 0.60, False)
            if rear is not None:
                pl = add_plate(f"{body.name}_plate_rear", rear, -1, size=(0.305, 0.152), coll=body.users_collection[0])
                cv.parent_keep(pl, body)
            handle = add_trunk_handle(body, bpy.data.materials["hero_w111_chrome"])
            car["report"]["poignée de coffre"] = "posée" if handle else "face arrière introuvable"
            ant = add_antenna(body, bpy.data.materials["hero_w111_chrome"])
            car["report"]["antenne"] = "posée" if ant else "aile introuvable"
            car["glass"] = split_glass(body, {"hero_w111_glass"})
            car["report"]["vitres"] = "à part" if car["glass"] else "introuvables"
            if car["glass"]:
                car["report"]["lunette"] = f"{mark_rear_window(car['glass'])} faces"
            car["report"]["plage arrière"] = f"{dark_shelf(body)} faces en moquette sombre"
            body[STOP] = 0.0
            body.id_properties_ui(STOP).update(min=0.0, max=1.0, description="feux stop (0 éteints, 1 allumés)")
            car["report"]["feux"] = tail_cores(body, on=lights_on)
            car["lights"] = _lights(car, lights_on, ("hero_w111_head_lens",), ("hero_w111_tail_lens",))
        # repères de l'habitacle (conduite à gauche) : œil du conducteur, centre du volant
        car["cockpit"] = dict(eye=Vector((-0.55, 0.36, 1.22)), wheel=Vector((0.55, 0.42, 0.87)))
        return car
    if variant == "slc":
        parts, report = _load_slc(collection, lights_on, raw)
        car = _finish("slc", parts, collection, lights_on, raw,
                      {k: (f"slc_wheel_{k}|",) for k in ("FL", "FR", "BL", "BR")}, {}, report)
        if not raw:
            body = car["body"]
            rear = ray_x([body], 0.0, 0.67, False)
            if rear is not None:
                pl = add_plate(f"{body.name}_plate_rear", rear, -1, size=(0.305, 0.152), coll=body.users_collection[0])
                cv.parent_keep(pl, body)
            car["lights"] = _lights(car, lights_on, ("hero_slc_head_lens",), ("hero_slc_tail_lens",))
        # repères de l'habitacle repris de la berline, recalés comme lui
        car["cockpit"] = dict(eye=Vector((-0.90, 0.33, 1.12)), wheel=Vector((0.23, 0.38, 0.81)))
        return car
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
        car["lights"] = cv.headlight_spots(body, [(mx.x + 0.05, 0.6, 0.62), (mx.x + 0.05, -0.6, 0.62)], color=HEAD_HERO)
    car["cockpit"] = dict(eye=Vector((-0.5, 0.35, 1.05)), wheel=Vector((0.3, 0.44, 0.83)))
    return car


# ---------------------------------------------------------------- le coupé des années 70
#
# Le modèle livré est une maquette basse (caisse de 1 500 triangles), aux proportions étirées : empattement 3,37 m
# pour 2,82 m réels, largeur 2,51 m pour 1,79 m, pneus de 90 cm. On le remet aux cotes de la voiture (empattement,
# largeur, hauteur 1,33 m), on rend des roues de 205/70 R14 (64 cm), puis on lisse la caisse (biseaux sur les arêtes
# vives et normales pondérées, la recette des caisses de jeu), on dessine les joints, et l'on écrit ici ce qui manque :
# réflecteurs et ampoules des phares, barrettes de calandre, plaque vierge ; l'habitacle vient de la berline.

SLC_SCALE = (0.837, 0.713, 0.754)    # x : empattement 2,82 m ; y : largeur 1,79 m ; z : hauteur 1,33 m
SLC_TYRE_D = 0.643                   # 205/70 R14
SLC_TRACK_Y = 0.735                  # demi-voie (1,45 m réels)
SLC_WHEELS = {"FL": ("Ronald R10.002", "mp.004"), "FR": ("Ronald R10.004", "mp.003"),
              "BL": ("Ronald R10.001", "mp.001"), "BR": ("Ronald R10.003", "mp.002")}

# joints de panneaux, en coordonnées de la caisse remise à l'échelle (l'avant vers +x)
SLC_GAPS = [
    (0, -0.716, ((-2, 2), (-1.2, 1.2), (0.27, 0.90))),    # arrière des portes
    (0, 0.805, ((-2, 2), (-1.2, 1.2), (0.27, 0.86))),     # avant des portes (pied de pare-brise)
    (0, 0.640, ((-2, 2), (-0.62, 0.62), (0.80, 1.20))),   # arrière du capot, devant la grille d'auvent
    (1, 0.640, ((0.64, 2.30), (-2, 2), (0.78, 1.20))),    # flancs du capot, sur les ailes
    (1, -0.640, ((0.64, 2.30), (-2, 2), (0.78, 1.20))),
    (0, -1.585, ((-2, 2), (-0.60, 0.60), (0.80, 1.20))),  # avant du coffre, sous la lunette
    (1, 0.600, ((-2.36, -1.585), (-2, 2), (0.80, 1.20))), # flancs du coffre
    (1, -0.600, ((-2.36, -1.585), (-2, 2), (0.80, 1.20))),
]
# le bas de caisse strié entre les roues
SLC_RIBS = [(2, 0.022, ((-0.98, 1.18), (-1.2, 1.2), (0.265, 0.395)))]


def _xf(ob, m):
    ob.data.transform(m)
    ob.data.update()


def _smooth_shell(ob, angle=38.0, bevel=0.005):
    """Caisse basse : sommets soudés, lissage par angle, biseau de deux segments sur les arêtes vives (l'arête
    accroche le reflet au lieu de casser la normale), normales pondérées par l'aire des faces (les panneaux
    plats restent plats)."""
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0006)
    bmesh.ops.join_triangles(bm, faces=bm.faces, angle_face_threshold=math.radians(30),
                             angle_shape_threshold=math.radians(40))
    bm.to_mesh(ob.data)
    bm.free()
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    bv = ob.modifiers.new("bevel", "BEVEL")
    bv.limit_method = "ANGLE"
    bv.angle_limit = math.radians(angle)
    bv.width = bevel
    bv.segments = 2
    bv.harden_normals = True
    wn = ob.modifiers.new("weighted", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    wn.weight = 50
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def _slc_rename_wheels(parts):
    for k, (rim, tyre) in SLC_WHEELS.items():
        for o in parts:
            if o.name.startswith(rim + "_") or o.name.startswith(tyre + "_"):
                o.name = f"slc_wheel_{k}|{o.name}"


def _slc_wheels(parts, report):
    """Roues à 64 cm, posées aux essieux de la caisse remise à l'échelle ; l'enjoliveur central (marqué)
    remplacé par un disque lisse."""
    sx = SLC_SCALE[0]
    for k in SLC_WHEELS:
        grp = [o for o in parts if o.name.startswith(f"slc_wheel_{k}|")]
        tyre = [o for o in grp if "Tire" in o.name and cv.tris([o]) > 20000]
        a, b = cv.bbox(tyre)
        c = (a + b) / 2
        s = SLC_TYRE_D / (b.z - a.z)
        side = 1 if c.y > 0 else -1
        target = Vector((c.x * sx, side * SLC_TRACK_Y, SLC_TYRE_D / 2))
        m = Matrix.Translation(target) @ Matrix.Scale(s, 4) @ Matrix.Translation(-c)
        for o in grp:
            _xf(o, m)
        report[f"roue {k}"] = f"échelle {s:.3f}"
    return s


def _slc_clean(parts, report):
    """Marques : l'étoile de calandre et son fond, les deux plaques (texte réel), l'enjoliveur central des jantes.
    Les ampoules et boîtiers de phare livrés (blocs orange) laissent la place à ceux écrits ici."""
    drop = ("Circle.002_", "Plane.001_", "Licence plate PL", "_Black_0", "Cube_Bulb")
    keep = []
    for o in parts:
        if any(p in o.name for p in drop):
            report[o.name.split("|")[-1][:32]] = "supprimé"
            me = o.data
            bpy.data.objects.remove(o)
            if me.users == 0:
                bpy.data.meshes.remove(me)
        else:
            keep.append(o)
    return keep


def _slc_lamps(parts, tag, lights_on, coll):
    """Phares : le modèle livré ne garde que le coin enveloppant (devenu le clignotant ambre strié) et laisse
    l'ouverture du phare vide (on voit l'intérieur de la caisse) ; on y pose le bloc d'époque : verre strié épais, deux réflecteurs paraboliques
    superposés (route en haut, antibrouillard en bas) et leurs ampoules, fond noir. Feux arrière : le bloc
    nervuré livré devient verre rouge, ambre et blanc, avec un fond réflecteur."""
    on = 1.0 if lights_on else 0.0
    head_lens = mat_lens(f"{tag}_head_lens", (0.97, 0.97, 0.95, 1), LAMP, 0.35 * on, flutes=70.0)
    amber = mat_lens(f"{tag}_amber", lin("#ff8a1a"), AMBER, 0.0, flutes=50.0)
    head_ref = mat_reflector(f"{tag}_head_reflector", LAMP, 2.5 * on)
    head_bulb = mat_plain(f"{tag}_head_bulb", LAMP, rough=0.2, emit=30.0 * on)
    chrome = bpy.data.materials.get(f"{tag}_chrome")
    black = mat_rubber(f"{tag}_lamp_black", (0.01, 0.01, 0.011, 1), 0.5, 0.02)
    corner = next(o for o in parts if "Glass Orange" in o.name)
    frame = next(o for o in parts if "Orange Car Paint" in o.name)
    corner.data.materials[0] = amber
    frame.data.materials[0] = chrome
    slats = [o for o in parts if o.name.startswith("Cube.002_") or o.name.startswith("Cube.003_")]
    ca, cb = cv.bbox([corner])
    ga, gb = cv.bbox(slats)
    # l'ouverture : de la calandre au coin enveloppant
    y_in = gb.y + 0.018
    y_out = min(v.co.y for v in corner.data.vertices if v.co.y > 0) - 0.004
    z0, z1 = ca.z - 0.006, cb.z + 0.002
    bm = bmesh.new()
    for s in (1, -1):
        # le verre au ras du coin enveloppant, en retrait du cadre chromé
        xf = cb.x - 0.004
        ya, yb = sorted((s * y_in, s * y_out))
        _box(bm, (xf - 0.006, ya, z0), (xf, yb, z1), mat=3)                      # verre strié de 6 mm
        zm = z0 + 0.42 * (z1 - z0)
        for (za, zb), depth in (((zm + 0.004, z1 - 0.008), 0.07), ((z0 + 0.008, zm - 0.004), 0.05)):
            _dish(bm, xf - 0.012 - depth, ya + 0.008, yb - 0.008, za, zb, depth, n=16, mat=0, sign=1)
            r = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.012,
                                          matrix=Matrix.Translation((xf - 0.012 - depth + 0.028, (ya + yb) / 2,
                                                                     (za + zb) / 2)))
            for f in {f for v in r["verts"] for f in v.link_faces}:
                f.material_index = 1
                f.smooth = True
        _box(bm, (xf - 0.11, ya + 0.004, zm - 0.004), (xf - 0.007, yb - 0.004, zm + 0.004), mat=2)  # séparation
        _box(bm, (xf - 0.11, ya - 0.004, z0 - 0.004), (xf - 0.09, yb + 0.004, z1 + 0.004), mat=2)   # fond
    head = _mesh_object(f"{tag}_headlamps", bm, [head_ref, head_bulb, black, head_lens], coll)
    out = [head]
    # feux arrière
    tail_lens = mat_lens(f"{tag}_tail_lens", lin("#6a0503"), "#ff1205", 0.9 * on, flutes=0.0)
    rear_amber = mat_lens(f"{tag}_rear_amber", lin("#c05a10"), AMBER, 0.0)
    reverse = mat_lens(f"{tag}_reverse_lens", (0.95, 0.95, 0.95, 1))
    tail_ref = mat_reflector(f"{tag}_tail_reflector", "#ff1205", 0.25 * on)
    tail_ref.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = lin("#a01008")
    for o in parts:
        n = o.name
        if "Cube.004_Procedural vehicle paint" in n:
            o.data.materials[0] = tail_lens
        elif "Cube.004_Procedural amber" in n:
            o.data.materials[0] = rear_amber
        elif "Cube.004_White Marble" in n:
            o.data.materials[0] = reverse
    tl = next(o for o in parts if "Cube.004_Procedural vehicle paint" in o.name)
    a, b = cv.bbox([tl])
    ys = [abs(v.co.y) for v in tl.data.vertices]
    bm = bmesh.new()
    for s in (1, -1):
        # un fond rouge derrière le seul verre rouge, à 3,5 cm du verre
        ya, yb = sorted((s * (min(ys) + 0.01), s * (max(ys) - 0.02)))
        _box(bm, (a.x + 0.035, ya, a.z + 0.006), (a.x + 0.042, yb, b.z - 0.006), mat=0)
    out.append(_mesh_object(f"{tag}_tail_reflectors", bm, [tail_ref], coll))
    return out


def _slc_grille(parts, tag, coll):
    """Calandre sans étoile : les lames livrées (vrillées, lisibles en croix dans les reflets) cèdent la place à un
    fond noir et à huit lames horizontales minces ; devant, deux barrettes chromées pleine largeur et un cadre."""
    chrome = bpy.data.materials.get(f"{tag}_chrome")
    black = mat_rubber(f"{tag}_grille_black", (0.012, 0.012, 0.013, 1), 0.35, 0.02)
    slats = [o for o in parts if o.name.startswith("Cube.002_") or o.name.startswith("Cube.003_")]
    a, b = cv.bbox(slats)
    for o in slats:
        parts.remove(o)
        bpy.data.objects.remove(o)
    bm = bmesh.new()
    x = b.x + 0.004
    _box(bm, (x - 0.075, a.y, a.z), (x - 0.065, b.y, b.z), mat=1)
    n = 8
    for i in range(n):
        zc = a.z + (b.z - a.z) * (i + 0.5) / n
        _box(bm, (x - 0.065, a.y + 0.004, zc - 0.004), (x - 0.02, b.y - 0.004, zc + 0.004), mat=1)
    for zc in (a.z + 0.36 * (b.z - a.z), a.z + 0.64 * (b.z - a.z)):
        _box(bm, (x - 0.012, a.y + 0.01, zc - 0.007), (x + 0.006, b.y - 0.01, zc + 0.007))
    t = 0.012
    _box(bm, (x - 0.07, a.y - t, b.z), (x + 0.004, b.y + t, b.z + t))
    _box(bm, (x - 0.07, a.y - t, a.z - t), (x + 0.004, b.y + t, a.z))
    _box(bm, (x - 0.07, a.y - t, a.z), (x + 0.004, a.y, b.z))
    _box(bm, (x - 0.07, b.y, a.z), (x + 0.004, b.y + t, b.z))
    ob = _mesh_object(f"{tag}_grille", bm, [chrome, black], coll)
    bv = ob.modifiers.new("bevel", "BEVEL")
    bv.width = 0.002
    bv.segments = 2
    return ob


def _slc_interior(tag, coll, lights_on, report, roof=()):
    """L'habitacle de la berline (Elements Creative Studio, CC BY 4.0) recalé dans le coupé : planche, volant,
    sièges, tapis et contre-portes avant, avancés sous le pare-brise du coupé et ramenés à sa hauteur."""
    parts = cv.import_model(os.path.join(CAST, "hero-mercedes-w111", "model.glb"), coll)
    cv.normalise(parts, rot_z=90)
    want = ("w111_interior_", "w111_steering_")
    doors = tuple(f"w111_door_{k}_{m}" for k in ("FL", "FR")
                  for m in ("Leather Top Grain Beige", "PVC Black Matte1", "Walnut Matte", "PVC Black Matte_0"))
    keep, door_parts = [], []
    for o in parts:
        if o.name.startswith(want):
            keep.append(o)
        elif o.name.startswith(doors):
            door_parts.append(o)
        else:
            me = o.data
            bpy.data.objects.remove(o)
            if me.users == 0:
                bpy.data.meshes.remove(me)
    _w111_materials(keep + door_parts, lights_on, tag=f"{tag}_int", paint_color=PAINT["slc"],
                    leather=LEATHER["slc"], wheel_rim="#0d0d0e")
    dx = 0.674 - 1.018      # le pied du pare-brise du coupé contre celui de la berline
    z0, z0n, kz = 0.29, 0.262, 0.92
    cabin = Matrix.Translation((dx, 0, z0n - z0 * kz)) @ Matrix.Diagonal((1.0, 0.90, kz, 1))
    # le pavillon et les montants de la berline dépassent du toit plus bas du coupé : on ne garde que ce qui est
    # sous la ceinture de caisse, ou, à l'arrière, sous le toit et les vitres du coupé (un rayon vers le haut les touche)
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    trees = [BVHTree.FromObject(o, dg) for o in roof]

    def covered(c):
        return any(t.ray_cast(c + Vector((0, 0, 0.005)), Vector((0, 0, 1)), 1.0)[0] is not None for t in trees)

    for o in keep:
        _xf(o, cabin)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        kill = [f for f in bm.faces if (c := f.calc_center_median()).z > 1.17 or (abs(c.y) > 0.64 and c.z > 0.93)
                or (c.z > 0.90 and c.x < -1.05 and trees and not covered(c))]
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        bm.to_mesh(o.data)
        bm.free()
    # contre-portes : allongées à la porte du coupé (1,5 m au lieu de 0,95 m), restées contre le flanc
    for o in door_parts:
        a, b = cv.bbox([o])
        s = 1 if a.y > 0 else -1
        m = (Matrix.Translation((-0.70 + 0.066 * 1.37, -s * 0.02, z0n - z0 * kz))
             @ Matrix.Diagonal((1.37, 1.0, kz, 1)))
        _xf(o, m)
    # garnitures latérales des places arrière
    leather = bpy.data.materials.get(f"{tag}_int_leather")
    bm = bmesh.new()
    for s in (1, -1):
        y = s * 0.765
        _box(bm, (-1.48, y - 0.012, 0.30), (-0.73, y + 0.012, 0.87))
    keep.append(_mesh_object(f"{tag}_quarter_trim", bm, [leather], coll))
    report["habitacle"] = f"repris de la berline, {cv.tris(keep + door_parts)} triangles"
    for o in keep + door_parts:
        o.name = f"{tag}_cabin|{o.name}"
    return keep + door_parts


def _load_slc(collection, lights_on, raw):
    coll = collection or bpy.context.scene.collection
    parts = cv.import_model(os.path.join(CAST, "hero-mercedes-slc", "model.glb"), coll)
    # le fichier pose l'avant vers -y
    cv.normalise(parts, rot_z=90)
    _slc_rename_wheels(parts)
    report = {}
    if raw:
        # tel que livré, seulement ramené à la longueur de la voiture remise en forme (même cadrage)
        cv.transform_all(parts, Matrix.Scale(SLC_SCALE[0], 4))
        return parts, report
    tag = "hero_slc"
    parts = _slc_clean(parts, report)
    wheels = [o for o in parts if o.name.startswith("slc_wheel_")]
    body_parts = [o for o in parts if o not in wheels]
    for o in body_parts:
        _xf(o, Matrix.Diagonal((*SLC_SCALE, 1)))
    _slc_wheels(wheels, report)
    on = 1.0 if lights_on else 0.0
    paint = mat_paint(f"{tag}_paint", PAINT["slc"], gaps=SLC_GAPS, ribs=SLC_RIBS, inside="#2b2620")
    chrome = mat_metal(f"{tag}_chrome", (0.92, 0.92, 0.93, 1), 0.05)
    alloy = mat_metal(f"{tag}_alloy", (0.80, 0.80, 0.81, 1), 0.2)
    seal = mat_rubber(f"{tag}_seal", rough=0.5, grain=0.05)
    glass = mat_window(f"{tag}_glass")
    tyre = mat_tyre(f"{tag}_tyre", r_rim=0.224, r_out=SLC_TYRE_D / 2)
    shell = next(o for o in body_parts if o.name.startswith("Cube_Car Paint"))
    shell.data.materials.clear()
    shell.data.materials.append(paint)
    _smooth_shell(shell)
    for o in body_parts:
        n = o.name
        if n.startswith("Cube_Alum") or n.startswith("Cylinder_Alum"):
            o.data.materials[0] = chrome
        elif "Old rubber" in n:
            o.data.materials[0] = seal
        elif n.startswith("Cube_Glass"):
            o.data.materials[0] = glass
            solidify(o, 0.005)
    for o in wheels:
        o.data.materials.clear()
        o.data.materials.append(tyre if "Tire" in o.name else alloy)
    # le centre des jantes : un disque lisse à la place de l'enjoliveur marqué
    caps = []
    for k in SLC_WHEELS:
        grp = [o for o in wheels if o.name.startswith(f"slc_wheel_{k}|")]
        a, b = cv.bbox(grp)
        c = (a + b) / 2
        side = 1 if c.y > 0 else -1
        y = (b.y - 0.042) if side > 0 else (a.y + 0.042)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.032, radius2=0.028, depth=0.008,
                              matrix=Matrix.Translation((c.x, y, c.z)) @ Matrix.Rotation(-side * math.pi / 2, 4, "X"))
        caps.append(_mesh_object(f"slc_wheel_{k}|cap", bm, [chrome], coll, smooth=True))
    wheels += caps
    built = _slc_lamps(body_parts, tag, lights_on, coll)
    built.append(_slc_grille(body_parts, tag, coll))
    roof = [o for o in body_parts if o.name.startswith("Cube_Car Paint") or o.name.startswith("Cube_Glass")]
    cabin = _slc_interior(tag, coll, lights_on, report, roof)
    for o in built + cabin:
        o.name = f"{tag}_built|{o.name}"
    return body_parts + built + cabin + wheels, report


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
    ap.add_argument("--usure", type=float, default=None, help="dose d'usure 0..1 (sinon FILM3D_USURE, puis USURE)")
    ap.add_argument("--usure-avant", type=float, default=0.0, help="planche usure : la dose de la colonne de gauche")
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
        "gros-calandre": ((mx.x + 1.55, -0.62, 0.78), (mx.x - 0.1, -0.05, 0.55), 40.0, "calandre et pare-chocs"),
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


def render_views(car_name, raw, views, out_dir, res, samples, reuse=False, tag=None, state=None):
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
        st = state if state is not None else ("" if car_name == "coupe" else (" livrée" if raw else " retravaillée"))
        cap = cvr.cam_label(cv, cam, f"{name}{st}  ·  {label}", res)
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
    if a.usure is not None:
        os.environ["FILM3D_USURE"] = str(a.usure)
    if a.sheet == "usure":
        # le métal et la peinture : à gauche la dose --usure-avant (0 par défaut), à droite la dose retenue ;
        # --reuse garde les vues déjà rendues (<car>-usure0-<vue>.png à gauche)
        views = a.only.split(",") if a.only else ["avant", "arriere", "gros-calandre"]
        after_w = usure()
        os.environ["FILM3D_USURE"] = str(a.usure_avant)
        before = render_views(a.car, False, views, shots, res, a.samples, reuse=a.reuse, tag=f"{a.car}-usure0",
                              state=f", usure {a.usure_avant:g}".replace(".", ","))
        os.environ["FILM3D_USURE"] = str(after_w)
        after = render_views(a.car, False, views, shots, res, a.samples, tag=f"{a.car}-usure",
                             state=f", usure {after_w:g}".replace(".", ","))
        paths = [p for pair in zip(before, after) for p in pair]
        if all(os.path.exists(p) for p in paths):
            cvr.compose(paths, 2, os.path.join(lab, "mercedes-metal-avant-apres.png"), res)
    elif a.sheet == "avant-apres":
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
