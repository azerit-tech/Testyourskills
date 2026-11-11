# Scène D, la jetée et la pointe : 300 m de jetée droite et plate au départ du port, puis la pointe, un
# terre-plein rond de 60 m en enrobé, entouré d'eau, un quai de pierre, un garde-corps bas, un seul lampadaire ; et
# ses trois plans P6 (toute la ville), FIN (l'arrestation) et FIN6 (l'encerclement)
# (docs/cinematique-poursuite.md §2.4).
#
# Construire et rendre un plan (une seule commande, sous le verrou commun) :
#
#   FILM3D_HERO=w111 lockf -k <verrou> nice -n 19 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
#     --factory-startup -P tools/film3d/render_lieux.py -- --lieu pointe --plan FIN [--engine cycles --samples 32]
#
# écrit Azerit/design/film/ref/lieux/pointe-FIN-socle[-cadrage].png (render_lieux.py).
#
# Repère : le monde de l'eau de lieux.py. La jetée a son axe en x = 80, de y = 100 (le bout du terre-plein du
# port) à y = 400 ; la pointe est centrée en (80, 430). La poursuite roule vers +y ; la ville est derrière, vers
# -y, avec la bande corail du ciel. Toutes les caméras regardent vers elle.
#
# La jetée : chaussée de 8 m à deux voies, trottoirs de 2 m, couronnement de pierre, garde-corps et mur de quai
# (lieux.roadway, rail « quai »), lampadaires des deux côtés tous les 30 m.
# La pointe : enrobé, couronnement, mur de quai, garde-corps de 0,9 m, une borne d'amarrage tous les 8 m, le
# lampadaire à 8 m du point d'arrêt, hors de l'axe de la jetée. Côté lagune (sud-est), le garde-corps s'ouvre
# trois fois sur 2,5 m, fermé par une chaîne : les passerelles de la marina s'y accrocheront (palier « marina »).
import math
import os
import random
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lieux as L  # noqa: E402

S, road = L.S, L.road

# ---------------------------------------------------------------- les cotes

JX = L.JETTY_X                  # 80 : l'axe de la jetée
JY0, JY1 = L.JETTY_YS           # 100 .. 400
J_HALF = 4.0                    # la chaussée à deux voies, cunettes comprises
J_WALK = 2.0
J_EDGE = J_HALF + 0.2 + J_WALK + 0.5      # 6,7 : le bord du couronnement
J_LAMPS = [JY0 + 15.0 + 30.0 * k for k in range(10)]   # 115 .. 385

CX, CY = L.POINTE               # (80, 430)
R = L.POINTE_R                  # 30
COPING = 0.55
RAIL_H = 0.9
OPENINGS = (-20.0, -40.0, -60.0)  # les trois ouvertures (degrés autour du centre, depuis +x), côté lagune
OPEN_W = 2.5
STOP = Vector((CX, CY, 0.0))    # là où la berline s'arrête
LAMP_AT = (CX + 5.5, CY - 5.8)  # à 8 m du point d'arrêt, à droite de l'axe de la jetée


def jetty_z(y):
    return 0.0


def jetty_point(x, y, lift=0.0):
    """Un point sur la chaussée de la jetée (bombé de la chaussée à deux voies compris)."""
    with L.road_half(J_HALF):
        z = road.road_z(x - JX)
    return Vector((x, y, z + lift))


def place_on_jetty(rig, x, y, heading=0.0):
    p = jetty_point(x, y)
    return L.put(rig, p.x, p.y, p.z, heading)


# ---------------------------------------------------------------- la jetée

def build_jetty(hidden, lamp_src, far=False):
    """La jetée de 300 m, droite et plate, du terre-plein du port à la pointe."""
    ys = [JY0 + 4.0 * k for k in range(int((JY1 - JY0) / 4.0) + 1)] + [JY1 + 1.0]
    out = L.roadway("jetee", ys, jetty_z, x0=JX, half=J_HALF, walk=J_WALK, rail="quai", lamp_src=lamp_src,
                    lamp_ys=J_LAMPS, far=far, rail_ys=(JY0, CY - math.sqrt(R * R - J_EDGE * J_EDGE)))
    print(f"[jetee] {JY1 - JY0:.0f} m en x {JX:.0f}, chaussée {2 * J_HALF:.0f} m, {len(out['lamps'])} lampadaires",
          flush=True)
    return out


# ---------------------------------------------------------------- la pointe

def _polar(a, r):
    t = math.radians(a)
    return CX + r * math.cos(t), CY + r * math.sin(t)


def _arc_ok(a):
    """L'angle a (degrés) n'est pas dans la gorge de la jetée."""
    x, y = _polar(a, R)
    return not (y < CY and abs(x - JX) < J_EDGE)


def _in_opening(a, margin=0.0):
    half = math.degrees(OPEN_W / 2 / (R - 0.25)) + margin
    return any(abs(((a - o + 180) % 360) - 180) < half for o in OPENINGS)


