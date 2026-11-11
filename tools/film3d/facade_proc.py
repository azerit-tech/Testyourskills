# Les huit immeubles du film, tout par le code (méthode C du banc de réalisme, retenue en finale).
#
# Remplace scene_a.make_building quand FILM3D_FACADE=proc : make_building(S, key, M, spec) rend
# (objet, accessoires, lumières) dans le repère de scene_a (façade en x = 0 tournée vers +x,
# emprise y de 0 à W, profondeur vers −x). Un maillage par dessin, instancié ; la teinte vient de
# la couleur de chaque instance (Object Info), l'accent en est dérivé (ou la propriété « accent »).
#
# Ce qu'il y a dedans : un mur unique percé de baies à vrais tableaux, chanfreins figés dans le
# maillage, sourcils, bandeaux, angles arrondis à hublots, tours à ailettes et gradins, balcons à
# lisses, coursive de motel, retraits ; vitres des étages à chambres simulées dans le shader (lancer
# de rayon dans une boîte par pièce : murs, sol, plafond, meuble, lampe, stores, rideaux) ;
# rez-de-chaussée à vrais intérieurs éclairés (bar, café, boutique, hall), stores bannes, terrasses ;
# enduit photographique (ambientCG PaintedPlaster017 + Plaster003, CC0, comme la méthode B) sous une
# carte d'usure calculée depuis le dessin (coulures sous chaque appui, reprises, épaufrures,
# fissures) ; néons, lavages de façade, enseignes en lettres Blender (mots neutres inventés).
#
# S (le module scene_a) est passé par l'appelant : ce module ne l'importe pas.
import math
import os
import random
import time
import traceback

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

S = None


def lin(h, a=1.0):
    return S.lin(h, a)


ATTR_V = ("rlo", "rhi", "wz", "wy")


# ---------------------------------------------------------------- maillages

def _orient(vs, want):
    """Remet un polygone dans le sens qui donne la normale voulue (méthode de Newell)."""
    n = Vector((0.0, 0.0, 0.0))
    k = len(vs)
    for i in range(k):
        a, b = vs[i].co, vs[(i + 1) % k].co
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    if n.dot(Vector(want)) < 0:
        vs = list(reversed(vs))
    return vs


