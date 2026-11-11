# Méthode C du banc de réalisme (« proc ») : un hôtel Art déco de front de mer, tout par le code.
#
# Géométrie bmesh (C_lib) : un mur unique percé de baies à vrais tableaux (24 à 35 cm), dormants
# et petits bois, appuis, sourcils filants qui font le tour de l'angle arrondi, tour centrale à
# ailettes et acrotère en gradins, hublots, corniche, bandeau d'enseigne, soubassement en verre
# noir ; chanfreins de 0,6 à 2,5 cm figés dans le maillage. Vitres des étages à chambres simulées
# dans le shader ; rez-de-chaussée à vrais intérieurs (bar, hall, boutique) éclairés. Usure calculée
# depuis le dessin (coulures sous chaque appui, reprises, épaufrures, fissures). Néons, lavages de
# façade, enseignes en lettres Blender (mots neutres inventés). Un seul objet, teinté par sa
# couleur d'objet (et la propriété « accent ») : il s'instancie comme les huit dessins du film.
#
#   lockf -k <scratchpad>/blender.lock nice -n 19 taskpolicy -b \
#     /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/lab/C_proc.py
#
# Variables : C_NAME (nom des images, « C-proc »), C_WHICH (« large,pres »), C_DRY=1 (construit sans rendre).
import math
import os
import random
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bench  # noqa: E402
import C_lib as C  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

S = bench.S
lin = C.lin

# ---------------------------------------------------------------- le dessin (repère de l'immeuble)
# façade dans le plan x = 0 tournée vers +x, y de 0 (côté caméra) à W, z = 0 au pied du mur
W, GF, FH, NF = 20.0, 4.2, 3.2, 3
ROOF = GF + NF * FH            # 13,8 : dalle du toit
PARA = ROOF + 1.0              # 14,8 : dessus de l'acrotère
SW = 0.15                      # dessus du trottoir
RC = 3.0                       # rayon de l'angle arrondi, côté caméra
CX, CY = -RC, RC
DEP = bench.LOT["depth"]
LEFT = [(3.55, 5.95), (6.75, 9.35)]
RIGHT = [(14.6, 16.8), (17.4, 19.5)]
TW, TX = (10.0, 14.0), 0.4     # la tour : emprise en y, saillie
TWIN = [(10.6, 11.78), (12.22, 13.4)]
FINS = [(10.35, 16.4), (12.0, 17.7), (13.65, 16.4)]
TTOP = 15.8
REV = 0.24                     # profondeur des tableaux des fenêtres
LOC = (bench.LOT["x"], bench.LOT["y0"], 0.0)


def zf(f):
    return GF + f * FH


def u_ang(a):
    """Abscisse dépliée d'un point de l'arrondi d'angle (angle en degrés, −90 à 0)."""
    return CY + math.radians(a) * RC


def world(p):
    return (LOC[0] + p[0], LOC[1] + p[1], LOC[2] + p[2])


def _safe(fn, *a, **k):
    """Un matériau qui plante ne coûte pas le rendu : repli gris, trace dans le journal."""
    try:
        return fn(*a, **k)
    except Exception:
        traceback.print_exc()
        return S.mat_plain("C_fallback", (0.5, 0.5, 0.5, 1), 0.5)