def mat_sol(name="sol_pointe", st=None):
    """Le sol de la pointe : l'enrobé de quai, avec les photos de la rue (Asphalt 02 lu deux fois, la vue
    aérienne d'Aerial Asphalt 01 pour les grandes nuances, le relief d'Asphalt 04 pour les creux) et le vernis
    d'eau de road.wet_shader. Posé en bandes de 9,5 m : de rares joints froids scellés au bitume, ondulés et
    interrompus ; des fissures pontées, des fissures fines ouvertes, des rapiéçages plus sombres, des taches
    d'huile ; des flaques irrégulières dans les creux (le même champ de « creux » que la chaussée, réglage
    « sèche »). Les traces du dérapage sont un décalque à part (skid_marks)."""
    st = st or L.ST
    m, N, out = S.material(name)
    P, _ = road.coords(N)
    px, py, _ = N.sep(P)
    sc = road.scan2(N, P, "asphalt_02", 3.0)
    d2 = sc["disp"]
    aer = road.tex(N, os.path.join(L.ASSETS, "aerial_asphalt_01", "diff_2k.jpg"), road.mapping(N, P, scale=(1 / 30.0,) * 3))
    aer_bw = N.new("ShaderNodeRGBToBW")
    N.link(aer, aer_bw.inputs[0])
    macro = N.math("DIVIDE", aer_bw.outputs[0], 0.125)
    region = road.noise(N, P, 0.03, 2.0)
    # --- les joints froids entre bandes d'enrobé (parallèles à la jetée), ondulés, à moitié effacés
    wob = N.math("MULTIPLY", N.math("SUBTRACT", road.noise(N, P, 0.4, 2.0, stretch=(0.0, 1.0, 0.0)), 0.5), 0.25)
    jm = N.math("FLOORED_MODULO", N.math("ADD", N.math("ADD", px, 3.1), wob), 9.5)
    jd = N.math("MINIMUM", jm, N.math("SUBTRACT", 9.5, jm))
    joint = N.math("MULTIPLY", road.inv(N, road.smooth(N, jd, 0.025, 0.06)),
                   road.smooth(N, road.noise(N, P, 0.35, 2.0, stretch=(0.2, 1.0, 0.2)), 0.4, 0.5))
    # --- fissures pontées (rubans de bitume brillants) et fissures fines ouvertes (sombres, mates)
    n1 = road.noise(N, P, 0.22, 2.0, 0.5, stretch=(1.0, 0.6, 1.0), dist=0.35)
    snake = N.math("MULTIPLY", road.inv(N, road.smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", n1, 0.5)), 0.004, 0.011)),
                   road.smooth(N, road.noise(N, P, 0.045, 2.0), 0.5, 0.6))
    n2 = road.noise(N, P, 0.7, 3.0, 0.5, dist=0.6)
    crack = N.math("MULTIPLY", road.inv(N, road.smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", n2, 0.5)), 0.0015, 0.005)),
                   road.smooth(N, road.noise(N, P, 0.09, 2.0), 0.56, 0.63))
    seal = N.math("MAXIMUM", joint, snake)
    # --- rapiéçages (enrobé plus neuf, plus noir) et taches d'huile
    pn = road.noise(N, P, 0.06, 2.0, 0.4)
    patch = road.smooth(N, pn, 0.66, 0.672)
    oil = road.smooth(N, road.noise(N, P, 0.45, 3.0, 0.6), 0.66, 0.78)
    # --- le champ de « creux » (en écarts-types), d'où l'eau : flaques irrégulières
    meso = road.noise(N, P, 0.42, 3.0, 0.55, stretch=(1.0, 0.7, 1.0))
    d4 = road.tex(N, os.path.join(S.ASSETS, "asphalt_04", "disp_2k.png"), road.mapping(N, P, scale=(1 / 4.04,) * 3, rot=(0, 0, 0.3)), color=False)
    D = N.math("MULTIPLY", N.math("SUBTRACT", 0.5, meso), 14.0)
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", 0.40, d4), 5.0))
    D = N.math("ADD", D, N.math("MULTIPLY", N.math("SUBTRACT", region, 0.55), 5.0))
    D = N.math("ADD", D, N.math("MULTIPLY", patch, -0.6))
    D = N.math("ADD", D, N.math("MULTIPLY", road.inv(N, road.smooth(N, jd, 0.0, 0.6)), 0.8))
    D = N.math("ADD", D, st["D_off"] + 0.25)
    p0, p1 = st["puddle"]
    w = road.smooth(N, D, p0, p1)
    deep = road.smooth(N, D, p1, p1 + 0.9)
    tipdry = road.smooth(N, d2, 0.62, 0.85)
    # --- couleur
    dk = st["dark"]
    col = N.mix(1.0, sc["diff"], (dk, dk, dk * 1.03, 1), "MULTIPLY")
    col = N.mix(1.0, col, road.grey(N, N.mixf(0.55, 1.0, macro)), "MULTIPLY")
    col = N.mix(N.math("MULTIPLY", patch, 0.85), col, N.mix(1.0, col, (0.55, 0.55, 0.57, 1), "MULTIPLY"))
    col = N.mix(N.math("MULTIPLY", oil, 0.75), col, N.mix(1.0, col, (0.45, 0.44, 0.43, 1), "MULTIPLY"))
    col = N.mix(1.0, col, road.grey(N, N.mixf(w, st["wet"][0], st["wet"][1])), "MULTIPLY")
    col = N.mix(seal, col, (0.010, 0.010, 0.011, 1))
    col = N.mix(crack, col, (0.004, 0.004, 0.004, 1))
    # --- rugosité, normales
    br = N.mixf(seal, N.math("MULTIPLY", sc["rough"], 0.95), 0.22)
    br = N.mixf(crack, br, 0.9)
    geo = N.new("ShaderNodeNewGeometry").outputs["Normal"]
    base_n = road.finish_normal(N, sc["nor_gl"], 1.0)
    base_n = road.vmix(N, N.math("MULTIPLY", patch, 0.4), base_n, geo)
    base_n = road.bump(N, road.noise(N, P, 0.28, 3.0), base_n, 1.0, 0.05)
    base_n = road.bump(N, N.math("SUBTRACT", seal, N.math("MULTIPLY", crack, 2.0)), base_n, 1.0, 0.002)
    # --- la pellicule d'eau
    cr = N.mixf(tipdry, st["cr"][0], st["cr"][1])
    cr = N.mixf(seal, cr, N.math("MULTIPLY", cr, 0.6))
    cr = N.mixf(crack, cr, 0.5)
    cr = N.mixf(N.math("POWER", w, 1.4), cr, 0.03)
    rip = road.ripples(N, P)
    thin = road.vmix(N, 0.3, rip, base_n)
    pud_n = road.vmix(N, deep, thin, rip)
    coat_n = road.vmix(N, road.smooth(N, w, 0.25, 1.0), base_n, pud_n)
    road.wet_shader(N, out, col, br, base_n, cr, coat_n)
    return m


def slide_pose(s):
    """La glissade de la berline, s de 0 (elle freine en sortant de la jetée, voie de droite) à 1 (arrêtée au
    centre, tournée de HERO_STOP) : (x, y, cap). L'arrière chasse vers la droite, l'avant pivote à gauche."""
    e = 1.0 - (1.0 - s) ** 2
    x = JX + 1.75 - 1.75 * (3 * s * s - 2 * s * s * s)
    y = JY1 - 6.0 + (STOP.y - JY1 + 6.0) * e
    return x, y, HERO_STOP * s ** 1.6


def skid_marks(name="traces_glissade", track=0.77, base=1.37, width=0.2, n=48):
    """Les traces de pneus du dérapage, de la sortie de la jetée au point d'arrêt : un ruban par roue (l'arrière
    dès le freinage, l'avant un peu après), noir de gomme, plus mat que l'eau, qui s'efface par endroits.
    Décalque à 6 mm du sol, coordonnées de texture : u le long de la trace, v en travers."""
    m, N, out = S.material(name)
    uv = N.new("ShaderNodeTexCoord").outputs["UV"]
    u, v, _ = N.sep(uv)
    P, _ = road.coords(N)
    streak = road.noise(N, road.combine(N, N.math("MULTIPLY", u, 3.0), N.math("MULTIPLY", v, 40.0), 0.0), 2.0, 3.0, 0.6)
    a = N.math("MULTIPLY", road.smooth(N, u, 0.0, 0.25), road.smooth(N, streak, 0.3, 0.6))
    a = N.math("MULTIPLY", a, road.inv(N, road.smooth(N, N.math("ABSOLUTE", N.math("SUBTRACT", v, 0.5)), 0.32, 0.5)))
    a = N.math("MULTIPLY", a, N.mixf(road.smooth(N, road.noise(N, P, 0.8, 2.0), 0.35, 0.6), 0.45, 0.95))
    p = S.principled(N, **{"Base Color": (0.006, 0.006, 0.006, 1), "Roughness": 0.42})
    p.inputs["Coat Weight"].default_value = 0.6
    p.inputs["Coat IOR"].default_value = 1.33
    p.inputs["Coat Roughness"].default_value = 0.12
    N.link(a, p.inputs["Alpha"])
    N.link(p.outputs[0], out.inputs[0])
    bm = L.bmesh.new()
    uvl = bm.loops.layers.uv.new()
    for lx in (-track, track):
        for ly, s0 in ((-base, 0.0), (base, 0.25)):
            pts = []
            for i in range(n + 1):
                s = s0 + (1.0 - s0) * i / n
                x, y, h = slide_pose(s)
                c, sn = math.cos(math.radians(h)), math.sin(math.radians(h))
                pts.append(Vector((x + lx * c - ly * sn, y + lx * sn + ly * c, 0.0)))
            rows = []
            for i, p_ in enumerate(pts):
                t = (pts[min(i + 1, n)] - pts[max(i - 1, 0)]).normalized()
                side = Vector((t.y, -t.x, 0.0)) * (width / 2)
                z = 0.006
                rows.append((bm.verts.new(p_ - side + Vector((0, 0, z))), bm.verts.new(p_ + side + Vector((0, 0, z)))))
            for i in range(n):
                f = bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
                for lp, (uu, vv) in zip(f.loops, ((i / n, 0.0), (i / n, 1.0), ((i + 1) / n, 1.0), ((i + 1) / n, 0.0))):
                    lp[uvl].uv = (uu, vv)
    ob = L.mesh_object(name, bm, [m])
    ob.visible_shadow = False
    return ob


def bollard_bm(bm, x, y, z, mat=0):
    """Une borne d'amarrage en fonte : fût galbé, tête débordante."""
    prof = [(0.0, 0.0), (0.17, 0.0), (0.15, 0.08), (0.13, 0.32), (0.15, 0.45), (0.21, 0.5), (0.21, 0.56), (0.0, 0.58)]
    n = 16
    rings = []
    for r, h in prof:
        rings.append([bm.verts.new((x + r * math.cos(t), y + r * math.sin(t), z + h)) for t in (i * math.tau / n for i in range(n))])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((a[i], a[j], b[j], b[i]))
            f.material_index = mat
            f.smooth = True


def chain_bm(bm, p0, p1, sag=0.22, pitch=0.075, wire=0.008):
    """Une chaîne tendue de p0 à p1, en chaînette (flèche `sag`) : des maillons ovales, un sur deux tourné d'un
    quart de tour."""
    p0, p1 = Vector(p0), Vector(p1)
    span = (p1 - p0).length
    n = max(2, int(span / pitch))
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append(p0.lerp(p1, t) - Vector((0, 0, 4 * sag * t * (1 - t))))
    for i in range(n):
        a, b = pts[i], pts[i + 1]
        c, d = (a + b) / 2, (b - a)
        q = d.to_track_quat("X", "Z")
        if i % 2:
            q = q @ Matrix.Rotation(math.pi / 2, 4, "X").to_quaternion()
        M = Matrix.Translation(c) @ q.to_matrix().to_4x4()
        L_, W_ = d.length * 0.62 + wire, 0.022
        ring = []
        for k in range(10):
            t = k * math.tau / 10
            ring.append((L_ * math.cos(t), W_ * math.sin(t)))
        rows = []
        for (u, v) in ring:
            rows.append([bm.verts.new(M @ Vector((u + wire * math.cos(s) * math.cos(math.atan2(v, u)),
                                                  v + wire * math.cos(s) * math.sin(math.atan2(v, u)),
                                                  wire * math.sin(s))))
                         for s in (j * math.tau / 4 for j in range(4))])
        for k in range(10):
            ra, rb = rows[k], rows[(k + 1) % 10]
            for j in range(4):
                f = bm.faces.new((ra[j], ra[(j + 1) % 4], rb[(j + 1) % 4], rb[j]))
                f.smooth = True


def build_pointe(hidden, lamp_src, far=False, marina=False):
    """La pointe : sol, couronnement, mur du quai, garde-corps et ses trois ouvertures à chaîne, bornes,
    lampadaire. Renvoie le lampadaire (mât, lumière, tête)."""
    dal = mat_sol()
    quay = bpy.data.materials.get("quai_pierre") or L.mat_quay("quai_pierre")
    cop = bpy.data.materials.get("couronnement") or L.mat_coping("couronnement")
    rail = bpy.data.materials.get("garde_corps") or L.mat_steel("garde_corps", color=(0.32, 0.36, 0.36), rough=0.35,
                                                               rust=0.3, paint=True)
    iron = L.mat_steel("fonte_bornes", color=(0.05, 0.05, 0.055), rough=0.45, rust=0.45, paint=True)
    n = 180
    da = 360.0 / n
    angs = [i * da for i in range(n)]
    # --- le sol : un disque d'enrobé (la jetée y entre par le sud)
    bm = L.bmesh.new()
    bm.faces.new([bm.verts.new((*_polar(a, R - COPING), 0.0)) for a in angs])
    L.mesh_object("pointe_sol", bm, [dal])
    # --- le couronnement et le mur du quai, coupés par la gorge de la jetée
    seg = [a for a in angs if _arc_ok(a) and _arc_ok(a + da)]
    bm = L.bmesh.new()
    for a in seg:
        pts = [[(*_polar(a, rr), z), (*_polar(a + da, rr), z)]
               for rr, z in ((R - COPING, 0.0), (R - COPING, 0.12), (R + 0.04, 0.12), (R + 0.04, 0.0))]
        vs = [[bm.verts.new(p[0]), bm.verts.new(p[1])] for p in pts]
        for i in range(3):
            bm.faces.new((vs[i][0], vs[i][1], vs[i + 1][1], vs[i + 1][0]))
    L.mesh_object("pointe_couronnement", bm, [cop])
    bm = L.bmesh.new()
    for a in seg:
        bm.faces.new([bm.verts.new((*_polar(t, R), z)) for t, z in ((a, 0.0), (a + da, 0.0), (a + da, L.WATER_Z - 2.0),
                                                                     (a, L.WATER_Z - 2.0))])
    L.mesh_object("pointe_quai", bm, [quay])
    # --- le garde-corps bas : montants tous les 2,4 m, main courante et lisse ; trois ouvertures fermées d'une chaîne
    rr = R - 0.25
    if not far:
        bm, cb = L.bmesh.new(), L.bmesh.new()
        step = math.degrees(2.4 / rr)
        a, prev = -90.0, None
        while a < 270.0 - step / 2:
            ok = _arc_ok(a) and not _in_opening(a)
            if ok:
                p = _polar(a, rr)
                L.tube_bm(bm, (p[0], p[1], 0.12), (p[0], p[1], RAIL_H), 0.025, seg=8)
                if prev is not None:
                    for h, r_ in ((RAIL_H, 0.03), (0.5, 0.016)):
                        L.tube_bm(bm, (prev[0], prev[1], h), (p[0], p[1], h), r_, seg=8)
                prev = p
            else:
                prev = None
            a += step
        for o in OPENINGS:
            h = math.degrees(OPEN_W / 2 / rr)
            for s in (-1, 1):                              # les deux poteaux de l'ouverture, plus forts
                p = _polar(o + s * h, rr)
                L.tube_bm(bm, (p[0], p[1], 0.12), (p[0], p[1], RAIL_H + 0.05), 0.04, seg=10)
                bm_top = _polar(o + s * h, rr)
                L.tube_bm(bm, (bm_top[0], bm_top[1], RAIL_H + 0.05), (bm_top[0], bm_top[1], RAIL_H + 0.09), 0.05, seg=10)
            p0, p1 = _polar(o - h, rr), _polar(o + h, rr)
            chain_bm(cb, (p0[0], p0[1], RAIL_H - 0.12), (p1[0], p1[1], RAIL_H - 0.12), sag=0.24)
        # le garde-corps se raccorde à celui de la jetée
        L.mesh_object("pointe_garde_corps", bm, [rail])
        steel = bpy.data.materials.get("chaine") or L.mat_steel("chaine", color=(0.36, 0.34, 0.32), rough=0.42, rust=0.55)
        L.mesh_object("pointe_chaines", cb, [steel])
    # --- une borne d'amarrage tous les 8 m sur le couronnement
    bm = L.bmesh.new()
    nb = int(2 * math.pi * (R - 0.28) / 8.0)
    k = 0
    for i in range(nb):
        a = -90.0 + (i + 0.5) * 360.0 / nb
        if _arc_ok(a) and not _in_opening(a, margin=3.0):
            bollard_bm(bm, *_polar(a, R - 0.28), 0.12)
            k += 1
    L.mesh_object("pointe_bornes", bm, [iron])
    # --- le lampadaire, bras vers le point d'arrêt
    d = Vector((STOP.x - LAMP_AT[0], STOP.y - LAMP_AT[1]))
    out = L.lamp(lamp_src, (LAMP_AT[0], LAMP_AT[1], 0.0), arm=(d.x, d.y), energy=3200.0, name="lamp_pointe")
    if marina:
        print("[pointe] marina : palier pas encore écrit", flush=True)
    print(f"[pointe] r {R:.0f} m en ({CX:.0f}, {CY:.0f}), {k} bornes, ouvertures à "
          f"{', '.join(f'{o:.0f}°' for o in OPENINGS)}", flush=True)
    return out


# ---------------------------------------------------------------- le décor et les plans

def decor(scene, hidden, all_lit=False, marina=False):
    lamp_src = L.panorama(scene, hidden, all_lit=all_lit, bridge="loin", port="loin")
    build_jetty(hidden, lamp_src)
    build_pointe(hidden, lamp_src, marina=marina)
    return lamp_src


def glows(points):
    """Les lueurs corail et lilas hors champ, qui battent dans la brume (les autres patrouilles, suggérées)."""
    for i, (p, col, e) in enumerate(points):
        Ld = bpy.data.lights.new(f"glow_off_{i}", "POINT")
        Ld.color = L.lin(col)[:3]
        Ld.energy = e
        Ld.shadow_soft_size = 0.6
        o = bpy.data.objects.new(Ld.name, Ld)
        bpy.context.scene.collection.objects.link(o)
        o.location = p
        o.visible_camera = False


def aim_helis(helis, target, energy=400000.0):
    """Les projecteurs des hélicoptères sur la cible. À 30-40 m, les 30 kW du projecteur de cast_vehicles
    éclairent la voiture vingt fois moins que le lampadaire : on les pousse (la lumière est partagée par les
    copies) pour que le faisceau se lise dans la brume et que la tache tombe sur la carrosserie."""
    bpy.context.view_layer.update()
    for r in helis:
        for o in r.children_recursive:
            if o.type == "LIGHT" and o.name.endswith("searchlight_spot"):
                o.data.energy = energy
    for r in helis:
        piv = next((o for o in r.children_recursive if o.name.endswith("searchlight_pivot")), None)
        if piv is None:
            continue
        p = piv.matrix_world.translation.copy()
        d = (Vector(target) - p).normalized()
        piv.matrix_world = Matrix.Translation(p) @ d.to_track_quat("-Z", "Y").to_matrix().to_4x4()


HERO_STOP = 25.0      # le cap de la berline arrêtée : le travers à gauche, trois quarts face pour FIN


def plan_FIN(scene, hidden, palier="socle"):
    """FIN, l'arrestation : caméra fixe à 20 cm du sol, 24 mm, à 9 m du point d'arrêt, tournée vers la jetée (et
    la ville), relevée de 14° : la berline et l'horizon au tiers bas, le ciel au-dessus. La berline est venue de la
    jetée, a freiné, glissé en travers vers la gauche (les traces de gomme) et s'arrête au centre, trois quarts face,
    les mains gantées levées derrière le pare-brise (l'habitacle un peu éclairé) ; la fumée des pneus la dépasse.
    Au premier plan à gauche, la patrouille arrêtée à côté d'elle, l'avant vers nous, la portière du conducteur
    grande ouverte ; derrière la portière un agent se redresse, l'arme tendue, à contre-jour du lampadaire et d'une
    lueur corail. Hors champ, des lueurs corail et lilas battent dans la brume et sur le sol mouillé.
    (Au 35 mm du cahier des charges, la berline seule remplit la largeur à 9 m : le 24 mm fait entrer la patrouille.)"""
    decor(scene, hidden, marina=(palier == "marina"))
    skid_marks()
    hero = L.hero()
    L.put(hero, STOP.x, STOP.y, 0.0, heading=HERO_STOP)
    L.hands_up(hero)
    L.cabin_light(hero, energy=25.0)
    L.drive(hero, 1.2, L.hero_wheels(hero), hero["wheel_r"])
    # la patrouille, parallèle à la berline, à sa droite et un peu en avant : sa portière gauche s'ouvre vers elle
    f = Vector((-math.sin(math.radians(HERO_STOP)), math.cos(math.radians(HERO_STOP)), 0.0))
    r = Vector((f.y, -f.x, 0.0))
    pp = STOP + r * 4.0 + f * 1.5
    pat = L.patrol("patrol")
    L.put(pat, pp.x, pp.y, 0.0, heading=HERO_STOP)
    L.open_door(pat, side=1, angle=80.0)
    L.bar_pools(pat, energy=1500.0)
    L.bar_beams(pat, "patrol", yaws=((-40, L.CORAL), (140, L.LILAC)), energy=6000.0)
    hinge = pp + f * 0.96 - r * 0.92
    door = (-f * math.cos(math.radians(80)) - r * math.sin(math.radians(80))).normalized()
    try:
        cop = L.officer("aim", style=0, name="officer_fin")
        bis = (door + (-f)).normalized()
        cp_ = hinge + bis * 0.75
        cop.location = (cp_.x, cp_.y, 0.0)
        L.face(cop, (STOP.x - 0.3, STOP.y + 0.6))
    except Exception as e:
        print(f"[pointe] agent non posé : {e!r}", flush=True)
    # la fumée des pneus : sur la trace de la glissade, et qui dépasse la voiture vers nous, à droite
    L.smoke("fumee_arriere", (CX + 1.6, CY - 3.2, 0.8), (3.6, 4.4, 1.4), density=0.5, seed=4.0)
    L.smoke("fumee_trace", (CX + 1.5, CY - 11.0, 1.0), (3.5, 6.0, 1.6), density=0.28, seed=7.0)
    L.smoke("fumee_avant", (CX - 1.6, CY + 2.4, 0.5), (2.6, 2.0, 0.8), density=0.42, seed=1.0)
    # les lueurs : hors champ à droite et à gauche, et derrière l'agent (le contre-jour)
    glows([((CX - 9.0, CY + 2.0, 1.4), L.LILAC, 7000.0), ((CX + 10.0, CY - 3.0, 1.5), L.CORAL, 7000.0),
           ((CX + 6.5, CY - 6.0, 1.7), L.CORAL, 2500.0), ((CX - 12.0, CY - 14.0, 1.6), L.LILAC, 4000.0)])
    # la brume est réelle depuis que lieux.haze tourne ses normales vers l'extérieur : 0,0005 sur 800 m laisse la
    # ville voilée mais lisible ; la nappe locale, plus dense, prend les faisceaux et les lueurs
    L.haze((CX - 80, CX + 80), (CY - 470, CY + 60), (L.WATER_Z, 50), 0.0005)
    L.haze((CX - 35, CX + 35), (CY - 40, CY + 30), (L.WATER_Z, 22), 0.003, name="haze_pointe")
    cam_loc = Vector((CX + 0.7, CY + 8.97, 0.2))
    a = math.radians(-1.0)
    d = Vector((math.sin(a), -math.cos(a), math.tan(math.radians(14.0))))
    cam = L.camera("cam_FIN", cam_loc, cam_loc + d * 40.0, lens=24, fstop=2.2,
                   focus=(STOP.x, STOP.y + 1.0, 1.0))
    scene.render.use_motion_blur = True
    return cam


def plan_FIN6(scene, hidden, palier="socle"):
    """FIN6, l'encerclement, temps gelé : la berline au centre, un anneau de dix patrouilles et du fourgon à
    14 m tournés vers elle, une silhouette devant chacun, trois projecteurs d'hélicoptère croisés sur elle, les
    avions saisis dans le ciel. L'orbite : rayon 7 m, à 25 cm, sur 150° ; l'image d'essai au milieu de l'arc,
    trois quarts face, les mains levées et la ville derrière. Vu à 25 cm, la berline cache tout ce qui est derrière
    elle : l'anneau est calé pour que deux véhicules l'encadrent (le fourgon à droite, une patrouille à gauche), et
    le 18 mm prend les autres sur les bords ; les rampes de tout l'anneau posent leurs flaques de couleur sur
    l'enrobé mouillé."""
    decor(scene, hidden, all_lit=True, marina=(palier == "marina"))
    rnd = random.Random(6)
    hero = L.hero()
    L.put(hero, STOP.x, STOP.y, 0.0, heading=HERO_STOP)
    L.hands_up(hero)
    L.cabin_light(hero, energy=25.0)
    skid_marks()
    ring = [(-122.7 + 360.0 / 11 * i, "van" if i == 0 else "patrol") for i in range(11)]
    first = {}
    for i, (a, kind) in enumerate(ring):
        x, y = _polar(a, 14.0)
        r = first.get(kind)
        if r is None:
            r = first[kind] = L.patrol("patrol") if kind == "patrol" else L.van("van")
            L.bar_pools(r, energy=1200.0)
        else:
            r = L.clone(r, f"{kind}_{i}")
        h = L.heading_to((STOP.x - x, STOP.y - y)) + rnd.uniform(-28, 28)
        L.put(r, x, y, 0.0, heading=h)
        L.bar_beams(r, f"{kind}_{i}", yaws=((rnd.uniform(-60, 60), L.CORAL), (rnd.uniform(120, 240), L.LILAC)),
                    energy=5000.0)
    try:
        cops = [L.officer(pz, style=st, name=f"officer_{pz}") for pz, st in (("aim", 0), ("crouch", 1), ("guard", 2))]
        for i, (a, kind) in enumerate(ring):
            src = cops[i % 3]
            o = src if i < 3 else S.instance(src, f"officer_{i}", (0, 0, 0))
            x, y = _polar(a + 8.0, 10.6)
            o.location = (x, y, 0.0)
            L.face(o, (STOP.x, STOP.y))
    except Exception as e:
        print(f"[pointe] agents non posés : {e!r}", flush=True)
    first_h, _ = L.helicopter("heli")
    hs = []
    for i, (a, z) in enumerate(((150, 30.0), (30, 34.0), (-100, 28.0))):
        r = first_h if i == 0 else L.clone(first_h, f"heli_{i}")
        x, y = _polar(a, 26.0)
        L.put(r, x, y, z, heading=a + 90, pitch=-5.0, roll=8.0)
        hs.append(r)
    aim_helis(hs, STOP + Vector((0, 0, 0.8)))
    try:
        j = L.jet("jet")
        L.put(j, CX + 40.0, CY - 160.0, 55.0, heading=-8.0, pitch=-3.0, roll=18.0)
        j2 = L.clone(j, "jet_2")
        L.put(j2, CX + 12.0, CY - 190.0, 62.0, heading=-8.0, pitch=-3.0, roll=18.0)
    except Exception as e:
        print(f"[pointe] avions non chargés : {e!r}", flush=True)
    L.smoke("fumee_gelee", (CX + 0.8, CY - 2.6, 0.5), (3.0, 3.5, 0.8), density=0.16, seed=2.0)
    L.haze((CX - 90, CX + 90), (CY - 470, CY + 90), (L.WATER_Z, 60), 0.0005)
    L.haze((CX - 35, CX + 35), (CY - 35, CY + 35), (L.WATER_Z, 40), 0.004, name="haze_pointe")
    a = 95.0                                          # le milieu de l'arc de 150° (de 20° à 170°)
    cam_loc = (*_polar(a, 7.0), 0.25)
    cam = L.camera("cam_FIN6", cam_loc, (STOP.x, STOP.y, 1.6), lens=18, fstop=2.8,
                   focus=(STOP.x, STOP.y, 1.1))
    return cam


P6_SPEED = 120 / 3.6   # 33 m/s


def plan_P6(scene, hidden, palier="socle"):
    """P6, toute la ville : la grue en haut de sa montée (4 m → 35 m), 24 mm, à 65 m devant la berline, tournée
    vers la ville. La berline en tête sur la jetée (s = 180, à 120 km/h), la colonne de gyrophares derrière elle
    sur la jetée, la voie du quai et la rampe du pont ; trois hélicoptères aux faisceaux croisés, deux avions bas
    dans l'axe de la jetée. Rien dans les 12 % du haut : le ciel."""
    import scene_c
    lamp_src = L.panorama(scene, hidden, all_lit=True, bridge="loin", port="loin")
    build_jetty(hidden, lamp_src)
    build_pointe(hidden, lamp_src, far=True)
    s = 180.0
    y_hero = JY0 + s
    hero = L.hero()
    place_on_jetty(hero, JX + 1.75, y_hero)
    L.drive(hero, P6_SPEED, L.hero_wheels(hero), hero["wheel_r"])
    col = []
    y, k = y_hero - 22.0, 0
    while y > JY0 + 4.0:                               # la jetée : deux voies, en quinconce
        col.append(("jetee", JX + (1.75 if k % 2 == 0 else -1.75), y, 0.0))
        y -= 18.0 + 5.0 * ((k * 7) % 3)
        k += 1
    for x in (60.0, 35.0, 12.0):                       # la voie du quai, vers la jetée (+x)
        col.append(("quai", x, L.QUAY_Y + (1.75 if x > 30 else -1.75), -90.0))
    for y in (-14.0, -40.0, -68.0):                    # la rampe du pont
        col.append(("pont", 1.8 if y > -30 else -1.8, y, 0.0))
    col[2] = ("van",) + col[2][1:]                    # le fourgon, troisième derrière la berline

    src = {}
    for i, (where, x, y, heading) in enumerate(col):
        kind = "van" if where == "van" else "patrol"
        if kind not in src:
            r = src[kind] = L.patrol("patrol") if kind == "patrol" else L.van("van")
            L.bar_pools(r, energy=2500.0)        # le ruban de gyrophares sur la chaussée mouillée, vu de 35 m
            L.bar_boost(r, 4.0)
        else:
            r = L.clone(src[kind], f"{kind}_{i}")
        if where in ("jetee", "van"):
            place_on_jetty(r, x, y, heading)
        elif where == "pont":
            scene_c.place_on_deck(r, x, y, heading)
        else:
            L.put(r, x, y, 0.0, heading)
        yaw = 25 + 70 * ((i * 37) % 5) / 4
        L.bar_beams(r, f"{kind}_{i}", yaws=((yaw, L.CORAL), (yaw - 180 + 25 * (i % 3), L.LILAC)))
        L.drive(r, P6_SPEED * 0.95)
    print(f"[P6] colonne de {len(col)} véhicules", flush=True)
    first, _ = L.helicopter("heli")
    hs = []
    for i, (dx, dy, z) in enumerate(((-22.0, 12.0, 17.0), (20.0, -6.0, 20.0), (-6.0, -30.0, 24.0))):
        r = first if i == 0 else L.clone(first, f"heli_{i}")
        L.put(r, JX + dx, y_hero + dy, z, heading=-dx * 1.5, pitch=-7.0)
        hs.append(r)
    aim_helis(hs, jetty_point(JX + 1.75, y_hero, 0.6))
    try:
        j = L.jet("jet")
        # au-dessus de la berline, vers la ville, inclinés : deux silhouettes nettes sur le ciel
        L.put(j, JX - 20.0, y_hero - 90.0, 52.0, heading=188.0, pitch=-2.0, roll=-28.0)
        j2 = L.clone(j, "jet_2")
        L.put(j2, JX + 10.0, y_hero - 65.0, 57.0, heading=188.0, pitch=-2.0, roll=-24.0)
        L.drive(j, 110.0)
        L.drive(j2, 110.0)
    except Exception as e:  # l'avion n'est qu'une silhouette au fond : sans lui le plan tient
        print(f"[P6] avions non chargés : {e!r}", flush=True)
    # la brume seulement en couloir sur la jetée, sous la caméra : sur toute la lagune, vue de 35 m, elle diffusait
    # le ciel en un voile rose qui noyait l'eau noire et ses reflets (rendus du 12 novembre)
    L.haze((JX - 30, JX + 30), (JY0 - 20, JY1), (L.WATER_Z, 28), 0.0012)
    # la caméra au haut de la grue : la berline au tiers bas, la ville aux deux tiers (tangente 0,25 au-dessus du
    # centre au 24 mm vertical, soit 14° de plongée ; la berline 28° sous l'horizontale, donc à 65 m devant)
    cam_y = y_hero + 65.0
    cam = L.camera("cam_P6", (JX + 1.0, cam_y, 35.0), (JX + 1.0, cam_y - 100.0, 35.0 - 100.0 * math.tan(math.radians(14))),
                   lens=24, fstop=0.0)
    scene.render.use_motion_blur = True
    return cam


PLANS = {"FIN": plan_FIN, "FIN6": plan_FIN6, "P6": plan_P6}


def build(plan, palier="socle"):
    scene, hidden = L.new_scene()
    cam = PLANS[plan](scene, hidden, palier=palier)
    scene.camera = cam
    scene.frame_set(2)
    return scene