class MB:
    """Un maillage en construction ; bevel > 0 : chanfrein figé à la fin (arêtes de plus de 30°)."""

    def __init__(self, name, bevel=0.0, seg=2):
        self.name, self.bevel, self.seg = name, bevel, seg
        self.bm = bmesh.new()
        self.mats = []
        self.lv = {a: self.bm.faces.layers.float_vector.new(a) for a in ATTR_V}
        self.lf = self.bm.faces.layers.float.new("rseed")

    def mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def v(self, p):
        return self.bm.verts.new(p)

    def poly(self, vs, mat, want=None, smooth=False, attrs=None):
        if want is not None:
            vs = _orient(vs, want)
        f = self.bm.faces.new(vs)
        f.material_index = self.mi(mat)
        f.smooth = smooth
        if attrs:
            for k, val in attrs.items():
                if k == "rseed":
                    f[self.lf] = val
                else:
                    f[self.lv[k]] = val
        return f

    def quad(self, pts, mat, want=None, attrs=None, smooth=False):
        return self.poly([self.v(p) for p in pts], mat, want, smooth, attrs)

    def box(self, x0, x1, y0, y1, z0, z1, mat, attrs=None, faces=None, mats=None):
        """Pavé ; faces : sous-ensemble de ('-x','+x','-y','+y','-z','+z') ; mats : matériau par face."""
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = min(y0, y1), max(y0, y1)
        z0, z1 = min(z0, z1), max(z0, z1)
        V = {}
        for i, x in enumerate((x0, x1)):
            for j, y in enumerate((y0, y1)):
                for k, z in enumerate((z0, z1)):
                    V[i, j, k] = self.v((x, y, z))
        spec = {
            "-x": ([(0, 0, 0), (0, 1, 0), (0, 1, 1), (0, 0, 1)], (-1, 0, 0)),
            "+x": ([(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)], (1, 0, 0)),
            "-y": ([(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)], (0, -1, 0)),
            "+y": ([(0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)], (0, 1, 0)),
            "-z": ([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)], (0, 0, -1)),
            "+z": ([(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)], (0, 0, 1)),
        }
        for key, (idx, want) in spec.items():
            if faces is not None and key not in faces:
                continue
            m = (mats or {}).get(key, mat)
            self.poly([V[t] for t in idx], m, want, attrs=attrs)

    def wall(self, xf, y0, y1, z0, z1, holes, mat, rim=(), rim_d=0.3, reveal=None):
        """Mur plan (normale +x) percé de baies (ya, yb, za, zb, profondeur) à vrais tableaux.
        Une seule nappe : les arêtes des baies se chanfreinent, le nu du mur reste lisse."""
        return self.wallg(lambda u, z, d: (xf - d, u, z), (1, 0, 0), (0, 1, 0), y0, y1, z0, z1, holes, mat, rim, rim_d, reveal)

    def wallg(self, fn, nrm, du, y0, y1, z0, z1, holes, mat, rim=(), rim_d=0.3, reveal=None):
        """Le même mur dans un repère quelconque : fn(u, z, d) -> point (u le long du mur, d vers
        l'intérieur), nrm la normale extérieure, du la direction des u croissants."""
        r6 = lambda a: round(a, 5)  # noqa: E731
        pu, mu = tuple(du), tuple(-c for c in du)
        ys = sorted({r6(y0), r6(y1)} | {r6(h[0]) for h in holes} | {r6(h[1]) for h in holes})
        zs = sorted({r6(z0), r6(z1)} | {r6(h[2]) for h in holes} | {r6(h[3]) for h in holes})
        F = [[self.v(fn(y, z, 0.0)) for z in zs] for y in ys]
        nI, nJ = len(ys) - 1, len(zs) - 1

        def hole(yc, zc):
            for k, h in enumerate(holes):
                if h[0] < yc < h[1] and h[2] < zc < h[3]:
                    return k
            return -1
        cell = [[hole((ys[i] + ys[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2) for j in range(nJ)] for i in range(nI)]
        for i in range(nI):
            for j in range(nJ):
                if cell[i][j] < 0:
                    self.poly([F[i][j], F[i + 1][j], F[i + 1][j + 1], F[i][j + 1]], mat, nrm)
        rm = reveal or mat
        for k, h in enumerate(holes):
            ya, yb, za, zb, d = h
            ia, ib, ja, jb = ys.index(r6(ya)), ys.index(r6(yb)), zs.index(r6(za)), zs.index(r6(zb))
            Bv = {}

            def bv(i, j):
                if (i, j) not in Bv:
                    Bv[i, j] = self.v(fn(ys[i], zs[j], d))
                return Bv[i, j]
            for i in range(ia, ib):
                self.poly([F[i][ja], F[i + 1][ja], bv(i + 1, ja), bv(i, ja)], rm, (0, 0, 1))
                self.poly([F[i][jb], F[i + 1][jb], bv(i + 1, jb), bv(i, jb)], rm, (0, 0, -1))
            for j in range(ja, jb):
                self.poly([F[ia][j], F[ia][j + 1], bv(ia, j + 1), bv(ia, j)], rm, pu)
                self.poly([F[ib][j], F[ib][j + 1], bv(ib, j + 1), bv(ib, j)], rm, mu)
        Rv = {}

        def rv(i, j):
            if (i, j) not in Rv:
                Rv[i, j] = self.v(fn(ys[i], zs[j], rim_d))
            return Rv[i, j]
        if "top" in rim:
            for i in range(nI):
                if cell[i][nJ - 1] < 0:
                    self.poly([F[i][nJ], F[i + 1][nJ], rv(i + 1, nJ), rv(i, nJ)], mat, (0, 0, 1))
        if "bottom" in rim:
            for i in range(nI):
                if cell[i][0] < 0:
                    self.poly([F[i][0], F[i + 1][0], rv(i + 1, 0), rv(i, 0)], mat, (0, 0, -1))
        if "left" in rim:
            for j in range(nJ):
                if cell[0][j] < 0:
                    self.poly([F[0][j], F[0][j + 1], rv(0, j + 1), rv(0, j)], mat, mu)
        if "right" in rim:
            for j in range(nJ):
                if cell[nI - 1][j] < 0:
                    self.poly([F[nI][j], F[nI][j + 1], rv(nI, j + 1), rv(nI, j)], mat, pu)

    def prism(self, pts, z0, z1, mat, smooth_max=0.5, caps=True):
        """Prisme vertical ; les petits côtés (arcs) sont lissés, les grands restent plans."""
        area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
        if area < 0:
            pts = list(reversed(pts))
        lo = [self.v((x, y, z0)) for x, y in pts]
        hi = [self.v((x, y, z1)) for x, y in pts]
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            seg = math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1])
            ex, ey = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]
            self.poly([lo[i], lo[j], hi[j], hi[i]], mat, (ey, -ex, 0), smooth=seg < smooth_max)
        if caps:
            self.poly(list(reversed(lo)), mat, (0, 0, -1))
            self.poly(hi, mat, (0, 0, 1))

    def cyl(self, p0, p1, r0, mat, r1=None, seg=12, smooth=True, caps=True):
        p0, p1 = Vector(p0), Vector(p1)
        r1 = r0 if r1 is None else r1
        ax = p1 - p0
        u = ax.orthogonal().normalized()
        w = ax.cross(u).normalized()
        dirs = [u * math.cos(2 * math.pi * i / seg) + w * math.sin(2 * math.pi * i / seg) for i in range(seg)]
        a = [self.v(p0 + d * r0) for d in dirs]
        b = [self.v(p1 + d * r1) for d in dirs]
        for i in range(seg):
            j = (i + 1) % seg
            self.poly([a[i], a[j], b[j], b[i]], mat, dirs[i] + dirs[j], smooth=smooth)
        if caps:
            self.poly(list(a), mat, -ax)
            self.poly(list(b), mat, ax)

    def torus(self, c, n, R, r, mat, seg=24, rseg=8):
        c, n = Vector(c), Vector(n).normalized()
        u = n.orthogonal().normalized()
        w = n.cross(u)
        rings = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            d = u * math.cos(a) + w * math.sin(a)
            rings.append((d, [self.v(c + d * (R + r * math.cos(2 * math.pi * k / rseg)) + n * (r * math.sin(2 * math.pi * k / rseg))) for k in range(rseg)]))
        for i in range(seg):
            d0, A = rings[i]
            d1, B = rings[(i + 1) % seg]
            for k in range(rseg):
                q = (k + 1) % rseg
                ctr = c + (d0 + d1).normalized() * R
                mid = (A[k].co + A[q].co + B[k].co + B[q].co) / 4
                self.poly([A[k], B[k], B[q], A[q]], mat, mid - ctr, smooth=True)

    def ellipsoid(self, c, radii, mat, rot=None, nu=16, nv=10):
        c = Vector(c)
        rot = rot or Matrix.Identity(3)
        rx, ry, rz = radii

        def p(th, ph):
            return c + rot @ Vector((rx * math.sin(ph) * math.cos(th), ry * math.sin(ph) * math.sin(th), rz * math.cos(ph)))
        top, bot = self.v(p(0, 0)), self.v(p(0, math.pi))
        rings = [[self.v(p(2 * math.pi * i / nu, math.pi * j / nv)) for i in range(nu)] for j in range(1, nv)]
        for i in range(nu):
            q = (i + 1) % nu
            self.poly([top, rings[0][i], rings[0][q]], mat, rings[0][i].co - c, smooth=True)
            self.poly([bot, rings[-1][q], rings[-1][i]], mat, rings[-1][i].co - c, smooth=True)
            for j in range(nv - 2):
                A, B = rings[j], rings[j + 1]
                self.poly([A[i], B[i], B[q], A[q]], mat, (A[i].co + B[q].co) / 2 - c, smooth=True)

    def disc(self, c, n, r, mat, seg=24, attrs=None):
        c, n = Vector(c), Vector(n).normalized()
        u = n.orthogonal().normalized()
        w = n.cross(u)
        vs = [self.v(c + (u * math.cos(2 * math.pi * i / seg) + w * math.sin(2 * math.pi * i / seg)) * r) for i in range(seg)]
        self.poly(vs, mat, n, attrs=attrs)

    def grid(self, fn, nu, nv, mat, want, smooth=True):
        """Une nappe paramétrée fn(u, v) -> (x, y, z), u, v dans [0, 1]."""
        V = [[self.v(fn(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
        for i in range(nu):
            for j in range(nv):
                self.poly([V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]], mat, want, smooth=smooth)

    def done(self):
        me = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        if self.bevel > 0:
            md = ob.modifiers.new("bevel", "BEVEL")
            md.width = self.bevel
            md.segments = self.seg
            md.limit_method = "ANGLE"
            md.angle_limit = math.radians(30)
            md.use_clamp_overlap = True
            freeze(ob)
        return ob


def freeze(ob, matrix=None):
    """Fige modificateurs (ou courbe, texte) dans un maillage : les instances le partagent."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    if matrix is not None:
        me.transform(matrix)
    if ob.type == "MESH":
        old = ob.data
        ob.modifiers.clear()
        ob.data = me
        bpy.data.meshes.remove(old)
        return ob
    new = bpy.data.objects.new(ob.name + "_m", me)
    bpy.context.scene.collection.objects.link(new)
    data = ob.data
    bpy.data.objects.remove(ob)
    try:
        bpy.data.curves.remove(data)
    except Exception:
        pass
    return new


_FONT = []


def basis(right, up, loc):
    r, u = Vector(right).normalized(), Vector(up).normalized()
    n = r.cross(u)
    m = Matrix((r, u, n)).transposed().to_4x4()
    m.translation = Vector(loc)
    return m


def text(body, loc, right, up, size, mat, extrude=0.025, bold=0.0, align="CENTER"):
    """Lettres en relief (Blender, police intégrée), figées en maillage dans le repère de l'immeuble."""
    if not _FONT:
        _FONT.append(bpy.data.fonts.load("<builtin>"))
    cu = bpy.data.curves.new("txt_" + body, "FONT")
    cu.body = body
    cu.font = _FONT[0]
    cu.size = size
    cu.extrude = extrude
    cu.offset = bold
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.materials.append(mat)
    ob = bpy.data.objects.new("txt_" + body, cu)
    bpy.context.scene.collection.objects.link(ob)
    return freeze(ob, basis(right, up, loc))


def tube(paths, r, mat, name="tube"):
    """Tubes (néons, câbles, fils) : polylignes à section ronde, figées en maillage."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = 2
    cu.use_fill_caps = True
    for pts in paths:
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for i, p in enumerate(pts):
            sp.points[i].co = (p[0], p[1], p[2], 1.0)
    cu.materials.append(mat)
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    return freeze(ob)


def sag(a, b, s, n=16):
    a, b = Vector(a), Vector(b)
    out = []
    for i in range(n + 1):
        t = i / n
        p = a.lerp(b, t)
        p.z -= s * 4 * t * (1 - t)
        out.append(tuple(p))
    return out


def arc_pts(cx, cy, r, a0, a1, n):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def ring_sector(cx, cy, r_in, r_out, a0, a1, n=24):
    """L'emprise d'un bandeau qui suit un arrondi d'angle (secteur de couronne)."""
    return arc_pts(cx, cy, r_out, a0, a1, n) + list(reversed(arc_pts(cx, cy, r_in, a0, a1, n)))


# ---------------------------------------------------------------- nœuds

def vm(N, op, a, b=None, scale=None):
    n = N.new("ShaderNodeVectorMath", _operation=op)
    if isinstance(a, tuple):
        a = a[:3]
    if isinstance(b, tuple):
        b = b[:3]
    N.set(n.inputs[0], a)
    if b is not None:
        N.set(n.inputs[1], b)
    if scale is not None:
        N.set(n.inputs["Scale"], scale)
    return n.outputs[1] if op in ("DOT_PRODUCT", "LENGTH", "DISTANCE") else n.outputs[0]


def cxyz(N, x, y, z):
    c = N.new("ShaderNodeCombineXYZ")
    N.set(c.inputs[0], x)
    N.set(c.inputs[1], y)
    N.set(c.inputs[2], z)
    return c.outputs[0]


def attr(N, name, kind="GEOMETRY"):
    return N.new("ShaderNodeAttribute", _attribute_type=kind, _attribute_name=name)


def noise(N, vec, scale, detail=4.0, rough=0.55, mapping=None):
    if mapping is not None:
        mp = N.new("ShaderNodeMapping", Scale=mapping)
        N.link(vec, mp.inputs[0])
        vec = mp.outputs[0]
    t = N.new("ShaderNodeTexNoise", Scale=scale, Detail=detail, Roughness=rough)
    N.link(vec, t.inputs["Vector"])
    return t.outputs[0]


def band(N, v, a, b):
    """1 si a < v < b."""
    return N.math("MULTIPLY", N.math("GREATER_THAN", v, a), N.math("LESS_THAN", v, b))


def white(N, w):
    n = N.new("ShaderNodeTexWhiteNoise", _noise_dimensions="1D")
    N.set(n.inputs["W"], w)
    return n.outputs[0], N.sep(n.outputs[1])


def ramp_const(N, fac, stops):
    out = N.ramp(fac, stops)
    out.node.color_ramp.interpolation = "CONSTANT"
    return out


# ---------------------------------------------------------------- matériaux

PP = "PaintedPlaster017/PaintedPlaster017_2K-JPG_"     # enduit peint, photogrammétrie (ambientCG, CC0)
PL = "Plaster003/Plaster003_2K-JPG_"                   # enduit plus frais, pour les reprises (ambientCG, CC0)
_MEAN = {}


def _photo(N, rel, vec, color=True):
    t = S.image(N, os.path.join(S.ASSETS, rel), vec, color)
    t.projection = "BOX"
    t.projection_blend = 0.3
    return t


def _mean_lum(rel):
    """Luminance moyenne (linéaire) d'une photo : on n'en garde que le grain, ramené autour de 1."""
    if rel not in _MEAN:
        img = bpy.data.images.load(os.path.join(S.ASSETS, rel), check_existing=True)
        a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
        img.pixels.foreach_get(a)
        a = a.reshape(-1, 4)[::61, :3]
        a = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
        _MEAN[rel] = float((a @ np.array([0.2126, 0.7152, 0.0722], np.float32)).mean())
    return _MEAN[rel]


def _corner_u(N, x, y, U, cy, r, near, on):
    """L'arrondi d'angle déplié : dans l'arc, l'abscisse de la carte suit le mur."""
    if not on:
        return U, 0.0
    side = N.math("LESS_THAN", y, cy) if near else N.math("GREATER_THAN", y, cy)
    inC = N.math("MULTIPLY", side, N.math("GREATER_THAN", x, -r - 0.05))
    th = N.math("ARCTAN2", N.math("SUBTRACT", y, cy), N.math("ADD", x, r))
    return N.mixf(inC, U, N.math("ADD", cy, N.math("MULTIPLY", th, r))), inC


def mat_stucco(name, wx, kind, corners, rough=0.85):
    """Enduit peint. L'albédo : la teinte de l'instance (Object Info) × le grain d'un enduit
    photographique (deux photos, l'une pour les reprises), × la carte d'usure du dessin (coulures,
    reprises, épaufrures, fissures) ; l'occlusion ambiante salit les angles rentrants. kind : wall,
    trim (presque blanc, accordé), accent (propriété « accent » de l'objet, sinon une teinte voisine).
    corners : (r, near, far, xlim) des angles arrondis, pour déplier la carte ; la carte ne vaut que
    pour les faces tournées vers l'avenue à moins de xlim de la façade (et les arrondis)."""
    m, N, out = S.material(name)
    tc = N.new("ShaderNodeTexCoord")
    P = tc.outputs["Object"]
    x, y, z = N.sep(P)
    nx = N.sep(tc.outputs["Normal"])[0]
    r_c, near, far, xlim = corners
    U, c1 = _corner_u(N, x, y, y, r_c, r_c, True, near)
    U, c2 = _corner_u(N, x, y, U, wx.W_build - r_c, r_c, False, far)
    front = N.math("MAXIMUM", N.math("GREATER_THAN", nx, 0.3), N.math("MAXIMUM", c1, c2))
    onmap = N.math("MULTIPLY", N.math("GREATER_THAN", x, -xlim - 0.05), front)
    uu = N.math("DIVIDE", N.math("SUBTRACT", U, wx.y0), wx.W)
    vv = N.math("DIVIDE", N.math("SUBTRACT", z, wx.z0), wx.H)
    tex = N.new("ShaderNodeTexImage")
    tex.image = wx.image
    tex.interpolation = "Linear"
    tex.extension = "EXTEND"
    N.link(cxyz(N, uu, vv, 0.0), tex.inputs["Vector"])
    sc = N.new("ShaderNodeSeparateColor")
    N.link(tex.outputs["Color"], sc.inputs[0])
    R, G, B = sc.outputs[0], sc.outputs[1], sc.outputs[2]
    A = tex.outputs["Alpha"]
    R, G = N.math("MULTIPLY", R, onmap), N.mixf(onmap, 0.5, G)
    B, A = N.math("MULTIPLY", B, onmap), N.math("MULTIPLY", A, onmap)
    vs = noise(N, P, 1.0, 4.0, 0.6, mapping=(3.0, 3.0, 0.14))
    proc = N.math("MULTIPLY", N.math("SUBTRACT", vs, 0.42, clamp=True), 1.4)
    dirt = N.math("ADD", R, N.math("MULTIPLY", proc, N.math("SUBTRACT", 1.0, onmap)))
    info = N.new("ShaderNodeObjectInfo")
    base = info.outputs["Color"]
    if kind == "trim":
        base = N.mix(0.8, base, lin("#f6f1e7"))
    elif kind == "accent":
        acc = attr(N, "accent", "OBJECT")
        has = N.math("GREATER_THAN", vm(N, "LENGTH", acc.outputs["Vector"]), 0.001)
        hs = N.new("ShaderNodeHueSaturation", Hue=0.68, Saturation=1.6, Value=0.8, Fac=1.0)
        N.link(base, hs.inputs["Color"])
        base = N.mix(has, hs.outputs[0], acc.outputs["Color"])
    # l'enduit photographique, décalé par instance : deux immeubles du même dessin n'ont pas le même mur
    rnd = info.outputs["Random"]
    vt = vm(N, "ADD", P, cxyz(N, N.math("MULTIPLY", rnd, 37.0), N.math("MULTIPLY", rnd, 53.0), N.math("MULTIPLY", rnd, 11.0)))
    m1 = N.new("ShaderNodeMapping", Scale=(0.42, 0.42, 0.42))
    N.link(vt, m1.inputs[0])
    m2 = N.new("ShaderNodeMapping", Scale=(0.6, 0.6, 0.6))
    N.link(vt, m2.inputs[0])
    c1 = _photo(N, PP + "Color.jpg", m1.outputs[0])
    h1 = _photo(N, PP + "Displacement.jpg", m1.outputs[0], False)
    r1 = _photo(N, PP + "Roughness.jpg", m1.outputs[0], False)
    c2 = _photo(N, PL + "Color.jpg", m2.outputs[0])
    bw1, bw2 = N.new("ShaderNodeRGBToBW"), N.new("ShaderNodeRGBToBW")
    N.link(c1.outputs["Color"], bw1.inputs[0])
    N.link(c2.outputs["Color"], bw2.inputs[0])
    d1 = N.math("ADD", 1.0, N.math("MULTIPLY", N.math("SUBTRACT", N.math("DIVIDE", bw1.outputs[0], _mean_lum(PP + "Color.jpg")), 1.0), 1.1))
    d2 = N.math("ADD", 1.0, N.math("MULTIPLY", N.math("SUBTRACT", N.math("DIVIDE", bw2.outputs[0], _mean_lum(PL + "Color.jpg")), 1.0), 0.7))
    fresh = N.math("GREATER_THAN", G, 0.56)
    det = N.mixf(fresh, d1, d2)
    # reprises de peinture : plaques de la carte et dérive très lente de teinte
    lf = noise(N, P, 0.11, 2.0, 0.5)
    tint = N.math("ADD", N.math("MULTIPLY", N.math("SUBTRACT", G, 0.5), 0.6), N.math("MULTIPLY", N.math("SUBTRACT", lf, 0.5), 0.35))
    hs2 = N.new("ShaderNodeHueSaturation", Fac=1.0)
    N.link(N.math("ADD", 0.5, N.math("MULTIPLY", N.math("SUBTRACT", lf, 0.5), 0.05)), hs2.inputs["Hue"])
    N.link(N.math("ADD", 1.0, N.math("MULTIPLY", N.math("SUBTRACT", G, 0.5), 0.5)), hs2.inputs["Saturation"])
    N.link(N.math("ADD", 1.0, N.math("MULTIPLY", tint, 0.9)), hs2.inputs["Value"])
    N.link(base, hs2.inputs["Color"])
    col = vm(N, "SCALE", hs2.outputs[0], scale=N.math("MINIMUM", det, 1.35))
    # coulures et crasse
    col = N.mix(N.math("MULTIPLY", N.math("MINIMUM", dirt, 1.0), 0.9), col, vm(N, "MULTIPLY", col, (0.32, 0.30, 0.29)))
    # (pas de nœud d'occlusion : il trace des rayons à chaque point d'enduit et doublait le rendu ;
    # la carte d'usure salit déjà les angles rentrants, sous les appuis et au pied)
    col = N.mix(B, col, lin("#c4bcae"))
    col = N.mix(N.math("MULTIPLY", A, 0.38), col, (0.12, 0.1, 0.09, 1))
    edge = N.math("ADD", 0.3, N.math("MULTIPLY", noise(N, P, 2.0, 3.0), 0.5))
    wet = N.math("SUBTRACT", 1.0, N.math("DIVIDE", N.math("SUBTRACT", z, edge), 0.2), clamp=True)
    col = N.mix(N.math("MULTIPLY", wet, 0.8), col, vm(N, "MULTIPLY", col, (0.5, 0.48, 0.5)))
    r = N.math("ADD", N.math("MULTIPLY", r1.outputs["Color"], 0.5), rough * 0.5)
    r = N.math("SUBTRACT", r, N.math("MULTIPLY", N.math("MINIMUM", dirt, 1.0), 0.25))
    r = N.mixf(wet, r, 0.35)
    h = N.math("ADD", h1.outputs["Color"], N.math("MULTIPLY", fresh, 0.2))
    h = N.math("SUBTRACT", h, N.math("ADD", N.math("MULTIPLY", B, 0.5), N.math("MULTIPLY", A, 0.8)))
    bump = N.new("ShaderNodeBump", Strength=0.35, Distance=0.006)
    N.link(h, bump.inputs["Height"])
    p = S.principled(N, **{"Specular IOR Level": 0.4})
    N.link(col, p.inputs["Base Color"])
    N.link(r, p.inputs["Roughness"])
    N.link(bump.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_room_glass(name, gain=1.0):
    """Vitre et chambre simulée derrière. Chaque vitre porte, en attributs de face, la boîte de
    sa pièce (rlo, rhi), sa baie (wz, wy) et une graine (rseed). Le shader lance le rayon de la
    caméra dans la boîte : mur du fond, cloisons, sol, plafond, un meuble en silhouette, une
    lampe et sa chaleur ; stores vénitiens à des hauteurs diverses, voilages, rideaux ; par-dessus,
    le reflet du ciel et de la rue (Fresnel), chaque vitre un peu voilée et désaxée."""
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    geo = N.new("ShaderNodeNewGeometry")
    vt = N.new("ShaderNodeVectorTransform", _vector_type="VECTOR", _convert_from="WORLD", _convert_to="OBJECT")
    N.link(geo.outputs["Incoming"], vt.inputs[0])
    d = vm(N, "NORMALIZE", vm(N, "SCALE", vt.outputs[0], scale=-1.0))
    d = vm(N, "ADD", d, (1e-5, 1e-5, 1e-5))
    lo, hi = attr(N, "rlo").outputs["Vector"], attr(N, "rhi").outputs["Vector"]
    seed = attr(N, "rseed").outputs["Fac"]
    size = vm(N, "SUBTRACT", hi, lo)
    tm = vm(N, "MAXIMUM", vm(N, "DIVIDE", vm(N, "SUBTRACT", lo, P), d), vm(N, "DIVIDE", vm(N, "SUBTRACT", hi, P), d))
    tx, ty, tz = N.sep(tm)
    tyz = N.math("MINIMUM", ty, tz)
    t = N.math("MINIMUM", tx, tyz)
    H = vm(N, "ADD", P, vm(N, "SCALE", d, scale=t))
    u = vm(N, "DIVIDE", vm(N, "SUBTRACT", H, lo), size)
    ux, uy, uz = N.sep(u)
    dx, dy, dz = N.sep(d)
    isX = N.math("LESS_THAN", tx, N.math("ADD", tyz, 1e-4))
    notX = N.math("SUBTRACT", 1.0, isX)
    isZ = N.math("MULTIPLY", notX, N.math("LESS_THAN", tz, N.math("ADD", ty, 1e-4)))
    isY = N.math("MULTIPLY", notX, N.math("SUBTRACT", 1.0, isZ))
    flo = N.math("MULTIPLY", isZ, N.math("LESS_THAN", dz, 0.0))
    cei = N.math("SUBTRACT", isZ, flo)
    # tirages au sort de la pièce
    r0, (r1, r2, r3) = white(N, seed)
    r4, (r5, r6, r7) = white(N, N.math("ADD", seed, 17.31))
    wallc = ramp_const(N, r0, [(0.0, lin("#e9d9bd")), (0.2, lin("#e2b99d")), (0.36, lin("#b9c3a5")), (0.5, lin("#d8aaa6")),
                               (0.64, lin("#aeb6cc")), (0.78, lin("#d9b872")), (0.9, lin("#efe9de"))])
    side = vm(N, "SCALE", wallc, scale=0.82)
    alb = N.mix(isY, wallc, side)
    # un cadre au mur du fond, une porte sur une cloison, la plinthe
    pic = N.math("MULTIPLY", N.math("MULTIPLY", isX, band(N, uy, N.math("ADD", 0.12, N.math("MULTIPLY", r1, 0.45)), N.math("ADD", 0.38, N.math("MULTIPLY", r1, 0.45)))), band(N, uz, 0.42, 0.66))
    picc = ramp_const(N, r2, [(0.0, lin("#3b4a5e")), (0.3, lin("#7a4a3a")), (0.6, lin("#c9b27a")), (0.8, lin("#2f3b33"))])
    alb = N.mix(pic, alb, picc)
    door = N.math("MULTIPLY", N.math("MULTIPLY", isY, band(N, ux, 0.12, 0.4)), N.math("LESS_THAN", uz, 0.76))
    alb = N.mix(N.math("MULTIPLY", door, N.math("GREATER_THAN", r3, 0.35)), alb, lin("#6b4a33"))
    skirt = N.math("MULTIPLY", N.math("SUBTRACT", 1.0, isZ), N.math("LESS_THAN", uz, 0.035))
    alb = N.mix(skirt, alb, lin("#efe9df"))
    # sol (parquet ou moquette) et plafond
    hx, hy, hz = N.sep(H)
    plank = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", hy, 0.16)), 0.93)
    wood = vm(N, "SCALE", lin("#7a5236"), scale=N.math("ADD", 0.6, N.math("MULTIPLY", plank, 0.4)))
    floorc = N.mix(N.math("GREATER_THAN", r5, 0.55), wood, ramp_const(N, r6, [(0.0, lin("#8b6f5a")), (0.5, lin("#5c5f6e")), (0.8, lin("#9a7b62"))]))
    alb = N.mix(flo, alb, floorc)
    alb = N.mix(cei, alb, lin("#efe8db"))
    # la lampe : plafonnier au milieu, ou lampadaire dans un coin du fond
    ceil_lamp = N.math("GREATER_THAN", r3, 0.5)
    Lu = N.new("ShaderNodeMix", _data_type="VECTOR")
    N.link(ceil_lamp, Lu.inputs["Factor"])
    N.link(cxyz(N, 0.2, N.mixf(N.math("GREATER_THAN", r4, 0.5), 0.12, 0.88), 0.55), Lu.inputs[4])
    N.set(Lu.inputs[5], (0.55, 0.5, 0.96))
    Lw = vm(N, "ADD", lo, vm(N, "MULTIPLY", Lu.outputs[1], size))
    dist2 = vm(N, "DOT_PRODUCT", vm(N, "SUBTRACT", H, Lw), vm(N, "SUBTRACT", H, Lw))
    lit = N.math("GREATER_THAN", r7, 0.3)
    pw = N.math("MULTIPLY", lit, N.math("ADD", 0.7, N.math("MULTIPLY", r5, 1.8)))
    E = N.math("ADD", N.math("DIVIDE", pw, N.math("ADD", 0.35, dist2)), N.math("ADD", 0.02, N.math("MULTIPLY", ux, 0.05)))
    lampc = N.ramp(r6, [(0.0, lin("#ff9a48")), (0.35, lin("#ffc06e")), (0.75, lin("#ffe3b8")), (0.92, lin("#fff4e4")), (0.97, lin("#c8ccff"))])
    room = vm(N, "SCALE", vm(N, "MULTIPLY", alb, lampc), scale=E)
    # le plafonnier se voit (abat-jour lumineux)
    shade = N.math("MULTIPLY", N.math("MULTIPLY", cei, ceil_lamp), N.math("LESS_THAN", dist2, 0.05))
    room = N.mix(N.math("MULTIPLY", shade, lit), room, vm(N, "SCALE", lampc, scale=6.0))
    # télévision dans les pièces éteintes : une lueur froide et basse
    tv = N.math("MULTIPLY", N.math("SUBTRACT", 1.0, lit), N.math("GREATER_THAN", r1, 0.7))
    room = vm(N, "ADD", room, vm(N, "SCALE", vm(N, "MULTIPLY", alb, lin("#9fa6ff")), scale=N.math("MULTIPLY", tv, N.math("MULTIPLY", N.math("SUBTRACT", 1.0, uz), 0.35))))
    # un meuble en silhouette dans un plan intermédiaire
    xf = N.math("ADD", N.sep(lo)[0], N.math("MULTIPLY", N.sep(size)[0], N.math("ADD", 0.45, N.math("MULTIPLY", r2, 0.3))))
    px_, py_, pz_ = N.sep(P)
    tf = N.math("DIVIDE", N.math("SUBTRACT", xf, px_), dx)
    Hf = vm(N, "ADD", P, vm(N, "SCALE", d, scale=tf))
    uf = vm(N, "DIVIDE", vm(N, "SUBTRACT", Hf, lo), size)
    fx_, fy_, fz_ = N.sep(uf)
    a0 = N.math("ADD", 0.08, N.math("MULTIPLY", r4, 0.4))
    low = N.math("MULTIPLY", band(N, fy_, a0, N.math("ADD", a0, 0.48)), N.math("LESS_THAN", fz_, N.math("ADD", 0.16, N.math("MULTIPLY", band(N, fy_, a0, N.math("ADD", a0, 0.06)), 0.12))))
    tall = N.math("MULTIPLY", band(N, fy_, N.math("SUBTRACT", 0.9, N.math("MULTIPLY", r7, 0.2)), N.math("SUBTRACT", 1.08, N.math("MULTIPLY", r7, 0.2))), N.math("LESS_THAN", fz_, 0.72))
    shape = N.math("MAXIMUM", N.math("MULTIPLY", low, N.math("GREATER_THAN", r2, 0.25)), N.math("MULTIPLY", tall, N.math("GREATER_THAN", r1, 0.45)))
    furn = N.math("MULTIPLY", shape, N.math("LESS_THAN", tf, t))
    furnc = vm(N, "SCALE", vm(N, "MULTIPLY", ramp_const(N, r5, [(0.0, lin("#5a3b2c")), (0.4, lin("#40465a")), (0.7, lin("#8c7a64"))]), lampc), scale=N.math("MULTIPLY", N.math("ADD", 0.12, N.math("MULTIPLY", pw, 0.25)), N.math("ADD", 0.4, fz_)))
    room = N.mix(furn, room, furnc)
    # stores et rideaux, au droit de la vitre
    wz, wy = attr(N, "wz").outputs["Vector"], attr(N, "wy").outputs["Vector"]
    z0, z1, bf = N.sep(wz)
    y0, y1, ck = N.sep(wy)
    v = N.math("DIVIDE", N.math("SUBTRACT", pz_, z0), N.math("SUBTRACT", z1, z0))
    w = N.math("DIVIDE", N.math("SUBTRACT", py_, y0), N.math("SUBTRACT", y1, y0))
    glowback = vm(N, "SCALE", lampc, scale=N.math("ADD", 0.03, N.math("MULTIPLY", pw, 0.32)))
    slat = N.math("ADD", 0.72, N.math("MULTIPLY", N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", pz_, 0.045)), 0.78), 0.28))
    blind = N.math("GREATER_THAN", v, N.math("SUBTRACT", 1.0, bf))
    blindc = vm(N, "SCALE", vm(N, "MULTIPLY", lin("#e6dcc8"), glowback), scale=slat)
    cw = N.math("ADD", 0.1, N.math("MULTIPLY", r4, 0.22))
    curt = N.math("MULTIPLY", N.math("GREATER_THAN", ck, 0.5), N.math("MAXIMUM", N.math("LESS_THAN", w, cw), N.math("GREATER_THAN", w, N.math("SUBTRACT", 1.0, N.math("MULTIPLY", cw, N.math("ADD", 0.5, r1))))))
    fold = N.math("ADD", 0.65, N.math("MULTIPLY", N.math("ADD", 0.5, N.math("MULTIPLY", N.math("SINE", N.math("MULTIPLY", py_, 52.0)), 0.5)), 0.35))
    curtc = vm(N, "SCALE", vm(N, "MULTIPLY", ramp_const(N, r2, [(0.0, lin("#e8d8b8")), (0.35, lin("#c98b6e")), (0.6, lin("#8a8fbf")), (0.8, lin("#e9e1d6"))]), glowback), scale=N.math("MULTIPLY", fold, 1.4))
    sheer = N.math("MULTIPLY", N.math("GREATER_THAN", ck, 0.85), 0.55)
    room = N.mix(sheer, room, vm(N, "ADD", vm(N, "SCALE", room, scale=0.35), vm(N, "SCALE", lin("#f2e6d0"), scale=N.math("ADD", 0.02, N.math("MULTIPLY", pw, 0.22)))))
    room = N.mix(curt, room, curtc)
    room = N.mix(blind, room, blindc)
    em = N.new("ShaderNodeEmission", Strength=gain)
    N.link(room, em.inputs["Color"])
    # la vitre : reflet, un peu voilé et désaxé d'une vitre à l'autre (verre ancien)
    tilt = cxyz(N, 1.0, N.math("MULTIPLY", N.math("SUBTRACT", r5, 0.5), 0.05), N.math("MULTIPLY", N.math("SUBTRACT", r6, 0.5), 0.05))
    nt = N.new("ShaderNodeVectorTransform", _vector_type="NORMAL", _convert_from="OBJECT", _convert_to="WORLD")
    N.link(tilt, nt.inputs[0])
    nn = vm(N, "NORMALIZE", nt.outputs[0])
    gl = N.new("ShaderNodeBsdfGlossy", Color=(0.92, 0.92, 0.95, 1))
    N.link(N.math("ADD", 0.015, N.math("MULTIPLY", r0, 0.05)), gl.inputs["Roughness"])
    N.link(nn, gl.inputs["Normal"])
    fr = N.new("ShaderNodeFresnel", IOR=1.5)
    N.link(nn, fr.inputs["Normal"])
    mx = N.new("ShaderNodeMixShader")
    N.link(N.math("ADD", N.math("MULTIPLY", fr.outputs[0], 0.5), 0.02), mx.inputs[0])
    N.link(em.outputs[0], mx.inputs[1])
    N.link(gl.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mat_shop_glass(name="C_shop_glass"):
    """Vitrine : transparente, reflet Fresnel, un film de poussière plus dense en bas."""
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    z = N.sep(P)[2]
    lw = N.new("ShaderNodeLayerWeight", Blend=0.1)
    dust = N.math("MULTIPLY", N.math("SUBTRACT", 1.0, N.math("DIVIDE", z, 1.2), clamp=True), 0.25)
    f = N.math("ADD", N.math("MULTIPLY", lw.outputs["Fresnel"], 0.45), 0.03)
    g = N.new("ShaderNodeBsdfGlossy", Color=(0.9, 0.9, 0.92, 1))
    N.link(N.math("ADD", 0.01, N.math("MULTIPLY", noise(N, P, 3.0), 0.03)), g.inputs["Roughness"])
    t = N.new("ShaderNodeBsdfTransparent", Color=(0.9, 0.9, 0.88, 1))
    df = N.new("ShaderNodeBsdfDiffuse", Color=(0.35, 0.33, 0.3, 1))
    m1 = N.new("ShaderNodeMixShader")
    N.link(dust, m1.inputs[0])
    N.link(t.outputs[0], m1.inputs[1])
    N.link(df.outputs[0], m1.inputs[2])
    mx = N.new("ShaderNodeMixShader")
    N.link(f, mx.inputs[0])
    N.link(m1.outputs[0], mx.inputs[1])
    N.link(g.outputs[0], mx.inputs[2])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mat_pbr(name, color, rough=0.5, metal=0.0, noise_amt=0.0, coat=0.0, bump=0.0, sheen=0.0):
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    p = S.principled(N, **{"Metallic": metal, "Coat Weight": coat, "Coat Roughness": 0.05, "Sheen Weight": sheen})
    col = lin(color) if isinstance(color, str) else color
    if noise_amt:
        n = noise(N, P, 6.0, 5.0)
        N.link(vm(N, "SCALE", col, scale=N.math("ADD", 1.0 - noise_amt, N.math("MULTIPLY", n, 2 * noise_amt))), p.inputs["Base Color"])
        N.link(N.math("ADD", rough * 0.8, N.math("MULTIPLY", n, rough * 0.4)), p.inputs["Roughness"])
    else:
        N.set(p.inputs["Base Color"], col)
        N.set(p.inputs["Roughness"], rough)
    if bump:
        b = N.new("ShaderNodeBump", Strength=bump, Distance=0.003)
        N.link(noise(N, P, 40.0, 4.0), b.inputs["Height"])
        N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_vitrolite(name="C_vitrolite"):
    """Verre opaque noir des devantures Art déco : poli, en plaques à joints fins."""
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    x, y, z = N.sep(P)
    jy = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", N.math("ADD", y, x), 0.6)), 0.015)
    jz = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", z, 0.38)), 0.02)
    j = N.math("MAXIMUM", jy, jz)
    n = noise(N, P, 1.5, 3.0)
    p = S.principled(N, **{"Coat Weight": 1.0, "Coat Roughness": 0.03})
    N.link(N.mix(j, vm(N, "SCALE", lin("#14161c"), scale=N.math("ADD", 0.7, N.math("MULTIPLY", n, 0.6))), (0.2, 0.19, 0.18, 1)), p.inputs["Base Color"])
    N.link(N.math("ADD", 0.12, N.math("MULTIPLY", j, 0.6)), p.inputs["Roughness"])
    b = N.new("ShaderNodeBump", Strength=0.3, Distance=0.002)
    N.link(N.math("SUBTRACT", 1.0, j), b.inputs["Height"])
    N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_terrazzo(name, c1, c2, checker=0.0):
    """Terrazzo poli (éclats de Voronoi), en damier si checker > 0 (taille de case en m)."""
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    vo = N.new("ShaderNodeTexVoronoi", Scale=60.0)
    N.link(P, vo.inputs["Vector"])
    chip = N.math("GREATER_THAN", N.sep(vo.outputs["Color"])[0], 0.8)
    if checker:
        x, y, z = N.sep(P)
        a = N.math("FLOORED_MODULO", N.math("ADD", N.math("FLOOR", N.math("DIVIDE", x, checker)), N.math("FLOOR", N.math("DIVIDE", y, checker))), 2.0)
        base = N.mix(a, lin(c1), lin(c2))
    else:
        base = lin(c1)
    col = N.mix(N.math("MULTIPLY", chip, 0.5), base, (0.55, 0.5, 0.45, 1))
    p = S.principled(N, Roughness=0.12)
    N.link(col, p.inputs["Base Color"])
    N.link(N.math("ADD", 0.08, N.math("MULTIPLY", noise(N, P, 2.0), 0.18)), p.inputs["Roughness"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_wood(name, color="#5b3824", stripe_axis=2, period=0.05):
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    c = N.sep(P)[stripe_axis]
    flute = N.math("ADD", 0.5, N.math("MULTIPLY", N.math("SINE", N.math("MULTIPLY", c, 2 * math.pi / period)), 0.5))
    n = noise(N, P, 3.0, 6.0, mapping=(1.0, 1.0, 12.0))
    p = S.principled(N, **{"Coat Weight": 0.4, "Coat Roughness": 0.15})
    N.link(vm(N, "SCALE", lin(color), scale=N.math("ADD", 0.6, N.math("MULTIPLY", n, 0.6))), p.inputs["Base Color"])
    N.set(p.inputs["Roughness"], 0.45)
    b = N.new("ShaderNodeBump", Strength=0.4, Distance=0.006)
    N.link(flute, b.inputs["Height"])
    N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_neon(name, color, strength):
    """Tube néon : cœur émissif, gaine de verre légèrement brillante."""
    m, N, out = S.material(name)
    e = N.new("ShaderNodeEmission", Color=lin(color), Strength=strength)
    N.link(e.outputs[0], out.inputs[0])
    return m


def mat_awning(name, c1, c2="#efe6d4", period=0.5):
    """Toile rayée, un peu translucide (la lumière de la salle passe au travers), plis."""
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    y = N.sep(P)[1]
    st = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", y, period)), 0.5)
    col = N.mix(st, lin(c1), lin(c2))
    n = noise(N, P, 5.0, 4.0)
    col = vm(N, "SCALE", col, scale=N.math("ADD", 0.8, N.math("MULTIPLY", n, 0.3)))
    p = S.principled(N, **{"Roughness": 0.75, "Sheen Weight": 0.3})
    N.link(col, p.inputs["Base Color"])
    tl = N.new("ShaderNodeBsdfTranslucent")
    N.link(col, tl.inputs["Color"])
    mx = N.new("ShaderNodeMixShader")
    N.set(mx.inputs[0], 0.35)
    N.link(p.outputs[0], mx.inputs[1])
    N.link(tl.outputs[0], mx.inputs[2])
    b = N.new("ShaderNodeBump", Strength=0.3, Distance=0.01)
    N.link(noise(N, P, 2.5, 2.0, mapping=(1.0, 3.0, 1.0)), b.inputs["Height"])
    N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(mx.outputs[0], out.inputs[0])
    return m


def mat_louvre(name, color, period=0.035, axis=2, metal=0.3):
    """Tôle à ailettes (climatiseurs, grilles) : rainures par bosselage."""
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    c = N.sep(P)[axis]
    g = N.math("LESS_THAN", N.math("FRACT", N.math("DIVIDE", c, period)), 0.5)
    n = noise(N, P, 4.0, 4.0)
    p = S.principled(N, Metallic=metal)
    N.link(vm(N, "SCALE", lin(color), scale=N.math("ADD", 0.55, N.math("MULTIPLY", n, 0.5))), p.inputs["Base Color"])
    N.link(N.math("ADD", 0.4, N.math("MULTIPLY", n, 0.3)), p.inputs["Roughness"])
    b = N.new("ShaderNodeBump", Strength=0.6, Distance=0.006)
    N.link(g, b.inputs["Height"])
    N.link(b.outputs["Normal"], p.inputs["Normal"])
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_glass(name, color, rough=0.05):
    m, N, out = S.material(name)
    p = S.principled(N, **{"Base Color": lin(color), "Roughness": rough, "Transmission Weight": 1.0, "IOR": 1.5})
    N.link(p.outputs[0], out.inputs[0])
    return m


def mat_roof(name="C_roof"):
    m, N, out = S.material(name)
    P = N.new("ShaderNodeTexCoord").outputs["Object"]
    n = noise(N, P, 0.4, 6.0)
    p = S.principled(N)
    N.link(N.ramp(n, [(0.3, lin("#3a3740")), (0.7, lin("#5c5761"))]), p.inputs["Base Color"])
    N.link(N.ramp(n, [(0.42, (0.15, 0.15, 0.15)), (0.55, (0.7, 0.7, 0.7))]), p.inputs["Roughness"])
    N.link(p.outputs[0], out.inputs[0])
    return m


# ---------------------------------------------------------------- carte d'usure

def _vnoise(rng, h, w, ch, cw):
    """Bruit de valeur lissé (cellules de ch × cw pixels)."""
    gh, gw = int(h / ch) + 3, int(w / cw) + 3
    g = rng.random((gh, gw), dtype=np.float32)
    yy = np.arange(h, dtype=np.float32) / ch
    xx = np.arange(w, dtype=np.float32) / cw
    iy, ix = yy.astype(np.int32), xx.astype(np.int32)
    fy, fx = yy - iy, xx - ix
    fy, fx = (fy * fy * (3 - 2 * fy))[:, None], (fx * fx * (3 - 2 * fx))[None, :]
    top = g[iy][:, ix] * (1 - fx) + g[iy][:, ix + 1] * fx
    bot = g[iy + 1][:, ix] * (1 - fx) + g[iy + 1][:, ix + 1] * fx
    return top * (1 - fy) + bot * fy


def _fbm(rng, h, w, cell, octaves=4):
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for k in range(octaves):
        c = max(1.5, cell / 2 ** k)
        out += amp * _vnoise(rng, h, w, c, c)
        tot += amp
        amp *= 0.5
    return out / tot


class Weather:
    """La carte d'usure d'une façade, dans son plan déplié (u = y le long du mur, arrondi d'angle
    déplié ; v = z). R : coulures et crasse ; G : reprises de peinture (0,5 neutre) ;
    B : épaufrures ; A : fissures. On y inscrit appuis, bandeaux, baies et descentes d'eau
    pendant la construction, puis bake() dessine tout d'un coup."""

    def __init__(self, name, y0, y1, z0, z1, px=0.0125, seed=11, W_build=0.0):
        self.W_build = W_build
        self.y0, self.z0, self.px = y0, z0, px
        self.nx, self.nz = int(round((y1 - y0) / px)), int(round((z1 - z0) / px))
        self.W, self.H = self.nx * px, self.nz * px
        self.ledges, self.openings, self.pipes, self.arrises = [], [], [], []
        self.rng = np.random.default_rng(seed)
        self.image = bpy.data.images.new(name, self.nx, self.nz, alpha=True, float_buffer=False)
        self.image.colorspace_settings.name = "Non-Color"
        self.image.alpha_mode = "CHANNEL_PACKED"

    def ledge(self, ya, yb, z, s=1.0):
        self.ledges.append((ya, yb, z, s))

    def opening(self, ya, yb, za, zb):
        self.openings.append((ya, yb, za, zb))

    def c(self, y):
        return int(np.clip((y - self.y0) / self.px, 0, self.nx))

    def r(self, z):
        return int(np.clip((z - self.z0) / self.px, 0, self.nz))

    def bake(self):
        h, w, px, rng = self.nz, self.nx, self.px, self.rng
        Z = (np.arange(h, dtype=np.float32) * px + self.z0)[:, None]
        Y = (np.arange(w, dtype=np.float32) * px + self.y0)[None, :]
        dirt = np.zeros((h, w), np.float32)

        def scr(a, b):
            return 1 - (1 - a) * (1 - b)
        # coulures sous chaque appui, bandeau, climatiseur
        for (ya, yb, zl, s) in self.ledges:
            L = yb - ya
            r0, r1, c0, c1 = self.r(zl - 0.16), self.r(zl), self.c(ya + 0.02), self.c(yb - 0.02)
            if r1 > r0 and c1 > c0:
                dz = (zl - Z[r0:r1]) / 0.16
                dirt[r0:r1, c0:c1] = scr(dirt[r0:r1, c0:c1], (1 - dz) ** 2 * 0.3 * min(s, 1.2))
            centers = [(ya + rng.uniform(0.02, 0.14), True), (yb - rng.uniform(0.02, 0.14), True)]
            centers += [(y, False) for y in rng.uniform(ya + 0.08, yb - 0.08, size=max(0, int(L / 0.28)))]
            for yc, end in centers:
                ln = rng.uniform(0.45, 1.9) * (1.25 if end else 0.75) * min(1.5, s) ** 0.5
                a = rng.uniform(0.4, 1.0) * (1.45 if end else 0.8) * min(s, 1.3)
                wd = rng.uniform(0.018, 0.07) * (1.4 if end else 1.0)
                r0, r1 = self.r(zl - ln), self.r(zl)
                c0, c1 = self.c(yc - 5 * wd - 0.05), self.c(yc + 5 * wd + 0.05)
                if r1 <= r0 or c1 <= c0:
                    continue
                zz, yy = Z[r0:r1], Y[:, c0:c1]
                dd = np.clip((zl - zz) / ln, 0, 1)
                sig = wd * (0.5 + 0.9 * dd)
                wig = 0.012 * np.sin(zz * rng.uniform(2, 6) + rng.uniform(0, 6.3))
                val = a * (1 - dd) ** 1.4 * np.exp(-((yy - yc - wig) / sig) ** 2)
                dirt[r0:r1, c0:c1] = scr(dirt[r0:r1, c0:c1], val)
        # la coulure a un grain vertical
        vstreak = _vnoise(rng, h, w, 1.1 / px, 0.035 / px)
        dirt *= 0.5 + 0.9 * vstreak
        # descentes d'eau : une traînée sombre de haut en bas
        for yp in self.pipes:
            dirt = scr(dirt, 0.4 * np.exp(-((Y - yp) / 0.13) ** 2) * (0.4 + 0.9 * vstreak))
        # soubassement : éclaboussures jusqu'à 0,8 à 1,4 m, lisière irrégulière
        edge = 0.8 + 0.6 * _vnoise(rng, 1, w, 1, 0.7 / px)[0]
        fine = _fbm(rng, h, w, 0.05 / px, 3)
        pl = np.clip(1 - Z / edge[None, :], 0, 1) ** 0.7 * (0.25 + 0.45 * fine)
        dirt = scr(dirt, pl)
        # crasse générale très douce, plus forte sous l'acrotère (lavage de la pluie)
        low = _fbm(rng, h, w, 2.5 / px, 4)
        dirt = scr(dirt, 0.1 * low)
        dirt = np.clip(dirt, 0, 1)
        # reprises de peinture : plaques rectangulaires de teinte voisine + dérive lente
        G = 0.5 + 0.25 * (low - 0.5)
        for _ in range(int(8 + self.W * 0.9)):
            yy0 = rng.uniform(self.y0, self.y0 + self.W - 1)
            zz0 = rng.uniform(0.2, self.H - 2.0)
            c0, c1 = self.c(yy0), self.c(yy0 + rng.uniform(0.8, 4.5))
            r0, r1 = self.r(zz0), self.r(zz0 + rng.uniform(0.6, 3.0))
            G[r0:r1, c0:c1] += rng.uniform(-0.17, 0.17)
        for (ya, yb, za, zb) in self.openings:
            if rng.random() < 0.3:
                m = rng.uniform(0.1, 0.4)
                G[self.r(za - m):self.r(zb + m), self.c(ya - m):self.c(yb + m)] += rng.uniform(0.04, 0.1)
        # épaufrures le long des arêtes des baies, des pilastres, du soubassement
        chipn = _vnoise(rng, h, w, 0.025 / px, 0.025 / px)
        zone = np.zeros((h, w), np.float32)
        b = 0.035
        for (ya, yb, za, zb) in self.openings:
            r0, r1, c0, c1 = self.r(za - b), self.r(zb + b), self.c(ya - b), self.c(yb + b)
            zone[r0:r1, c0:c1] = 1.0
            ri0, ri1, ci0, ci1 = self.r(za + 0.01), self.r(zb - 0.01), self.c(ya + 0.01), self.c(yb - 0.01)
            zone[ri0:ri1, ci0:ci1] = 0.0
        for ya in self.arrises:
            zone[:, self.c(ya - b):self.c(ya + b)] = 1.0
        zone = np.maximum(zone, (Z < 1.3).astype(np.float32) * 0.5)
        B = zone * np.clip((chipn - 0.66) * 8, 0, 1)
        B = np.maximum(B, np.clip((chipn - 0.9) * 10, 0, 1) * (Z < 3.0) * 0.7)
        # fissures fines depuis les angles des baies
        A = np.zeros((h, w), np.float32)
        for (ya, yb, za, zb) in self.openings:
            for (cy, cz, sy, sz) in ((ya, zb, -1, 1), (yb, zb, 1, 1), (ya, za, -1, -1), (yb, za, 1, -1)):
                if rng.random() > 0.18:
                    continue
                ang = math.atan2(sz, sy) + rng.uniform(-0.35, 0.35)
                py, pz = cy, cz
                for _ in range(int(rng.uniform(0.25, 1.1) / (px * 0.7))):
                    ang += rng.normal(0, 0.18)
                    py += math.cos(ang) * px * 0.7
                    pz += math.sin(ang) * px * 0.7
                    rr, cc = self.r(pz), self.c(py)
                    if 0 < rr < h - 1 and 0 < cc < w - 1:
                        A[rr, cc] = 1.0
                        pass
        rgba = np.stack([dirt, np.clip(G, 0, 1), np.clip(B, 0, 1), A], axis=-1).astype(np.float32)
        self.image.pixels.foreach_set(rgba.ravel())
        self.image.update()
        self.image.pack()
        return rgba


# ---------------------------------------------------------------- les huit dessins

FH = 3.2       # hauteur d'un étage courant (celle de scene_a)
REV = 0.24     # profondeur des tableaux des fenêtres
SW = 0.15      # dessus du trottoir
TX = 0.4       # saillie des tours à ailettes

# ce qui distingue chaque dessin, au-delà de la spec de scene_a ; mots d'enseigne neutres, inventés
DESIGN = {
    "deco": dict(style="transom", fin="mid", blade="PALMS", neon="neon_coral", lines=True,
                 shops=[("bar", "COCKTAILS"), ("cafe", "CAFE"), ("surf", "SURF SHOP"), ("store", "BOOKS")],
                 awn=["#ff6a3d", "#2f6f6a"]),
    "hotel": dict(style="transom", fin="lobby", blade="HOTEL", canopy="OCEAN", vacancy=True, neon="neon_coral",
                  lines=True, shops=[("bar", "BAR"), ("lobby", None), ("surf", "SURF SHOP")], awn=["#b84a62"]),
    "shop": dict(style="transom", roof_word="SURF", roof_mat="letter_coral",
                 shops=[("surf", "SURF SHOP"), ("cafe", "CAFE"), ("store", "RECORDS")], awn=["#c79a3a", "#3a4a8a"]),
    "liner": dict(style="bars", canopy="BREEZE", lines=True,
                  shops=[("cafe", "CAFE"), ("store", "DELI"), ("lobby", None), ("bar", "BAR"), ("surf", "SURF")],
                  awn=["#2f6f6a"]),
    "flats": dict(style="bars", entry="1120"),
    "motel": dict(style="plain"),
    "tower": dict(style="bars", fin="lobby", canopy="HORIZON",
                  shops=[("store", "GIFTS"), ("lobby", None), ("cafe", "CAFE"), ("bar", "BAR")], awn=["#3a4a8a"]),
    "block": dict(style="band", roof_word="DINER", roof_mat="neon_mint", neon="neon_lilac", lines=True,
                  shops=[("cafe", "CAFE"), ("store", "BOOKS"), ("bar", "BAR"), ("surf", "SURF"), ("store", "RECORDS"),
                         ("cafe", "ICE CREAM")], awn=["#ff6a3d", "#c79a3a"]),
}

_SH = {}


def _safe(fn, *a, **k):
    """Un matériau qui plante ne coûte pas l'immeuble : repli gris, trace dans le journal."""
    try:
        return fn(*a, **k)
    except Exception:
        traceback.print_exc()
        return S.mat_plain("P_fallback", (0.5, 0.5, 0.5, 1), 0.5)


def shared():
    """Les matériaux communs aux huit dessins, créés une fois."""
    if _SH:
        return _SH
    f = _safe
    _SH.update(
        vitro=f(mat_vitrolite, "P_vitrolite"),
        frame_w=f(mat_pbr, "P_frame_w", "#e6dfd0", 0.42, 0.1, noise_amt=0.12),
        frame_b=f(mat_pbr, "P_frame_b", "#4a3526", 0.32, 0.85, noise_amt=0.15),
        bronze=f(mat_pbr, "P_bronze", "#4a3526", 0.32, 0.85, noise_amt=0.15),
        brass=f(mat_pbr, "P_brass", "#c79a52", 0.25, 1.0),
        steel=f(mat_pbr, "P_steel", "#b8b8bc", 0.25, 1.0),
        room=f(mat_room_glass, "P_room_glass", gain=3.5),
        porthole=f(mat_room_glass, "P_porthole_glass", gain=1.3),
        shop=f(mat_shop_glass, "P_shop_glass"),
        case=f(mat_glass, "P_case_glass", "#eef2ec", 0.02),
        roof=f(mat_roof, "P_roof"),
        metal=f(mat_pbr, "P_metal", "#2a2a2e", 0.45, 0.8, noise_amt=0.2),
        pipe=f(mat_pbr, "P_pipe", "#bdb5a8", 0.5, 0.3, noise_amt=0.3),
        ac=f(mat_louvre, "P_ac", "#d8d2c4", 0.03, 2, 0.3),
        grille=f(mat_louvre, "P_grille", "#5a5650", 0.025, 2, 0.6),
        # néons : couleurs saturées, puissance modérée, pour qu'AgX ne les blanchisse pas
        neon_coral=f(mat_neon, "P_neon_coral", S.CORAL, 6),
        neon_lilac=f(mat_neon, "P_neon_lilac", "#7a5cff", 3.2),
        neon_amber=f(mat_neon, "P_neon_amber", S.AMBER, 7),
        neon_mint=f(mat_neon, "P_neon_mint", "#3fe0b0", 4),
        letter_coral=f(mat_neon, "P_letter_coral", "#ff7448", 6),
        letter_cream=f(mat_neon, "P_letter_cream", S.CREAM, 6),
        bulb=f(mat_neon, "P_bulb", "#ffd08a", 30),
        sconce=f(mat_neon, "P_sconce", "#ffe6bf", 9),
        down=f(mat_neon, "P_downlight", "#fff1d6", 20),
        menu=f(mat_neon, "P_menu", "#f3e7c9", 1.5),
        sign_panel=f(mat_pbr, "P_sign_panel", "#efe6d2", 0.5, noise_amt=0.15),
        sign_dark=f(mat_pbr, "P_sign_dark", "#2b2030", 0.5, 0.2, noise_amt=0.15),
        checker=f(mat_terrazzo, "P_bar_floor", "#1d1b1e", "#e8dfcc", checker=0.45),
        terrazzo=f(mat_terrazzo, "P_lobby_floor", "#d9cbb3", "#d9cbb3"),
        tile=f(mat_terrazzo, "P_cafe_floor", "#e9e1d0", "#3d6b62", checker=0.3),
        oak=f(mat_wood, "P_oak", "#8a5a36", 1, 0.5),
        walnut=f(mat_wood, "P_walnut", "#4a2c1c", 1, 0.06),
        plum=f(mat_pbr, "P_plum_wall", "#74405a", 0.8, noise_amt=0.15, sheen=0.5),
        ceiling=f(mat_pbr, "P_ceiling", "#3a2a24", 0.7, noise_amt=0.1),
        cream_wall=f(mat_pbr, "P_cream_wall", "#e9dcc4", 0.8, noise_amt=0.1),
        mint_wall=f(mat_pbr, "P_mint_wall", "#bfe0cf", 0.8, noise_amt=0.1),
        rose_wall=f(mat_pbr, "P_rose_wall", "#e6b4a8", 0.8, noise_amt=0.1),
        blue_wall=f(mat_pbr, "P_blue_wall", "#a9bcdc", 0.8, noise_amt=0.1),
        marble=f(mat_pbr, "P_marble", "#ece4d6", 0.15, noise_amt=0.15, coat=0.5),
        mirror=f(mat_pbr, "P_mirror", "#b89a7a", 0.06, 1.0),
        bottles=[f(mat_glass, f"P_bottle_{i}", c) for i, c in enumerate(("#c47a2a", "#3f7a4a", "#e8efe6", "#8a2f3a", "#d9b44a"))],
        globe=f(mat_neon, "P_globe", "#ffc070", 16),
        cove=f(mat_neon, "P_cove", "#ffb860", 10),
        leather=f(mat_pbr, "P_leather", "#7a2e3a", 0.45, coat=0.3),
        chair=f(mat_pbr, "P_chair", "#1c1c20", 0.35, 0.9),
        boards=[f(mat_pbr, f"P_board_{i}", c, 0.2, coat=1.0) for i, c in enumerate((S.CORAL, "#8d8cf0", "#f3e7c9", "#9fd8c8", "#f2b8c6"))],
        goods=[f(mat_pbr, f"P_goods_{i}", c, 0.7) for i, c in enumerate(("#e7d3b0", "#9fd8c8", "#f2a07a", "#7c86c9", "#efefe8", "#2f3a55"))],
        pastry=[f(mat_pbr, f"P_pastry_{i}", c, 0.6) for i, c in enumerate(("#c98a4a", "#f2d7a0", "#e8a0a8"))],
        doors=[f(mat_pbr, f"P_door_{i}", c, 0.4, coat=0.4) for i, c in enumerate(("#2f6f6a", "#ff6a3d", "#f4e6b8", "#3a4a8a", "#9fd8c8"))],
        pot=f(mat_pbr, "P_pot", "#d9cfc0", 0.8, noise_amt=0.25),
        leaf=f(mat_pbr, "P_leaf", "#2f4a2a", 0.5, noise_amt=0.3, sheen=0.3),
        soil=f(mat_pbr, "P_soil", "#2a1f18", 0.95),
    )
    return _SH


def design_mats(key, wx, corners, awn):
    """Les matériaux d'un dessin : les communs, plus l'enduit, les moulures et l'accent sous sa carte d'usure."""
    M = dict(shared())
    M["stucco"] = _safe(mat_stucco, f"P_{key}_stucco", wx, "wall", corners)
    M["trim"] = _safe(mat_stucco, f"P_{key}_trim", wx, "trim", corners, rough=0.7)
    M["accent"] = _safe(mat_stucco, f"P_{key}_accent", wx, "accent", corners, rough=0.75)
    out = []
    for c in (awn or [S.CORAL]):
        k = "awning_" + c
        if k not in _SH:
            _SH[k] = _safe(mat_awning, f"P_awning_{c[1:]}", c)
        out.append(_SH[k])
    M["awnings"] = out
    return M


class Bld:
    """Un immeuble d'après sa spec scene_a, dans son repère (façade x = 0 vers +x, y de 0 à W)."""

    def __init__(self, key, spec):
        p = dict(sill=0.9, wh=1.6, frame="frame_w", rail="frame_w", gf_h=4.2, gf="shops", nshops=4, floors=4,
                 r=3.0, ct=4.5, round_near=False, round_far=False, bay=3.0, balc="none")
        p.update(spec)
        self.key, self.p = key, p
        self.d = DESIGN.get(key, dict(style="bars"))
        self.rng = random.Random(sum((i + 1) * ord(c) for i, c in enumerate(key)))
        self.W, self.D = float(p["W"]), float(p["D"])
        self.gf_h, self.nfl = float(p["gf_h"]), int(p["floors"])
        self.r = float(p["r"])
        self.rn, self.rf = bool(p["round_near"]), bool(p["round_far"])
        self.yw0 = self.r if self.rn else 0.0
        self.yw1 = self.W - self.r if self.rf else self.W
        self.ya = p["ct"] if self.rn else 0.3
        self.yb = self.W - p["ct"] if self.rf else self.W - 0.3
        self.sb_n, self.sb = p.get("setback", (0, 0.0))
        self.main_top = self.gf_h + (self.nfl - 1 - self.sb_n) * FH
        self.tops = self.gf_h + (self.nfl - 1) * FH
        self.para = self.main_top + 0.9
        self.ttop = self.para + 1.0
        self.shops = p["gf"] == "shops"
        self.fin = None
        fin = self.d.get("fin")
        if fin == "lobby" and self.shops and p.get("lobby_bay") is not None:
            self.fin = self.ya + (p["lobby_bay"] + 0.5) * (self.yb - self.ya) / p["nshops"]
        elif fin:
            self.fin = self.W / 2
        xlim = max(self.r if (self.rn or self.rf) else 1.0, self.sb + 0.5 if self.sb_n else 0.0)
        top = max(self.tops + 1.2, self.ttop + 2.2 if self.fin is not None else 0.0)
        y0 = -0.62 * self.r - 0.3 if self.rn else -0.3
        y1 = self.W + 0.62 * self.r + 0.3 if self.rf else self.W + 0.3
        self.wx = Weather(f"P_{key}_weather", y0, y1, 0.0, top, px=0.022, seed=11 + 7 * len(key) + ord(key[0]), W_build=self.W)
        rc = self.r if (self.rn or self.rf) else 0.0
        self.M = design_mats(key, self.wx, (rc, self.rn, self.rf, xlim), self.d.get("awn"))
        self.G = dict(wall=MB(f"P_{key}_wall", 0.025, 2), trim=MB(f"P_{key}_trim", 0.02, 2),
                      fine=MB(f"P_{key}_fine", 0.006, 1), plain=MB(f"P_{key}_plain"))
        self.frame = self.M.get(p["frame"], self.M["frame_w"])
        self.rail = self.M.get(p["rail"], self.M["frame_w"])
        self.extra, self.props, self.lights, self.ops, self.bays = [], [], [], [], []

    # ------------------------------------------------------------ outils
    def zf(self, f):
        return self.gf_h + (f - 1) * FH

    def upper(self):
        """Les étages courants hors retrait."""
        return [f for f in range(1, self.nfl) if f < self.nfl - self.sb_n]

    def u_near(self, ang):
        return self.r + math.radians(ang) * self.r

    def u_far(self, ang):
        return self.W - self.r + math.radians(ang) * self.r

    def front_spans(self, cut_fin=True):
        a0 = self.yw0 if self.rn else 0.0
        a1 = self.yw1 if self.rf else self.W
        if cut_fin and self.fin is not None:
            return [(a0, self.fin - 2.0), (self.fin + 2.0, a1)]
        return [(a0, a1)]

    def fnw(self, wall):
        """Le repère d'un mur : (fn(u, z, d), normale)."""
        if wall == "main":
            return (lambda u, z, d: (-d, u, z)), (1, 0, 0)
        if wall == "sb":
            x = -self.sb
            return (lambda u, z, d: (x - d, u, z)), (1, 0, 0)
        if wall == "tower":
            return (lambda u, z, d: (TX - d, u, z)), (1, 0, 0)
        if wall == "side0":
            return (lambda u, z, d: (u, d, z)), (0, -1, 0)
        W = self.W
        return (lambda u, z, d: (u, W - d, z)), (0, 1, 0)

    def gbox(self, g, fn, ua, ub, za, zb, da, db, mat):
        p0, p1 = fn(ua, za, da), fn(ub, zb, db)
        g.box(p0[0], p1[0], p0[1], p1[1], p0[2], p1[2], mat)

    def spot(self, loc, color, energy, direction=(0, 0, -1), cone=60.0):
        self.lights.append(("light", tuple(loc), dict(kind="SPOT", direction=tuple(direction), color=color,
                                                      energy=float(energy), size=(0.1, 0.1), spot=float(cone))))

    def tube(self, paths, r, mat, name="tube"):
        self.extra.append(tube(paths, r, mat, f"P_{self.key}_{name}"))

    def text(self, *a, **k):
        self.extra.append(text(*a, **k))

    # ------------------------------------------------------------ le plan des baies
    def layout(self):
        p, ops = self.p, self.ops
        bay = p.get("bay", 3.0)
        self.pier = pier = 0.5 if bay >= 3.8 else 0.9
        sill, wh = p["sill"], p["wh"]
        style = self.d.get("style", "bars")

        def cols(a, b, n=None):
            n = n or max(1, int(round((b - a) / bay)))
            cw = (b - a) / n
            return [(a + k * cw + pier / 2, a + (k + 1) * cw - pier / 2) for k in range(n)], [a + k * cw for k in range(n + 1)]
        if self.fin is not None:
            segs = [s for s in ((self.ya, self.fin - 2.3), (self.fin + 2.3, self.yb)) if s[1] - s[0] > 1.8]
        else:
            segs = [(self.ya, self.yb)]
        self.cols, self.piers = [], []
        for a, b in segs:
            c, pr = cols(a, b, p.get("ncol") if len(segs) == 1 else None)
            self.cols += c
            self.piers += pr
        self.cols_sb = cols(0.6, self.W - 0.6)[0] if self.sb_n else []
        doors = set(p.get("doors", ()))
        gallery = bool(p.get("gallery"))

        def add(wall, a, b, za, zb, kind, zfl, st=style, d=REV, f=0, k=0):
            ops.append(dict(wall=wall, ua=a, ub=b, za=za, zb=zb, d=d, kind=kind, zfl=zfl, style=st, f=f, k=k))

        def motel_bay(a, b, zfl, f, k):
            add("main", a, a + 1.0, max(zfl + 0.06, SW), zfl + 2.2, "door", zfl, "plain", f=f, k=k)
            add("main", a + 1.35, b, zfl + sill, zfl + sill + wh, "win", zfl, "plain", f=f, k=k)
        # étages courants
        for f in range(1, self.nfl):
            zf = self.zf(f)
            sb = f >= self.nfl - self.sb_n
            row = self.cols_sb if sb else self.cols
            n = len(row)
            for k, (a, b) in enumerate(row):
                bal = p["balc"]
                isb = (bal == "all") or (bal == "alt" and (k + f) % 2 == 0) or (bal == "ends" and k in (0, n - 1))
                if sb or (gallery and f == 1):
                    isb = False
                if gallery and f == 1 and k in doors:
                    motel_bay(a, b, zf, f, k)
                elif isb:
                    add("sb" if sb else "main", a, b, zf + 0.06, zf + sill + wh, "balc", zf, f=f, k=k)
                else:
                    add("sb" if sb else "main", a, b, zf + sill, zf + sill + wh, "win", zf, f=f, k=k)
            if self.fin is not None and not sb:
                tc = self.fin
                for k, (a, b) in enumerate(((tc - 1.4, tc - 0.22), (tc + 0.22, tc + 1.4))):
                    add("tower", a, b, zf + 0.55, zf + 2.6, "win", zf, "tall", f=f, k=k)
        # rez-de-chaussée
        if self.shops:
            n = p["nshops"]
            cw = (self.yb - self.ya) / n
            types = self.d.get("shops") or []
            for k in range(n):
                a, b = self.ya + k * cw + 0.3, self.ya + (k + 1) * cw - 0.3
                lob = k == p.get("lobby_bay")
                t, word = types[k % len(types)] if types else (("cafe", "store", "bar", "surf")[k % 4], None)
                if lob:
                    t, word = "lobby", None
                elif t == "lobby":
                    t = "store"
                self.bays.append((a, b, t, word))
                add("main", a, b, SW, 3.65 if lob else 3.5, "shop", SW, d=0.35 if lob else 0.3, k=k)
        else:
            zg = self.gf_h - FH
            n = len(self.cols)
            for k, (a, b) in enumerate(self.cols):
                if gallery and k in doors:
                    motel_bay(a, b, zg, 0, k)
                elif self.d.get("entry") and k == n // 2:
                    c = (a + b) / 2
                    add("main", c - 0.8, c + 0.8, SW, zg + sill + wh, "entry", SW, d=0.35, k=k)
                else:
                    za = zg + sill + (0.1 if zg > 0.5 else 0.0)
                    add("main", a, b, za, za + wh, "win", max(zg, SW), k=k)
        # fenêtres des pignons : trois au plus par étage, côté avenue
        for side in (0, 1):
            rnd = self.rn if side == 0 else self.rf
            xe = -(self.r if rnd else 0.0) - 0.8
            xs = -self.D + 0.8
            nn = min(3, int((xe - xs) / 3.0))
            for f in self.upper():
                zf = self.zf(f)
                for i in range(nn):
                    c = xe - 1.0 - i * 3.0
                    add(f"side{side}", c - 0.6, c + 0.6, zf + sill, zf + sill + min(wh, 1.45), "win", zf, "plain", f=f, k=i)

    # ------------------------------------------------------------ le gros œuvre
    def body(self):
        G, M = self.G, self.M
        st, rf = M["stucco"], M["roof"]
        pl = G["plain"]
        D, W = self.D, self.W
        y0 = self.r if self.rn else 0.3
        y1 = W - self.r if self.rf else W - 0.3
        zl = self.gf_h - 0.25 if self.shops else 0.0
        pl.box(-D + 0.3, -0.3, y0, y1, zl, self.main_top - 0.2, st)
        pl.box(-D + 0.3, -0.3, y0, y1, self.main_top - 0.2, self.main_top, rf)
        if self.shops:
            pl.box(-D + 0.3, -6.8, y0, y1, 0.0, zl, st)
        for near in (True, False):
            if not (self.rn if near else self.rf):
                continue
            a, b = (0.3, self.r) if near else (W - self.r, W - 0.3)
            pl.box(-D + 0.3, -self.r, a, b, 0.0, self.main_top, st, mats={"+z": rf})
            cy = self.r if near else W - self.r
            arc = arc_pts(-self.r, cy, self.r, -90, 0, 32) if near else arc_pts(-self.r, cy, self.r, 0, 90, 32)
            G["wall"].prism([(-self.r, cy)] + arc, 0.0, self.para, st)
        pl.box(-D, -D + 0.3, 0.0, W, 0.0, self.tops + 0.9 if self.sb_n else self.para, st)
        # faces intérieures de l'acrotère (vues du drone)
        pl.box(-0.35, -0.25, self.yw0, self.yw1, self.main_top, self.para, st, faces=("-x",))
        pl.box(-D, -0.35, 0.2, 0.3, self.main_top, self.para, st, faces=("+y",))
        pl.box(-D, -0.35, W - 0.3, W - 0.2, self.main_top, self.para, st, faces=("-y",))
        if self.sb_n:
            sb = self.sb
            pl.box(-D + 0.3, -sb - 0.3, 0.3, W - 0.3, self.main_top, self.tops - 0.2, st)
            pl.box(-D + 0.3, -sb - 0.3, 0.3, W - 0.3, self.tops - 0.2, self.tops, rf)
            for a, b in ((0.0, 0.3), (W - 0.3, W)):
                G["wall"].box(-D, -sb, a, b, self.main_top, self.tops + 0.9, st)

    def facade(self):
        G, M, wx = self.G, self.M, self.wx
        st = M["stucco"]
        H = {}
        for o in self.ops:
            H.setdefault(o["wall"], []).append((o["ua"], o["ub"], o["za"], o["zb"], o["d"]))
            if o["wall"] in ("main", "sb", "tower"):
                wx.opening(o["ua"], o["ub"], o["za"], o["zb"])
        G["wall"].wall(0.0, self.yw0, self.yw1, 0.0, self.para, H.get("main", []), st, rim=("top",), rim_d=0.35)
        if self.sb_n:
            G["wall"].wall(-self.sb, 0.3, self.W - 0.3, self.main_top, self.tops + 0.9, H.get("sb", []), st, rim=("top",), rim_d=0.3)
        for side in (0, 1):
            rnd = self.rn if side == 0 else self.rf
            fn, nrm = self.fnw(f"side{side}")
            G["wall"].wallg(fn, nrm, (1, 0, 0), -self.D, -self.r if rnd else 0.0, 0.0, self.para,
                            H.get(f"side{side}", []), st, rim=("top",), rim_d=0.3)
        wx.arrises += [self.yw0 + 0.02, self.yw1 - 0.02]

    # ------------------------------------------------------------ fenêtres, portes, balcons
    def window(self, fn, nrm, ua, ub, za, zb, zfl, style, door=False, front=True):
        G, M, rng = self.G, self.M, self.rng
        if not door:
            self.gbox(G["trim"], fn, ua - 0.07, ub + 0.07, za - 0.06, za + 0.004, -0.07, 0.03, M["trim"])
            if front:
                self.wx.ledge(ua - 0.07, ub + 0.07, za - 0.06, 1.0)
        fr, fm = self.frame, G["fine"]
        d0, d1 = REV - 0.09, REV - 0.02

        def b(u0, u1, z0, z1, e0=0.0, e1=0.0):
            self.gbox(fm, fn, u0, u1, z0, z1, d0 + e0, d1 + e1, fr)
        b(ua, ub, za, za + 0.06)
        b(ua, ub, zb - 0.06, zb)
        b(ua, ua + 0.05, za, zb)
        b(ub - 0.05, ub, za, zb)
        wd = ub - ua
        if style == "band":
            n = max(1, int(round(wd / 1.25)))
            for i in range(1, n):
                um = ua + wd * i / n
                b(um - 0.03, um + 0.03, za, zb)
            zt = za + (zb - za) * 0.7
            b(ua, ub, zt - 0.025, zt + 0.025, 0.01, -0.01)
        else:
            if wd > 1.5 or style == "tall" or door:
                um = (ua + ub) / 2
                b(um - 0.03, um + 0.03, za, zb)
            if style == "transom" or door:
                zt = za + (zb - za) * (0.8 if door else 0.72)
                b(ua, ub, zt - 0.025, zt + 0.025, 0.01, -0.01)
            elif style in ("bars", "tall"):
                for q in ((0.3, 0.55, 0.8) if style == "bars" else (0.33, 0.66)):
                    zt = za + (zb - za) * q
                    b(ua, ub, zt - 0.016, zt + 0.016, 0.02, -0.015)
        if door:
            b(ua, ub, za, za + 0.45)
        dg = REV - 0.05
        bf = rng.choice([0, 0, 0, 0.25, 0.4, 0.55, 0.7, 0.85, 0.97])
        if 0 < bf < 0.9:
            bf += rng.uniform(-0.06, 0.06)
        ck = rng.choice([0, 0, 0, 0.6, 0.6, 0.9]) if front else 0.0
        p0, p1 = fn(ua - 0.8, zfl + 0.02, dg - 0.01), fn(ub + 0.8, zfl + 2.95, dg + 3.8)
        lo = tuple(min(s, t) for s, t in zip(p0, p1))
        hi = tuple(max(s, t) for s, t in zip(p0, p1))
        attrs = dict(rlo=lo, rhi=hi, wz=(za, zb, bf), wy=(ua, ub, ck) if front else (0.0, 1.0, 0.0), rseed=rng.random() * 100)
        G["plain"].quad([fn(ua, za, dg), fn(ub, za, dg), fn(ub, zb, dg), fn(ua, zb, dg)], M["room"], nrm, attrs)

    def aircon(self, xf, yc, ztop):
        G, M = self.G, self.M
        zb = ztop - 0.44
        G["trim"].box(xf - 0.05, xf + 0.48, yc - 0.33, yc + 0.33, zb, ztop, M["ac"])
        G["fine"].box(xf + 0.48, xf + 0.49, yc - 0.28, yc + 0.28, zb + 0.05, ztop - 0.05, M["grille"])
        for s in (-1, 1):
            G["fine"].box(xf, xf + 0.42, yc + s * 0.29 - 0.015, yc + s * 0.29 + 0.015, zb - 0.05, zb, M["metal"])
            G["fine"].cyl((xf + 0.01, yc + s * 0.29, zb - 0.4), (xf + 0.4, yc + s * 0.29, zb - 0.04), 0.012, M["metal"], seg=6)
        G["fine"].cyl((xf + 0.3, yc + 0.22, zb), (xf + 0.33, yc + 0.25, zb - 0.22), 0.008, M["pipe"], seg=6)
        self.wx.ledge(yc - 0.33, yc + 0.33, zb, 1.5)

    def balcony(self, xf, a, b, zf):
        """Dalle et garde-corps marin à trois lisses, poteaux ronds, retours contre le mur."""
        G, M = self.G, self.M
        dep = 1.15
        G["trim"].box(xf - 0.05, xf + dep, a, b, zf - 0.2, zf + 0.03, M["trim"])
        self.wx.ledge(a, b, zf - 0.2, 1.1)
        rl, fm = self.rail, G["fine"]
        xr = xf + dep - 0.08
        for zr in (0.38, 0.68, 1.0):
            fm.cyl((xr, a + 0.05, zf + zr), (xr, b - 0.05, zf + zr), 0.022, rl, seg=8)
            for ye in (a + 0.05, b - 0.05):
                fm.cyl((xf + 0.02, ye, zf + zr), (xr, ye, zf + zr), 0.02, rl, seg=8)
        n = max(1, int((b - a) / 1.1))
        for k in range(n + 1):
            yk = a + 0.05 + (b - a - 0.1) * k / n
            fm.cyl((xr, yk, zf + 0.03), (xr, yk, zf + 1.02), 0.024, rl, seg=8)

    def door(self, fn, o):
        """Porte de chambre de motel : vantail peint en retrait, chambranle, poignée, applique."""
        G, M = self.G, self.M
        ua, ub, za, zb = o["ua"], o["ub"], o["za"], o["zb"]
        mat = M["doors"][(o["k"] + o["f"]) % len(M["doors"])]
        self.gbox(G["fine"], fn, ua, ub, za, zb, 0.16, 0.21, mat)
        for (u0, u1, z0, z1) in ((ua - 0.08, ua, za, zb + 0.08), (ub, ub + 0.08, za, zb + 0.08), (ua, ub, zb, zb + 0.08)):
            self.gbox(G["trim"], fn, u0, u1, z0, z1, -0.03, 0.02, M["trim"])
        p0, p1 = fn(ub - 0.12, za + 1.0, 0.16), fn(ub - 0.12, za + 1.0, 0.1)
        G["fine"].cyl(p0, p1, 0.025, M["brass"], seg=8)
        q0, q1 = fn(ub + 0.32, za + 1.85, 0.0), fn(ub + 0.32, za + 1.85, -0.08)
        G["plain"].cyl(q0, q1, 0.07, M["sconce"], seg=12)

    def entry(self, o):
        """L'entrée des appartements : porte vitrée à imposte, marches, petite marquise numérotée."""
        G, M = self.G, self.M
        ua, ub, za, zb = o["ua"], o["ub"], o["za"], o["zb"]
        c = (ua + ub) / 2
        fn, nrm = self.fnw("main")
        fr, fm = self.frame, G["fine"]
        d0, d1 = 0.2, 0.26
        for (u0, u1, z0, z1) in ((ua, ub, za, za + 0.1), (ua, ub, zb - 0.07, zb), (ua, ua + 0.07, za, zb),
                                 (ub - 0.07, ub, za, zb), (c - 0.035, c + 0.035, za, zb - 0.7), (ua, ub, zb - 0.75, zb - 0.68)):
            self.gbox(fm, fn, u0, u1, z0, z1, d0, d1, fr)
        attrs = dict(rlo=(-4.2, ua - 0.6, SW), rhi=(-0.27, ub + 0.6, 3.9), wz=(za, zb, 0.0), wy=(ua, ub, 0.0), rseed=self.rng.random() * 100)
        G["plain"].quad([fn(ua, za, 0.25), fn(ub, za, 0.25), fn(ub, zb, 0.25), fn(ua, zb, 0.25)], M["room"], nrm, attrs)
        G["trim"].box(0.0, 0.6, ua - 0.3, ub + 0.3, 0.0, SW + 0.15, M["trim"])
        G["trim"].prism(S.rounded_footprint(0.0, 1.4, ua - 0.5, ub + 0.5, 0.3), zb + 0.15, zb + 0.35, M["trim"])
        self.text(self.d.get("entry", ""), (1.415, c, zb + 0.25), (0, 1, 0), (0, 0, 1), 0.15, M["letter_cream"], extrude=0.008, bold=0.006)
        for y in (ua - 0.3, ub + 0.3):
            G["plain"].cyl((0.0, y, 2.4), (0.06, y, 2.4), 0.08, M["sconce"], seg=12)
        self.spot((0.7, c, zb + 0.1), "#ffe2bf", 600, cone=120)

    def windows(self):
        rng, p = self.rng, self.p
        runs = {}
        for o in self.ops:
            kind, w = o["kind"], o["wall"]
            if kind not in ("win", "balc", "door", "entry"):
                continue
            fn, nrm = self.fnw(w)
            front = w in ("main", "sb", "tower")
            if kind == "door":
                self.door(fn, o)
                continue
            if kind == "entry":
                self.entry(o)
                continue
            self.window(fn, nrm, o["ua"], o["ub"], o["za"], o["zb"], o["zfl"], o["style"], door=kind == "balc", front=front)
            if kind == "balc":
                runs.setdefault((w, o["f"]), []).append(o)
            elif front and w != "tower" and p.get("ac") and rng.random() < p["ac"]:
                xf = -self.sb if w == "sb" else 0.0
                self.aircon(xf, (o["ua"] + o["ub"]) / 2 + rng.uniform(-0.35, 0.35), o["za"] - 0.1)
        # balcons : un par baie, filants sur les baies voisines (« all »)
        h = self.pier / 2 - 0.12
        for (w, f), lst in runs.items():
            lst.sort(key=lambda o: o["k"])
            cur = [lst[0]]
            for o in lst[1:] + [None]:
                if o is not None and o["k"] == cur[-1]["k"] + 1 and abs(o["ua"] - cur[-1]["ub"] - self.pier) < 0.05:
                    cur.append(o)
                    continue
                self.balcony(-self.sb if w == "sb" else 0.0, cur[0]["ua"] - h, cur[-1]["ub"] + h, cur[0]["zfl"])
                if o is not None:
                    cur = [o]

    def portholes(self):
        """Hublots sur les arrondis : manchon en saillie, bague épaisse, vitre en retrait de 11 cm."""
        G, M, wx = self.G, self.M, self.wx
        for near in (True, False):
            if not (self.rn if near else self.rf):
                continue
            r = self.r
            cy = r if near else self.W - r
            a = math.radians(-45.0 if near else 45.0)
            n = Vector((math.cos(a), math.sin(a), 0.0))
            u = cy + a * r
            for f in [0] + self.upper():
                if f == 0:
                    zfl = SW
                    zc = 1.95 if self.shops else self.gf_h - FH + 1.65
                    rp = 0.3
                else:
                    zfl = self.zf(f)
                    zc, rp = zfl + 1.65, 0.36
                c = Vector((-r + r * math.cos(a), cy + r * math.sin(a), zc))
                G["plain"].cyl(c - n * 0.02, c + n * 0.11, rp + 0.03, M["trim"], seg=28, caps=False)
                G["plain"].torus(c + n * 0.11, n, rp + 0.06, 0.05, M["trim"], seg=28, rseg=10)
                if near:
                    lo, hi = (-r - 1.5, -0.6, zfl + 0.02), (0.4, r + 1.5, zfl + 2.95)
                else:
                    lo, hi = (-r - 1.5, self.W - r - 1.5, zfl + 0.02), (0.4, self.W + 0.6, zfl + 2.95)
                attrs = dict(rlo=lo, rhi=hi, wz=(zc - rp, zc + rp, 0.0), wy=(0.0, 1.0, 0.0), rseed=self.rng.random() * 100)
                G["plain"].disc(c + n * 0.004, n, rp + 0.005, M["porthole"], seg=28, attrs=attrs)
                wx.opening(u - rp - 0.05, u + rp + 0.05, zc - rp - 0.05, zc + rp + 0.05)
                wx.ledge(u - 0.3, u + 0.3, zc - rp - 0.06, 0.6)

    def ring(self, mat, z0, z1, r_in, r_out, sweep=90.0, g="trim"):
        """Un bandeau qui suit les arrondis d'angle."""
        if self.rn:
            self.G[g].prism(ring_sector(-self.r, self.r, r_in, r_out, -sweep, 0, 28), z0, z1, mat)
        if self.rf:
            self.G[g].prism(ring_sector(-self.r, self.W - self.r, r_in, r_out, 0, sweep, 28), z0, z1, mat)

    def ring_ledge(self, z, s, sweep=90.0):
        wx = self.wx
        if self.rn:
            wx.ledge(self.u_near(-sweep), self.yw0, z, s)
        if self.rf:
            wx.ledge(self.yw1, self.u_far(sweep), z, s)

    def eyebrows(self):
        """Sourcils filants au-dessus des fenêtres, qui font le tour des arrondis ; bandeaux d'étage."""
        p, M, wx = self.p, self.M, self.wx
        tr = self.G["trim"]
        r = self.r
        for f in self.upper():
            zf = self.zf(f)
            ze = zf + p["sill"] + p["wh"] + 0.12
            if p.get("eyebrow"):
                for a, b in self.front_spans():
                    a, b = max(a, 0.15), min(b, self.W - 0.15)
                    tr.box(-0.05, 0.55, a, b, ze, ze + 0.1, M["trim"])
                    wx.ledge(a, b, ze, 0.9)
                self.ring(M["trim"], ze, ze + 0.1, r - 0.05, r + 0.55, 75.0)
                self.ring_ledge(ze, 0.9, 75.0)
            elif self.rn or self.rf:
                # sans sourcils, un filet fait le tour de l'angle et s'arrête au premier trumeau
                self.ring(M["trim"], ze, ze + 0.1, r - 0.02, r + 0.14)
                if self.rn:
                    tr.box(-0.02, 0.14, self.yw0, self.ya, ze, ze + 0.1, M["trim"])
                if self.rf:
                    tr.box(-0.02, 0.14, self.yb, self.yw1, ze, ze + 0.1, M["trim"])
                self.ring_ledge(ze, 0.5)
            if p.get("bands"):
                for a, b in self.front_spans():
                    tr.box(0.0, 0.12, a, b, zf - 0.12, zf, M["trim"])
                    wx.ledge(a, b, zf - 0.12, 0.7)
                self.ring(M["trim"], zf - 0.12, zf, r - 0.02, r + 0.12)
        if self.sb_n:
            # la terrasse du retrait : garde-corps sur l'acrotère
            fm = self.G["fine"]
            for a, b in self.front_spans():
                for zr in (0.5, 1.0):
                    fm.cyl((-0.1, a + 0.1, self.para + zr), (-0.1, b - 0.1, self.para + zr), 0.022, self.rail, seg=8)
                yk = a + 0.1
                while yk < b:
                    fm.cyl((-0.1, yk, self.para), (-0.1, yk, self.para + 1.02), 0.024, self.rail, seg=8)
                    yk += 1.5

    # ------------------------------------------------------------ tour à ailettes, acrotère, toit
    def fintower(self):
        if self.fin is None:
            return
        G, M, wx = self.G, self.M, self.wx
        st = M["stucco"]
        tc = self.fin
        t0, t1 = tc - 2.0, tc + 2.0
        TT = self.ttop
        holes = [(o["ua"], o["ub"], o["za"], o["zb"], o["d"]) for o in self.ops if o["wall"] == "tower"]
        G["wall"].wall(TX, t0, t1, self.gf_h, TT, holes, st, rim=("top", "bottom", "left", "right"), rim_d=TX)
        G["wall"].box(-1.0, 0.0, t0, t1, self.para - 0.1, TT, st)
        G["wall"].box(-1.0, 0.3, t0 + 0.6, t1 - 0.6, TT, TT + 0.7, st)
        G["wall"].box(-1.0, 0.2, t0 + 1.2, t1 - 1.2, TT + 0.7, TT + 1.3, st)
        wx.ledge(t0, t1, TT, 0.6)
        twin = ((tc - 1.4, tc - 0.22), (tc + 0.22, tc + 1.4))
        for f in self.upper():
            zf = self.zf(f)
            z0, z1 = zf + 2.68, zf + 3.67
            if z1 > TT - 0.2:
                continue
            for (ya, yb) in twin:
                G["trim"].box(TX, TX + 0.03, ya, yb, z0, z1, M["accent"])
                for q in (0.25, 0.5, 0.75):
                    yq = ya + (yb - ya) * q
                    G["trim"].box(TX + 0.03, TX + 0.06, yq - 0.03, yq + 0.03, z0 + 0.08, z1 - 0.08, M["accent"])
                wx.ledge(ya, yb, z0, 0.35)
        for yc, top in ((t0 + 0.35, TT + 0.6), (tc, TT + 1.9), (t1 - 0.35, TT + 0.6)):
            G["trim"].box(TX - 0.05, 1.0, yc - 0.08, yc + 0.08, self.gf_h + 0.05, TT, M["trim"])
            G["trim"].box(-0.6, 1.0, yc - 0.08, yc + 0.08, TT, top, M["trim"])
            G["trim"].box(-0.4, 0.75, yc - 0.06, yc + 0.06, top, top + 0.3, M["trim"])
            self.tube([[(1.035, yc, self.gf_h + 0.3), (1.035, yc, top - 0.05)]], 0.018, M["neon_lilac"], "neon_fin")
            wx.arrises.append(yc)
        wx.arrises += [t0, t1]
        G["fine"].cyl((-0.3, tc, TT + 1.3), (-0.3, tc, TT + 5.6), 0.04, M["metal"], seg=8)
        for zz, ll in ((TT + 3.8, 0.7), (TT + 4.8, 0.45)):
            G["fine"].cyl((-0.3, tc - ll, zz), (-0.3, tc + ll, zz), 0.015, M["metal"], seg=6)
        # la lueur des ailettes : deux projecteurs au pied, tournés vers le haut
        for y in (tc - 0.8, tc + 0.8):
            G["fine"].box(0.84, 0.98, y - 0.08, y + 0.08, self.gf_h - 0.08, self.gf_h, M["metal"])
            self.spot((0.9, y, self.gf_h + 0.02), "#8f7dff", 220, (-0.13, 0, 1), 36)

    def parapet(self):
        G, M, wx = self.G, self.M, self.wx
        tr = G["trim"]
        P = self.para
        lines = self.d.get("lines")
        for (a, b) in self.front_spans():
            tr.box(-0.35, 0.06, a, b, P, P + 0.1, M["trim"])
            wx.ledge(a, b, P, 0.5)
            if lines:
                for zz in (P - 0.8, P - 0.6, P - 0.4):
                    tr.box(0.0, 0.035, a, b, zz, zz + 0.06, M["accent"])
                    wx.ledge(a, b, zz, 0.2)
        self.ring(M["trim"], P, P + 0.1, self.r - 0.35, self.r + 0.06)
        self.ring_ledge(P, 0.5)
        if lines:
            for zz in (P - 0.8, P - 0.6, P - 0.4):
                self.ring(M["accent"], zz, zz + 0.06, self.r - 0.01, self.r + 0.035)
        for side in (0, 1):
            rnd = self.rn if side == 0 else self.rf
            xe = -self.r if rnd else 0.06
            y0, y1 = (-0.06, 0.3) if side == 0 else (self.W - 0.3, self.W + 0.06)
            tr.box(-self.D, xe, y0, y1, P, P + 0.1, M["trim"])
        neon = self.d.get("neon")
        if neon:
            paths = []
            for (a, b) in self.front_spans():
                paths.append([(0.09, a + 0.05, P + 0.05), (0.09, b - 0.05, P + 0.05)])
            r = self.r + 0.09
            if self.rn:
                paths.append([(-self.r + r * math.cos(math.radians(t)), self.r + r * math.sin(math.radians(t)), P + 0.05) for t in range(-88, 1, 4)])
            if self.rf:
                paths.append([(-self.r + r * math.cos(math.radians(t)), self.W - self.r + r * math.sin(math.radians(t)), P + 0.05) for t in range(0, 89, 4)])
            self.tube(paths, 0.016, M[neon], "neon_parapet")

    def roof(self):
        p, G, M, rng = self.p, self.G, self.M, self.rng
        top = self.tops if self.sb_n else self.main_top
        x0 = -self.D + 0.3
        x1 = (-self.sb if self.sb_n else 0.0) - 0.5
        ya, yb = 0.8, self.W - 0.8
        st = M["stucco"]
        if p.get("stair"):
            xs = x0 + 1.5
            ys = ya + (yb - ya) * rng.uniform(0.55, 0.75)
            G["wall"].box(xs, xs + 3.2, ys, ys + 2.6, top, top + 2.7, st)
            G["trim"].box(xs - 0.2, xs + 3.4, ys - 0.2, ys + 2.8, top + 2.7, top + 2.85, M["trim"])
            G["fine"].box(xs + 3.2, xs + 3.25, ys + 0.8, ys + 1.8, top, top + 2.1, M["doors"][3])
        for k in range(p.get("vents", 0)):
            xv, yv = rng.uniform(x0 + 1.5, x1 - 2.5), rng.uniform(ya + 1, yb - 1)
            G["fine"].box(xv, xv + 0.5, yv, yv + 0.5, top, top + rng.uniform(0.6, 1.2), M["metal"])
            G["fine"].box(xv - 0.06, xv + 0.56, yv - 0.06, yv + 0.56, top + 0.5, top + 0.56, M["metal"])
        for k in range(p.get("ac_roof", 0)):
            self.props.append(("ac", (rng.uniform(x0 + 2.0, x1 - 3.0), rng.uniform(ya + 1.5, yb - 1.5), top),
                               rng.choice((0.0, math.pi / 2, math.pi)), rng.uniform(1.6, 2.0)))
        if p.get("tank"):
            self.props.append(("tank", (x0 + 4.5, ya + (yb - ya) * rng.uniform(0.2, 0.4), top), rng.uniform(0, 6), 0.0065))
        word = self.d.get("roof_word")
        if p.get("roof_sign") and word:
            # cadre d'enseigne sur le toit, lettres lumineuses sur panneau sombre
            L = min(10.0, (self.yb - self.ya) * 0.6)
            yc = self.ya + (self.yb - self.ya) * 0.5
            sy0, sy1 = yc - L / 2, yc + L / 2
            xs = x1 - 1.9
            z0, z1 = top + 1.6, top + 1.6 + p["roof_sign"]
            G["trim"].box(xs, xs + 0.12, sy0, sy1, z0, z1, M["sign_dark"])
            for zz in (z0 - 0.1, z1):
                G["fine"].box(xs - 0.05, xs + 0.17, sy0 - 0.1, sy1 + 0.1, zz, zz + 0.1, M["metal"])
            for ye in (sy0 - 0.1, sy1):
                G["fine"].box(xs - 0.05, xs + 0.17, ye, ye + 0.1, z0, z1, M["metal"])
            n = int(L / 2.0) + 1
            for k in range(n):
                yk = sy0 + (L - 0.12) * k / max(1, n - 1)
                G["fine"].box(xs - 0.9, xs - 0.78, yk, yk + 0.12, top, z1, M["metal"])
                G["fine"].box(xs - 0.9, xs, yk, yk + 0.08, top + 0.8, top + 0.88, M["metal"])
            size = min(0.72 * (z1 - z0), 0.95 * L / (0.68 * len(word) + 0.3))
            self.text(word, (xs + 0.13, yc, (z0 + z1) / 2), (0, 1, 0), (0, 0, 1), size, M[self.d.get("roof_mat", "letter_coral")],
                      extrude=0.03, bold=0.02)
            self.spot((xs + 1.6, yc, top + 0.4), "#ffd9a8", 700, (-0.3, 0, 1), 45)

    def blade(self):
        """Grande enseigne verticale en drapeau : lettres empilées des deux côtés, liseré néon."""
        word = self.d.get("blade")
        if not word or not self.p.get("blade"):
            return
        G, M = self.G, self.M
        tr, fm = G["trim"], G["fine"]
        if self.rn and self.p["blade"] * self.W < self.ya:
            yc = (self.r + self.ya) / 2
        else:
            target = self.p["blade"] * self.W
            yc = min(self.piers, key=lambda y: abs(y - target)) if self.piers else target
        x0, x1 = 0.5, 1.8
        z0, z1 = self.gf_h + 1.1, self.main_top - 0.6
        tr.box(x0, x1, yc - 0.12, yc + 0.12, z0, z1, M["sign_panel"])
        tr.box(x0 + 0.15, x1 - 0.15, yc - 0.09, yc + 0.09, z1, z1 + 0.35, M["sign_panel"])
        tr.box(x0 + 0.4, x1 - 0.4, yc - 0.06, yc + 0.06, z1 + 0.35, z1 + 0.65, M["sign_panel"])
        tr.box(x0 + 0.3, x1 - 0.3, yc - 0.09, yc + 0.09, z0 - 0.3, z0, M["sign_panel"])
        for zz in (z0 + 0.4, (z0 + z1) / 2, z1 - 0.4):
            fm.box(0.0, x0, yc - 0.03, yc + 0.03, zz, zz + 0.08, M["metal"])
        xm = (x0 + x1) / 2
        n = len(word)
        step = (z1 - z0 - 0.5) / n
        size = min(1.1, step * 0.78)
        for k, ch in enumerate(word):
            z = z1 - 0.25 - step * (k + 0.5)
            self.text(ch, (xm, yc - 0.13, z), (1, 0, 0), (0, 0, 1), size, M["letter_coral"], extrude=0.02, bold=0.02)
            self.text(ch, (xm, yc + 0.13, z), (-1, 0, 0), (0, 0, 1), size, M["letter_coral"], extrude=0.02, bold=0.02)
        for s in (-1, 1):
            yy = yc + s * 0.135
            self.tube([[(x0 + 0.08, yy, z0 + 0.08), (x1 - 0.08, yy, z0 + 0.08), (x1 - 0.08, yy, z1 - 0.08), (x0 + 0.08, yy, z1 - 0.08),
                        (x0 + 0.08, yy, z0 + 0.08)]], 0.016, M["neon_lilac"], "neon_blade")
        self.spot((1.15, yc, z0 - 0.45), "#ffb38a", 420, (0, 0, 1), 24)

    # ------------------------------------------------------------ le rez-de-chaussée
    def ground(self):
        steps = [self.gf_shops] if self.shops else [self.gf_rooms]
        steps += [self.gallery, self.street_bits, self.washes]
        for step in steps:
            try:
                step()
            except Exception:
                print(f"[proc] {self.key} : ÉCHEC {step.__name__}", flush=True)
                traceback.print_exc()

    def gf_shops(self):
        G, M, wx = self.G, self.M, self.wx
        tr, fm = G["trim"], G["fine"]
        gl = self.gf_h - 0.27
        a0 = self.yw0 if self.rn else 0.0
        a1 = self.yw1 if self.rf else self.W
        tr.box(0.0, 0.32, a0, a1, gl, self.gf_h, M["trim"])
        self.ring(M["trim"], gl, self.gf_h, self.r - 0.05, self.r + 0.32, 84.0)
        wx.ledge(a0, a1, gl, 0.6)
        self.ring_ledge(gl, 0.6, 84.0)
        edges = [a0]
        for (a, b, t, w) in self.bays:
            edges += [a, b]
            if t != "lobby":
                tr.box(0.0, 0.02, a - 0.3, b + 0.3, 3.5, gl, M["accent"])
        edges.append(a1)
        for i in range(0, len(edges) - 1, 2):
            if edges[i + 1] - edges[i] > 0.05:
                fm.box(0.0, 0.025, edges[i], edges[i + 1], SW, 0.72, M["vitro"])
        self.ring(M["vitro"], SW, 0.72, self.r - 0.02, self.r + 0.025, 86.0, g="fine")
        awn = M["awnings"]
        for k, (a, b, t, word) in enumerate(self.bays):
            try:
                if t == "lobby":
                    self.lobby(a, b)
                    self.canopy(a, b)
                    continue
                self.shopfront(a, b, k)
                getattr(self, "in_" + t)(a, b)
                if t in ("cafe", "bar") or self.rng.random() < 0.45:
                    self.awning(a + 0.15, b - 0.15, awn[k % len(awn)], terrace=t in ("cafe", "bar") and b - a > 3.2)
                if word:
                    self.fascia(a, b, word, t)
            except Exception:
                print(f"[proc] {self.key} : ÉCHEC boutique {k} ({t})", flush=True)
                traceback.print_exc()

    def fascia(self, a, b, word, t):
        M = self.M
        L = b - a + 0.4
        size = min(0.3, 0.92 * L / (0.66 * len(word) + 0.4))
        mat = M["neon_amber"] if t == "bar" else M["letter_cream"] if t in ("store", "surf") else M["letter_coral"]
        self.text(word, (0.032, (a + b) / 2, (3.5 + self.gf_h - 0.27) / 2), (0, 1, 0), (0, 0, 1), size, mat, extrude=0.012, bold=0.01)

    def gf_rooms(self):
        """Rez-de-chaussée d'habitation : soubassement, bandeau, plantes au pied."""
        G, M, wx = self.G, self.M, self.wx
        tr = G["trim"]
        zg = self.gf_h - FH
        if zg > 0.5:
            tr.box(0.0, 0.12, 0.0, self.W, zg - 0.12, zg, M["trim"])
            wx.ledge(0.0, self.W, zg - 0.12, 0.7)
            for zz in (0.35, 0.65):
                tr.box(0.0, 0.02, 0.0, self.W, zz, zz + 0.04, M["accent"])
            pl = G["plain"]
            for k, (a, b) in enumerate(self.cols):
                if k % 2 == 1:
                    self.plant(pl, 0.45, (a + b) / 2, 0.9, z=SW)

    def gallery(self):
        """La coursive de motel : dalle, lisses, poteaux, avancée du toit, escalier, enseignes."""
        if not self.p.get("gallery"):
            return
        G, M = self.G, self.M
        tr, fm, pl = G["trim"], G["fine"], G["plain"]
        zf, a, b = self.gf_h, self.ya, self.yb
        rl = self.rail
        tr.box(0.0, 2.0, a, b, zf - 0.22, zf, M["trim"])
        self.wx.ledge(a, b, zf - 0.22, 1.2)
        for zr in (0.45, 0.95):
            fm.cyl((1.95, a, zf + zr), (1.95, b - 1.2, zf + zr), 0.02, rl, seg=8)
        y = a
        while y < b - 1.2:
            fm.cyl((1.95, y, zf), (1.95, y, zf + 0.98), 0.015, rl, seg=6)
            y += 1.2
        y = a
        while y < b:
            tr.box(1.82, 1.98, y, y + 0.16, 0.0, self.tops + 0.1, rl)
            y += 4.0
        tr.box(0.0, 2.4, a - 0.2, b + 0.2, self.tops, self.tops + 0.35, M["trim"])
        self.wx.ledge(a, b, self.tops, 1.0)
        # l'escalier, au bout, le long de la coursive
        n = 16
        for i in range(n):
            yi = b - 4.8 + i * 0.28
            zi = (i + 1) * zf / n
            fm.box(2.1, 3.1, yi, yi + 0.3, zi - 0.05, zi, M["trim"])
        for xx in (2.1, 3.1):
            fm.cyl((xx, b - 4.8, 0.0), (xx, b - 0.5, zf), 0.04, M["metal"], seg=8)
            fm.cyl((xx, b - 4.8, 0.95), (xx, b - 0.5, zf + 0.95), 0.02, rl, seg=8)
        # l'enseigne de toit et le « VACANCY » sous la coursive
        yc = (a + b) / 2
        tr.box(2.2, 2.32, yc - 4.2, yc + 4.2, self.tops + 0.35, self.tops + 1.6, M["sign_dark"])
        self.text("MOTEL", (2.335, yc, self.tops + 0.98), (0, 1, 0), (0, 0, 1), 0.95, M["neon_coral"], extrude=0.02, bold=0.015)
        vy = a + 2.0
        pl.box(1.0, 1.9, vy - 0.03, vy + 0.03, zf - 0.75, zf - 0.38, M["sign_dark"])
        self.text("VACANCY", (1.45, vy - 0.042, zf - 0.565), (1, 0, 0), (0, 0, 1), 0.15, M["neon_mint"], extrude=0.008, bold=0.006)
        for k in range(4):
            y = a + (b - a) * (k + 0.5) / 4
            self.spot((1.0, y, self.tops - 0.03), "#ffd9a8", 900, (0, 0, -1), 120)
            self.spot((1.0, y, zf - 0.25), "#ffd9a8", 800, (0, 0, -1), 120)
            pl.cyl((1.0, y, zf - 0.23), (1.0, y, zf - 0.22), 0.1, M["down"], seg=12, smooth=False)
            pl.cyl((1.0, y, self.tops - 0.01), (1.0, y, self.tops), 0.1, M["down"], seg=12, smooth=False)

    def shopfront(self, ya, yb, k, zt=2.7, ztop=3.5, d=0.3):
        G, M = self.G, self.M
        fm, pl = G["fine"], G["plain"]
        xg, x0, x1 = -d + 0.03, -d, -d + 0.07
        br = M["bronze"]
        left = k % 2 == 0
        da, db = (ya + 0.02, ya + 0.98) if left else (yb - 0.98, yb - 0.02)
        ga, gb = (db, yb) if left else (ya, da)
        nm = max(1, int(round((gb - ga) / 1.8)))
        mull = [ga + (gb - ga) * i / nm for i in range(1, nm)]
        for (a, b) in ((ya, da), (db, yb)):
            if b - a > 0.05:
                fm.box(x0 - 0.01, x1, a, b, SW, 0.62, M["vitro"])
                fm.box(x0, x1, a, b, 0.62, 0.68, br)
                pl.quad([(xg, a, 0.68), (xg, b, 0.68), (xg, b, zt), (xg, a, zt)], M["shop"], (1, 0, 0))
        pl.quad([(xg, ya, zt + 0.06), (xg, yb, zt + 0.06), (xg, yb, ztop), (xg, ya, ztop)], M["shop"], (1, 0, 0))
        pl.quad([(xg - 0.02, da + 0.06, SW + 0.14), (xg - 0.02, db - 0.06, SW + 0.14), (xg - 0.02, db - 0.06, zt - 0.06),
                 (xg - 0.02, da + 0.06, zt - 0.06)], M["shop"], (1, 0, 0))
        fm.box(x0, x1, da, da + 0.06, SW, zt, br)
        fm.box(x0, x1, db - 0.06, db, SW, zt, br)
        fm.box(x0, x1, da, db, SW, SW + 0.14, br)
        fm.box(x0, x1, da, db, zt - 0.06, zt, br)
        fm.cyl((xg + 0.07, da + 0.15, 1.05), (xg + 0.07, db - 0.15, 1.05), 0.016, M["brass"], seg=8)
        fm.box(x0, x1, ya, yb, zt, zt + 0.06, br)
        fm.box(x0, x1, ya, yb, ztop - 0.05, ztop, br)
        for y in [ya + 0.03] + mull + [yb - 0.03]:
            fm.box(x0, x1, y - 0.03, y + 0.03, 0.62, ztop, br)
        for y in mull:
            fm.box(x0, x1, y - 0.03, y + 0.03, SW, 0.62, br)

    # ------------------------------------------------------------ intérieurs
    def room_shell(self, xb, ya, yb, floor, wall, ceil, zc=3.9, d=0.3):
        pl = self.G["plain"]
        pl.box(xb, -d, ya, yb, 0.05, SW, floor, faces=("+z",))
        pl.box(xb, -d, ya, yb, zc, zc + 0.1, ceil, faces=("-z",))
        pl.box(xb, -d, ya - 0.1, ya, SW, zc, wall, faces=("+y",))
        pl.box(xb, -d, yb, yb + 0.1, SW, zc, wall, faces=("-y",))
        pl.box(xb - 0.1, xb, ya, yb, SW, zc, wall, faces=("+x",))

    def ceiling_spot(self, x, y, color, energy):
        """La lumière d'une salle : un projecteur au plafond, logé dans un spot encastré."""
        self.G["plain"].cyl((x, y, 3.88), (x, y, 3.9), 0.09, self.M["down"], seg=12, smooth=False)
        self.spot((x, y, 3.86), color, energy, (0, 0, -1), 150)

    def table(self, B, x, y):
        M = self.M
        B.cyl((x, y, SW), (x, y, SW + 0.03), 0.22, M["chair"], seg=14)
        B.cyl((x, y, SW), (x, y, 0.74), 0.03, M["chair"], seg=8)
        B.cyl((x, y, 0.74), (x, y, 0.77), 0.34, M["marble"], seg=20)

    def chair(self, B, x, y, s):
        M = self.M
        B.box(x - 0.2, x + 0.2, y - 0.2, y + 0.2, 0.44, 0.47, M["chair"])
        for dx in (-0.17, 0.17):
            for dy in (-0.17, 0.17):
                B.cyl((x + dx, y + dy, SW), (x + dx, y + dy, 0.44), 0.013, M["chair"], seg=6)
        yb = y + s * 0.19
        for dx in (-0.17, -0.06, 0.06, 0.17):
            B.box(x + dx - 0.015, x + dx + 0.015, yb - 0.012, yb + 0.012, 0.47, 0.86, M["chair"])
        B.box(x - 0.2, x + 0.2, yb - 0.015, yb + 0.015, 0.8, 0.88, M["chair"])

    def setting(self, B, x, y):
        self.table(B, x, y)
        self.chair(B, x, y - 0.55, -1)
        self.chair(B, x, y + 0.55, 1)

    def plant(self, B, x, y, s=1.0, z=SW):
        M, rng = self.M, self.rng
        B.cyl((x, y, z), (x, y, z + 0.62 * s), 0.22 * s, M["pot"], r1=0.29 * s, seg=16)
        B.cyl((x, y, z + 0.58 * s), (x, y, z + 0.6 * s), 0.27 * s, M["soil"], seg=16, smooth=False)
        for k in range(13):
            ang = 2 * math.pi * k / 13 + rng.uniform(-0.2, 0.2)
            tilt = rng.uniform(0.2, 1.05)
            L = rng.uniform(0.45, 0.85) * s
            d = Vector((math.cos(ang) * math.sin(tilt), math.sin(ang) * math.sin(tilt), math.cos(tilt)))
            c = Vector((x, y, z + 0.6 * s)) + d * L * 0.5
            B.ellipsoid(c, (0.055 * s, 0.012 * s, L * 0.5), M["leaf"], rot=d.to_track_quat("Z", "Y").to_matrix(), nu=8, nv=6)

    def in_bar(self, ya, yb):
        G, M, rng = self.G, self.M, self.rng
        pl, fm = G["plain"], G["fine"]
        xb, L, c = -6.2, yb - ya, (ya + yb) / 2
        self.room_shell(xb, ya, yb, M["checker"], M["plum"], M["ceiling"])
        m0, m1 = ya + 0.6, yb - 0.6
        pl.box(xb, xb + 0.02, m0, m1, 1.1, 2.75, M["mirror"], faces=("+x",))
        for zs in (1.35, 1.8, 2.25):
            fm.box(xb, xb + 0.3, m0, m1, zs, zs + 0.035, M["walnut"])
            pl.box(xb + 0.26, xb + 0.29, m0, m1, zs - 0.025, zs, M["cove"])
            y = m0 + 0.1
            while y < m1 - 0.1:
                r, hgt = rng.uniform(0.03, 0.045), rng.uniform(0.2, 0.32)
                mat = rng.choice(M["bottles"])
                z0 = zs + 0.035
                pl.cyl((xb + 0.15, y, z0), (xb + 0.15, y, z0 + hgt * 0.68), r, mat, seg=10)
                pl.cyl((xb + 0.15, y, z0 + hgt * 0.68), (xb + 0.15, y, z0 + hgt), r * 0.9, mat, r1=r * 0.3, seg=8)
                y += rng.uniform(0.09, 0.16)
        fm.box(xb, xb + 0.6, ya + 0.4, yb - 0.4, SW, 1.0, M["walnut"])
        fm.box(xb, xb + 0.65, ya + 0.35, yb - 0.35, 1.0, 1.04, M["marble"])
        fm.box(-3.9, -3.25, ya + 0.6, yb - 0.6, SW, 1.05, M["walnut"])
        fm.box(-3.95, -3.15, ya + 0.55, yb - 0.55, 1.05, 1.1, M["marble"])
        pl.cyl((-3.12, ya + 0.6, 0.3), (-3.12, yb - 0.6, 0.3), 0.02, M["brass"], seg=8)
        ns = max(2, int((L - 1.6) / 0.86))
        for k in range(ns):
            y = ya + 1.05 + k * (L - 2.1) / max(1, ns - 1)
            pl.cyl((-2.75, y, SW), (-2.75, y, SW + 0.02), 0.2, M["chair"], seg=14)
            pl.cyl((-2.75, y, SW), (-2.75, y, 0.74), 0.025, M["brass"], seg=8)
            pl.cyl((-2.75, y, 0.74), (-2.75, y, 0.8), 0.19, M["leather"], seg=16)
        ng = max(2, int(L / 1.4))
        for k in range(ng):
            y = ya + 0.8 + k * (L - 1.6) / (ng - 1)
            pl.ellipsoid((-3.55, y, 2.55), (0.13, 0.13, 0.13), M["globe"], nu=12, nv=8)
            pl.cyl((-3.55, y, 2.68), (-3.55, y, 3.9), 0.006, M["chair"], seg=6)
        for y in ((ya + L * 0.28, yb - L * 0.28) if L > 4.2 else (c,)):
            self.setting(pl, -1.1, y)
        self.ceiling_spot(-2.6, c, "#ffc488", 620 * L)

    def in_surf(self, ya, yb):
        G, M, rng = self.G, self.M, self.rng
        pl, fm = G["plain"], G["fine"]
        xb, L, c = -6.0, yb - ya, (ya + yb) / 2
        self.room_shell(xb, ya, yb, M["oak"], M["mint_wall"], M["cream_wall"])
        n = max(2, int((L - 1.0) / 0.65))
        for k in range(n):
            y = ya + 0.8 + k * (L - 1.6) / max(1, n - 1)
            rot = Matrix.Rotation(rng.uniform(-0.07, 0.07), 3, "X") @ Matrix.Rotation(-0.13, 3, "Y")
            pl.ellipsoid((xb + 0.3, y, 1.28), (0.05, 0.27, 1.08 - 0.1 * (k % 3)), M["boards"][k % 5], rot=rot, nu=18, nv=12)
        for zs in (0.9, 1.5, 2.1):
            fm.box(-5.4, -1.2, ya, ya + 0.45, zs, zs + 0.03, M["oak"])
            x = -5.3
            while x < -1.5:
                w = rng.uniform(0.25, 0.45)
                pl.box(x, x + w, ya + 0.04, ya + 0.4, zs + 0.03, zs + 0.03 + rng.uniform(0.08, 0.3), rng.choice(M["goods"]))
                x += w + rng.uniform(0.03, 0.12)
        hw = min(1.0, L * 0.2)
        fm.box(-3.6, -2.2, c - hw, c + hw, SW, 0.82, M["oak"])
        for k in range(7):
            a, b = rng.uniform(-3.5, -2.6), rng.uniform(c - hw + 0.1, c + hw - 0.4)
            pl.box(a, a + 0.38, b, b + 0.3, 0.82, 0.82 + rng.uniform(0.03, 0.12), rng.choice(M["goods"]))
        for y in (ya + L * 0.2, c, yb - L * 0.2):
            pl.ellipsoid((-2.9, y, 2.75), (0.16, 0.16, 0.12), M["sconce"], nu=12, nv=8)
            pl.cyl((-2.9, y, 2.86), (-2.9, y, 3.9), 0.006, M["chair"], seg=6)
        self.plant(pl, -0.9, yb - 0.5, 1.2)
        self.ceiling_spot(-3.0, c, "#fff0da", 500 * L)

    def in_cafe(self, ya, yb):
        G, M, rng = self.G, self.M, self.rng
        pl, fm = G["plain"], G["fine"]
        xb, L, c = -6.0, yb - ya, (ya + yb) / 2
        self.room_shell(xb, ya, yb, M["tile"], rng.choice((M["rose_wall"], M["blue_wall"], M["mint_wall"])), M["cream_wall"])
        # comptoir, vitrine à gâteaux, machine, tableau du menu
        fm.box(xb + 0.9, xb + 1.5, ya + 0.5, yb - 0.5, SW, 1.0, M["oak"])
        fm.box(xb + 0.85, xb + 1.55, ya + 0.45, yb - 0.45, 1.0, 1.04, M["marble"])
        cl = min(1.6, L * 0.35)
        pl.box(xb + 0.95, xb + 1.45, ya + 0.6, ya + 0.6 + cl, 1.04, 1.4, M["case"])
        for k in range(int(cl / 0.22)):
            pl.ellipsoid((xb + 1.2, ya + 0.72 + k * 0.22, 1.1), (0.08, 0.08, 0.05), rng.choice(M["pastry"]), nu=10, nv=6)
        fm.box(xb, xb + 0.5, ya + 0.3, yb - 0.3, SW, 0.95, M["walnut"])
        fm.box(xb + 0.05, xb + 0.5, c - 0.35, c + 0.35, 0.95, 1.45, M["steel"])
        pl.box(xb, xb + 0.03, ya + 0.7, yb - 0.7, 1.9, 2.75, M["sign_dark"], faces=("+x",))
        for rr in range(5):
            pl.box(xb + 0.03, xb + 0.035, ya + 0.9, ya + 0.9 + rng.uniform(0.6, max(0.7, L - 2.2)), 2.55 - rr * 0.13, 2.57 - rr * 0.13, M["menu"])
        nt = max(1, int((L - 0.8) / 1.5))
        for k in range(nt):
            y = ya + 0.75 + (k + 0.5) * (L - 1.5) / nt
            self.setting(pl, -1.3, y)
            if k % 2 == 0:
                self.setting(pl, -2.9, y + 0.3)
        for k in range(max(2, int(L / 1.6))):
            y = ya + 0.7 + k * (L - 1.4) / max(1, int(L / 1.6) - 1)
            pl.ellipsoid((-2.2, y, 2.8), (0.14, 0.14, 0.14), M["globe"], nu=12, nv=8)
            pl.cyl((-2.2, y, 2.94), (-2.2, y, 3.9), 0.006, M["chair"], seg=6)
        self.plant(pl, -0.8, yb - 0.45, 1.0)
        self.ceiling_spot(-2.8, c, "#ffd2a0", 520 * L)

    def in_store(self, ya, yb):
        G, M, rng = self.G, self.M, self.rng
        pl, fm = G["plain"], G["fine"]
        xb, L, c = -6.0, yb - ya, (ya + yb) / 2
        self.room_shell(xb, ya, yb, M["oak"], rng.choice((M["cream_wall"], M["blue_wall"])), M["cream_wall"])
        for y in (ya + 0.3, yb - 0.3):
            fm.box(xb, xb + 0.45, y - 0.02, y + 0.02, SW, 2.5, M["walnut"])
        for zs in (0.5, 1.0, 1.5, 2.0):
            fm.box(xb, xb + 0.45, ya + 0.3, yb - 0.3, zs, zs + 0.03, M["walnut"])
            y = ya + 0.35
            while y < yb - 0.5:
                w = rng.uniform(0.15, 0.4)
                pl.box(xb + 0.06, xb + rng.uniform(0.25, 0.4), y, y + w, zs + 0.03, zs + 0.03 + rng.uniform(0.15, 0.4), rng.choice(M["goods"]))
                y += w + rng.uniform(0.02, 0.1)
        hw = min(1.2, L * 0.22)
        fm.box(-3.4, -2.4, c - hw, c + hw, SW, 0.8, M["walnut"])
        for k in range(9):
            a, b = rng.uniform(-3.3, -2.7), rng.uniform(c - hw + 0.1, c + hw - 0.35)
            pl.box(a, a + 0.3, b, b + 0.25, 0.8, 0.8 + rng.uniform(0.03, 0.25), rng.choice(M["goods"]))
        fm.box(-1.9, -1.3, yb - 1.4, yb - 0.4, SW, 1.0, M["oak"])
        pl.box(-1.85, -1.5, yb - 1.1, yb - 0.75, 1.0, 1.3, M["metal"])
        for y in (ya + L * 0.25, yb - L * 0.25):
            pl.cyl((-2.9, y, 3.2), (-2.9, y, 3.9), 0.006, M["chair"], seg=6)
            pl.cyl((-2.9, y, 3.05), (-2.9, y, 3.2), 0.18, M["sconce"], r1=0.06, seg=14)
        self.ceiling_spot(-3.0, c, "#fff2e0", 460 * L)

    def lobby(self, ya, yb):
        """Le hall : portes doubles au milieu, vitrages latéraux, imposte en éventail, banque, lustre."""
        G, M = self.G, self.M
        pl, fm = G["plain"], G["fine"]
        d = 0.35
        xg, x0, x1 = -d + 0.03, -d, -d + 0.07
        br = M["bronze"]
        zt, ztop = 2.6, 3.65
        c = (ya + yb) / 2
        da, db = c - 0.9, c + 0.9
        for (a, b) in ((ya, da), (db, yb)):
            if b - a < 0.1:
                continue
            fm.box(x0 - 0.01, x1, a, b, SW, 0.5, M["vitro"])
            pl.quad([(xg, a, 0.5), (xg, b, 0.5), (xg, b, zt), (xg, a, zt)], M["shop"], (1, 0, 0))
            nm = max(1, int(round((b - a) / 1.3)))
            for i in range(1, nm):
                y = a + (b - a) * i / nm
                fm.box(x0, x1, y - 0.03, y + 0.03, SW, ztop, br)
        for (a, b) in ((da, c), (c, db)):
            pl.quad([(xg - 0.03, a + 0.07, SW + 0.15), (xg - 0.03, b - 0.07, SW + 0.15), (xg - 0.03, b - 0.07, zt - 0.07),
                     (xg - 0.03, a + 0.07, zt - 0.07)], M["shop"], (1, 0, 0))
            for y in (a + 0.035, b - 0.035):
                fm.box(x0 - 0.03, x1 - 0.03, y - 0.035, y + 0.035, SW, zt, br)
            fm.box(x0 - 0.03, x1 - 0.03, a, b, SW, SW + 0.15, br)
            fm.box(x0 - 0.03, x1 - 0.03, a, b, zt - 0.07, zt, br)
            yh = b - 0.2 if a < c else a + 0.2
            fm.cyl((xg + 0.05, yh, 0.8), (xg + 0.05, yh, 1.6), 0.016, M["brass"], seg=8)
        pl.quad([(xg, ya, zt + 0.05), (xg, yb, zt + 0.05), (xg, yb, ztop), (xg, ya, ztop)], M["shop"], (1, 0, 0))
        for y in (ya + 0.03, da, db, yb - 0.03):
            fm.box(x0, x1, y - 0.03, y + 0.03, SW, ztop, br)
        for z in (0.47, zt, ztop - 0.05):
            fm.box(x0, x1, ya, yb, z, z + 0.05, br)
        cz = zt + 0.05
        for k in range(9):
            ang = math.pi * (k + 1) / 10
            co, si = math.cos(ang), math.sin(ang)
            t = min((ztop - 0.05 - cz) / si, 0.9 / max(1e-3, abs(co)))
            fm.cyl((x0 + 0.035, c, cz), (x0 + 0.035, c + co * t, cz + si * t), 0.012, br, seg=6)
        fm.cyl((x0 + 0.02, c, cz), (x0 + 0.06, c, cz), 0.16, br, seg=16)
        xb = -6.6
        self.room_shell(xb, ya, yb, M["terrazzo"], M["cream_wall"], M["cream_wall"], d=d)
        pl.box(xb, xb + 0.02, c - 1.0, c + 1.0, 1.4, 3.4, M["brass"], faces=("+x",))
        fm.box(-5.9, -5.2, c - 1.0, c + 1.0, SW, 1.1, M["walnut"])
        fm.box(-5.95, -5.15, c - 1.05, c + 1.05, 1.1, 1.14, M["marble"])
        pl.cyl((-5.55, c - 0.6, 1.14), (-5.55, c - 0.6, 1.45), 0.012, M["brass"], seg=6)
        pl.cyl((-5.55, c - 0.6, 1.42), (-5.55, c - 0.6, 1.62), 0.15, M["globe"], r1=0.09, seg=14)
        pl.torus((-3.2, c, 3.45), (0, 0, 1), 0.45, 0.035, M["down"], seg=24, rseg=6)
        for k in range(3):
            a = 2 * math.pi * k / 3
            pl.cyl((-3.2 + 0.45 * math.cos(a), c + 0.45 * math.sin(a), 3.45), (-3.2, c, 3.9), 0.005, M["chair"], seg=4)
        self.plant(pl, -1.3, yb - 0.5, 1.4)
        if yb - ya > 4.0:
            self.plant(pl, -1.3, ya + 0.5, 1.2)
        self.ceiling_spot(-3.6, c, "#ffd9a8", 560 * (yb - ya))

    def canopy(self, ya, yb):
        """La marquise de l'entrée : dalle arrondie, spots encastrés, lettres, tirants ; « VACANCY »."""
        G, M = self.G, self.M
        pl = G["plain"]
        c = (ya + yb) / 2
        half = min(1.85, (yb - ya) / 2 + 0.3)
        G["trim"].prism(S.rounded_footprint(0.0, 2.3, c - half, c + half, 0.5), 3.62, 3.92, M["trim"])
        self.wx.ledge(c - half, c + half, 3.62, 1.0)
        for yy in (c - half + 0.65, c, c + half - 0.65):
            for xx in (0.8, 1.7):
                pl.cyl((xx, yy, 3.6), (xx, yy, 3.621), 0.07, M["down"], seg=12, smooth=False)
        word = self.d.get("canopy")
        if word:
            size = min(0.3, 0.9 * 2 * half / (0.66 * len(word) + 0.4))
            self.text(word, (2.315, c, 3.77), (0, 1, 0), (0, 0, 1), size, M["letter_cream"], extrude=0.01, bold=0.012)
        xw = TX if self.fin is not None and abs(self.fin - c) < 2.0 else 0.0
        for yy in (c - half + 0.35, c + half - 0.35):
            pl.cyl((2.0, yy, 3.92), (xw, yy, 5.6), 0.018, M["metal"], seg=8)
        if self.d.get("vacancy"):
            vy = c - half + 0.17
            pl.box(1.0, 2.15, vy - 0.03, vy + 0.03, 3.05, 3.4, M["sign_dark"])
            for xx in (1.1, 2.05):
                pl.cyl((xx, vy, 3.4), (xx, vy, 3.62), 0.006, M["metal"], seg=4)
            self.text("VACANCY", (1.575, vy - 0.042, 3.225), (1, 0, 0), (0, 0, 1), 0.17, M["neon_coral"], extrude=0.008, bold=0.006)
        self.spot((1.15, c, 3.58), "#ffe2bf", 1500, (0, 0, -1), 130)

    def awning(self, ya, yb, mat, terrace=False, x1=1.85, zw=3.45, zl=2.72):
        G, M = self.G, self.M
        pl, fm = G["plain"], G["fine"]
        L = yb - ya

        def fa(u, v):
            y = ya + L * u
            sagz = 0.035 * math.sin(math.pi * v) * (0.6 + 0.4 * abs(math.sin(math.pi * (y - ya) / 1.475)))
            return (x1 * v, y, zw + (zl - zw) * v - sagz)
        pl.grid(fa, max(12, int(L * 10)), 8, mat, (0.4, 0, 1))
        n = max(1, int(round(L / 0.5)))

        def fv(u, v):
            y = ya + L * u
            t = ((y - ya) / (L / n)) % 1.0
            depth = 0.13 + 0.08 * math.sqrt(max(0.0, 1 - (2 * t - 1) ** 2))
            return (x1 + 0.004, y, zl - depth * v)
        pl.grid(fv, n * 12, 2, mat, (1, 0, 0))
        fm.box(0.0, 0.2, ya - 0.05, yb + 0.05, 3.42, 3.58, M["metal"])
        for y in (ya + 0.05, (ya + yb) / 2, yb - 0.05):
            fm.cyl((0.02, y, 3.0), (x1 - 0.05, y, zl + 0.02), 0.018, M["metal"], seg=8)
        fm.cyl((x1, ya, zl), (x1, yb, zl), 0.02, M["metal"], seg=8)
        if terrace:
            wire = sag((x1 - 0.12, ya + 0.05, zl - 0.06), (x1 - 0.12, yb - 0.05, zl - 0.06), 0.12, 24)
            self.tube([wire], 0.004, M["chair"], "wire_bulbs")
            for k in range(1, 24, 2):
                q = wire[k]
                pl.ellipsoid((q[0], q[1], q[2] - 0.05), (0.032, 0.032, 0.042), M["bulb"], nu=8, nv=6)
            nt = max(1, int(L / 2.9))
            for k in range(nt):
                self.setting(pl, 1.05, ya + L * (k + 0.5) / nt)

    def street_bits(self):
        """Descentes d'eau aux extrémités, appliques et plantes aux portes du hall, câbles."""
        G, M, wx = self.G, self.M, self.wx
        fm, tr, pl = G["fine"], G["trim"], G["plain"]
        ys = [self.ya - 0.2 if self.rn else 0.18, self.yb + 0.2 if self.rf else self.W - 0.18]
        for yp in ys:
            fm.cyl((0.09, yp, 0.45), (0.09, yp, self.para - 0.45), 0.055, M["pipe"], seg=12)
            fm.cyl((0.09, yp, 0.47), (0.26, yp, SW + 0.06), 0.055, M["pipe"], seg=12)
            tr.box(-0.02, 0.22, yp - 0.15, yp + 0.15, self.para - 0.7, self.para - 0.4, M["pipe"])
            z = 1.6
            while z < self.para - 1.0:
                fm.box(0.0, 0.15, yp - 0.07, yp + 0.07, z, z + 0.04, M["metal"])
                z += 1.85
            wx.pipes.append(yp)
        for (a, b, t, w) in self.bays:
            if t != "lobby":
                continue
            for y in (a - 0.15, b + 0.15):
                fm.box(0.0, 0.02, y - 0.09, y + 0.09, 2.15, 2.75, M["brass"])
                pl.cyl((0.02, y, 2.22), (0.02, y, 2.68), 0.075, M["sconce"], seg=14)
                self.plant(pl, 0.42, y, 1.0)
        self.tube([[(0.04, ys[1] - 0.12, 1.45), (0.04, ys[1] - 0.12, 3.9)],
                   sag((0.12, ys[1] - 0.15, self.gf_h + 0.25), (0.55, ys[1] - 4.5, self.gf_h + 1.4), 0.3, 20)], 0.009, M["metal"], "cables")
        fm.box(0.0, 0.14, ys[1] - 0.26, ys[1] + 0.02 - 0.12, 1.0, 1.45, M["pipe"])

    def washes(self):
        """Lavages de façade (les projecteurs de scene_a sont remplacés : spec["own_uplights"])."""
        if self.p.get("gallery"):
            return
        G, M = self.G, self.M
        power = 480.0 if self.p.get("uplight") else 320.0
        cand = sorted(set(round(y, 2) for y in self.piers))
        if self.fin is not None:
            cand = [y for y in cand if abs(y - self.fin) > 2.6]
        picks, last = [], -99.0
        for y in cand:
            if y - last >= 4.5:
                picks.append(y)
                last = y
        if len(picks) > 4:
            picks = [picks[int(round(i * (len(picks) - 1) / 3))] for i in range(4)]
        for y in picks:
            if self.shops:
                G["fine"].box(0.17, 0.31, y - 0.09, y + 0.09, self.gf_h, self.gf_h + 0.1, M["metal"])
                self.spot((0.26, y, self.gf_h + 0.13), "#ffd9a8", power, (-0.2, 0, 1), 62)
            else:
                G["fine"].box(0.38, 0.52, y - 0.09, y + 0.09, SW, SW + 0.12, M["metal"])
                self.spot((0.45, y, SW + 0.16), "#ffe2bf", power, (-0.16, 0, 1), 60)
        for near in (True, False):
            if not (self.rn if near else self.rf):
                continue
            a = math.radians(-45.0 if near else 45.0)
            cy = self.r if near else self.W - self.r
            px, py = -self.r + self.r * math.cos(a), cy + self.r * math.sin(a)
            nx, ny = math.cos(a), math.sin(a)
            lx, ly = px + nx * 1.2, py + ny * 1.2
            G["fine"].box(lx - 0.1, lx + 0.1, ly - 0.1, ly + 0.1, SW, SW + 0.12, M["metal"])
            self.spot((lx, ly, SW + 0.15), "#ff7a50", 480, (-nx * 0.6, -ny * 0.6, 1), 48)

    # ------------------------------------------------------------ assemblage
    def build(self):
        t0 = time.time()
        self.layout()
        for step in (self.body, self.facade, self.windows, self.portholes, self.eyebrows, self.fintower, self.parapet,
                     self.roof, self.ground, self.blade):
            try:
                step()
            except Exception:
                print(f"[proc] {self.key} : ÉCHEC {step.__name__}", flush=True)
                traceback.print_exc()
        self.wx.bake()
        objs = [g.done() for g in self.G.values()] + self.extra
        ob = S.join(objs, f"bld_{self.key}")
        print(f"[proc] {self.key} : {len(ob.data.polygons)} faces, {len(self.lights)} lumières, {len(self.props)} accessoires, "
              f"carte {self.wx.nx}×{self.wx.nz}, {time.time() - t0:.1f} s", flush=True)
        return ob


def make_building(S_mod, key, M, spec):
    """Le remplaçant de scene_a.make_building : (objet, accessoires, lumières), dans le repère de scene_a.
    En cas d'échec, l'immeuble d'origine de scene_a, pour que le film se construise quand même."""
    global S
    S = S_mod
    b = None
    try:
        b = Bld(key, spec)
        ob = b.build()
        spec["own_uplights"] = True
        return ob, b.props, b.lights
    except Exception:
        print(f"[proc] {key} : ÉCHEC, repli sur le dessin de scene_a", flush=True)
        traceback.print_exc()
        if b is not None:
            for o in b.extra:
                try:
                    bpy.data.objects.remove(o)
                except Exception:
                    pass
        spec.pop("own_uplights", None)
        return S.make_building(key, M, spec)