def materials(wx):
    corner = (CX, CY, RC)
    return dict(
        stucco=_safe(C.mat_stucco, "C_stucco", wx, "wall", corner),
        trim=_safe(C.mat_stucco, "C_trim", wx, "trim", corner, rough=0.7),
        accent=_safe(C.mat_stucco, "C_accent", wx, "accent", corner, rough=0.75),
        vitro=_safe(C.mat_vitrolite),
        frame=_safe(C.mat_pbr, "C_frame", "#e6dfd0", 0.42, 0.1, noise_amt=0.12),
        bronze=_safe(C.mat_pbr, "C_bronze", "#4a3526", 0.32, 0.85, noise_amt=0.15),
        brass=_safe(C.mat_pbr, "C_brass", "#c79a52", 0.25, 1.0),
        room=_safe(C.mat_room_glass, "C_room_glass", gain=3.5),
        porthole=_safe(C.mat_room_glass, "C_porthole_glass", gain=1.3),
        shop=_safe(C.mat_shop_glass),
        roof=_safe(C.mat_roof),
        metal=_safe(C.mat_pbr, "C_metal", "#2a2a2e", 0.45, 0.8, noise_amt=0.2),
        pipe=_safe(C.mat_pbr, "C_pipe", "#bdb5a8", 0.5, 0.3, noise_amt=0.3),
        ac=_safe(C.mat_louvre, "C_ac", "#d8d2c4", 0.03, 2, 0.3),
        grille=_safe(C.mat_louvre, "C_grille", "#5a5650", 0.025, 2, 0.6),
        neon_coral=_safe(C.mat_neon, "C_neon_coral", S.CORAL, 12),
        neon_lilac=_safe(C.mat_neon, "C_neon_lilac", S.LILAC, 9),
        neon_amber=_safe(C.mat_neon, "C_neon_amber", S.AMBER, 12),
        letter_coral=_safe(C.mat_neon, "C_letter_coral", "#ff7448", 8),
        letter_cream=_safe(C.mat_neon, "C_letter_cream", S.CREAM, 9),
        bulb=_safe(C.mat_neon, "C_bulb", "#ffd08a", 30),
        sconce=_safe(C.mat_neon, "C_sconce", "#ffe6bf", 9),
        down=_safe(C.mat_neon, "C_downlight", "#fff1d6", 20),
        sign_panel=_safe(C.mat_pbr, "C_sign_panel", "#efe6d2", 0.5, noise_amt=0.15),
        sign_dark=_safe(C.mat_pbr, "C_sign_dark", "#2b2030", 0.5, 0.2, noise_amt=0.15),
        awning=_safe(C.mat_awning, "C_awning", S.CORAL),
        concrete=_safe(S.mat_concrete),
        checker=_safe(C.mat_terrazzo, "C_bar_floor", "#1d1b1e", "#e8dfcc", checker=0.45),
        terrazzo=_safe(C.mat_terrazzo, "C_lobby_floor", "#d9cbb3", "#d9cbb3"),
        oak=_safe(C.mat_wood, "C_oak", "#8a5a36", 1, 0.5),
        walnut=_safe(C.mat_wood, "C_walnut", "#4a2c1c", 1, 0.06),
        plum=_safe(C.mat_pbr, "C_plum_wall", "#74405a", 0.8, noise_amt=0.15, sheen=0.5),
        ceiling=_safe(C.mat_pbr, "C_ceiling", "#3a2a24", 0.7, noise_amt=0.1),
        cream_wall=_safe(C.mat_pbr, "C_cream_wall", "#e9dcc4", 0.8, noise_amt=0.1),
        mint_wall=_safe(C.mat_pbr, "C_mint_wall", "#bfe0cf", 0.8, noise_amt=0.1),
        marble=_safe(C.mat_pbr, "C_marble", "#ece4d6", 0.15, noise_amt=0.15, coat=0.5),
        mirror=_safe(C.mat_pbr, "C_mirror", "#b89a7a", 0.06, 1.0),
        bottles=[_safe(C.mat_glass, f"C_bottle_{i}", c) for i, c in enumerate(("#c47a2a", "#3f7a4a", "#e8efe6", "#8a2f3a", "#d9b44a"))],
        globe=_safe(C.mat_neon, "C_globe", "#ffc070", 16),
        cove=_safe(C.mat_neon, "C_cove", "#ffb860", 10),
        leather=_safe(C.mat_pbr, "C_leather", "#7a2e3a", 0.45, coat=0.3),
        chair=_safe(C.mat_pbr, "C_chair", "#1c1c20", 0.35, 0.9),
        boards=[_safe(C.mat_pbr, f"C_board_{i}", c, 0.2, coat=1.0) for i, c in enumerate((S.CORAL, "#8d8cf0", "#f3e7c9", "#9fd8c8", "#f2b8c6"))],
        goods=[_safe(C.mat_pbr, f"C_goods_{i}", c, 0.7) for i, c in enumerate(("#e7d3b0", "#9fd8c8", "#f2a07a", "#7c86c9", "#efefe8", "#2f3a55"))],
        pot=_safe(C.mat_pbr, "C_pot", "#d9cfc0", 0.8, noise_amt=0.25),
        leaf=_safe(C.mat_pbr, "C_leaf", "#2f4a2a", 0.5, noise_amt=0.3, sheen=0.3),
        soil=_safe(C.mat_pbr, "C_soil", "#2a1f18", 0.95),
    )


