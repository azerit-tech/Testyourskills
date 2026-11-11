# Méthode B (« pbr ») du banc de réalisme : un hôtel Art déco de front de mer (rez-de-chaussée
# et trois étages, 20 m) en géométrie modeste, et le réalisme porté par les SURFACES :
# enduits photographiques CC0 (B_mats), reprises de peinture, crasse des creux, arêtes
# arrondies (Bevel), soubassement en pierre à vrai déplacement, coulures en décalcomanies.
#
#   lockf -k <scratchpad>/blender.lock nice -n 19 taskpolicy -b \
#     /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/lab/B_pbr.py
#
# Tout est construit dans le repère de l'immeuble (façade en x = 0 tournée vers +x, emprise
# y de 0 à W, profondeur vers −x), puis posé sur la parcelle : c'est instanciable comme les
# huit dessins de scene_a (une instance, une couleur d'objet).
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench  # noqa: E402
import B_mats  # noqa: E402

S = bench.S
random.seed(7)

W, D = 20.0, 14.0
GF, FH, NF = bench.LOT["gf_h"], bench.LOT["fh"], bench.LOT["floors"]
ROOF = GF + NF * FH            # 13,8 : dessus du dernier étage
PAR = ROOF + 1.2               # 15,0 : haut de l'acrotère
T = 0.3                        # épaisseur du mur de façade
WINS = [2.3, 6.0, 14.0, 17.7]  # axes des fenêtres des étages (une par chambre de 4 m)
WW, SILL, WH = 2.4, 0.85, 1.65
PY0, PY1, PYX = 8.4, 11.6, 0.45   # le pylône central et sa saillie
SHOPS = [(0.7, 4.2), (4.8, 8.0), (12.0, 15.2), (15.8, 19.3)]
PIERS = [(0.0, 0.7), (4.2, 4.8), (8.0, 8.4), (11.6, 12.0), (15.2, 15.8), (19.3, 20.0)]
OPEN_TOP = 3.4
TINT = "#f2cdbf"               # pêche rosé pastel (couleur d'objet, comme les instances du film)


# ---------------------------------------------------------------- outils

def new_coll(name, hide=True):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    c.hide_render = hide
    c.hide_viewport = hide
    return c


def apply_mods(ob):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    for md in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=md.name)