class Hotel:
    def __init__(self, seed=7):
        self.rng = random.Random(seed)
        self.wx = C.Weather("C_weather", -2.0, 20.6, 0.0, 18.6)
        self.M = materials(self.wx)
        self.G = dict(wall=C.MB("C_wall", 0.025, 2), trim=C.MB("C_trim", 0.02, 2),
                      fine=C.MB("C_fine", 0.006, 1), plain=C.MB("C_plain"))
        self.extra = []      # lettres et tubes, déjà en maillages
        self.lights = []     # (nom, type, pos locale, direction, couleur, énergie, taille, cône, caché)

    # ------------------------------------------------------------ outils
    def light(self, name, kind, loc, direction, color, energy, size=(1.0, 1.0), spot=60.0, hide=True, blend=0.75):
        self.lights.append((name, kind, loc, direction, color, energy, size, spot, hide, blend))

    def tube(self, paths, r, mat, name="tube"):
        self.extra.append(C.tube(paths, r, mat, name))

    def text(self, *a, **k):
        self.extra.append(C.text(*a, **k))

    def glass(self, xg, ya, yb, za, zb, room):
        rng = self.rng
        bf = rng.choice([0, 0, 0, 0.25, 0.4, 0.55, 0.7, 0.85, 0.97])
        if 0 < bf < 0.9:
            bf += rng.uniform(-0.06, 0.06)
        ck = rng.choice([0, 0, 0, 0.6, 0.6, 0.9])
        attrs = dict(rlo=room[:3], rhi=room[3:], wz=(za, zb, bf), wy=(ya, yb, ck), rseed=rng.random() * 100)
        self.G["plain"].quad([(xg, ya, za), (xg, yb, za), (xg, yb, zb), (xg, ya, zb)], self.M["room"], (1, 0, 0), attrs)

    # ------------------------------------------------------------ le gros œuvre
    def body(self):
        G, M = self.G, self.M
        st = M["stucco"]
        G["plain"].box(-DEP, -0.3, 3.0, W, GF - 0.25, ROOF - 0.2, st)
        G["plain"].box(-DEP, -0.3, 3.0, W, ROOF - 0.2, ROOF, M["roof"])
        G["plain"].box(-DEP, -6.4, 3.0, W, 0.0, GF - 0.25, st)
        G["wall"].prism([(CX, CY)] + C.arc_pts(CX, CY, RC, -90, 0, 32), 0.0, PARA, st)
        G["wall"].box(-DEP, CX, 0.0, 3.0, 0.0, PARA, st)
        G["wall"].box(-DEP, -DEP + 0.3, 3.0, W, ROOF, PARA, st)
        G["wall"].box(-DEP, -0.3, W - 0.3, W, ROOF, PARA, st)
        G["plain"].box(CX - 0.3, 0.0, -0.02, 3.0, -0.05, SW, M["concrete"])

    def facade(self):
        holes = [(3.4, 9.6, SW, 3.5, 0.3), (10.5, 13.5, SW, 3.6, 0.35), (14.4, 19.6, SW, 3.5, 0.3)]
        for f in range(NF):
            for (ya, yb) in LEFT + RIGHT:
                holes.append((ya, yb, zf(f) + 0.85, zf(f) + 2.45, REV))
        self.G["wall"].wall(0.0, 3.0, W, 0.0, PARA, holes, self.M["stucco"], rim=("top",), rim_d=0.35)
        for h in holes:
            self.wx.opening(*h[:4])

    def window(self, xf, ya, yb, za, zb, zfl, style):
        G, M = self.G, self.M
        G["trim"].box(xf - 0.03, xf + 0.07, ya - 0.07, yb + 0.07, za - 0.06, za + 0.004, M["trim"])
        self.wx.ledge(ya - 0.07, yb + 0.07, za - 0.06, 1.0)
        x0, x1 = xf - REV + 0.02, xf - REV + 0.09
        fr = M["frame"]
        fm = G["fine"]
        fm.box(x0, x1, ya, yb, za, za + 0.06, fr)
        fm.box(x0, x1, ya, yb, zb - 0.06, zb, fr)
        fm.box(x0, x1, ya, ya + 0.05, za, zb, fr)
        fm.box(x0, x1, yb - 0.05, yb, za, zb, fr)
        if yb - ya > 1.5 or style == "tall":
            ym = (ya + yb) / 2
            fm.box(x0, x1, ym - 0.03, ym + 0.03, za, zb, fr)
        if style == "transom":
            zt = za + (zb - za) * 0.72
            fm.box(x0 + 0.01, x1 - 0.01, ya, yb, zt - 0.025, zt + 0.025, fr)
        else:
            for q in ((0.3, 0.55, 0.8) if style == "bars" else (0.33, 0.66)):
                zt = za + (zb - za) * q
                fm.box(x0 + 0.015, x1 - 0.02, ya, yb, zt - 0.016, zt + 0.016, fr)
        xg = xf - REV + 0.05
        self.glass(xg, ya, yb, za, zb, (xg - 3.8, ya - 0.8, zfl + 0.02, xg + 0.01, yb + 0.8, zfl + 2.95))

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

    def floors(self):
        rng = self.rng
        ac = {(0, 1), (1, 2), (2, 0), (0, 3), (2, 3)}
        for f in range(NF):
            z = zf(f)
            for k, (ya, yb) in enumerate(LEFT + RIGHT):
                self.window(0.0, ya, yb, z + 0.85, z + 2.45, z, "transom" if k < 2 else "bars")
                if (f, k) in ac:
                    self.aircon(0.0, (ya + yb) / 2 + rng.uniform(-0.35, 0.35), z + 0.85 - 0.1)
        tr, M = self.G["trim"], self.M
        for f in range(NF):
            ze = zf(f) + 2.57
            tr.box(-0.05, 0.55, 3.0, 9.75, ze, ze + 0.1, M["trim"])
            tr.prism(C.ring_sector(CX, CY, RC - 0.05, RC + 0.55, -75, 0, 28), ze, ze + 0.1, M["trim"])
            tr.box(-0.05, 0.5, 14.35, 19.75, ze, ze + 0.1, M["trim"])
            self.wx.ledge(u_ang(-75), 9.75, ze, 0.9)
            self.wx.ledge(14.35, 19.75, ze, 0.9)

    def portholes(self):
        G, M = self.G, self.M
        a = math.radians(-45)
        n = Vector((math.cos(a), math.sin(a), 0.0))
        for f in range(-1, NF):
            zc = zf(f) + 1.65 if f >= 0 else 1.95
            zfl = zf(f) if f >= 0 else SW
            r = 0.36 if f >= 0 else 0.3
            c = Vector((CX + RC * math.cos(a), CY + RC * math.sin(a), zc))
            G["plain"].torus(c + n * 0.03, n, r + 0.04, 0.05, M["trim"], seg=28, rseg=10)
            attrs = dict(rlo=(-4.5, -0.6, zfl + 0.02), rhi=(0.4, 4.5, zfl + (2.95 if f >= 0 else 3.5)),
                         wz=(zc - r, zc + r, 0.0), wy=(0.0, 1.0, 0.0), rseed=self.rng.random() * 100)
            G["plain"].disc(c + n * 0.034, n, r, M["porthole"], seg=28, attrs=attrs)
            u = u_ang(-45)
            self.wx.opening(u - r - 0.05, u + r + 0.05, zc - r - 0.05, zc + r + 0.05)
            self.wx.ledge(u - 0.3, u + 0.3, zc - r - 0.06, 0.6)

    def tower(self):
        G, M, wx = self.G, self.M, self.wx
        st = M["stucco"]
        holes = [(ya, yb, zf(f) + 0.55, zf(f) + 2.6, REV) for f in range(NF) for (ya, yb) in TWIN]
        G["wall"].wall(TX, TW[0], TW[1], GF, TTOP, holes, st, rim=("top", "bottom", "left", "right"), rim_d=TX)
        for h in holes:
            wx.opening(*h[:4])
        G["wall"].box(-1.0, 0.0, TW[0], TW[1], PARA - 0.1, TTOP, st)
        G["wall"].box(-1.0, 0.3, 10.6, 13.4, TTOP, 16.5, st)
        G["wall"].box(-1.0, 0.2, 11.2, 12.8, 16.5, 17.1, st)
        wx.ledge(TW[0], TW[1], TTOP, 0.6)
        for f in range(NF):
            for (ya, yb) in TWIN:
                self.window(TX, ya, yb, zf(f) + 0.55, zf(f) + 2.6, zf(f), "tall")
            z0, z1 = zf(f) + 2.68, zf(f) + 3.67
            for (ya, yb) in TWIN:
                G["trim"].box(TX, TX + 0.03, ya, yb, z0, z1, M["accent"])
                for q in (0.25, 0.5, 0.75):
                    yq = ya + (yb - ya) * q
                    G["trim"].box(TX + 0.03, TX + 0.06, yq - 0.03, yq + 0.03, z0 + 0.08, z1 - 0.08, M["accent"])
                wx.ledge(ya, yb, z0, 0.35)
        for yc, top in FINS:
            G["trim"].box(TX - 0.05, 1.0, yc - 0.08, yc + 0.08, GF + 0.05, TTOP, M["trim"])
            G["trim"].box(-0.6, 1.0, yc - 0.08, yc + 0.08, TTOP, top, M["trim"])
            G["trim"].box(-0.4, 0.75, yc - 0.06, yc + 0.06, top, top + 0.3, M["trim"])
            self.tube([[(1.035, yc, GF + 0.3), (1.035, yc, top - 0.05)]], 0.018, M["neon_lilac"], "neon_fin")
            self.light(f"fin_{yc}", "AREA", (1.08, yc, (GF + top) / 2), (-1, 0, 0), S.LILAC, 35.0, (0.05, top - GF))
            wx.arrises.append(yc)
        wx.arrises += [TW[0], TW[1]]
        G["fine"].cyl((-0.3, 12.0, 17.1), (-0.3, 12.0, 21.4), 0.04, M["metal"], seg=8)
        for zz, ll in ((19.6, 0.7), (20.6, 0.45)):
            G["fine"].cyl((-0.3, 12.0 - ll, zz), (-0.3, 12.0 + ll, zz), 0.015, M["metal"], seg=6)

    def parapet(self):
        G, M, wx = self.G, self.M, self.wx
        tr = G["trim"]
        for (a, b) in ((3.0, TW[0]), (TW[1], W)):
            tr.box(-0.35, 0.06, a, b, PARA, PARA + 0.1, M["trim"])
            for zz in (14.0, 14.2, 14.4):
                tr.box(0.0, 0.035, a, b, zz, zz + 0.06, M["accent"])
                wx.ledge(a, b, zz, 0.2)
            wx.ledge(a, b, PARA, 0.5)
        tr.prism(C.ring_sector(CX, CY, RC - 0.35, RC + 0.06, -90, 0, 32), PARA, PARA + 0.1, M["trim"])
        for zz in (14.0, 14.2, 14.4):
            tr.prism(C.ring_sector(CX, CY, RC - 0.01, RC + 0.035, -90, 0, 32), zz, zz + 0.06, M["accent"])
        wx.ledge(u_ang(-90), 3.0, PARA, 0.5)
        arc = [(CX + (RC + 0.09) * math.cos(math.radians(a)), CY + (RC + 0.09) * math.sin(math.radians(a)), PARA + 0.05) for a in range(-88, 1, 4)]
        self.tube([arc + [(0.09, 9.95, PARA + 0.05)], [(0.09, 14.05, PARA + 0.05), (0.09, 19.95, PARA + 0.05)]], 0.016, M["neon_coral"], "neon_parapet")

    def roof(self):
        G, M = self.G, self.M
        G["wall"].box(-9.5, -6.5, 11.5, 14.5, ROOF, 16.5, M["stucco"])
        G["trim"].box(-9.7, -6.3, 11.3, 14.7, 16.5, 16.62, M["trim"])
        G["fine"].cyl((-11.0, 6.0, ROOF + 1.3), (-11.0, 6.0, ROOF + 3.0), 1.0, M["metal"], seg=20)
        G["fine"].cyl((-11.0, 6.0, ROOF + 3.0), (-11.0, 6.0, ROOF + 3.5), 1.02, M["metal"], r1=0.1, seg=20)
        for dx, dy in ((-0.7, -0.7), (0.7, -0.7), (-0.7, 0.7), (0.7, 0.7)):
            G["fine"].cyl((-11.0 + dx, 6.0 + dy, ROOF), (-11.0 + dx, 6.0 + dy, ROOF + 1.3), 0.05, M["metal"], seg=6)
        for y in (4.5, 6.3):
            G["trim"].box(-4.6, -3.6, y, y + 1.2, ROOF, ROOF + 0.85, M["ac"])

    # ------------------------------------------------------------ le rez-de-chaussée
    def ground(self):
        G, M, wx = self.G, self.M, self.wx
        tr, fm = G["trim"], G["fine"]
        tr.box(0.0, 0.32, 3.0, W, 3.93, 4.2, M["trim"])
        tr.prism(C.ring_sector(CX, CY, RC - 0.05, RC + 0.32, -84, 0, 30), 3.93, 4.2, M["trim"])
        wx.ledge(u_ang(-84), W, 3.93, 0.6)
        for (a, b) in ((3.0, 10.15), (13.85, W)):
            tr.box(0.0, 0.02, a, b, 3.5, 3.93, M["accent"])
        for (a, b) in ((3.0, 3.4), (9.6, 10.5), (13.5, 14.4), (19.6, W)):
            fm.box(0.0, 0.025, a, b, SW, 0.72, M["vitro"])
        fm.prism(C.ring_sector(CX, CY, RC - 0.02, RC + 0.025, -86, 0, 30), SW, 0.72, M["vitro"])
        steps = [lambda: self.shopfront(3.4, 9.6, (3.42, 4.38), [5.95, 7.75]),
                 lambda: self.shopfront(14.4, 19.6, (14.42, 15.38), [17.45]),
                 self.bar, self.surf, self.lobby, self.canopy, self.awning, self.signs, self.street_bits]
        for step in steps:
            try:
                step()
            except Exception:
                print("[C] ÉCHEC rez-de-chaussée", getattr(step, "__name__", "?"), flush=True)
                traceback.print_exc()

    def shopfront(self, ya, yb, door, mull, zt=2.7, ztop=3.5, d=0.3):
        G, M = self.G, self.M
        fm, pl = G["fine"], G["plain"]
        xg, x0, x1 = -d + 0.03, -d, -d + 0.07
        br = M["bronze"]
        da, db = door
        for (a, b) in ((ya, da), (db, yb)):
            if b - a > 0.05:
                fm.box(x0 - 0.01, x1, a, b, SW, 0.62, M["vitro"])
                fm.box(x0, x1, a, b, 0.62, 0.68, br)
                pl.quad([(xg, a, 0.68), (xg, b, 0.68), (xg, b, zt), (xg, a, zt)], M["shop"], (1, 0, 0))
        pl.quad([(xg, ya, zt + 0.06), (xg, yb, zt + 0.06), (xg, yb, ztop), (xg, ya, ztop)], M["shop"], (1, 0, 0))
        pl.quad([(xg - 0.02, da + 0.06, SW + 0.14), (xg - 0.02, db - 0.06, SW + 0.14), (xg - 0.02, db - 0.06, zt - 0.06), (xg - 0.02, da + 0.06, zt - 0.06)], M["shop"], (1, 0, 0))
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

    def room_shell(self, xb, ya, yb, floor, wall, ceil, zc=3.9, d=0.3):
        pl = self.G["plain"]
        pl.box(xb, -d, ya, yb, 0.05, SW, floor, faces=("+z",))
        pl.box(xb, -d, ya, yb, zc, zc + 0.1, ceil, faces=("-z",))
        pl.box(xb, -d, ya - 0.1, ya, SW, zc, wall, faces=("+y",))
        pl.box(xb, -d, yb, yb + 0.1, SW, zc, wall, faces=("-y",))
        pl.box(xb - 0.1, xb, ya, yb, SW, zc, wall, faces=("+x",))

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

    def bar(self):
        G, M, rng = self.G, self.M, self.rng
        pl, fm = G["plain"], G["fine"]
        ya, yb, xb = 3.4, 9.6, -6.2
        self.room_shell(xb, ya, yb, M["checker"], M["plum"], M["ceiling"])
        pl.box(xb, xb + 0.02, 4.2, 8.8, 1.1, 2.75, M["mirror"], faces=("+x",))
        for zs in (1.35, 1.8, 2.25):
            fm.box(xb, xb + 0.3, 4.2, 8.8, zs, zs + 0.035, M["walnut"])
            pl.box(xb + 0.26, xb + 0.29, 4.2, 8.8, zs - 0.025, zs, M["cove"])
            y = 4.3
            while y < 8.7:
                r, hgt = rng.uniform(0.03, 0.045), rng.uniform(0.2, 0.32)
                mat = rng.choice(M["bottles"])
                z0 = zs + 0.035
                pl.cyl((xb + 0.15, y, z0), (xb + 0.15, y, z0 + hgt * 0.68), r, mat, seg=10)
                pl.cyl((xb + 0.15, y, z0 + hgt * 0.68), (xb + 0.15, y, z0 + hgt), r * 0.9, mat, r1=r * 0.3, seg=8)
                y += rng.uniform(0.09, 0.16)
        fm.box(xb, xb + 0.6, 4.0, 9.0, SW, 1.0, M["walnut"])
        fm.box(xb, xb + 0.65, 3.95, 9.05, 1.0, 1.04, M["marble"])
        fm.box(-3.9, -3.25, 4.0, 9.0, SW, 1.05, M["walnut"])
        fm.box(-3.95, -3.15, 3.95, 9.05, 1.05, 1.1, M["marble"])
        pl.cyl((-3.12, 4.0, 0.3), (-3.12, 9.0, 0.3), 0.02, M["brass"], seg=8)
        for k in range(6):
            y = 4.45 + k * 0.86
            pl.cyl((-2.75, y, SW), (-2.75, y, SW + 0.02), 0.2, M["chair"], seg=14)
            pl.cyl((-2.75, y, SW), (-2.75, y, 0.74), 0.025, M["brass"], seg=8)
            pl.cyl((-2.75, y, 0.74), (-2.75, y, 0.8), 0.19, M["leather"], seg=16)
        for y in (4.6, 6.0, 7.4, 8.8):
            pl.ellipsoid((-3.55, y, 2.55), (0.13, 0.13, 0.13), M["globe"], nu=12, nv=8)
            pl.cyl((-3.55, y, 2.68), (-3.55, y, 3.9), 0.006, M["chair"], seg=6)
        for y in (5.3, 7.7):
            self.table(pl, -1.1, y)
            self.chair(pl, -1.1, y - 0.55, -1)
            self.chair(pl, -1.1, y + 0.55, 1)
        self.text("COCKTAILS", (-0.4, 6.5, 3.12), (0, 1, 0), (0, 0, 1), 0.26, M["neon_amber"], extrude=0.008, bold=0.008)
        self.light("bar", "AREA", (-3.2, 6.5, 3.85), (0, 0, -1), "#ffc488", 1000.0, (5.0, 5.6))
        self.light("bar_back", "AREA", (-5.6, 6.5, 2.9), (-1, 0, -0.3), "#ffb060", 140.0, (0.4, 4.6))

    def surf(self):
        G, M, rng = self.G, self.M, self.rng
        pl, fm = G["plain"], G["fine"]
        ya, yb, xb = 14.4, 19.6, -6.0
        self.room_shell(xb, ya, yb, M["oak"], M["mint_wall"], M["cream_wall"])
        for k, y in enumerate((15.2, 15.85, 16.5, 17.15, 17.8, 18.45, 19.05)):
            rot = (Matrix.Rotation(rng.uniform(-0.07, 0.07), 3, "X") @ Matrix.Rotation(-0.13, 3, "Y"))
            pl.ellipsoid((xb + 0.3, y, 1.28), (0.05, 0.27, 1.08 - 0.1 * (k % 3)), M["boards"][k % 5], rot=rot, nu=18, nv=12)
        for zs in (0.9, 1.5, 2.1):
            fm.box(-5.4, -1.2, ya, ya + 0.45, zs, zs + 0.03, M["oak"])
            y0 = -5.3
            while y0 < -1.5:
                w = rng.uniform(0.25, 0.45)
                pl.box(y0, y0 + w, ya + 0.04, ya + 0.4, zs + 0.03, zs + 0.03 + rng.uniform(0.08, 0.3), rng.choice(M["goods"]))
                y0 += w + rng.uniform(0.03, 0.12)
        fm.box(-3.6, -2.2, 16.0, 18.0, SW, 0.82, M["oak"])
        for k in range(7):
            a, b = rng.uniform(-3.5, -2.6), rng.uniform(16.1, 17.6)
            pl.box(a, a + 0.38, b, b + 0.3, 0.82, 0.82 + rng.uniform(0.03, 0.12), rng.choice(M["goods"]))
        for y in (15.6, 17.0, 18.4):
            pl.ellipsoid((-2.9, y, 2.75), (0.16, 0.16, 0.12), M["sconce"], nu=12, nv=8)
            pl.cyl((-2.9, y, 2.86), (-2.9, y, 3.9), 0.006, M["chair"], seg=6)
        self.plant(pl, -0.9, 19.1, 1.2)
        self.light("surf", "AREA", (-3.0, 17.0, 3.85), (0, 0, -1), "#fff0da", 420.0, (5.4, 4.8))

    def lobby(self):
        G, M, rng = self.G, self.M, self.rng
        pl, fm = G["plain"], G["fine"]
        ya, yb, d = 10.5, 13.5, 0.35
        xg, x0, x1 = -d + 0.03, -d, -d + 0.07
        br = M["bronze"]
        zt, ztop = 2.6, 3.6
        for (a, b) in ((ya, 11.1), (12.9, yb)):
            fm.box(x0 - 0.01, x1, a, b, SW, 0.5, M["vitro"])
            pl.quad([(xg, a, 0.5), (xg, b, 0.5), (xg, b, zt), (xg, a, zt)], M["shop"], (1, 0, 0))
        for (a, b) in ((11.1, 12.0), (12.0, 12.9)):
            pl.quad([(xg - 0.03, a + 0.07, SW + 0.15), (xg - 0.03, b - 0.07, SW + 0.15), (xg - 0.03, b - 0.07, zt - 0.07), (xg - 0.03, a + 0.07, zt - 0.07)], M["shop"], (1, 0, 0))
            for y in (a + 0.035, b - 0.035):
                fm.box(x0 - 0.03, x1 - 0.03, y - 0.035, y + 0.035, SW, zt, br)
            fm.box(x0 - 0.03, x1 - 0.03, a, b, SW, SW + 0.15, br)
            fm.box(x0 - 0.03, x1 - 0.03, a, b, zt - 0.07, zt, br)
            yh = b - 0.2 if a < 12.0 else a + 0.2
            fm.cyl((xg + 0.05, yh, 0.8), (xg + 0.05, yh, 1.6), 0.016, M["brass"], seg=8)
        pl.quad([(xg, ya, zt + 0.05), (xg, yb, zt + 0.05), (xg, yb, ztop), (xg, ya, ztop)], M["shop"], (1, 0, 0))
        for y in (ya + 0.03, 11.1, 12.9, yb - 0.03):
            fm.box(x0, x1, y - 0.03, y + 0.03, SW, ztop, br)
        for z in (0.47, zt, ztop - 0.05):
            fm.box(x0, x1, ya, yb, z, z + 0.05, br)
        cy, cz = 12.0, zt + 0.05
        for k in range(9):
            ang = math.pi * (k + 1) / 10
            c, s = math.cos(ang), math.sin(ang)
            t = min((ztop - 0.05 - cz) / s, (yb - ya) / 2 / max(1e-3, abs(c)))
            fm.cyl((x0 + 0.035, cy, cz), (x0 + 0.035, cy + c * t, cz + s * t), 0.012, br, seg=6)
        fm.cyl((x0 + 0.02, cy, cz), (x0 + 0.06, cy, cz), 0.16, br, seg=16)
        xb = -7.0
        self.room_shell(xb, ya, yb, M["terrazzo"], M["cream_wall"], M["cream_wall"], zc=4.0, d=d)
        pl.box(xb, xb + 0.02, 11.0, 13.0, 1.4, 3.4, M["brass"], faces=("+x",))
        fm.box(-6.3, -5.6, 11.0, 13.0, SW, 1.1, M["walnut"])
        fm.box(-6.35, -5.55, 10.95, 13.05, 1.1, 1.14, M["marble"])
        pl.cyl((-5.95, 11.4, 1.14), (-5.95, 11.4, 1.45), 0.012, M["brass"], seg=6)
        pl.cyl((-5.95, 11.4, 1.42), (-5.95, 11.4, 1.62), 0.15, M["globe"], r1=0.09, seg=14)
        pl.torus((-3.2, 12.0, 3.5), (0, 0, 1), 0.45, 0.035, M["down"], seg=24, rseg=6)
        for k in range(3):
            a = 2 * math.pi * k / 3
            pl.cyl((-3.2 + 0.45 * math.cos(a), 12.0 + 0.45 * math.sin(a), 3.5), (-3.2, 12.0, 4.0), 0.005, M["chair"], seg=4)
        self.plant(pl, -1.3, 13.05, 1.4)
        self.light("lobby", "AREA", (-3.5, 12.0, 3.95), (0, 0, -1), "#ffd9a8", 560.0, (6.0, 2.8))

    def canopy(self):
        G, M = self.G, self.M
        pl = G["plain"]
        G["trim"].prism(S.rounded_footprint(0.0, 2.3, 10.15, 13.85, 0.5), 3.62, 3.92, M["trim"])
        for yy in (10.8, 12.0, 13.2):
            for xx in (0.8, 1.7):
                pl.cyl((xx, yy, 3.6), (xx, yy, 3.621), 0.07, M["down"], seg=12, smooth=False)
        self.text("OCEAN", (2.315, 12.0, 3.77), (0, 1, 0), (0, 0, 1), 0.3, M["letter_cream"], extrude=0.01, bold=0.012)
        for yy in (10.45, 13.55):
            pl.cyl((2.0, yy, 3.92), (TX, yy, 5.6), 0.018, M["metal"], seg=8)
        vy = 10.32
        pl.box(1.0, 2.15, vy - 0.03, vy + 0.03, 3.05, 3.4, M["sign_dark"])
        for xx in (1.1, 2.05):
            pl.cyl((xx, vy, 3.4), (xx, vy, 3.62), 0.006, M["metal"], seg=4)
        self.text("VACANCY", (1.575, vy - 0.042, 3.225), (1, 0, 0), (0, 0, 1), 0.17, M["neon_coral"], extrude=0.008, bold=0.006)
        self.light("canopy", "AREA", (1.15, 12.0, 3.55), (0, 0, -1), "#ffe2bf", 220.0, (2.0, 3.4))

    def awning(self, ya=3.55, yb=9.45, x1=1.85, zw=3.45, zl=2.72):
        G, M = self.G, self.M
        pl, fm = G["plain"], G["fine"]

        def fa(u, v):
            y = ya + (yb - ya) * u
            sagz = 0.035 * math.sin(math.pi * v) * (0.6 + 0.4 * abs(math.sin(math.pi * (y - ya) / 1.475)))
            return (x1 * v, y, zw + (zl - zw) * v - sagz)
        pl.grid(fa, 60, 8, M["awning"], (0.4, 0, 1))
        n = int(round((yb - ya) / 0.5))

        def fv(u, v):
            y = ya + (yb - ya) * u
            t = ((y - ya) / ((yb - ya) / n)) % 1.0
            depth = 0.13 + 0.08 * math.sqrt(max(0.0, 1 - (2 * t - 1) ** 2))
            return (x1 + 0.004, y, zl - depth * v)
        pl.grid(fv, n * 12, 2, M["awning"], (1, 0, 0))
        fm.box(0.0, 0.2, ya - 0.05, yb + 0.05, 3.42, 3.58, M["metal"])
        for y in (ya + 0.05, (ya + yb) / 2, yb - 0.05):
            fm.cyl((0.02, y, 3.0), (x1 - 0.05, y, zl + 0.02), 0.018, M["metal"], seg=8)
        fm.cyl((x1, ya, zl), (x1, yb, zl), 0.02, M["metal"], seg=8)
        wire = C.sag((x1 - 0.12, ya + 0.05, zl - 0.06), (x1 - 0.12, yb - 0.05, zl - 0.06), 0.12, 24)
        self.tube([wire], 0.004, M["chair"], "wire_bulbs")
        for k in range(1, 24, 2):
            p = wire[k]
            pl.ellipsoid((p[0], p[1], p[2] - 0.05), (0.032, 0.032, 0.042), M["bulb"], nu=8, nv=6)
        for y in (5.0, 7.9):
            self.table(pl, 1.05, y)
            self.chair(pl, 1.05, y - 0.58, -1)
            self.chair(pl, 1.05, y + 0.58, 1)

    def signs(self):
        G, M = self.G, self.M
        tr, fm = G["trim"], G["fine"]
        # le drapeau du bar, à l'angle
        yb_, x0, x1, z0, z1 = 3.2, 0.15, 1.15, 2.6, 3.4
        tr.box(x0, x1, yb_ - 0.06, yb_ + 0.06, z0, z1, M["sign_dark"])
        for zz in (z0 + 0.1, z1 - 0.1):
            fm.box(0.0, x0, yb_ - 0.02, yb_ + 0.02, zz - 0.02, zz + 0.02, M["metal"])
        xm, zm = (x0 + x1) / 2, (z0 + z1) / 2
        self.text("BAR", (xm, yb_ - 0.072, zm), (1, 0, 0), (0, 0, 1), 0.42, M["neon_amber"], extrude=0.01, bold=0.01)
        self.text("BAR", (xm, yb_ + 0.072, zm), (-1, 0, 0), (0, 0, 1), 0.42, M["neon_amber"], extrude=0.01, bold=0.01)
        for s in (-1, 1):
            yy = yb_ + s * 0.07
            self.tube([[(x0 + 0.05, yy, z0 + 0.05), (x1 - 0.05, yy, z0 + 0.05), (x1 - 0.05, yy, z1 - 0.05), (x0 + 0.05, yy, z1 - 0.05), (x0 + 0.05, yy, z0 + 0.05)]], 0.01, M["neon_coral"], "neon_bar")
        # le grand drapeau vertical de l'hôtel, contre la tour
        yc, x0, x1, z0, z1 = 14.2, 0.5, 1.8, 5.3, 12.9
        tr.box(x0, x1, yc - 0.12, yc + 0.12, z0, z1, M["sign_panel"])
        tr.box(x0 + 0.15, x1 - 0.15, yc - 0.09, yc + 0.09, z1, z1 + 0.35, M["sign_panel"])
        tr.box(x0 + 0.4, x1 - 0.4, yc - 0.06, yc + 0.06, z1 + 0.35, z1 + 0.65, M["sign_panel"])
        tr.box(x0 + 0.3, x1 - 0.3, yc - 0.09, yc + 0.09, z0 - 0.3, z0, M["sign_panel"])
        for zz in (z0 + 0.4, (z0 + z1) / 2, z1 - 0.4):
            fm.box(0.0, x0, yc - 0.03, yc + 0.03, zz, zz + 0.08, M["metal"])
        xm = (x0 + x1) / 2
        for k, ch in enumerate("HOTEL"):
            z = z1 - 0.8 - k * 1.43
            self.text(ch, (xm, yc - 0.13, z), (1, 0, 0), (0, 0, 1), 1.1, M["letter_coral"], extrude=0.02, bold=0.02)
            self.text(ch, (xm, yc + 0.13, z), (-1, 0, 0), (0, 0, 1), 1.1, M["letter_coral"], extrude=0.02, bold=0.02)
        for s in (-1, 1):
            yy = yc + s * 0.135
            self.tube([[(x0 + 0.08, yy, z0 + 0.08), (x1 - 0.08, yy, z0 + 0.08), (x1 - 0.08, yy, z1 - 0.08), (x0 + 0.08, yy, z1 - 0.08), (x0 + 0.08, yy, z0 + 0.08)]], 0.016, M["neon_lilac"], "neon_hotel")
        # l'enseigne en bandeau de la boutique
        self.text("SURF SHOP", (0.032, 17.0, 3.715), (0, 1, 0), (0, 0, 1), 0.3, M["letter_cream"], extrude=0.012, bold=0.01)

    def street_bits(self):
        G, M, wx = self.G, self.M, self.wx
        fm, tr, pl = G["fine"], G["trim"], G["plain"]
        for yp in (9.88, 19.85):
            fm.cyl((0.09, yp, 0.45), (0.09, yp, PARA - 0.45), 0.055, M["pipe"], seg=12)
            fm.cyl((0.09, yp, 0.47), (0.26, yp, SW + 0.06), 0.055, M["pipe"], seg=12)
            tr.box(-0.02, 0.22, yp - 0.15, yp + 0.15, PARA - 0.7, PARA - 0.4, M["pipe"])
            z = 1.6
            while z < PARA - 1.0:
                fm.box(0.0, 0.15, yp - 0.07, yp + 0.07, z, z + 0.04, M["metal"])
                z += 1.85
            wx.pipes.append(yp)
        for y in (10.05, 13.95):
            fm.box(0.0, 0.02, y - 0.09, y + 0.09, 2.15, 2.75, M["brass"])
            pl.cyl((0.02, y, 2.22), (0.02, y, 2.68), 0.075, M["sconce"], seg=14)
            self.plant(pl, 0.42, y, 1.0)
        fm.box(0.0, 0.14, 19.66, 19.94, 1.0, 1.45, M["pipe"])
        self.tube([[(0.04, 19.8, 1.45), (0.04, 19.8, 3.9)], C.sag((0.12, 19.75, 4.45), (0.55, 14.32, 5.6), 0.3, 20),
                   [(1.2, 14.2, 13.55), (0.6, 14.4, 14.2), (0.0, 14.6, 14.6)]], 0.009, M["metal"], "cables")
        # projecteurs de façade : lavage qui s'éteint en montant
        ups = [((0.24, 5.0), "#ffd9a8"), ((0.24, 8.4), "#ffd9a8"), ((0.24, 15.6), "#ffd9a8"), ((0.24, 18.6), "#ffd9a8")]
        for k, ((x, y), col) in enumerate(ups):
            fm.box(x - 0.07, x + 0.07, y - 0.09, y + 0.09, 4.2, 4.3, M["metal"])
            self.light(f"up_{k}", "SPOT", (x + 0.02, y, 4.33), (-0.2, 0, 1), col, 480.0, spot=62, blend=0.85)
        for k, y in enumerate((11.2, 12.8)):
            fm.box(0.84, 0.98, y - 0.08, y + 0.08, 3.92, 4.0, M["metal"])
            self.light(f"up_t{k}", "SPOT", (0.9, y, 4.02), (-0.13, 0, 1), S.LILAC, 380.0, spot=36, blend=0.8)
        fm.box(0.22, 0.42, 0.22, 0.42, SW, SW + 0.12, M["metal"])
        self.light("up_corner", "SPOT", (0.32, 0.32, SW + 0.15), (-0.42, 0.42, 1), S.CORAL, 480.0, spot=48, blend=0.8)

    # ------------------------------------------------------------ assemblage
    def build(self):
        t0 = time.time()
        for step in (self.body, self.facade, self.floors, self.portholes, self.tower, self.parapet, self.roof, self.ground):
            try:
                step()
            except Exception:
                print(f"[C] ÉCHEC {step.__name__}", flush=True)
                traceback.print_exc()
        self.wx.bake()
        objs = [g.done() for g in self.G.values()] + self.extra
        ob = S.join(objs, "C_hotel")
        ob.location = LOC
        ob.color = (*lin("#f2d0c0")[:3], 1.0)
        ob["accent"] = list(lin("#a7a2e6")[:3])
        for (name, kind, loc, d, col, e, size, spot, hide, blend) in self.lights:
            L = S.add_light("C_" + name, kind, world(loc), d, lin(col) if isinstance(col, str) else col, e, size, spot)
            if kind == "SPOT":
                L.data.spot_blend = blend
            if hide:
                L.visible_camera = False
        nf = len(ob.data.polygons)
        print(f"[C] immeuble : {nf} faces, {len(ob.data.vertices)} sommets, {len(self.lights)} lumières, {time.time() - t0:.1f} s", flush=True)
        return ob


def main():
    bench.setup()
    Hotel().build()
    if os.environ.get("C_DRY"):
        print("[C] construit, pas de rendu", flush=True)
        return
    which = tuple(os.environ.get("C_WHICH", "large,pres").split(","))
    bench.render(os.environ.get("C_NAME", "C-proc"), which=which)


main()