class Decals:
    """Des quads de décalcomanie, avec leurs UV et leur force (attribut de coin « dstr »)."""

    def __init__(self, M):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.st = self.bm.loops.layers.float_color.new("dstr")
        self.mats = []
        self.M = M

    def add(self, kind, plane, a0, a1, z0, z1, strength, u=(0.0, 1.0), flip=False):
        """plane = ('x', x) : quad dans le plan x, a = y ; ('y', y) : plan y, a = x (face −y)."""
        mat = self.M[kind]
        if mat not in self.mats:
            self.mats.append(mat)
        axis, c = plane
        if axis == "x":
            pts = [(c, a0, z0), (c, a1, z0), (c, a1, z1), (c, a0, z1)]
        else:
            pts = [(a1, c, z0), (a0, c, z0), (a0, c, z1), (a1, c, z1)]
        ua, ub = u
        if flip:
            ua, ub = ub, ua
        uvs = [(ua, 0), (ub, 0), (ub, 1), (ua, 1)]
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        f.material_index = self.mats.index(mat)
        for loop, t in zip(f.loops, uvs):
            loop[self.uv].uv = t
            loop[self.st] = (strength, strength, strength, 1.0)

    def done(self, name):
        me = bpy.data.meshes.new(name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(ob)
        ob.visible_shadow = True
        return ob


def text_letter(name, ch, loc, size, mat, depth=0.04):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = ch
    cu.size = size
    cu.extrude = depth
    cu.bevel_depth = 0.006
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    ob.location = loc
    ob.rotation_euler = (math.pi / 2, 0, math.pi / 2)
    return ob


def tube(name, p0, p1, mat, r=0.016):
    return S.cyl(name, p0, p1, r, mat, seg=8)


# ---------------------------------------------------------------- la masse en stuc

def mass(M):
    """Tout ce qui est enduit, en pavés qui se recouvrent, puis une seule opération booléenne
    (différence des ouvertures, avec auto-intersection) : un maillage propre, sans faces
    internes, que le nœud Bevel peut arrondir partout sans couture."""
    B = S.Boxes("pbr_mass")
    st, tr, roof = M["stucco"], M["trim"], M["roof"]
    # murs : façade, pignons, acrotère arrière, dalle de toit
    B.add(-T, 0, 0, W, 0, PAR, st)
    B.add(-D, 0, 0, T, 0, PAR, st)
    B.add(-D, 0, W - T, W, 0, PAR, st)
    B.add(-D, -D + T, 0, W, ROOF - 0.2, PAR, st)
    B.add(-D, 0, 0, W, ROOF - 0.25, ROOF, roof)
    # pilastres d'about, en saillie, montent au-dessus de l'acrotère
    for y0, y1 in ((0, 0.7), (W - 0.7, W)):
        B.add(0, 0.18, y0, y1, 0, PAR + 0.45, st)
        for k in range(3):   # les trois filets « vitesse » en tête de pilastre
            zz = PAR - 0.9 + k * 0.3
            B.add(0.18, 0.22, y0 - 0.0, y1, zz, zz + 0.08, tr)
    # pylône central à gradins
    B.add(-T, PYX, PY0, PY1, OPEN_TOP, PAR + 0.6, st)
    B.add(-T, PYX - 0.12, PY0 + 0.4, PY1 - 0.4, PAR + 0.6, PAR + 1.6, st)
    B.add(-T, PYX - 0.24, PY0 + 0.8, PY1 - 0.8, PAR + 1.6, PAR + 2.6, st)
    B.add(-T, PYX - 0.36, PY0 + 1.2, PY1 - 1.2, PAR + 2.6, PAR + 3.4, st)
    for zz, w in ((PAR + 0.6, 0.0), (PAR + 1.6, 0.4), (PAR + 2.6, 0.8)):   # larmiers des gradins
        B.add(-T, PYX + 0.06 - w * 0.3, PY0 - 0.05 + w, PY1 + 0.05 - w, zz - 0.1, zz, tr)
    # les deux ailettes du pylône (porteuses du néon) et le bandeau de l'enseigne
    for yy in (PY0 + 0.15, PY1 - 0.45):
        B.add(PYX, PYX + 0.16, yy, yy + 0.3, GF, PAR + 0.3, tr)
    # rainures verticales du pylône, entre les ailettes, en haut
    for k in range(3):
        yy = 9.45 + k * 0.45
        B.add(PYX, PYX + 0.05, yy, yy + 0.2, ROOF - 0.4, PAR + 0.5, st)
    # sourcils au-dessus des fenêtres (le geste Art déco), larmier filant en tête de rez-de-chaussée
    for f in range(NF):
        zf = GF + f * FH
        top = zf + SILL + WH
        for yc in WINS:
            B.add(0, 0.58, yc - WW / 2 - 0.35, yc + WW / 2 + 0.35, top + 0.16, top + 0.27, tr)
    for y0, y1 in ((0.7, PY0), (PY1, W - 0.7)):
        B.add(0, 0.26, y0, y1, GF - 0.12, GF + 0.02, tr)
        # les trois filets de l'acrotère
        for k in range(3):
            zz = ROOF + 0.25 + k * 0.22
            B.add(0, 0.04, y0, y1, zz, zz + 0.07, tr)
        B.add(0, 0.14, y0, y1, PAR - 0.22, PAR - 0.08, tr)
    # couvertine
    B.add(-T - 0.03, 0.06, 0.7, W - 0.7, PAR, PAR + 0.07, tr)
    # marquise de l'entrée
    B.add(0, 2.6, PY0 - 0.5, PY1 + 0.5, 3.5, 3.72, tr)
    B.add(2.45, 2.62, PY0 - 0.5, PY1 + 0.5, 3.28, 3.86, tr)
    # bandeau d'enseigne des boutiques : un léger retrait encadré
    ob = B.done()
    # les ouvertures
    cut = S.Boxes("pbr_cutters")
    for f in range(NF):
        zf = GF + f * FH
        for yc in WINS:
            cut.add(-T - 0.1, 0.1, yc - WW / 2, yc + WW / 2, zf + SILL, zf + SILL + WH, st)
    for y0, y1 in SHOPS:
        cut.add(-T - 0.1, 0.1, y0, y1, -0.5, OPEN_TOP, st)
    cut.add(-T - 0.1, 0.1, PY0, PY1, -0.5, OPEN_TOP - 0.15, st)
    # le léger retrait du bandeau d'enseigne au-dessus de chaque vitrine
    for y0, y1 in SHOPS:
        cut.add(-0.04, 0.1, y0 + 0.15, y1 - 0.15, OPEN_TOP + 0.15, GF - 0.25, st)
    cutter = cut.done()
    md = ob.modifiers.new("open", "BOOLEAN")
    md.operation = "DIFFERENCE"
    md.solver = "EXACT"
    md.object = cutter
    md.use_self = True
    md.use_hole_tolerant = True
    apply_mods(ob)
    bpy.data.objects.remove(cutter)
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


# ---------------------------------------------------------------- menuiseries, vitrines, intérieurs

def window(B, M, yc, zf):
    y0, y1 = yc - WW / 2, yc + WW / 2
    zs, zt = zf + SILL, zf + SILL + WH
    fm = M["frame"]
    # appui en saillie (enduit clair), tablette dans le tableau
    B.add(-0.2, 0.07, y0 - 0.06, y1 + 0.06, zs - 0.05, zs + 0.01, M["trim"])
    # cadre, deux meneaux, une traverse basse (fenêtre « en bandeau » à trois vantaux)
    xa, xb = -0.22, -0.16
    B.add(xa, xb, y0, y1, zs, zs + 0.06, fm)
    B.add(xa, xb, y0, y1, zt - 0.06, zt, fm)
    B.add(xa, xb, y0, y0 + 0.06, zs, zt, fm)
    B.add(xa, xb, y1 - 0.06, y1, zs, zt, fm)
    for k in (1, 2):
        ym = y0 + (y1 - y0) * k / 3
        B.add(xa - 0.01, xb, ym - 0.03, ym + 0.03, zs, zt, fm)
    for zz in (zs + 0.55, zt - 0.45):
        B.add(xa, xb + 0.005, y0, y1, zz - 0.02, zz + 0.02, fm)
    B.add(-0.195, -0.19, y0, y1, zs, zt, M["glass"])
    B.add(-0.27, -0.265, y0, y1, zs, zt, M["blinds"])
    B.add(-0.55, -0.545, y0, y1, zs + 0.1, zt, M["curtain"])


def rooms(B, M):
    """Les chambres derrière les fenêtres : dalles, plafonds, cloisons, fond lumineux (scene_a)."""
    RD = 4.0
    B.add(-D + 0.3, -RD, T, W - T, GF, ROOF - 0.25, M["inside"], front_mat=M["rooms"])
    for f in range(NF):
        zf = GF + f * FH
        B.add(-RD, -T, T, W - T, zf, zf + 0.12, M["inside"])
        B.add(-RD, -T, T, W - T, zf + FH - 0.22, zf + FH, M["ceiling"])
        for yk in (4.0, 8.0, 12.0, 16.0):
            B.add(-RD, -T, yk - 0.06, yk + 0.06, zf, zf + FH, M["inside"])


def shopfront(B, M, y0, y1, k, lights):
    """Une vitrine profonde : allège en terrazzo, châssis bronze, imposte, porte d'un côté,
    et derrière, une boutique qu'on lit : sol, plafond, comptoir, étagères, suspensions."""
    fm = M["bronze"]
    door = k in (0, 3)
    yd0, yd1 = (y0 + 0.15, y0 + 1.15) if k == 0 else (y1 - 1.15, y1 - 0.15)
    xa, xb = -0.3, -0.22
    # seuil et allège
    B.add(-0.3, 0.0, y0, y1, 0.0, 0.17, M["terrazzo"])
    if door:
        for a, b in ((y0, yd0), (yd1, y1)):
            if b - a > 0.05:
                B.add(xa, -0.18, a, b, 0.17, 0.55, M["terrazzo"])
    else:
        B.add(xa, -0.18, y0, y1, 0.17, 0.55, M["terrazzo"])
    # châssis
    B.add(xa, xb, y0, y1, 0.5, 0.58, fm)
    B.add(xa, xb, y0, y1, OPEN_TOP - 0.08, OPEN_TOP, fm)
    B.add(xa, xb, y0, y1, 2.55, 2.61, fm)
    B.add(xa, xb, y0, y0 + 0.07, 0.17, OPEN_TOP, fm)
    B.add(xa, xb, y1 - 0.07, y1, 0.17, OPEN_TOP, fm)
    n = max(1, int((y1 - y0) / 1.3))
    for j in range(1, n):
        yy = y0 + (y1 - y0) * j / n
        B.add(xa, xb, yy - 0.03, yy + 0.03, 0.5, OPEN_TOP, fm)
    if door:
        for yy in (yd0, yd1):
            B.add(xa - 0.01, xb, yy - 0.04, yy + 0.04, 0.17, 2.6, fm)
        B.add(xa + 0.02, xb - 0.02, yd0 + 0.45, yd0 + 0.55, 1.0, 1.05, M["dark"])   # poignée
    B.add(-0.26, -0.255, y0, y1, 0.17 if door else 0.55, OPEN_TOP, M["glass"])
    # la boutique
    sd = 6.0
    B.add(-sd, -0.3, y0, y1, 0.0, 0.17, M["terrazzo"])
    B.add(-sd, -0.3, y0, y1, OPEN_TOP + 0.05, GF, M["ceiling"])
    for yy in (y0 - 0.1, y1):
        B.add(-sd, -0.3, yy, yy + 0.1, 0, GF, M["inside"])
    ys = random.Random(k)
    warm = ["#ffd29a", "#ffe3bf", "#ffc985", "#fff0d8"][k]
    back = S.mat_emit(f"shop_back_{k}", S.lin(warm), 6.0 + ys.random() * 3.0)
    B.add(-sd - 0.1, -sd, y0, y1, 0, GF, M["inside"], front_mat=back)
    # étagères contre le fond, et leur liseré lumineux
    for zz in (0.9, 1.5, 2.1):
        B.add(-sd + 0.0, -sd + 0.4, y0 + 0.3, y1 - 0.3, zz, zz + 0.04, M["inside"])
        B.add(-sd + 0.38, -sd + 0.42, y0 + 0.3, y1 - 0.3, zz - 0.03, zz, S.mat_emit(f"shelf_led_{k}_{zz}", S.lin("#ffe7c4"), 12.0))
    # comptoir, présentoir en vitrine
    yc = ys.uniform(y0 + 0.6, y1 - 1.8)
    B.add(-3.2, -2.4, yc, yc + 1.6, 0.17, 1.05, M["bronze"])
    B.add(-3.25, -2.35, yc - 0.05, yc + 1.65, 1.05, 1.1, M["terrazzo"])
    B.add(-1.1, -0.6, y0 + 0.4, y1 - 0.4, 0.17, 0.75, M["inside"])
    # suspensions
    for j in range(2):
        yy = y0 + (y1 - y0) * (j + 1) / 3
        B.add(-2.0, -1.8, yy - 0.1, yy + 0.1, 2.6, 2.75, S.mat_emit(f"pendant_{k}_{j}", S.lin("#ffd9a0"), 45.0))
        B.add(-1.91, -1.89, yy - 0.01, yy + 0.01, 2.75, OPEN_TOP + 0.05, M["dark"])
    lights.append(("shop_in", (-2.5, (y0 + y1) / 2, OPEN_TOP - 0.1), (y1 - y0, 3.0), warm))
    lights.append(("shop_out", (0.6, (y0 + y1) / 2, 1.8), (y1 - y0, 2.2), warm))


def shutter(B, M, y0, y1, zb):
    """Rideau de fer à moitié baissé (la boutique ferme), son coffre et sa lame finale."""
    B.add(-0.17, -0.12, y0, y1, zb, OPEN_TOP, M["shutter"])
    B.add(-0.18, -0.11, y0, y1, zb - 0.06, zb, M["dark"])
    B.add(-0.2, -0.05, y0, y1, OPEN_TOP - 0.18, OPEN_TOP, M["dark"])


def lobby(B, M, lights):
    """L'entrée de l'hôtel : vestibule en retrait, sol en terrazzo, portes vitrées, lustre."""
    y0, y1 = PY0, PY1
    top = OPEN_TOP - 0.15
    xd = -1.4
    B.add(xd, 0.6, y0, y1, 0.0, 0.17, M["terrazzo"])
    B.add(0.6, 1.0, y0 + 0.4, y1 - 0.4, 0.0, 0.16, M["terrazzo"])     # la marche
    for yy in (y0, y1 - 0.25):
        B.add(xd, -T, yy, yy + 0.25, 0, top, M["stucco"])                # joues du vestibule
    B.add(xd, -T, y0, y1, top - 0.1, top, M["ceiling"])
    fm = M["bronze"]
    nv = 4
    for j in range(nv + 1):
        yy = y0 + 0.25 + (y1 - y0 - 0.5) * j / nv
        B.add(xd - 0.05, xd + 0.03, yy - 0.04, yy + 0.04, 0.17, top, fm)
    for zz in (0.17, 2.45, top - 0.06):
        B.add(xd - 0.05, xd + 0.03, y0 + 0.25, y1 - 0.25, zz, zz + 0.06, fm)
    B.add(xd - 0.01, xd, y0 + 0.25, y1 - 0.25, 0.17, top, M["glass"])
    # le hall derrière
    B.add(-8.0, xd, y0 - 1.0, y1 + 1.0, 0.0, 0.17, M["terrazzo"])
    B.add(-8.0, xd, y0 - 1.0, y1 + 1.0, top, top + 0.3, M["ceiling"])
    B.add(-8.1, -8.0, y0 - 1.0, y1 + 1.0, 0, top, M["inside"], front_mat=S.mat_emit("lobby_back", S.lin("#ffdcab"), 6.0))
    B.add(-5.2, -4.4, y0 + 0.6, y1 - 0.6, 0.17, 1.1, M["bronze"])     # le comptoir de la réception
    B.add(-3.4, -3.0, 9.6, 10.4, top - 0.45, top - 0.3, S.mat_emit("chandelier", S.lin("#ffe0b0"), 30.0))
    lights.append(("shop_in", (-3.0, 10.0, top - 0.2), (2.5, 2.5), "#ffd9a8"))
    # sous la marquise : des spots encastrés et l'aire de lumière qui descend sur le trottoir
    for j in range(3):
        for i in range(2):
            B.add(0.7 + i * 1.2, 0.9 + i * 1.2, PY0 + 0.6 + j * 1.0, PY0 + 0.8 + j * 1.0, 3.49, 3.5, S.mat_emit("canopy_spot", S.lin("#fff0d0"), 40.0))
    lights.append(("canopy", (1.3, 10.0, 3.45), (2.4, 4.0), "#ffe2bf"))


def awning(B, M, y0, y1, mat):
    lo, hi, dz = OPEN_TOP - 0.05, 2.65, 0.04
    S.add_hex(B, [(0, y0 - 0.08, lo), (1.5, y0 - 0.08, hi), (0, y1 + 0.08, lo), (1.5, y1 + 0.08, hi),
                  (0, y0 - 0.08, lo + dz), (1.5, y0 - 0.08, hi + dz), (0, y1 + 0.08, lo + dz), (1.5, y1 + 0.08, hi + dz)], mat)
    B.add(1.48, 1.52, y0 - 0.08, y1 + 0.08, hi - 0.25, hi + 0.03, mat)
    for yy in (y0, y1):
        S.add_hex(B, [(0, yy - 0.01, lo), (1.5, yy - 0.01, hi), (0, yy + 0.01, lo), (1.5, yy + 0.01, hi),
                      (0, yy - 0.01, lo + 0.02), (1.5, yy - 0.01, hi + 0.02), (0, yy + 0.01, lo + 0.02), (1.5, yy + 0.01, hi + 0.02)], M["dark"])


def plinth(M):
    """Soubassement en pierre corallienne au pied de chaque trumeau, en vrai déplacement."""
    B = S.Boxes("pbr_plinth")
    for y0, y1 in PIERS:
        x1 = 0.22 if (y0, y1) in ((0.0, 0.7), (19.3, 20.0)) else 0.05
        B.add(-T - 0.02, x1, y0 - 0.03, y1 + 0.03, 0.0, 0.72, M["coral"])
    ob = B.done()
    # coupe-larme sur le soubassement
    md = ob.modifiers.new("dice", "SUBSURF")
    md.subdivision_type = "SIMPLE"
    md.levels = 1
    md.render_levels = 7
    adaptive = False
    for owner in (md, ob.cycles if hasattr(ob, "cycles") else None):
        if owner is not None and hasattr(owner, "use_adaptive_subdivision"):
            owner.use_adaptive_subdivision = True
            if hasattr(owner, "adaptive_pixel_size"):
                owner.adaptive_pixel_size = 1.0
            adaptive = True
    if not adaptive:
        try:
            bpy.context.scene.cycles.feature_set = "EXPERIMENTAL"
            ob.cycles.use_adaptive_subdivision = True
            adaptive = True
        except Exception as e:
            print("[B] pas de subdivision adaptative :", e)
    print(f"[B] soubassement : subdivision adaptative = {adaptive}", flush=True)
    return ob


# ---------------------------------------------------------------- les coulures

def decals(M):
    Dc = Decals(M)
    R = random.Random(11)
    eps = 0.004

    def sub(width_frac=0.5):
        u0 = R.uniform(0, 1 - width_frac)
        return (u0, u0 + width_frac)

    for f in range(NF):
        zf = GF + f * FH
        zs = zf + SILL - 0.05
        floor_below_top = zf - FH + SILL + WH + 0.05 if f > 0 else OPEN_TOP + 0.05
        for yc in WINS:
            # sous l'appui : la coulure la plus visible d'une façade, plus étroite que la fenêtre
            w = WW * R.uniform(0.55, 0.85)
            yy = yc + R.uniform(-0.25, 0.25)
            h = R.uniform(0.7, 1.25)
            Dc.add("decal_hang", ("x", eps), yy - w / 2, yy + w / 2, max(floor_below_top, zs - h), zs, R.uniform(0.45, 0.85), sub(0.45), R.random() < 0.5)
            # aux deux bouts du sourcil, l'eau tombe en filets
            top = zf + SILL + WH + 0.16
            for e in (-1, 1):
                ye = yc + e * (WW / 2 + 0.22)
                if R.random() < 0.8:
                    Dc.add("decal_thin", ("x", eps), ye - 0.12, ye + 0.12, top - R.uniform(0.5, 1.0) - (0.0), top, R.uniform(0.6, 1.0), sub(0.15), R.random() < 0.5)
    # sous la corniche de l'acrotère, une frange continue mais inégale
    for y0, y1 in ((0.7, PY0), (PY1, W - 0.7)):
        y = y0
        while y < y1 - 0.3:
            w = R.uniform(1.2, 2.6)
            b = min(y + w, y1)
            Dc.add("decal_hang", ("x", eps), y, b, PAR - 0.22 - R.uniform(0.9, 1.7), PAR - 0.22, R.uniform(0.45, 0.85), sub(min(0.95, (b - y) / 3.0)), R.random() < 0.5)
            y = b - R.uniform(0.1, 0.4)
        # sous les filets et au-dessus des fenêtres du dernier étage : en retrait du sourcil
    # pylône : sous les larmiers des gradins et sur la face entre les ailettes
    for zz, w in ((PAR + 0.5, 0.0), (PAR + 1.5, 0.4), (PAR + 2.5, 0.8)):
        Dc.add("decal_hang", ("x", PYX - (w * 0.3) + eps), PY0 + w + 0.05, PY1 - w - 0.05, zz - R.uniform(1.0, 1.8), zz, R.uniform(0.6, 0.9), sub(0.5))
    # pied des trumeaux et des pilastres : la crasse qui remonte au-dessus de la pierre
    for y0, y1 in PIERS:
        x = 0.18 + eps if (y0, y1) in ((0.0, 0.7), (19.3, 20.0)) else eps
        Dc.add(R.choice(["decal_rise", "decal_rise2"]), ("x", x), y0, y1, 0.7, 0.7 + R.uniform(0.6, 1.1), R.uniform(0.5, 0.9), sub(0.25))
    # pilastres d'about : longues traînées
    for y0, y1 in ((0, 0.7), (W - 0.7, W)):
        Dc.add("decal_hang", ("x", 0.18 + eps), y0, y1, PAR - 2.5, PAR - 0.95, 0.8, sub(0.2))
        Dc.add("decal_thin", ("x", 0.18 + eps), y0, y1, 4.5, 9.0, 0.6, sub(0.15))
    # le pignon au-dessus du voisin : sous la couvertine, et une grande traînée
    x = -D
    while x < -0.2:
        w = R.uniform(1.5, 3.0)
        b = min(x + w, 0.0)
        Dc.add("decal_hang", ("y", -eps), x, b, PAR - R.uniform(1.2, 3.0), PAR, R.uniform(0.4, 0.8), sub(0.5), R.random() < 0.5)
        x = b - 0.2
    # les climatiseurs : la condensation goutte dessous
    for yy, zz in AC_SPOTS:
        Dc.add("decal_thin", ("x", eps), yy - 0.25, yy + 0.25, zz - R.uniform(1.0, 1.6) + 0.0, zz + 0.05, 1.0, sub(0.12))
    # la descente d'eau : la façade a pris l'eau autour, surtout aux joints
    Dc.add("decal_hang", ("x", eps), 0.72, 1.08, 4.5, ROOF, 0.7, sub(0.12))
    Dc.add("decal_rise", ("x", eps), 0.72, 1.08, 0.7, 2.2, 0.9, sub(0.12))
    # sur le bandeau d'enseigne des vitrines, sous le larmier
    for y0, y1 in SHOPS:
        Dc.add("decal_hang", ("x", eps), y0 + 0.05, y1 - 0.05, OPEN_TOP + 0.05, GF - 0.12, R.uniform(0.3, 0.55), sub(0.6))
    return Dc.done("pbr_decals")


AC_SPOTS = []


# ---------------------------------------------------------------- l'immeuble

def build(M, hidden):
    objs = []
    objs.append(mass(M))
    objs.append(plinth(M))
    B = S.Boxes("pbr_details")
    lights = []
    for f in range(NF):
        for yc in WINS:
            window(B, M, yc, GF + f * FH)
    rooms(B, M)
    for k, (y0, y1) in enumerate(SHOPS):
        shopfront(B, M, y0, y1, k, lights)
    shutter(B, M, SHOPS[2][0], SHOPS[2][1], 2.2)
    lobby(B, M, lights)
    awning(B, M, SHOPS[3][0], SHOPS[3][1], S.mat_awning(S.CORAL, "awning_coral"))
    awning(B, M, SHOPS[0][0], SHOPS[0][1], S.mat_awning("#4b2f54", "awning_plum"))
    # descente d'eau avec ses colliers, coffret électrique, applique de l'entrée
    pipe = tube("downpipe", (0.1, 0.9, 0.17), (0.1, 0.9, PAR - 0.3), M["pipe"], r=0.05)
    pipe2 = S.cyl("downpipe_neck", (0.1, 0.9, PAR - 0.3), (-0.1, 0.9, PAR - 0.1), 0.05, M["pipe"], seg=10)
    for zz in range(1, int(PAR / 2.0)):
        B.add(0.0, 0.16, 0.84, 0.96, zz * 2.0, zz * 2.0 + 0.04, M["pipe"])
    B.add(0.0, 0.07, 4.35, 4.75, 1.3, 1.85, M["pipe"])
    B.add(0.07, 0.075, 4.38, 4.72, 1.33, 1.82, M["dark"])
    for yy in (7.85, 12.15):
        B.add(0.0, 0.12, yy - 0.08, yy + 0.08, 2.4, 2.75, M["bronze"])
        B.add(0.12, 0.2, yy - 0.06, yy + 0.06, 2.45, 2.7, S.mat_emit("sconce", S.lin("#ffe0b0"), 18.0))
    det = B.done()
    objs += [det, pipe, pipe2]
    # les climatiseurs de fenêtre (Poly Haven), sur une fenêtre sur trois
    ac_parts = S.import_glb("exterior_aircon_unit/exterior_aircon_unit.gltf")
    ac = S.source(ac_parts, "ac_src", hidden)
    R = random.Random(5)
    for f in range(NF):
        for yc in WINS:
            if R.random() < 0.34:
                yy = yc + R.uniform(-0.6, 0.6)
                zz = GF + f * FH + 0.12
                AC_SPOTS.append((yy, zz))
                objs.append(S.instance(ac, f"ac_{f}_{yc}", (0.3, yy, zz), math.pi / 2, 0.9))
    objs.append(decals(M))
    # néons : ailettes du pylône (lilas), couvertine (corail), lettres crème « HOTEL »
    lilac = S.mat_emit("neon_lilac", S.lin(S.LILAC), 30.0)
    coral = S.mat_emit("neon_coral", S.lin(S.CORAL), 22.0)
    cream = S.mat_emit("neon_cream", S.lin(S.CREAM), 14.0)
    for yy in (PY0 + 0.15, PY1 - 0.15):
        objs.append(tube(f"neon_fin_{yy}", (PYX + 0.18, yy, GF + 0.1), (PYX + 0.18, yy, PAR + 0.3), lilac))
    for y0, y1 in ((0.7, PY0), (PY1, W - 0.7)):
        objs.append(tube(f"neon_cop_{y0}", (0.1, y0, PAR + 0.1), (0.1, y1, PAR + 0.1), coral, r=0.014))
    for i, ch in enumerate("HOTEL"):
        zc = ROOF - 1.4 - i * 1.25
        objs.append(text_letter(f"sign_{ch}{i}", ch, (PYX + 0.1, (PY0 + PY1) / 2, zc), 1.05, cream))
        objs[-1].scale = (1.0, 1.0, 1.0)
    B2 = S.Boxes("pbr_sign_back")
    B2.add(PYX, PYX + 0.08, 9.45, 10.55, ROOF - 7.0, ROOF - 0.7, M["dark"])
    objs.append(B2.done())
    # lettres-boîtiers des boutiques, sur leur bandeau (mots neutres)
    zs = (OPEN_TOP + 0.15 + GF - 0.25) / 2
    for word, y, mat in (("CAFE", sum(SHOPS[1]) / 2, cream), ("OCEAN", sum(SHOPS[3]) / 2, S.mat_emit("letters_lilac", S.lin(S.LILAC), 9.0))):
        for i, ch in enumerate(word):
            yy = y + (i - (len(word) - 1) / 2) * 0.36
            objs.append(text_letter(f"fascia_{word}_{i}", ch, (0.0, yy, zs), 0.4, mat, depth=0.03))
    # néon de vitrine dans la boutique B
    objs.append(text_letter("shop_neon", "BAR", (-0.6, sum(SHOPS[1]) / 2, 2.1), 0.5, coral, depth=0.01))
    # le mât au sommet du pylône
    objs.append(S.cyl("mast", (-0.1, 10.0, PAR + 3.4), (-0.1, 10.0, PAR + 7.5), 0.05, M["dark"], seg=8))
    return objs, lights


def lights_for(lights, X, Y):
    """Les lumières de la façade : lavages au pied et sur le larmier, pylône lilas depuis la
    marquise, vitrines, marquise, enseigne."""
    for j, (kind, (lx, ly, lz), size, col) in enumerate(lights):
        loc = (X + lx, Y + ly, lz)
        if kind == "shop_in":
            S.add_light(f"B_shopin_{j}", "AREA", loc, (0, 0, -1), S.lin(col), 450.0, size)
        elif kind == "shop_out":
            S.add_light(f"B_shopout_{j}", "AREA", loc, (1, 0, -0.35), S.lin(col), 40.0 * size[0], size)
        elif kind == "canopy":
            S.add_light(f"B_canopy_{j}", "AREA", loc, (0.2, 0, -1), S.lin(col), 320.0, size)
    warm = S.lin("#ffdcb4")
    # au pied des trumeaux, des projecteurs encastrés qui lèchent le mur
    for y0, y1 in PIERS:
        yc = (y0 + y1) / 2
        if PY0 - 0.5 < yc < PY1 + 0.5:
            continue
        x = 0.4 if (y0, y1) in ((0.0, 0.7), (19.3, 20.0)) else 0.22
        L = S.add_light(f"B_up_{yc}", "SPOT", (X + x, Y + yc, 0.25), (-0.09, 0, 1), warm, 300.0, spot=24)
        L.data.spot_blend = 0.6
    # sur le larmier du rez-de-chaussée : le lavage des étages, fort en bas, qui s'éteint en montant
    for yc in (2.3, 4.15, 6.0, 14.0, 15.85, 17.7):
        L = S.add_light(f"B_wash_{yc}", "SPOT", (X + 0.3, Y + yc, GF + 0.1), (-0.13, 0, 1), warm, 380.0, spot=62)
        L.data.spot_blend = 0.9
    # le pylône en lilas, depuis la marquise
    for yc in (9.2, 10.8):
        L = S.add_light(f"B_pylon_{yc}", "SPOT", (X + 1.6, Y + yc, 3.85), (-0.17, 0, 1), S.lin(S.LILAC), 2600.0, spot=22)
        L.data.spot_blend = 0.5
    # l'enseigne éclaire un peu son pylône
    S.add_light("B_sign", "AREA", (X + PYX + 0.6, Y + 10.0, ROOF - 3.9), (-1, 0, 0), S.lin(S.CREAM), 60.0, (0.8, 6.0))


def main():
    bench.setup()
    hidden = bench.hidden_collection()
    M = B_mats.mats()
    objs, lights = build(M, hidden)
    X, Y = bench.LOT["x"], bench.LOT["y0"]
    tint = (*S.lin(TINT)[:3], 1.0)
    for o in objs:
        o.location = Vector(o.location) + Vector((X, Y, 0))
        o.color = tint
    lights_for(lights, X, Y)
    which = tuple(os.environ.get("B_WHICH", "large,pres").split(","))
    bench.render(os.environ.get("B_NAME", "B-pbr"), which=which)


main()
