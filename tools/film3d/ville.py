# La ville unique (SPEC §18.36, docs/cinematique-plan-de-ville.md) : les lieux du film, construits chacun dans sa
# scène et son repère, posés dans un seul repère de ville (celui du pont), le long de la seule route de la berline.
#
# Rien n'est écrit en dur : parcours.vers_ville(plan) pose la scène d'un plan dans la ville, parcours.pose_ville(plan)
# en donne (rot, tx, ty), parcours.CONTINU dit quelles coupes sont continues (toutes sauf l'ellipse P3 → P4). Un
# changement de route ou d'ancre s'y répercute seul.
#
# L'assemblage (voie choisie) : chaque lieu est construit par sa propre scène, une fois, dans son propre Blender, et
# mis en cache comme pour un rendu (debit.cached_build : le même .blend que render_film, partagé) ; la ville est
# ensuite une scène vide où l'on AJOUTE (bpy.data.libraries.load, sans lien) la scène de chaque lieu, ses collections
# rattachées à une collection du lieu, ses objets de tête parentés à une racine qui porte la transformation. Ni
# caméras, ni monde, ni véhicules, ni personnages : la ville pose sa berline et sa caméra. Pourquoi : les build()
# repartent tous d'une scène vide (read_factory_settings), posent leur ciel, leurs caméras, leurs images réduites ; six
# build() à la suite dans un même Blender se détruiraient l'un l'autre, et leurs modules gardent des états entre
# deux appels. Repris du cache, chaque lieu coûte de quelques secondes à une minute et demie (la rue).
#
#   python3 tools/film3d/ville.py                      # les fenêtres, les poses des lieux, les raccords, les prises,
#                                                      # le chargement par plan
#   python3 tools/film3d/ville.py --selftest           # les poses, les prises, la conduite, sans Blender
#   python3 tools/film3d/ville.py --carte --out DIR    # les lieux en cache, la ville assemblée (DIR/ville.blend), la
#                                                      # carte vue de dessus (portrait, nord en haut), les tableaux
#                                                      # d'emprises, de chevauchements et de jonctions
#   python3 tools/film3d/ville.py --prise --out DIR    # les prises continues grises (Workbench 360 × 640) de
#                                                      # ville.blend : prise-1.mp4 (OUV à P3), prise-2.mp4 (P4 à P6)
#   options : --lieux avenue,pont… ; --lointains (garder les faux lointains) ; --blender PATH
#   render_film.py --ville DIR                         # un plan rendu avec ses voisins de la ville (voisins, CHARGE)
#
# Les drapeaux des objets de la ville (propriétés) : ville_lieu (le nom du lieu), ville_lointain (1 : un faux lointain
# de ce lieu, un décor qui imite un autre lieu ou l'horizon ; lointains(scene, False) les cache tous).
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import parcours as P  # noqa: E402

FPS = P.FPS
# Les lieux, dans l'ordre de la route : (nom, plans qu'il porte, plan dont la scène le construit). La scène de chaque
# plan est parcours.LIEU ; sa pose dans la ville, parcours.pose_ville. Le module et l'argument de construction sont
# ceux de render_film.SOURCES (l'avenue : celle de P1, qui porte aussi OUV).
LIEUX = (
    ("avenue", ("OUV", "P1"), "P1"),
    ("rond-point", ("P2",), "P2"),
    ("rue", ("P3",), "P3"),
    ("pont", ("P4",), "P4"),
    ("port", ("P5",), "P5"),
    ("jetee", ("P6", "FIN", "FIN6"), "P6"),
)
NOMS = tuple(n for n, _, _ in LIEUX)
# Les lieux du monde de l'eau (lieux.py) partagent un repère dans leurs scènes : le même monde posé trois fois
WATER_WORLD = ("pont", "port", "jetee")

# Ce que chaque plan charge (plan de ville §5 : une scène par prise, pas par plan) : (près, loin, ville lointaine).
# « près » : le lieu entier ; « loin » : le lieu pour ce qui dépasse dans le champ (aujourd'hui le lieu entier, ses
# versions « loin » viendront) ; la ville lointaine (lieux.distant_city) seulement pour les plans sur l'eau, jamais
# avec l'avenue, le rond-point ni la rue. Une prise charge l'union de ses plans.
CHARGE = {
    "OUV": (("avenue", "rond-point"), ("rue",), False),
    "P1": (("avenue", "rond-point", "rue"), ("pont",), False),
    "P2": (("avenue", "rond-point", "rue"), ("pont",), False),
    "P3": (("avenue", "rond-point", "rue"), ("pont",), False),
    "P4": (("pont",), ("port", "rue"), True),
    "P5": (("port", "jetee"), ("pont",), True),
    "P6": (("port", "jetee"), ("pont",), True),
    "FIN": (("jetee",), ("port", "pont"), True),
    "FIN6": (("jetee",), ("port", "pont"), True),
}


def lieu(nom):
    for n, plans, plan in LIEUX:
        if n == nom:
            return dict(nom=n, plans=plans, plan=plan)
    raise KeyError(nom)


def source(plan):
    """(module, argument de build) de la scène d'un plan : ceux de render_film."""
    import render_film
    return render_film.SOURCES[plan]


def charge(shots):
    """(lieux à charger, ville lointaine ?) pour une prise faite des plans `shots` : l'union de leurs règles."""
    noms, loin = [], False
    for s in shots:
        pres, far, city = CHARGE[s]
        noms += [n for n in pres + far if n not in noms]
        loin = loin or city
    return [n for n in NOMS if n in noms], loin


# ---------------------------------------------------------------- les transformations, sans Blender

# Le repère de ville : celui de la scène du pont (z = 0 la chaussée, l'eau à −1,5 m). Tout vient de parcours :
# vers_ville(plan) pose la scène d'un plan dans la ville, pose_ville(plan) en donne (rot, tx, ty). La moitié de la
# ville (OUV à P3) et celle de l'eau (P4 à P6) y sont posées chacune par sa route ; entre les deux, l'ellipse P3 → P4.

def _rot(deg, x, y):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return c * x - s * y, s * x + c * y


def placement(plan):
    """(rot, tx, ty) : la scène du plan posée dans la ville, ville = R(rot) scène + t (rot en degrés, trigonométrique)."""
    return P.pose_ville(plan)


def to_city(plan, x, y):
    return P.vers_ville(plan)[0](x, y)


def matrice(plan):
    """La matrice 4 × 4 (lignes) de la racine du lieu : scène -> ville (rotation autour de z, puis translation)."""
    rot, tx, ty = placement(plan)
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    return [[c, -s, 0.0, tx], [s, c, 0.0, ty], [0.0, 0.0, 1.0, 0.0], [0.0, 0.0, 0.0, 1.0]]


def _shot_rot(shot):
    """La rotation de la scène du plan vers la ville."""
    return P.vers_ville(shot)[1]


def route_city(shot, x, y):
    """Un point du repère du parcours (la route abstraite) dans la ville, posé comme le plan `shot` le pose."""
    to_scene, _ = P.placer(shot)
    return to_city(shot, *to_scene(x, y))


def ecarts_poses():
    """Pour chaque lieu qui porte plusieurs plans du parcours : l'écart entre la pose que chacun lui donne (même
    scène, deux places : une ellipse d'espace si non nul). [(lieu, plan posé, autre plan, distance, écart de cap)]"""
    out = []
    for nom, plans, plan in LIEUX:
        for other in plans:
            if other == plan or other not in P.ANCHOR:
                continue
            ra, xa, ya = placement(plan)
            rb, xb, yb = placement(other)
            out.append((nom, plan, other, math.hypot(xb - xa, yb - ya), rb - ra))
    return out


def raccords():
    """Chaque coupe du parcours : [(A, B, continue ?, m le long, m en travers)] : ce qui sépare la place de A
    prolongé d'une image de celle de B/1 dans la ville (parcours._saut ; 0 pour une coupe continue)."""
    return [(a, b, ok, *P._saut(a, b)) for (a, b), ok in P.CONTINU.items()]


# ---------------------------------------------------------------- la route, la berline, la caméra, sans Blender

_RS = []


def s_of_pos(x, y):
    """L'abscisse sur la route du point le plus proche de (x, y) (repère du parcours ; la route ne se recoupe pas :
    le plus proche partout), à 5 cm près."""
    if not _RS:
        n = int(P.ROUTE.length / 0.05)
        _RS.extend((k * 0.05, *P.ROUTE.at(k * 0.05)[:2]) for k in range(n + 1))
    return min(_RS, key=lambda r: (r[1] - x) ** 2 + (r[2] - y) ** 2)[0]


def frames():
    """Les images de la ville : 1 à TOTAL, le montage bout à bout (l'image f est l'image f − START du plan)."""
    return range(1, P.TOTAL + 1)


def shot_of(f):
    g = f - 1
    for name, n in P.SHOTS:
        if P.START[name] <= g < P.START[name] + n:
            return name, g - P.START[name] + 1
    name, n = P.SHOTS[-1]
    return name, g - P.START[name] + 1


def lieu_of_shot(shot):
    for nom, plans, plan in LIEUX:
        if shot in plans:
            return nom, plan
    raise KeyError(shot)


def fenetres():
    """[(plan, image de la ville au début, à la fin, s au début, s à la fin)] : la fenêtre de chaque plan sur la route."""
    out = []
    for name, n in P.SHOTS:
        s0 = s_of_pos(*P.DRIVE.pos(P.t_of(name, 1)))
        s1 = s_of_pos(*P.DRIVE.pos(P.t_of(name, n)))
        out.append((name, P.START[name] + 1, P.START[name] + n, s0, s1))
    return out


def shot_of_s(s):
    """Le plan à qui la route appartient en s : celui dont la fenêtre la couvre ; entre deux fenêtres, la moitié la
    plus proche ; avant et après, le premier et le dernier."""
    w = fenetres()
    for (na, _, _, _, a1), (nb, _, _, b0, _) in zip(w, w[1:]):
        if s <= (a1 + b0) / 2:
            return na
    return w[-1][0]


def route_at(s, shot=None):
    """(x, y, cap) du point s de la route dans la ville, posé comme le plan `shot` (par défaut celui à qui la route
    appartient en s) : de part et d'autre de l'ellipse, la même abscisse n'a pas la même place."""
    shot = shot or shot_of_s(s)
    x, y, cap = P.ROUTE.at(s)[:3]
    return (*route_city(shot, x, y), cap - P.placer(shot)[1] + _shot_rot(shot))


def route_pts(ds=1.0):
    """[(s, x, y, cap, plan)] le long de parcours.ROUTE, dans la ville."""
    n = int(P.ROUTE.length / ds)
    out = []
    for k in range(n + 1):
        shot = shot_of_s(k * ds)
        out.append((k * ds, *route_at(k * ds, shot), shot))
    return out


def hero_city(f):
    """(x, y, cap de la caisse, cap de la vitesse, s) de la berline à l'image f de la ville : sa place dans la scène
    du plan (parcours.hero), posée dans la ville (parcours.vers_ville)."""
    shot, fr = shot_of(f)
    to_v, rot = P.vers_ville(shot)
    h = P.hero(shot)
    x, y = to_v(*h["pos"](fr))
    return x, y, h["heading"](fr) + rot, h["travel"](fr) + rot, s_of_pos(*P.DRIVE.pos(P.t_of(shot, fr)))


def cam_cap_city(f):
    """Le cap du bras commun dans la ville : celui du module (parcours.cam_cap, repère de la scène du plan), plus la
    rotation du lieu."""
    shot, fr = shot_of(f)
    return P.cam_cap(shot, fr) + _shot_rot(shot)


def cam_city(f, ground=0.0):
    """(x, y, z, lacet, site, roulis, focale) de la caméra de poursuite commune à l'image f : le bras de parcours
    (CAM_BACK derrière, CAM_LEFT à gauche, CAM_Z au-dessus de la chaussée `ground`), visée comme OUV (ouv_avenue.aim :
    la berline en x 50 %, y 58 %)."""
    import ouv_avenue as O
    x, y = hero_city(f)[:2]
    a = math.radians(cam_cap_city(f))
    fx, fy = -math.sin(a), math.cos(a)
    cx, cy = x - P.CAM_BACK * fx - P.CAM_LEFT * fy, y - P.CAM_BACK * fy + P.CAM_LEFT * fx
    out = O.aim(cx, cy, P.CAM_Z, x, y)
    return (out[0], out[1], out[2] + ground) + tuple(out[3:])


# Les plans qui ne sont pas filmés par le bras commun (parcours.camera) : leur caméra propre, module.fonction(t) ->
# (x, y, z, lacet, site, roulis, focale) dans la scène du plan (t en s depuis l'image 1 du plan)
CAMERA_PLAN = {"P4": ("p4_pont", "camera")}


def cam_plan(f):
    """La caméra propre du plan de l'image f (CAMERA_PLAN), posée dans la ville ; None pour le bras commun."""
    import importlib
    shot, fr = shot_of(f)
    if shot not in CAMERA_PLAN:
        return None
    mod, fn = CAMERA_PLAN[shot]
    c = getattr(importlib.import_module(mod), fn)((fr - 1) / FPS)
    to_v, rot = P.vers_ville(shot)
    return (*to_v(c[0], c[1]), c[2], c[3] + rot) + tuple(c[4:])


SAUT = 3.0     # m : au-delà, deux images voisines de la berline ne sont plus la même prise (contrôle de prises())


def prises():
    """Les prises continues : [(première image, dernière image, plans)] ; une coupe là où parcours.CONTINU est faux
    (la seule ellipse : P3 → P4)."""
    out, cur = [], [P.SHOTS[0][0]]
    for (a, b), ok in P.CONTINU.items():
        if ok:
            cur.append(b)
        else:
            out.append(cur)
            cur = [b]
    out.append(cur)
    return [(P.START[ps[0]] + 1, P.START[ps[-1]] + dict(P.SHOTS)[ps[-1]], tuple(ps)) for ps in out]


def prise_pose(a):
    """La conduite d'une prise qui commence à l'image a, posée dans la ville : (pos(t) -> (x, y), heading(t) ->
    degrés), t le temps de parcours.DRIVE ; la pose de son premier plan (tous les plans d'une prise la partagent :
    selftest)."""
    shot, _ = shot_of(a)
    to_v, rot = P.vers_ville(shot)
    to_s, cap = P.placer(shot)
    return (lambda t: to_v(*to_s(*P.DRIVE.pos(t))), lambda t: P.DRIVE.heading(t) - cap + rot)


def table():
    lines = [f"repère de ville : la scène du pont ; route {P.ROUTE.length:.1f} m ; {P.TOTAL} images ; la berline "
             f"finit à s = {fenetres()[-1][4]:.1f} m"]
    for name, g0, g1, s0, s1 in fenetres():
        lines.append(f"  {name:4s} images {g0:3d}-{g1:3d}  s {s0:6.1f} -> {s1:6.1f} m  scène {P.LIEU[name]}")
    lines.append("lieu         plans           posé par  pose dans la ville : ville = R(rot) scène + t")
    for nom, plans, plan in LIEUX:
        rot, tx, ty = placement(plan)
        lines.append(f"  {nom:11s} {','.join(plans):15s} {plan:4s}    rot {rot:+7.2f}°  t ({tx:8.2f} ; {ty:8.2f})")
    for nom, a, b, d, dcap in ecarts_poses():
        lines.append(f"  {nom} : {a} et {b} le posent à {d:.2f} m et {dcap:+.2f}° l'un de l'autre")
    lines.append("raccords (A prolongé d'une image contre B/1, dans la ville) :")
    for a, b, ok, along, across in raccords():
        lines.append(f"  {a:4s} -> {b:4s} {'continu ' if ok else 'ELLIPSE '} {along:+8.2f} m le long, {across:+6.2f} m "
                     f"en travers")
    lines.append("prises continues : " + " ; ".join(f"{a}-{b} ({','.join(p)})" for a, b, p in prises()))
    lines.append("chargement par plan (près | loin | ville lointaine) :")
    for shot, (pres, far, city) in CHARGE.items():
        lines.append(f"  {shot:4s} {','.join(pres):26s} | {','.join(far):15s} | {'oui' if city else 'non'}")
    return "\n".join(lines)


def selftest():
    for nom, plans, plan in LIEUX:
        m = matrice(plan)
        for q in ((0.0, 0.0), (12.5, -40.0), (-130.0, 220.0)):
            r = to_city(plan, *q)
            mx = m[0][0] * q[0] + m[0][1] * q[1] + m[0][3]
            my = m[1][0] * q[0] + m[1][1] * q[1] + m[1][3]
            assert math.hypot(mx - r[0], my - r[1]) < 1e-9, (nom, q, (mx, my), r)
    assert max(map(abs, placement("P4"))) < 1e-9          # le repère de ville est la scène du pont
    # un lieu, une place : les plans d'un même lieu le posent au même endroit
    for nom, a, b, d, dcap in ecarts_poses():
        assert d < 0.05 and abs(dcap) < 0.01, (nom, a, b, d, dcap)
    pr = prises()
    assert pr[0][0] == 1 and pr[-1][1] == P.TOTAL and all(a[1] + 1 == b[0] for a, b in zip(pr, pr[1:])), pr
    # dans une prise, la berline ne saute pas ; la conduite de la prise (prise_pose) est la berline de chaque plan
    for a, b, _ in pr:
        pos, head = prise_pose(a)
        prev = None
        for f in range(a, b + 1):
            t = (f - 1) / FPS
            h = hero_city(f)
            assert math.hypot(pos(t)[0] - h[0], pos(t)[1] - h[1]) < 1e-3, (a, f, pos(t), h)
            assert abs((head(t) - h[2] + 180) % 360 - 180) < 1e-3, (a, f, head(t), h[2])
            if prev:
                assert math.hypot(h[0] - prev[0], h[1] - prev[1]) < SAUT, (f, h, prev)
            prev = h
    # la route, plan par plan, passe sous la berline
    for name, n in P.SHOTS:
        for fr in (1, n):
            x, y = route_city(name, *P.DRIVE.pos(P.t_of(name, fr)))
            hx, hy = hero_city(P.START[name] + fr)[:2]
            assert math.hypot(x - hx, y - hy) < 1e-6, (name, fr)
    w = fenetres()
    assert all(a[4] <= b[3] + 1.0 for a, b in zip(w, w[1:])), w
    assert set(CHARGE) >= {s for _, ps, _ in LIEUX for s in ps}
    # la clé du cache de scène : FILM3D_VILLE absent et « 1 » (le défaut) sont la même scène, « 0 » une autre
    import debit
    assert debit.env_key({"FILM3D_VILLE": "1", "FILM3D_HERO": "w111"}) == debit.env_key({"FILM3D_HERO": "w111"})
    assert debit.env_key({"FILM3D_VILLE": "0"}) != debit.env_key({})
    print("[ville] selftest : poses de parcours, un lieu une place, prises sans saut, conduite des prises, route sous "
          "la berline, fenêtres, chargement, clé FILM3D_VILLE : ok")


# ---------------------------------------------------------------- dans Blender : chaque lieu en cache

def log(msg):
    print(f"[ville] {msg}", flush=True)


def assets_dir():
    import render_film
    return os.path.realpath(render_film.assets_dir())


def worker_cache(nom, out):
    """Construit (ou reprend du cache de debit) la scène du lieu, exactement comme render_film la construit pour son
    plan, et écrit DIR/lieux/<nom>.json : le .blend du cache, la scène, l'inventaire de ses objets."""
    import importlib
    import inspect

    import bpy

    import debit
    plan = lieu(nom)["plan"]
    mod_name, arg = source(plan)
    d = os.path.join(out, "lieux")
    os.makedirs(d, exist_ok=True)
    os.environ["FILM3D_BLEND"] = os.path.join(d, f"{nom}-scene.blend")
    mod = importlib.import_module(mod_name)
    ASSETS = assets_dir()
    head = debit.head_key(plan, arg, bpy.app.version_string)      # avant la construction, comme cached_build
    t0 = time.time()
    scene, how, t_build, _ = debit.cached_build(
        plan, arg, lambda: mod.build(arg) if arg and inspect.signature(mod.build).parameters else mod.build(),
        ASSETS)
    cdir = debit.cache_dir(ASSETS)
    hit = debit.find(cdir, head)
    if hit:
        blend = hit[0]
    else:
        # la construction a changé ce qu'elle a lu (un fichier réécrit) : le .blend qu'elle vient de ranger
        hh = debit.head_hash(head)
        fresh = [os.path.join(cdir, n) for n in os.listdir(cdir) if n.startswith(f"{plan}-{hh}-") and
                 n.endswith(".blend") and os.path.getmtime(os.path.join(cdir, n)) >= t0]
        if not fresh:
            raise RuntimeError(f"{nom} : pas de .blend dans le cache après la construction")
        blend = max(fresh, key=os.path.getmtime)
        log(f"! {nom} : le cache ne reconnaît pas sa propre construction (un fichier lu a changé pendant), "
            f"je prends {os.path.basename(blend)}")
    inv = inventory(scene)
    info = dict(nom=nom, plan=plan, module=mod_name, blend=blend, scene=scene.name, how=how,
                build_s=round(t_build, 1), blend_mb=round(os.path.getsize(blend) / 1e6, 1), objects=inv)
    with open(os.path.join(d, f"{nom}.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False)
    log(f"{nom} ({plan}, {mod_name}) : {how} en {t_build:.0f} s, {len(inv)} objets, {info['blend_mb']} Mo, {blend}")


def _hidden(ob):
    if ob.hide_render:
        return True
    return any(c.hide_render for c in ob.users_collection)


def inventory(scene):
    import bpy
    bpy.context.view_layer.update()
    out = []
    for ob in scene.objects:
        mw = ob.matrix_world
        pts = [mw @ __import__("mathutils").Vector(c) for c in ob.bound_box]
        mn = [round(min(p[i] for p in pts), 2) for i in range(3)]
        mx = [round(max(p[i] for p in pts), 2) for i in range(3)]
        polys = len(ob.data.polygons) if ob.type == "MESH" else 0
        out.append(dict(n=ob.name, t=ob.type, p=ob.parent.name if ob.parent else None,
                        c=[c.name for c in ob.users_collection], h=int(_hidden(ob)), mn=mn, mx=mx, f=polys,
                        body=int("body" in ob.keys())))
    return out


# ---------------------------------------------------------------- dans Blender : la ville assemblée

# Ce que la ville ne reprend pas d'un lieu (les objets de tête et toute leur descendance) : les caméras, les véhicules
# du plan (les rigs de lieux.rig, qui portent « body » ; la berline et la patrouille de l'avenue, « coupe » et
# « police »), les personnages (toute descendance qui a une armature). Les voitures garées restent : c'est du décor.
# les véhicules, les personnages et ce qu'ils laissent : les traces de pneus des berlines des plans (wake_wheel_*
# du rond-point, trace_p5_* du port, traces_glissade de la pointe) et les repères de roue (repere_*)
CAST = re.compile(r"^(hero|coupe|police|patrol|van|heli|jet|officer|agent|focus|wake|traces?|repere)([_.:]|$)")
# Les faux lointains de chaque lieu : ce qui imite un autre lieu ou l'horizon. Deux règles, sur l'objet de tête :
# son nom (le panorama de lieux.panorama, le phare lointain, les brumes), puis sa place dans la scène du lieu (le
# centre de sa boîte hors de la zone propre du lieu, zones() : le fond de rue de la rue, le rond-point au bout de
# l'avenue nord, et dans le monde de l'eau le pont, le port ou la jetée vus depuis un autre de ces trois lieux).
LOINTAIN_NOMS = r"^(phare_lointain|lagune|ville_|autre_rive|rive_|sea$|sea[._]|haze)"


def zones():
    """{lieu: zone(x, y) -> bool} : la zone propre du lieu dans le repère de sa scène, lue dans les modules des
    scènes (aucune cote en dur). L'avenue n'en a pas : tout y est à elle."""
    import lieux as L
    import scene_b as B
    import scene_f as F
    import scene_c as C
    (px0, px1), (py0, py1) = L.PORT_XS, L.PORT_YS
    m = 3.0
    ville = L.ville_on() and getattr(C, "Y_TOE", None) is not None
    y_lo = min(L.BRIDGE_Y[0], C.Y_CITY_END) if ville else L.BRIDGE_Y[0]
    y_hi = C.Y_TOE if ville else py0 - 1e-6
    return {
        "avenue": lambda x, y: True,
        "rond-point": lambda x, y: abs(x) <= F.L + m and abs(y) <= F.L + m,
        # la rue, le boulevard du quai, le mur du quai et ses lampadaires : jusqu'à 1 m au-delà du quai (S_BRIDGE)
        "rue": lambda x, y: B.S_CAM - B.Y_END - m <= y <= B.S_BRIDGE + 1.0,
        # le pont : du quai de la ville au port ; en ville, de sa tête (scene_c.Y_CITY_END) à la fin du raccord de
        # son pied (scene_c.Y_TOE), qui sont à lui et non des lointains
        "pont": lambda x, y: y_lo - m <= y <= y_hi + m and abs(x - L.BRIDGE_X) <= 30.0,
        "port": lambda x, y: px0 - 15.0 <= x <= px1 + 40.0 and py0 <= y <= py1 + m,
        "jetee": lambda x, y: y >= L.JETTY_YS[0] - m and abs(x - L.JETTY_X) <= 80.0,
    }


# Les volumes (brumes, fumées, gerbes) : cachés au rendu gris, comme render_film --dry
VOLUMES = ("haze", "fumee", "spray_")
COULEURS = {"avenue": (0.95, 0.55, 0.15), "rond-point": (0.35, 0.8, 0.3), "rue": (0.85, 0.3, 0.75),
            "pont": (0.3, 0.55, 0.95), "port": (0.95, 0.85, 0.2), "jetee": (0.2, 0.85, 0.85)}
SHOT_COL = {"OUV": (1, 1, 1), "P1": (0.1, 0.1, 0.1), "P2": (1, 1, 1), "P3": (0.1, 0.1, 0.1), "P4": (1, 1, 1),
            "P5": (0.1, 0.1, 0.1), "P6": (1, 1, 1)}
Z_TOP = 60.0                                               # la hauteur des annotations de la carte


def _tops(objs):
    return [o for o in objs if o.parent is None or o.parent not in objs]


def _family(ob):
    return [ob] + list(ob.children_recursive)


def is_cast(ob):
    if ob.type == "CAMERA" or "body" in ob.keys() or CAST.match(ob.name):
        return True
    return any(o.type == "ARMATURE" for o in _family(ob))


# Ce qui sort d'un lieu voisin (SPEC §18.36 : ce qui se voit des deux côtés d'une coupe continue est le même objet,
# au même endroit, dans le même état) : seulement les acteurs animés de son plan (ce qui se déplace : une clé de
# position qui varie, ou un chemin suivi), la caméra et les traces que laisse sa berline. Les voitures garées, le barrage et ses agents immobiles, les cônes, les lampes, les émissifs restent.
TRACES = re.compile(r"^(wake|traces?|repere)([_.:]|$)")


def _bouge(o):
    import motion as M
    if any(c.type == "FOLLOW_PATH" and not c.mute for c in o.constraints):
        return True
    try:
        fcs = M.fcurves(o)
    except Exception:
        fcs = []
    for fc in fcs:
        # se déplacer : une position qui varie de plus de 5 cm (une portière, une roue, un geste sur place ne font
        # pas un acteur : la voiture du barrage ouvre sa portière, l'agent vise, ils restent là)
        if fc.data_path in ("location", "delta_location"):
            vals = [k.co[1] for k in fc.keyframe_points]
            if vals and max(vals) - min(vals) > 0.05:
                return True
    return False


def is_acteur(top, traces=True):
    """Un acteur animé (à retirer d'un voisin) : la caméra, une trace de berline (si `traces` : le plan du voisin
    suit le plan rendu, la berline n'y est pas encore passée), ou une famille dont un objet bouge."""
    if top.type == "CAMERA" or (traces and TRACES.match(top.name)):
        return True
    if TRACES.match(top.name):
        return False                    # une trace révélée par ses clés : son état est celui de son plan à la coupe
    return any(_bouge(o) for o in _family(top))


def _decaler(idbs, d):
    """Décale de `d` images les clés de ces blocs (chaque action une fois) : la phase d'un voisin de la même prise."""
    import motion as M
    seen = set()
    n = 0
    for idb in idbs:
        ad = getattr(idb, "animation_data", None)
        act = ad.action if ad else None
        if act is None or act.name in seen:
            continue
        seen.add(act.name)
        for fc in M.fcurves(idb):
            for k in fc.keyframe_points:
                k.co[0] += d
                k.handle_left[0] += d
                k.handle_right[0] += d
            n += 1
    return n


def _blocs(objs):
    """Les blocs animables d'objets : eux, leurs données, leurs matériaux et arbres de nœuds."""
    out = []
    for o in objs:
        out.append(o)
        if o.data is not None:
            out.append(o.data)
            if getattr(o.data, "node_tree", None) is not None:
                out.append(o.data.node_tree)
        for s in getattr(o, "material_slots", ()):
            m = s.material
            if m is not None:
                out.append(m)
                if m.node_tree is not None:
                    out.append(m.node_tree)
    return out


def meme_prise(a, b):
    """Les plans a et b sont-ils dans la même prise continue ?"""
    return any(a in ps and b in ps for _a, _b, ps in prises())


def is_lointain(nom, top, zone):
    """Le drapeau d'une famille (son objet de tête, avant la pose dans la ville) : 0 si elle est cachée de toute
    façon (les sources), 1 si son nom est celui d'un lointain ou si son centre sort de la zone du lieu ; une famille
    qui contient le centre du lieu (un grand sol) reste au lieu."""
    from mathutils import Vector
    fam = [o for o in _family(top) if o.type in ("MESH", "CURVE", "FONT")]
    if all(_hidden(o) for o in _family(top)):
        return False
    if re.match(LOINTAIN_NOMS, top.name):
        return True
    if not fam:
        return False
    pts = [o.matrix_world @ Vector(c) for o in fam for c in o.bound_box]
    x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
    y0, y1 = min(p.y for p in pts), max(p.y for p in pts)
    return not zone((x0 + x1) / 2, (y0 + y1) / 2)


def assembler(scene, infos, noms, base=None, plan=None):
    """Ajoute chaque lieu à la scène de ville : sa collection, sa racine (la transformation de placement), ses
    objets parentés à la racine, ses drapeaux. `base` (4 × 4, lignes) : le repère de la scène, s'il n'est pas celui de
    la ville (voisins : la scène d'un plan). `plan` (voisins) : le plan rendu ; un lieu de la même prise n'y perd que
    ses acteurs animés (is_acteur), et ses clés passent dans la numérotation du plan (la même image de la prise, le
    même état : lampes, rampes, enseignes). Rend {nom: dict(racine, collection, objets, retirés, lointains)}."""
    import bpy
    from mathutils import Matrix
    out = {}
    for nom in noms:
        info = infos[nom]
        t0 = time.time()
        with bpy.data.libraries.load(info["blend"], link=False) as (src, dst):
            dst.scenes = [info["scene"]]
        sc = dst.scenes[0]
        nb_plan = lieu(nom)["plan"]
        prise = plan is not None and nb_plan in P.START and plan in P.START and meme_prise(plan, nb_plan)
        nb_fs = sc.frame_start
        coll = bpy.data.collections.new(f"ville_{nom}")
        scene.collection.children.link(coll)
        for ch in list(sc.collection.children):
            coll.children.link(ch)
        for ob in list(sc.collection.objects):
            coll.objects.link(ob)
        objs = set(sc.objects)
        world = sc.world
        bpy.data.scenes.remove(sc)
        if world is not None and world.users == 0:
            bpy.data.worlds.remove(world)
        gone = set()
        # les traces d'un voisin dont le plan précède restent (la berline y est passée) ; s'il suit, elles sortent
        suit = prise and P.START[nb_plan] > P.START[plan]
        for top in _tops(objs):
            if (is_acteur(top, traces=suit) if prise else is_cast(top)):
                gone.update(_family(top))
        names_gone = sorted(o.name for o in _tops(gone))
        for ob in gone:
            bpy.data.objects.remove(ob, do_unlink=True)
        objs -= gone
        shift = 0
        if prise:
            # l'image F du plan rendu est l'image de prise START[plan] + F − frame_start ; celle du voisin, la sienne
            shift = (P.START[plan] - scene.frame_start) - (P.START[nb_plan] - nb_fs)
            nk = _decaler(_blocs(objs), -shift) if shift else 0
            log(f"{nom} ({nb_plan}) dans la prise de {plan} : entier hors acteurs animés, clés décalées de "
                f"{-shift:+d} images ({nk} courbes)")
        bpy.context.view_layer.update()
        zone = zones()[nom]
        root = bpy.data.objects.new(f"ville_{nom}_racine", None)
        root.empty_display_size = 10.0
        coll.objects.link(root)
        root.matrix_world = (Matrix(base) if base else Matrix.Identity(4)) @ Matrix(matrice(lieu(nom)["plan"]))
        far = 0
        for top in _tops(objs):
            # un véhicule ou un figurant gardé (immobile, d'un lieu de la même prise) est à son lieu, où qu'il soit
            # posé : le barrage au bout de la rue n'imite aucun autre lieu
            flag = False if (prise and is_cast(top)) else is_lointain(nom, top, zone)
            for o in _family(top):
                o["ville_lieu"] = nom
                o["ville_lointain"] = int(flag)
                o["ville_cache0"] = int(o.hide_render)
                far += flag
            top.parent = root
            top.matrix_parent_inverse = Matrix.Identity(4)
        root["ville_lieu"] = nom
        root["ville_lointain"] = 0
        root["ville_cache0"] = 0
        out[nom] = dict(racine=root, collection=coll, objets=len(objs), retires=names_gone, lointains=far,
                        load_s=round(time.time() - t0, 1))
        log(f"{nom} : {len(objs)} objets ajoutés ({far} faux lointains), {len(gone)} retirés "
            f"({', '.join(names_gone[:12])}{'…' if len(names_gone) > 12 else ''}) en {time.time() - t0:.1f} s")
    return out


def voisins(scene, plan, ville_dir):
    """render_film --ville DIR : autour de la scène du plan (son lieu, sa berline, sa caméra, son ciel), les autres
    lieux que CHARGE lui donne, pris des .blend de DIR/lieux (ville.py --cache), posés dans le repère du lieu du plan,
    sans leurs faux lointains. Un lieu absent de DIR est signalé et sauté."""
    from mathutils import Matrix
    own = lieu_of_shot(plan)[0]
    infos = {}
    for n in charge((plan,))[0]:
        if n == own:
            continue
        path = os.path.join(ville_dir, "lieux", f"{n}.json")
        try:
            with open(path, encoding="utf-8") as f:
                info = json.load(f)
        except (OSError, ValueError):
            log(f"! {plan} : {n} absent ({path} : ville.py --cache d'abord), pas posé")
            continue
        if not os.path.exists(info["blend"]):
            log(f"! {plan} : {n}, son .blend a quitté le cache ({info['blend']}), pas posé")
            continue
        infos[n] = info
    import bpy
    own_objs = [o for o in scene.objects if o.get("ville_lieu") is None]
    base = Matrix(matrice(lieu(own)["plan"])).inverted()
    built = assembler(scene, infos, list(infos), base=[list(r) for r in base], plan=plan)
    lointains(scene, False)
    bpy.context.view_layer.update()
    doubles = doublons(scene, own, own_objs, built)
    poses = ", ".join("%s (%d objets)" % (n, b["objets"]) for n, b in built.items()) or "aucun voisin"
    log(f"{plan} dans la ville : {poses} autour de {own} ; {len(doubles)} faux lointains de {own} cachés sous un "
        f"voisin chargé ({', '.join(sorted(doubles)[:8])}{'…' if len(doubles) > 8 else ''})")
    return built


def doublons(scene, own, own_objs, built):
    """Les faux lointains de la scène du plan (hors de la zone de son lieu) qui imitent un voisin chargé : le centre
    de leur boîte dans la boîte d'un voisin. Cachés : le vrai lieu est là, et c'est lui qu'on voit des deux côtés de
    la coupe. Les lointains de nom (ciel, mer, brume, phare lointain) restent. Rend leurs noms."""
    from mathutils import Vector
    boxes = []
    for n in built:
        pts = []
        for o in scene.objects:
            if o.get("ville_lieu") == n and not o.get("ville_lointain") and o.type == "MESH" and not o.hide_render:
                pts += [o.matrix_world @ Vector(c) for c in (o.bound_box[0], o.bound_box[6])]
        if pts:
            boxes.append((min(p.x for p in pts), max(p.x for p in pts), min(p.y for p in pts), max(p.y for p in pts)))
    zone = zones()[own]
    objs = set(own_objs)
    hidden = set()
    for top in _tops(objs):
        if is_cast(top) or is_acteur(top) or re.match(LOINTAIN_NOMS, top.name):
            continue
        if not is_lointain(own, top, zone):
            continue
        fam = [o for o in _family(top) if o.type in ("MESH", "CURVE", "FONT")]
        pts = [o.matrix_world @ Vector(c) for o in fam for c in o.bound_box]
        if not pts:
            continue
        cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
        cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
        if any(x0 <= cx <= x1 and y0 <= cy <= y1 for x0, x1, y0, y1 in boxes):
            for o in _family(top):
                o.hide_render = o.hide_viewport = True
            hidden.add(top.name)
    return hidden


def montrer(scene, noms, show_far=False):
    """Ne montre au rendu que les lieux `noms` de la ville (une prise : charge()), sans leurs faux lointains sauf
    show_far ; les objets cachés d'origine le restent."""
    for ob in scene.objects:
        n = ob.get("ville_lieu")
        if n in NOMS:
            ob.hide_render = (n not in noms or bool(ob.get("ville_cache0"))
                              or (bool(ob.get("ville_lointain")) and not show_far))


def lointains(scene, show):
    """Montre ou cache tous les faux lointains de la ville (drapeau ville_lointain)."""
    n = 0
    for ob in scene.objects:
        if ob.get("ville_lointain"):
            hide = (not show) or bool(ob.get("ville_cache0"))
            ob.hide_render = ob.hide_viewport = hide
            n += 1
    return n


def volumes(scene, show):
    for ob in scene.objects:
        if ob.type == "MESH" and ob.name.startswith(VOLUMES):
            ob.hide_render = ob.hide_viewport = (not show) or bool(ob.get("ville_cache0"))


def mer(scene):
    """La seule mer de la ville (lieux.water, au niveau du monde de l'eau) et le seul ciel (lieux.ciel, la bande
    corail vers lieux.MER_VILLE_DEG, l'azimut unique de la ville)."""
    import bpy
    import lieux as L
    L.ciel(scene, mer=math.radians(L.MER_VILLE_DEG))
    scene.world.color = (0.04, 0.045, 0.06)
    ob = L.water("ville_mer", (-3000.0, 3000.0), (-3000.0, 3000.0), L.WATER_Z)
    if ob.name not in scene.collection.objects:
        scene.collection.objects.link(ob)
    for c in list(ob.users_collection):
        if c != scene.collection:
            c.objects.unlink(ob)
    ob["ville_lieu"], ob["ville_lointain"], ob["ville_cache0"] = "mer", 0, 0
    bpy.context.view_layer.update()
    return ob


# ---- le sol sous la route : lancers de rayons vers le bas, lieu par lieu

def _cast_down(scene, dg, x, y, z0, lieu_nom=None, depth=10.0):
    """Le premier dessus (normale vers le haut) sous (x, y, z0), d'un lieu donné (None : tout lieu, mer exclue).
    Rend (z, objet) ou None."""
    from mathutils import Vector
    o = Vector((x, y, z0))
    d = Vector((0.0, 0.0, -1.0))
    left = depth
    for _ in range(16):
        ok, loc, nor, _i, ob, _m = scene.ray_cast(dg, o, d, distance=left)
        if not ok:
            return None
        ob = ob.original if ob else ob
        who = ob.get("ville_lieu") if ob else None
        if nor.z > 0.5 and who not in (None, "mer", "annotation") and (lieu_nom is None or who == lieu_nom):
            return loc.z, ob
        left -= (o.z - loc.z) + 0.005
        if left <= 0:
            return None
        o = loc + d * 0.005
    return None


Z_CIEL = 30.0           # d'où partent les rayons vers le sol (au-dessus du tablier du pont, sous les grues)


def _sol(scene, dg, x, y, cap, lieu_nom=None):
    """Le dessus de chaussée le plus haut sous (x, y) (ville ; `cap` : le sens de la route), d'un lieu donné ou de
    tout lieu : un dessus « large », que quatre rayons voisins (1,2 m devant, derrière, à gauche, à droite)
    retrouvent à 0,3 m près ; les enseignes, guirlandes, têtes de lampadaire et haubans sont passés. (z, objet)."""
    a = math.radians(cap)
    fx, fy, lx, ly = -math.sin(a), math.cos(a), -math.cos(a), -math.sin(a)
    z0 = Z_CIEL
    for _ in range(12):
        h = _cast_down(scene, dg, x, y, z0, lieu_nom, depth=z0 + 10.0)
        if h is None:
            return None
        ok = True
        for dx, dy in ((1.2 * fx, 1.2 * fy), (-1.2 * fx, -1.2 * fy), (1.2 * lx, 1.2 * ly), (-1.2 * lx, -1.2 * ly)):
            h2 = _cast_down(scene, dg, x + dx, y + dy, h[0] + 0.5, lieu_nom, depth=0.8)
            if h2 is None:
                ok = False
                break
        if ok:
            return h
        z0 = h[0] - 0.01
    return None


def profil(scene, noms, ds=0.5):
    """Le sol de la ville sous la route : [(s, x, y, z ou None, lieu)] tous les ds : la chaussée du lieu à qui la
    route appartient là (le lieu de shot_of_s), sinon celle de n'importe quel lieu, sinon un trou."""
    import bpy
    dg = bpy.context.evaluated_depsgraph_get()
    out = []
    for s, x, y, cap, shot in route_pts(ds):
        want = lieu_of_shot(shot)[0]
        h = (_sol(scene, dg, x, y, cap, want) if want in noms else None) or _sol(scene, dg, x, y, cap)
        out.append((s, x, y, h[0], h[1].get("ville_lieu")) if h else (s, x, y, None, None))
    return out


def _combler(zs):
    """Une liste avec des None : les trous comblés en ligne droite entre leurs bords."""
    known = [i for i, z in enumerate(zs) if z is not None]
    if not known:
        return [0.0] * len(zs)
    full = list(zs)
    for i in range(len(full)):
        if full[i] is None:
            a = max((k for k in known if k < i), default=None)
            b = min((k for k in known if k > i), default=None)
            full[i] = zs[b] if a is None else zs[a] if b is None else zs[a] + (zs[b] - zs[a]) * (i - a) / (b - a)
    return full


def sol_berline(scene, noms):
    """{image: (x, y, z, lieu ou None)} : la chaussée sous la berline à chaque image (celle du lieu du plan, sinon de
    tout lieu), les trous comblés d'une prise à l'autre (z interpolé, lieu None)."""
    import bpy
    dg = bpy.context.evaluated_depsgraph_get()
    out = {}
    for a, b, _ in prises():
        fs = list(range(a, b + 1))
        rows = []
        for f in fs:
            x, y, _, trav, _ = hero_city(f)
            want = lieu_of_shot(shot_of(f)[0])[0]
            h = (_sol(scene, dg, x, y, trav, want) if want in noms else None) or _sol(scene, dg, x, y, trav)
            rows.append((x, y, h[0] if h else None, h[1].get("ville_lieu") if h else None))
        zs = _combler([r[2] for r in rows])
        for f, r, z in zip(fs, rows, zs):
            out[f] = (r[0], r[1], z, r[3])
    return out


def coupe_laterale(scene, dg, s, nom, half=14.0, step=0.25):
    """La chaussée du lieu `nom` en travers de la route à l'abscisse s : (z au centre, largeur, décalage du milieu
    de la chaussée vers la gauche de la route) ; la chaussée s'arrête à la première marche de plus de 6 cm (une
    bordure) ou au premier vide."""
    x, y, cap = route_at(s, lieu(nom)["plan"])  # la route posée comme le lieu (sa moitié de ville)
    a = math.radians(cap)
    lx, ly = -math.cos(a), -math.sin(a)          # la gauche de la route
    c = _sol(scene, dg, x, y, cap, nom)
    if c is None:
        return None
    zc = c[0]
    ends = []
    for side in (1, -1):
        zp, k = zc, 0
        while k * step < half:
            k += 1
            h = _cast_down(scene, dg, x + side * k * step * lx, y + side * k * step * ly, zp + 0.5, nom, depth=1.0)
            if h is None or abs(h[0] - zp) > 0.06:
                break
            zp = h[0]
        ends.append(side * (k - 1) * step)
    return zc, ends[0] - ends[1], (ends[0] + ends[1]) / 2


def jonctions(scene, noms, ds=1.0):
    """Pour chaque lieu : sa chaussée le long de la route (z, largeur, décalage) ; pour chaque paire de lieux qui se
    suivent : la fin de l'un, le début de l'autre, et les écarts à la coupe."""
    import bpy
    dg = bpy.context.evaluated_depsgraph_get()
    n = int(P.ROUTE.length / ds)
    cov = {}
    for nom in noms:
        rows = []
        for k in range(n + 1):
            s = k * ds
            r = coupe_laterale(scene, dg, s, nom)
            if r:
                rows.append((s, *r))
        cov[nom] = rows
    w = {name: (s0, s1) for name, _, _, s0, s1 in fenetres()}
    out = []
    for (na, pa_, pa), (nb, pb_, pb) in zip(LIEUX, LIEUX[1:]):
        if na not in noms or nb not in noms:
            continue
        s_cut = (w[pa_[-1] if pa_[-1] in w else pa][1] + w[pb][0]) / 2
        a_rows, b_rows = cov[na], cov[nb]
        # l'intervalle de chaque lieu qui contient sa fenêtre (ou le plus proche de la coupe)
        a_end = _run_end(a_rows, w[pa][0], +1, ds)
        b_start = _run_end(b_rows, w[pb][1], -1, ds)
        ra = _near(a_rows, min(a_end, s_cut) if a_end is not None else s_cut)
        rb = _near(b_rows, max(b_start, s_cut) if b_start is not None else s_cut)
        ka = [s for s in pa_ if s in P.START][-1]
        kb = [s for s in pb_ if s in P.START][0]
        out.append(dict(a=na, b=nb, continu=P.CONTINU.get((ka, kb), True), s_cut=s_cut, a_end=a_end, b_start=b_start,
                        gap=(b_start - a_end) if a_end is not None and b_start is not None else None,
                        za=ra and ra[1], zb=rb and rb[1], wa=ra and ra[2], wb=rb and rb[2], oa=ra and ra[3],
                        ob=rb and rb[3], axa=_axis(a_rows, ra and ra[0], -1), axb=_axis(b_rows, rb and rb[0], +1)))
    return cov, out


def _run_end(rows, s_in, direction, ds):
    """Le bout (dans `direction`) de la suite continue de rangées qui contient s_in (ou commence le plus près)."""
    if not rows:
        return None
    ss = [r[0] for r in rows]
    i = min(range(len(ss)), key=lambda k: abs(ss[k] - s_in))
    while 0 <= i + direction < len(ss) and abs(ss[i + direction] - ss[i]) <= ds * 1.5:
        i += direction
    return ss[i]


def _near(rows, s):
    if not rows or s is None:
        return None
    return min(rows, key=lambda r: abs(r[0] - s))


def _axis(rows, s, direction, span=10.0):
    """L'angle (degrés, positif à gauche) entre l'axe de la chaussée et la route, sur `span` m depuis s vers
    l'intérieur du lieu : la pente du décalage du milieu de la chaussée."""
    if s is None:
        return None
    pts = [r for r in rows if 0 <= (r[0] - s) * direction <= span]
    if len(pts) < 3:
        return None
    n = len(pts)
    ms = sum(r[0] for r in pts) / n
    mo = sum(r[3] for r in pts) / n
    var = sum((r[0] - ms) ** 2 for r in pts)
    if var == 0:
        return None
    slope = sum((r[0] - ms) * (r[3] - mo) for r in pts) / var
    return math.degrees(math.atan(slope))


# ---- les emprises et les chevauchements, en plan

ETENDU = 600.0          # un objet plus grand que ça (m, en x ou en y) est un sol étendu : listé, hors de la grille


# ---- les contrôles : le sol sous les roues, les emprises réelles

TROU_PAS, TROU_LAT, TROU_HAUT, TROU_MARCHE = 0.5, (-1.0, 0.0, 1.0), 3.0, 0.03


def _premiere_face(scene, dg, x, y, z0, depth):
    """La première face sous (x, y, z0), quel que soit son objet (sauf la berline de la ville et les annotations) :
    (z, objet, lieu) ; None si rien jusqu'à `depth` m. La mer de la ville compte comme un trou (lieu « mer »)."""
    from mathutils import Vector
    o = Vector((x, y, z0))
    d = Vector((0.0, 0.0, -1.0))
    left = depth
    for _ in range(8):
        ok, loc, _nor, _i, ob, _m = scene.ray_cast(dg, o, d, distance=left)
        if not ok:
            return None
        ob = ob.original if ob else ob
        who = ob.get("ville_lieu") if ob else None
        if who not in ("berline", "annotation"):
            return loc.z, ob.name, who
        left -= (o.z - loc.z) + 0.005
        if left <= 0:
            return None
        o = loc + d * 0.005
    return None


def _echantillons(a, b, ds):
    """Les instants de la prise (a, b) espacés de `ds` m de chemin de la berline : [(t, x, y, cap de la vitesse)]."""
    pos, _head = prise_pose(a)
    t0, t1 = (a - 1) / FPS, (b - 1) / FPS
    dt = 1.0 / 480.0
    out, t, acc, prev = [], t0, ds, pos(t0)
    while t <= t1 + 1e-9:
        p = pos(t)
        acc += math.hypot(p[0] - prev[0], p[1] - prev[1])
        prev = p
        if acc >= ds:
            q0, q1 = pos(t - 1e-3), pos(t + 1e-3)
            cap = math.degrees(math.atan2(-(q1[0] - q0[0]), q1[1] - q0[1]))
            out.append((t, p[0], p[1], cap))
            acc -= ds
        t += dt
    return out


def trous(scene, ds=TROU_PAS, lats=TROU_LAT, up=TROU_HAUT, marche=TROU_MARCHE):
    """Le sol sous les roues, par lancer de rayon vertical dans la ville assemblée : tous les `ds` m du chemin de la
    berline, sur son axe et à ± 1 m, la première face sous z + `up` (z : le sol du pas précédent), quel que soit son
    objet. Un trou : aucune face (ou la mer) ; une marche : un saut de hauteur de plus de `marche` entre deux pas, au-
    delà de la pente du voisinage (la médiane des sauts de ± 4 pas : une rampe régulière n'est pas une marche).
    Rend [dict(prise, s0, s1, plan, image, lat, genre, avant, apres, dz)] et le nombre de pas."""
    import bpy
    dg = bpy.context.evaluated_depsgraph_get()
    events, n = [], 0
    for k, (a, b, _shots) in enumerate(prises()):
        samples = _echantillons(a, b, ds)
        ss = [s_of_pos(*P.DRIVE.pos(t)) for t, _x, _y, _c in samples]
        fr = [shot_of(min(P.TOTAL, max(1, int(round(t * FPS)) + 1))) for t, _x, _y, _c in samples]
        for lat in lats:
            line, zprev = [], None
            for (t, x, y, cap) in samples:
                c = math.radians(cap)
                px, py = x - lat * math.cos(c), y - lat * math.sin(c)      # lat > 0 : à gauche de la berline
                if zprev is None:
                    h0 = _sol(scene, dg, px, py, cap)
                    zprev = h0[0] if h0 else Z_CIEL - up
                h = _premiere_face(scene, dg, px, py, zprev + up, up + 12.0)
                if h is None or h[2] == "mer":
                    line.append(None)
                else:
                    line.append(h)
                    zprev = h[0]
            n += len(line)
            dz = [None] + [(line[i][0] - line[i - 1][0]) if line[i] and line[i - 1] else None
                           for i in range(1, len(line))]
            i = 0
            while i < len(line):
                if line[i] is None:
                    j = i
                    while j + 1 < len(line) and line[j + 1] is None:
                        j += 1
                    before = next((line[q] for q in range(i - 1, -1, -1) if line[q]), None)
                    after = next((line[q] for q in range(j + 1, len(line)) if line[q]), None)
                    events.append(dict(prise=k + 1, s0=round(ss[i], 2), s1=round(ss[j], 2), plan=fr[i][0],
                                       image=fr[i][1], lat=lat, genre="trou", avant=before and before[1],
                                       apres=after and after[1],
                                       dz=round(after[0] - before[0], 3) if before and after else None))
                    i = j + 1
                    continue
                if dz[i] is not None:
                    nb = sorted(dz[q] for q in range(max(1, i - 4), min(len(dz), i + 5)) if q != i and dz[q] is not None)
                    ref = nb[len(nb) // 2] if nb else 0.0
                    if abs(dz[i] - ref) > marche:
                        events.append(dict(prise=k + 1, s0=round(ss[i - 1], 2), s1=round(ss[i], 2), plan=fr[i][0],
                                           image=fr[i][1], lat=lat, genre="marche", avant=line[i - 1][1],
                                           apres=line[i][1], dz=round(dz[i], 3)))
                i += 1
    return events, n


def _tris_xy(ob, dg):
    """Les triangles de l'objet évalué, en plan dans la ville : tableau (n, 3, 2), ou None."""
    import numpy as np
    ev = ob.evaluated_get(dg)
    try:
        me = ev.to_mesh()
    except RuntimeError:
        return None
    if me is None:
        return None
    try:
        me.calc_loop_triangles()
        nt = len(me.loop_triangles)
        if nt == 0 or len(me.vertices) == 0:
            return None
        co = np.empty(len(me.vertices) * 3, dtype=np.float64)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        tri = np.empty(nt * 3, dtype=np.int64)
        me.loop_triangles.foreach_get("vertices", tri)
        m = np.array(ob.matrix_world, dtype=np.float64)
        w = co @ m[:3, :3].T + m[:3, 3]
        return w[tri.reshape(-1, 3)][:, :, :2]
    finally:
        ev.to_mesh_clear()


def _raster(T, x0, y0, cell, nx, ny):
    """Les cases (indices à plat j·nx + i) de la grille que couvrent les triangles T (n, 3, 2) en plan : un petit
    triangle (au plus 2 × 2 cases) par ses sommets et son centre ; un grand par le test des centres de case de sa
    boîte, plus ses arêtes échantillonnées (une face verticale se projette en ligne)."""
    import numpy as np
    if T is None or not len(T):
        return np.zeros(0, dtype=np.int64)
    I = (T[..., 0] - x0) / cell
    J = (T[..., 1] - y0) / cell
    i0, i1 = np.floor(I.min(1)).astype(np.int64), np.floor(I.max(1)).astype(np.int64)
    j0, j1 = np.floor(J.min(1)).astype(np.int64), np.floor(J.max(1)).astype(np.int64)
    small = ((i1 - i0) <= 1) & ((j1 - j0) <= 1)
    S = T[small]
    pts = [S.reshape(-1, 2), S.mean(1)]
    idx = []
    for k in np.nonzero(~small)[0]:
        (ax, ay), (bx, by), (cx, cy) = T[k]
        xs = x0 + (np.arange(i0[k], i1[k] + 1) + 0.5) * cell
        ys = y0 + (np.arange(j0[k], j1[k] + 1) + 0.5) * cell
        X, Y = np.meshgrid(xs, ys)
        d1 = (bx - ax) * (Y - ay) - (by - ay) * (X - ax)
        d2 = (cx - bx) * (Y - by) - (cy - by) * (X - bx)
        d3 = (ax - cx) * (Y - cy) - (ay - cy) * (X - cx)
        inside = ((d1 >= 0) & (d2 >= 0) & (d3 >= 0)) | ((d1 <= 0) & (d2 <= 0) & (d3 <= 0))
        jj, ii = np.nonzero(inside)
        idx.append((jj + j0[k]) * nx + (ii + i0[k]))
        for (px, py), (qx, qy) in (((ax, ay), (bx, by)), ((bx, by), (cx, cy)), ((cx, cy), (ax, ay))):
            m = max(2, int(math.hypot(qx - px, qy - py) / (cell / 2)) + 1)
            u = np.linspace(0.0, 1.0, m)
            pts.append(np.stack([px + (qx - px) * u, py + (qy - py) * u], 1))
    P_ = np.concatenate(pts) if pts else np.zeros((0, 2))
    ii = np.floor((P_[:, 0] - x0) / cell).astype(np.int64)
    jj = np.floor((P_[:, 1] - y0) / cell).astype(np.int64)
    idx.append(jj * nx + ii)
    flat = np.concatenate(idx)
    ok = (flat >= 0) & (flat < nx * ny)
    return np.unique(flat[ok])


def emprises(scene, noms, cell=2.0):
    """Par lieu : la boîte englobante de ses objets visibles (faux lointains et volumes exclus) dans la ville, ses
    sols étendus (plus de ETENDU m, listés hors de la grille) ; l'empreinte réelle de ses faces (les triangles
    rastérisés sur une grille de `cell` m), puis les chevauchements par paire : surface, boîte, et pour chaque lieu
    les objets dont les faces couvrent le plus de cases communes (chacun compté pour ses propres faces).
    Rend (boîtes, étendus, chevauchements, empreintes, grille) ; grille = (union des lieux, x0, y0, cell, nx, ny,
    {lieu: grille})."""
    import numpy as np
    import bpy
    from mathutils import Vector
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    per = {nom: [] for nom in noms}
    for ob in scene.objects:
        nom = ob.get("ville_lieu")
        if nom not in per or ob.get("ville_lointain") or ob.type not in ("MESH", "CURVE", "FONT", "SURFACE"):
            continue
        if _hidden(ob) or ob.name.startswith(VOLUMES) or CAST.match(ob.name):
            continue
        pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        per[nom].append((ob, min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts),
                         max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    box, wide = {}, {}
    for nom, rows in per.items():
        small = [r for r in rows if r[4] - r[1] <= ETENDU and r[5] - r[2] <= ETENDU]
        wide[nom] = [(r[0].name, round(r[4] - r[1]), round(r[5] - r[2])) for r in rows if r not in small]
        per[nom] = small
        if small:
            box[nom] = (min(r[1] for r in small), min(r[2] for r in small), min(r[3] for r in small),
                        max(r[4] for r in small), max(r[5] for r in small), max(r[6] for r in small))
    if not box:
        return box, wide, [], {}, None
    x0 = min(b[0] for b in box.values()) - 10
    y0 = min(b[1] for b in box.values()) - 10
    x1 = max(b[3] for b in box.values()) + 10
    y1 = max(b[4] for b in box.values()) + 10
    nx, ny = int((x1 - x0) / cell) + 1, int((y1 - y0) / cell) + 1
    grids, cells = {}, {}
    for nom, rows in per.items():
        g = np.zeros(nx * ny, dtype=bool)
        cs = []
        for r in rows:
            c = _raster(_tris_xy(r[0], dg), x0, y0, cell, nx, ny)
            g[c] = True
            cs.append((r[0].name, c))
        grids[nom], cells[nom] = g, cs
    over = []
    for i, a in enumerate(noms):
        for b in noms[i + 1:]:
            if a not in grids or b not in grids:
                continue
            m = grids[a] & grids[b]
            area = float(m.sum()) * cell * cell
            if area <= 0:
                continue
            k = np.nonzero(m)[0]
            jj, ii = k // nx, k % nx
            bb = (x0 + ii.min() * cell, y0 + jj.min() * cell, x0 + (ii.max() + 1) * cell, y0 + (jj.max() + 1) * cell)

            def heavy(nom):
                cnt = [(name, int(m[c].sum())) for name, c in cells[nom] if len(c)]
                cnt = sorted((t for t in cnt if t[1]), key=lambda t: -t[1])[:4]
                return [(name, round(v * cell * cell)) for name, v in cnt]
            over.append(dict(a=a, b=b, area=round(area), box=[round(v, 1) for v in bb], wa=heavy(a), wb=heavy(b)))
    foot = {nom: round(float(g.sum()) * cell * cell) for nom, g in grids.items()}
    union = np.zeros(nx * ny, dtype=bool)
    for g in grids.values():
        union |= g
    return box, wide, over, foot, (union.reshape(ny, nx), x0, y0, cell, nx, ny,
                                   {n: g.reshape(ny, nx) for n, g in grids.items()})


def place_libre(grille, cadre, w, h, marge=6.0):
    """Le centre d'un rectangle w × h (m) sans aucune empreinte de lieu dans le cadre (x0, y0, x1, y1), cherché
    depuis le coin en haut à droite (vers le bas, puis vers la gauche) ; None s'il n'y en a pas."""
    import numpy as np
    union, gx0, gy0, cell, nx, ny, _ = grille
    X0, Y0, X1, Y1 = cadre
    occ = np.pad(union.astype(np.int32), 1).cumsum(0).cumsum(1)

    def empty(cx, cy):
        i0 = int((cx - w / 2 - marge - gx0) / cell)
        i1 = int((cx + w / 2 + marge - gx0) / cell) + 1
        j0 = int((cy - h / 2 - marge - gy0) / cell)
        j1 = int((cy + h / 2 + marge - gy0) / cell) + 1
        i0, i1 = max(0, i0), min(nx, i1)
        j0, j1 = max(0, j0), min(ny, j1)
        if i0 >= i1 or j0 >= j1:
            return True
        return occ[j1, i1] - occ[j0, i1] - occ[j1, i0] + occ[j0, i0] == 0
    step = max(cell, min(w, h) / 6)
    cx = X1 - w / 2 - marge
    while cx - w / 2 >= X0:
        cy = Y1 - h / 2 - marge
        while cy - h / 2 >= Y0:
            if empty(cx, cy):
                return cx, cy
            cy -= step
        cx -= step
    return None


def centres_lieux(grille, cadre, size):
    """{lieu: (x, y, rotation)} : où écrire le nom du lieu, au centre de masse de son empreinte dans le cadre, tourné
    d'un quart de tour si l'empreinte est trois fois plus haute que large (le pont, sur son tablier)."""
    import numpy as np
    union, gx0, gy0, cell, nx, ny, grids = grille
    X0, Y0, X1, Y1 = cadre
    out = {}
    for nom, g in grids.items():
        jj, ii = np.nonzero(g)
        if not len(ii):
            continue
        xs, ys = gx0 + (ii + 0.5) * cell, gy0 + (jj + 0.5) * cell
        keep = (xs >= X0) & (xs <= X1) & (ys >= Y0) & (ys <= Y1)
        if keep.sum() < 4:
            continue
        xs, ys = xs[keep], ys[keep]
        w, h = xs.max() - xs.min(), ys.max() - ys.min()
        tall = h > 3.0 * w
        half_w = 0.75 * len(nom) * size * 2.6 / 2      # la demi-longueur du nom écrit
        x, y = float(np.median(xs)), float(np.median(ys))
        if tall:
            y = min(max(y, Y0 + half_w + size), Y1 - half_w - size)
        else:
            x = min(max(x, X0 + half_w + size), X1 - half_w - size)
            y = min(max(y, Y0 + 3 * size), Y1 - 3 * size)
        out[nom] = (x, y, math.radians(90.0) if tall else 0.0)
    return out


def texte_trous(events, n):
    if not events:
        return [f"sol sous les roues (rayons verticaux, {n} pas de {TROU_PAS} m sur l'axe et à ±1 m) : ni trou ni "
                f"marche de plus de {TROU_MARCHE * 100:.0f} cm"]
    L_ = [f"sol sous les roues (rayons verticaux, {n} pas de {TROU_PAS} m sur l'axe et à ±1 m ; trou : aucune face "
          f"ou la mer ; marche : plus de {TROU_MARCHE * 100:.0f} cm hors pente) : {len(events)} événements"]
    for e in events:
        where = f"s {e['s0']:.1f}" + (f"..{e['s1']:.1f}" if e["s1"] != e["s0"] else "")
        L_.append(f"  prise {e['prise']} {e['genre']:6s} {where:15s} {e['plan']}/{e['image']:<3d} à {e['lat']:+.0f} m ; "
                  f"{e['avant'] or '—'} -> {e['apres'] or '—'}" + (f" ; {e['dz'] * 100:+.1f} cm" if e["dz"] is not None
                                                                    else ""))
    return L_


RELEVE_LAT = (-3.5, -1.0, 0.0, 1.0, 3.5)


def releve(scene, plages, lats=RELEVE_LAT, ds=0.5, pile=0.5):
    """Le relevé brut du sol sous la berline sur des plages d'abscisse [(s0, s1)] : tous les `ds` m de son chemin,
    sur son axe et à `lats` m (positif à gauche), toutes les faces sous z + 3 m jusqu'à `pile` m sous la première
    (deux chaussées superposées s'y voient), et les faux lointains cachés dont la boîte couvre le point (un raccord
    classé lointain à tort s'y voit). [dict(s, plan, image, lat, faces=[(z, objet, lieu)], caches=[objet])]"""
    import bpy
    from mathutils import Vector
    dg = bpy.context.evaluated_depsgraph_get()
    hidden = []
    for ob in scene.objects:
        if ob.get("ville_lointain") and ob.type == "MESH":
            pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
            hidden.append((ob.name, min(q.x for q in pts), max(q.x for q in pts), min(q.y for q in pts),
                           max(q.y for q in pts), min(q.z for q in pts), max(q.z for q in pts)))
    out = []
    for a, b, _shots in prises():
        for (tt, x, y, cap) in _echantillons(a, b, ds):
            s = s_of_pos(*P.DRIVE.pos(tt))
            if not any(s0 <= s <= s1 for s0, s1 in plages):
                continue
            shot, fr = shot_of(min(P.TOTAL, max(1, int(round(tt * FPS)) + 1)))
            c = math.radians(cap)
            for lat in lats:
                px, py = x - lat * math.cos(c), y - lat * math.sin(c)
                h0 = _sol(scene, dg, px, py, cap)
                ztop = (h0[0] if h0 else 8.0) + TROU_HAUT
                faces, z0, left = [], ztop, TROU_HAUT + 12.0
                o, d = Vector((px, py, z0)), Vector((0.0, 0.0, -1.0))
                for _ in range(12):
                    ok, loc, _n, _i, ob, _m = scene.ray_cast(dg, o, d, distance=left)
                    if not ok:
                        break
                    ob = ob.original if ob else ob
                    who = ob.get("ville_lieu") if ob else None
                    if who not in ("berline", "annotation"):
                        faces.append((round(loc.z, 3), ob.name, who))
                        if loc.z < faces[0][0] - pile:
                            break
                    left -= (o.z - loc.z) + 0.002
                    o = loc + d * 0.002
                    if left <= 0:
                        break
                caches = [hn for hn, x0, x1, y0, y1, z0_, z1_ in hidden
                          if x0 <= px <= x1 and y0 <= py <= y1 and z0_ <= ztop and z1_ >= ztop - TROU_HAUT - 12.0]
                out.append(dict(s=round(s, 2), plan=shot, image=fr, lat=lat, x=round(px, 2), y=round(py, 2),
                                faces=faces, caches=caches[:6]))
    return out


def texte_releve(rows):
    L_ = ["relevé du sol sous la berline (rayons verticaux ; faces de haut en bas ; superposées : à moins de 2 cm) :"]
    for r in rows:
        f = r["faces"]
        sup = [g for g in f[1:] if f and abs(g[0] - f[0][0]) < 0.02 and g[1] != f[0][1]]
        faces = " ; ".join(f"{z:+.3f} {n} ({w})" for z, n, w in f[:4]) or "RIEN"
        L_.append(f"  s {r['s']:6.1f} {r['plan']}/{r['image']:<3d} {r['lat']:+4.1f} m ({r['x']:.1f} ; {r['y']:.1f}) : "
                  f"{faces}" + (f"  SUPERPOSÉES : {', '.join(g[1] for g in sup)}" if sup else "")
                  + (f"  [lointains cachés ici : {', '.join(r['caches'])}]" if r["caches"] else ""))
    return L_


SUPERPOSE = 0.02                    # deux surfaces à moins de 2 cm l'une de l'autre : un combat de profondeur au rendu
COMPOSE_PAS, COMPOSE_LARGE = 0.5, 6.0


def empilements(scene, plan, f0, f1, pas=COMPOSE_PAS, large=COMPOSE_LARGE, seuil=SUPERPOSE):
    """La scène composée d'un plan (sa scène + ses voisins, comme render_film --ville la rend) : des rayons verticaux
    sur une grille de `pas` m à moins de `large` m de la berline, images f0 à f1 ; à chaque point, toutes les faces
    visibles au rendu jusqu'à 0,5 m sous la première. Rend {(objet haut, lieu, objet bas, lieu): [n, dz min, dz max,
    (x, y, z) du premier]} pour chaque couple d'objets différents empilés à moins de `seuil`."""
    import bpy
    from mathutils import Vector
    h = P.hero(plan)
    cells = set()
    for f in range(f0, f1 + 1):
        x, y = h["pos"](f)[:2]
        k = int(large / pas)
        for i in range(-k, k + 1):
            for j in range(-k, k + 1):
                if (i * i + j * j) * pas * pas <= large * large:
                    cells.add((round(x / pas) + i, round(y / pas) + j))
    scene.frame_set(f0)
    # les rayons ne voient que ce qui est visible dans la vue : ce qui est rendu mais caché dans la vue y est remis
    # le temps du contrôle ; les véhicules et figurants (familles is_cast, traces exceptées) sont passés : le sol
    remis = [o for o in scene.objects if o.type == "MESH" and not o.hide_render and (o.hide_viewport or o.hide_get())]
    for o in remis:
        o.hide_viewport = False
        o.hide_set(False)
    cast = {o for t in _tops(set(scene.objects)) if is_cast(t) and not TRACES.match(t.name) for o in _family(t)}
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    d = Vector((0.0, 0.0, -1.0))
    out = {}
    for ci, cj in sorted(cells):
        o = Vector((ci * pas, cj * pas, 30.0))
        left, faces = 60.0, []
        for _ in range(16):
            ok, loc, _n, _i, ob, _m = scene.ray_cast(dg, o, d, distance=left)
            if not ok:
                break
            ob = ob.original if ob else ob
            left -= (o.z - loc.z) + 0.001
            o = loc + d * 0.001
            if ob is None or ob in cast or ob.hide_render or any(c.hide_render for c in ob.users_collection):
                continue
            faces.append((loc.z, ob))
            if loc.z < faces[0][0] - 0.5 or left <= 0:
                break
        for (za, a), (zb, b) in zip(faces, faces[1:]):
            if a != b and za - zb < seuil:
                key = (a.name, a.get("ville_lieu") or "propre", b.name, b.get("ville_lieu") or "propre")
                r = out.setdefault(key, [0, 9.0, -9.0, (round(ci * pas, 1), round(cj * pas, 1), round(za, 3))])
                r[0] += 1
                r[1], r[2] = min(r[1], za - zb), max(r[2], za - zb)
    for o in remis:
        o.hide_viewport = True
    return out, len(cells)


def worker_compose(a):
    """--compose P:f0-f1,... : pour chaque plan, sa scène composée (cache de debit + ville.voisins de DIR), et les
    empilements sous la berline ; écrit DIR/compose-<P>.txt."""
    import importlib
    import inspect

    import debit
    plan, rng = a.plan_sol.split(":")
    f0, f1 = (int(v) for v in rng.split("-"))
    mod_name, arg = source(plan)
    if mod_name == "scene_b":
        os.environ["FILM3D_PLAN"] = plan
    os.environ["FILM3D_BLEND"] = os.path.join(a.out, f"compose-{plan}.blend")
    mod = importlib.import_module(mod_name)
    scene, how, t_build, _ = debit.cached_build(
        plan, arg, lambda: mod.build(arg) if arg and inspect.signature(mod.build).parameters else mod.build(),
        assets_dir())
    voisins(scene, plan, os.path.abspath(a.ville))
    volumes(scene, False)
    t0 = time.time()
    out, n = empilements(scene, plan, f0, f1)
    lines = [f"{plan} images {f0}-{f1} : scène composée ({how}), {n} points de {COMPOSE_PAS} m à moins de "
             f"{COMPOSE_LARGE} m de la berline, {len(out)} couples empilés à moins de {SUPERPOSE * 100:.0f} cm "
             f"({time.time() - t0:.0f} s)"]
    for (an, al, bn, bl), (k, d0, d1, p) in sorted(out.items(), key=lambda kv: -kv[1][0]):
        lines.append(f"  {k:5d} pts  {an} ({al}) sur {bn} ({bl})  dz {d0 * 100:.1f} à {d1 * 100:.1f} cm  "
                     f"ex. ({p[0]} ; {p[1]} ; z {p[2]})")
    with open(os.path.join(a.out, f"compose-{plan}.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    log("\n".join(lines))


def worker_controles(a, noms):
    """--controles : reprend DIR/ville.blend, refait les contrôles (sol sous les roues, emprises réelles) et la carte,
    sans rien reconstruire ; écrit DIR/controles.json et DIR/controles.txt."""
    import bpy
    bpy.ops.wm.open_mainfile(filepath=os.path.join(a.out, "ville.blend"), load_ui=False)
    scene = bpy.data.scenes["ville"]
    if bpy.context.window:
        bpy.context.window.scene = scene
    lointains(scene, False)
    volumes(scene, False)
    hero = [o for o in scene.objects if o.get("ville_lieu") == "berline"]
    for o in hero:
        o.hide_viewport = True
    bpy.context.view_layer.update()
    t0 = time.time()
    ev, n = trous(scene)
    log(f"sol sous les roues : {len(ev)} événements sur {n} pas en {time.time() - t0:.0f} s")
    t0 = time.time()
    box, wide, over, foot, grille = emprises(scene, noms)
    log(f"emprises réelles en {time.time() - t0:.0f} s")
    for o in hero:
        o.hide_viewport = False
        o.hide_render = True
    rel = []
    if a.releve:
        plages = [tuple(float(v) for v in part.split(":")) for part in a.releve.split(",")]
        rel = releve(scene, plages)
        with open(os.path.join(a.out, "releve.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(texte_releve(rel)) + "\n")
        log(f"relevé : {len(rel)} points -> {os.path.join(a.out, 'releve.txt')}")
    carte(scene, a, noms, grille)
    rep = dict(trous=ev, pas=n, boites=box, etendus=wide, chevauchements=over, empreintes=foot, releve=rel)
    with open(os.path.join(a.out, "controles.json"), "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)
    txt = "\n".join(texte_chevauchements(rep) + texte_trous(ev, n))
    with open(os.path.join(a.out, "controles.txt"), "w", encoding="utf-8") as f:
        f.write(txt + "\n")
    print(txt, flush=True)


def carte(scene, a, noms, grille):
    """Les trois cartes de DIR : la route (et en transparence), la ville entière ; portrait, nord en haut, les noms
    des lieux sur leur empreinte, la légende dans un coin d'eau."""
    couleurs_lieux(scene)
    pts = [hero_city(f)[:2] for f in frames()] + [p[1:3] for p in route_pts(1.0)]
    rx, ry = [p[0] for p in pts], [p[1] for p in pts]
    near = portrait((min(rx) - 70, min(ry) - 60, max(rx) + 70, max(ry) + 60))
    size = max(6.0, (near[3] - near[1]) / 110.0)
    annoter(scene, near, size, noms, a.legende or legende_defaut(), grille)
    rendre_carte(scene, near, os.path.join(a.out, "carte-route.png"))
    rendre_carte(scene, near, os.path.join(a.out, "carte-route-transparence.png"), xray=True)
    if grille:
        union, gx0, gy0, cell, nx, ny, _ = grille
        far = portrait((gx0, gy0, gx0 + nx * cell, gy0 + ny * cell))
        big = far[3] - far[1]
        annoter(scene, far, max(6.0, big / 110.0), noms, a.legende or legende_defaut(), grille)
        rendre_carte(scene, far, os.path.join(a.out, "carte-ville.png"))


def texte_chevauchements(r):
    L_ = ["emprises (repère de ville, faux lointains et traces exclus ; m ; empreinte : faces rastérisées, 2 m) :"]
    for n, b in r["boites"].items():
        L_.append(f"  {n:11s} x {b[0]:8.1f} .. {b[3]:8.1f}  y {b[1]:8.1f} .. {b[4]:8.1f}  z {b[2]:6.1f} .. {b[5]:6.1f}"
                  f"  empreinte {r['empreintes'].get(n, 0):7d} m²")
    for n, wl in r["etendus"].items():
        if wl:
            L_.append(f"  {n} : sols étendus hors grille : " + ", ".join(f"{a} ({x}×{y} m)" for a, x, y in wl[:8]))
    L_.append("chevauchements (faces rastérisées sur une grille de 2 m ; par objet : les cases communes que ses "
              "propres faces couvrent) :")
    for o in sorted(r["chevauchements"], key=lambda o: -o["area"]):
        L_.append(f"  {o['a']} × {o['b']} : {o['area']} m², boîte x {o['box'][0]}..{o['box'][2]} y {o['box'][1]}.."
                  f"{o['box'][3]} ; {o['a']} : " + ", ".join(f"{a} {m}" for a, m in o["wa"]) + f" ; {o['b']} : "
                  + ", ".join(f"{a} {m}" for a, m in o["wb"]))
    if not r["chevauchements"]:
        L_.append("  aucun")
    return L_


# ---- la berline et la caméra

def poser_berline(scene, sol):
    """La berline (lieux.hero) sur toute la durée : la conduite du parcours, prise par prise posée dans la ville
    (prise_pose), sur la chaussée trouvée sous elle (sol_berline). Clés de motion.key_vehicle sans la dynamique de
    caisse (FILM3D_DYN=0 le temps de l'appel) : un saut de prise ferait bondir les ressorts."""
    import motion as M
    import lieux as L
    hero = L.hero()
    wheels = L.hero_wheels(hero)
    d = [w.location.y for w in wheels]
    poses = []
    old = os.environ.get("FILM3D_DYN")
    os.environ["FILM3D_DYN"] = "0"
    try:
        for a, b, _ in prises():
            pos, head = prise_pose(a)
            ps = M.sample(pos, range(a - 1, b + 2), heading=head, steer=P.DRIVE.steer, wheel_r=hero["wheel_r"],
                          wheelbase=(max(d) - min(d)) if d else 2.9, f0=1)
            poses += [p for p in ps if a <= p["frame"] <= b or (p["frame"] == a - 1 and a == 1)
                      or (p["frame"] == b + 1 and b == P.TOTAL)]
        pts = sorted(sol.items())

        def ground(x, y):
            f = min(pts, key=lambda kv: (kv[1][0] - x) ** 2 + (kv[1][1] - y) ** 2)[0]
            fa, fb = max(1, f - 1), min(P.TOTAL, f + 1)
            ds = math.hypot(sol[fb][0] - sol[fa][0], sol[fb][1] - sol[fa][1])
            slope = math.degrees(math.atan((sol[fb][2] - sol[fa][2]) / ds)) if ds > 0.05 else 0.0
            return sol[f][2], slope
        M.key_vehicle(hero, poses, wheels=wheels, ground=ground)
    finally:
        if old is None:
            os.environ.pop("FILM3D_DYN", None)
        else:
            os.environ["FILM3D_DYN"] = old
    M.wheel_marks(wheels, hero["wheel_r"])
    for o in _family(hero):
        o["ville_lieu"], o["ville_lointain"], o["ville_cache0"] = "berline", 0, int(o.hide_render)
    return hero


def poser_camera(scene, sol, smooth=12):
    """La caméra de poursuite commune (parcours : CAM_BACK derrière, CAM_LEFT à gauche, CAM_Z au-dessus de la
    chaussée, 24 mm), sur toute la durée, sans opérateur ; le sol sous la berline lissé sur ± `smooth` images de la
    même prise (une coupe ne mélange pas deux sols)."""
    import motion as M
    import lieux as L
    take = {f: k for k, (a, b, _) in enumerate(prises()) for f in range(a, b + 1)}

    def zg(f):
        ks = [sol[k][2] for k in range(f - smooth, f + smooth + 1) if k in sol and take[k] == take[f]]
        return sum(ks) / len(ks)
    vals = {f: cam_plan(f) or cam_city(f, zg(f)) for f in frames()}
    c0 = vals[1]
    cam = L.camera("cam_ville", c0[:3], (c0[0], c0[1] + 10.0, c0[2]), lens=24.0, fstop=0.0)
    M.key_camera(cam, frames(), lambda t: vals[min(P.TOTAL, max(1, int(round(t * FPS)) + 1))], f0=1,
                 operator=False)
    scene.camera = cam
    return cam


# ---- la carte

def _text(name, body, x, y, size, color, coll, rot=0.0):
    import bpy
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.align_x, cu.align_y = "CENTER", "CENTER"
    ob = bpy.data.objects.new(name, cu)
    coll.objects.link(ob)
    ob.location = (x, y, Z_TOP + 1.0)
    ob.rotation_euler = (0, 0, rot)
    ob.color = (*color, 1.0)
    return ob


def _ribbon(name, pts, half, color, coll, z=Z_TOP, half1=None):
    """Un ruban de demi-largeur `half` le long de pts [(x, y, cap)] ; `half1` : sa demi-largeur au premier point,
    `half` au dernier (une pointe de flèche)."""
    import bmesh
    import bpy
    bm = bmesh.new()
    prev = None
    for i, (x, y, cap) in enumerate(pts):
        a = math.radians(cap)
        lx, ly = -math.cos(a), -math.sin(a)
        half_i = half if half1 is None else half1 + (half - half1) * i / max(1, len(pts) - 1)
        pair = (bm.verts.new((x + half_i * lx, y + half_i * ly, z)),
                bm.verts.new((x - half_i * lx, y - half_i * ly, z)))
        if prev:
            bm.faces.new((prev[0], prev[1], pair[1], pair[0]))
        prev = pair
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob.color = (*color, 1.0)
    return ob


def annoter(scene, box, size, noms=NOMS, legende=None, grille=None):
    """La route (un ruban par moitié de ville, l'ellipse en pointillé rouge), les fenêtres des plans (la berline image
    par image, blanc et noir alternés), leurs débuts (un trait blanc ; rouge à une coupe d'ellipse), le nom des plans et
    des lieux, une grille de 50 m, le nord. Dans une collection « annotation », à Z_TOP."""
    import bpy
    old = bpy.data.collections.get("annotation")
    if old:
        for o in list(old.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(old)
    coll = bpy.data.collections.new("annotation")
    scene.collection.children.link(coll)
    # la route, en morceaux continus (de part et d'autre de l'ellipse, la même route n'est pas au même endroit)
    runs, prev = [[]], None
    for s, x, y, cap, shot in route_pts(0.5):
        if prev and math.hypot(x - prev[0], y - prev[1]) > 2.0:
            runs.append([])
        runs[-1].append((x, y, cap))
        prev = (x, y)
    for k, run in enumerate(runs):
        if len(run) > 1:
            _ribbon(f"route_{k}", run, 0.35 * size / 6.0, (0.55, 0.55, 0.55), coll, Z_TOP - 0.2)
    for name, g0, g1, s0, s1 in fenetres():
        pts = [hero_city(f) for f in range(g0, g1 + 1)]
        _ribbon(f"fenetre_{name}", [(p[0], p[1], p[3]) for p in pts], 0.9 * size / 6.0, SHOT_COL[name], coll)
        x, y, _, cap, _ = pts[0]
        prev_shot = [a for (a, b) in P.CONTINU if b == name]
        cut = bool(prev_shot) and not P.CONTINU[(prev_shot[0], name)]
        a = math.radians(cap + 90)
        _ribbon(f"debut_{name}", [(x - 0.4 * math.cos(a), y - 0.4 * math.sin(a), cap + 90),
                                  (x + 0.4 * math.cos(a), y + 0.4 * math.sin(a), cap + 90)],
                (3.0 if cut else 1.8) * size / 6.0, (0.95, 0.1, 0.1) if cut else (1.0, 1.0, 1.0), coll, Z_TOP + 0.2)
        xm, ym, _, capm, _ = pts[len(pts) // 2]
        a = math.radians(capm)
        off = 3.0 * size
        _text(f"nom_{name}", name, xm + off * math.cos(a), ym + off * math.sin(a), size * 1.5, (1, 1, 1), coll)
    # l'ellipse : de la dernière image de A à la première de B, en pointillé rouge, sa longueur de vraie route
    for (a_, b_), ok in P.CONTINU.items():
        if ok:
            continue
        xa, ya = hero_city(P.START[a_] + dict(P.SHOTS)[a_])[:2]
        xb, yb = hero_city(P.START[b_] + 1)[:2]
        d = math.hypot(xb - xa, yb - ya)
        cap = math.degrees(math.atan2(-(xb - xa), yb - ya))
        n = max(1, int(d / (3.0 * size / 6.0 * 4)))
        for k in range(0, n, 2):
            u0, u1 = k / n, min(1.0, (k + 1) / n)
            _ribbon(f"ellipse_{a_}_{b_}_{k}", [(xa + (xb - xa) * u0, ya + (yb - ya) * u0, cap),
                                               (xa + (xb - xa) * u1, ya + (yb - ya) * u1, cap)],
                    0.5 * size / 6.0, (0.95, 0.1, 0.1), coll, Z_TOP + 0.1)
        along = P.SAUT.get((a_, b_), (d,))[0]
        a = math.radians(cap)
        _text(f"ellipse_{a_}_{b_}", f"ELLIPSE {abs(along):.0f} M", (xa + xb) / 2 + 3.2 * size * math.cos(a),
              (ya + yb) / 2 + 3.2 * size * math.sin(a), size * 0.9, (0.95, 0.1, 0.1), coll, rot=math.radians(cap + 90))
    # le nom des lieux : sur leur empreinte (centres_lieux) ; sans grille, de part et d'autre de la route
    places = centres_lieux(grille, box, size) if grille else {}
    for nom, (x, y, rot) in places.items():
        if nom not in noms:
            continue
        _text(f"lieu_{nom}", nom.upper(), x, y, size * 2.6, COULEURS[nom], coll, rot=rot)
        _text(f"lieu_{nom}_ombre", nom.upper(), x + 0.12 * size, y - 0.12 * size, size * 2.6, (0.0, 0.0, 0.0), coll,
              rot=rot).location.z -= 0.5
    for k, (nom, plans, plan) in enumerate(LIEUX):
        if nom not in noms or nom in places:
            continue
        fs = [f for f in frames() if shot_of(f)[0] in plans]
        if not fs:
            continue
        x, y, _, cap, _ = hero_city(fs[len(fs) // 2])
        a = math.radians(cap)
        off = (-1) ** k * 9.0 * size
        _text(f"lieu_{nom}", nom.upper(), x + off * math.cos(a), y + off * math.sin(a), size * 2.6,
              COULEURS[nom], coll)
        _text(f"lieu_{nom}_ombre", nom.upper(), x + off * math.cos(a) + 0.12 * size,
              y + off * math.sin(a) - 0.12 * size, size * 2.6, (0.0, 0.0, 0.0), coll).location.z -= 0.5
    gx0, gy0, gx1, gy1 = box
    step = 50.0
    k = math.floor(gx0 / step)
    while k * step <= gx1:
        _ribbon(f"grille_x{k}", [(k * step, gy0, 0.0), (k * step, gy1, 0.0)], 0.12 * size / 6.0, (0.7, 0.7, 0.7),
                coll, Z_TOP - 0.5)
        if k % 2 == 0:
            _text(f"gx{k}", f"{k * step:.0f}", k * step, gy0 + size, size * 0.6, (0.85, 0.85, 0.85), coll)
        k += 1
    k = math.floor(gy0 / step)
    while k * step <= gy1:
        _ribbon(f"grille_y{k}", [(gx0, k * step, -90.0), (gx1, k * step, -90.0)], 0.12 * size / 6.0, (0.7, 0.7, 0.7),
                coll, Z_TOP - 0.5)
        if k % 2 == 0:
            _text(f"gy{k}", f"{k * step:.0f}", gx0 + 1.5 * size, k * step, size * 0.6, (0.85, 0.85, 0.85), coll)
        k += 1
    # le nord, en haut à gauche : une flèche et sa lettre
    nx, ny = gx0 + 4.0 * size, gy1 - 7.0 * size
    _ribbon("nord_fleche", [(nx, ny, 0.0), (nx, ny + 3.0 * size, 0.0)], 0.3 * size, (1, 1, 1), coll, Z_TOP + 0.3)
    _ribbon("nord_pointe", [(nx, ny + 3.0 * size, 0.0), (nx, ny + 4.2 * size, 0.0)], 0.0, (1, 1, 1), coll,
            Z_TOP + 0.3, half1=0.9 * size)
    _text("nord", "N", nx, ny + 5.6 * size, size * 1.4, (1, 1, 1), coll)
    if legende:
        lines = [s.strip() for s in legende.split("|")]
        ls = size * 0.8
        w, h = 0.62 * ls * max(len(s) for s in lines), 1.8 * ls * len(lines)
        at = place_libre(grille, box, w, h) if grille else None
        cx, cy = at if at else ((gx0 + gx1) / 2, gy0 + h / 2 + 3 * size)
        for i, line in enumerate(lines):
            _text(f"legende_{i}", line, cx, cy + h / 2 - (i + 0.5) * 1.8 * ls, ls, (1, 1, 1), coll)
    for o in coll.objects:
        o["ville_lieu"], o["ville_lointain"], o["ville_cache0"] = "annotation", 0, 0
    return coll


def legende_defaut():
    """La légende de la carte : ce qu'elle montre et d'où viennent les poses (lignes séparées par |)."""
    poses = [f"{n.upper()} {r:+.0f}° ({x:.1f} ; {y:.1f})" for n, (r, x, y) in
             ((n, placement(lieu(n)["plan"])) for n in NOMS)]
    return " | ".join(["LA VILLE UNIQUE, NORD EN HAUT", "CARRÉS DE 50 M", f"ROUTE {P.ROUTE.length:.0f} M, {P.TOTAL} IMAGES",
                       "PLANS EN BLANC ET NOIR", "ELLIPSE EN ROUGE", "POSES :"] + poses)


def portrait(box, ratio=9.0 / 16.0):
    """La boîte (x0, y0, x1, y1) élargie autour de son centre pour tenir en portrait largeur / hauteur = ratio."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    if w / h > ratio:
        h = w / ratio
    else:
        w = h * ratio
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2


def rendre_carte(scene, box, path, px=2400, xray=False):
    """Un rendu orthographique vu de dessus (Workbench, à plat, une couleur par lieu) de la boîte (x0, y0, x1, y1)."""
    import bpy
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    cam_d = bpy.data.cameras.new("carte")
    cam_d.type = "ORTHO"
    cam_d.ortho_scale = max(w, h)
    cam_d.clip_start, cam_d.clip_end = 1.0, 2000.0
    cam = bpy.data.objects.new("carte", cam_d)
    scene.collection.objects.link(cam)
    cam.location = ((x0 + x1) / 2, (y0 + y1) / 2, 500.0)
    cam.rotation_euler = (0.0, 0.0, 0.0)
    old = scene.camera
    scene.camera = cam
    r = scene.render
    r.engine = "BLENDER_WORKBENCH"
    r.resolution_x, r.resolution_y = (px, max(16, int(px * h / w))) if w >= h else (max(16, int(px * w / h)), px)
    r.resolution_percentage = 100
    r.use_motion_blur = False
    r.image_settings.file_format = "PNG"
    sh = scene.display.shading
    sh.light, sh.color_type = "FLAT", "OBJECT"
    sh.show_shadows, sh.show_cavity = False, False
    sh.show_object_outline = True
    sh.object_outline_color = (0.0, 0.0, 0.0)
    sh.show_xray = xray
    if xray:
        sh.xray_alpha = 0.45
    scene.compositing_node_group = None
    r.filepath = path
    bpy.ops.render.render(write_still=True)
    scene.camera = old
    bpy.data.objects.remove(cam, do_unlink=True)
    sh.show_xray = False
    log(f"carte {r.resolution_x}×{r.resolution_y} ({w:.0f} × {h:.0f} m, {w / r.resolution_x:.2f} m/px) -> {path}")


def couleurs_lieux(scene):
    for ob in scene.objects:
        nom = ob.get("ville_lieu")
        if nom in COULEURS:
            ob.color = (*COULEURS[nom], 1.0)
        elif nom == "mer":
            ob.color = (0.08, 0.1, 0.16, 1.0)
        elif nom == "berline":
            ob.color = (1.0, 0.1, 0.1, 1.0)


def poids(scene):
    import bpy
    tri = 0
    dg = bpy.context.evaluated_depsgraph_get()
    seen = set()
    for inst in dg.object_instances:
        ob = inst.object
        if ob.type == "MESH" and not inst.is_instance:
            me = ob.data
            tri += sum(len(p.vertices) - 2 for p in me.polygons)
        elif ob.type == "MESH" and ob.data.name not in seen:
            seen.add(ob.data.name)
    per = {}
    for ob in scene.objects:
        nom = ob.get("ville_lieu", "?")
        d = per.setdefault(nom, [0, 0])
        d[0] += 1
        if ob.type == "MESH":
            d[1] += len(ob.data.polygons)
    return dict(objets=len(scene.objects), mailles=len(bpy.data.meshes), images=len(bpy.data.images),
                triangles_evalues=tri, par_lieu=per)


def worker_carte(a, noms):
    import bpy
    t0 = time.time()
    infos = {}
    for nom in noms:
        with open(os.path.join(a.out, "lieux", f"{nom}.json"), encoding="utf-8") as f:
            infos[nom] = json.load(f)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "ville"
    import scene_a as S
    S.render_settings(scene)
    built = assembler(scene, infos, noms)
    mer(scene)
    t_asm = time.time() - t0
    lointains(scene, a.lointains)
    volumes(scene, False)
    bpy.context.view_layer.update()
    t1 = time.time()
    prof = profil(scene, noms)
    sol = sol_berline(scene, noms)
    log(f"sol sous la route : {sum(1 for p in prof if p[3] is not None)} / {len(prof)} points trouvés, sous la "
        f"berline : {sum(1 for v in sol.values() if v[3])} / {len(sol)} images, en {time.time() - t1:.0f} s")
    t1 = time.time()
    cov, junc = jonctions(scene, noms)
    log(f"jonctions en {time.time() - t1:.0f} s")
    t1 = time.time()
    box, wide, over, foot, grille = emprises(scene, noms)
    log(f"emprises réelles et chevauchements en {time.time() - t1:.0f} s")
    t1 = time.time()
    ev, n_pas = trous(scene)
    log(f"sol sous les roues : {len(ev)} événements sur {n_pas} pas en {time.time() - t1:.0f} s")
    hero = poser_berline(scene, sol)
    poser_camera(scene, sol)
    scene.frame_start, scene.frame_end = 1, P.TOTAL
    scene.render.fps = int(FPS)
    w = poids(scene)
    blend = os.path.join(a.out, "ville.blend")
    t1 = time.time()
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=False)
    t_save = time.time() - t1
    # la carte : à plat, une couleur par lieu, la route et ses fenêtres par-dessus
    for o in _family(hero):
        o.hide_render = True
    carte(scene, a, noms, grille)
    rapport = dict(lieux={n: dict(blend=infos[n]["blend"], how=infos[n]["how"], build_s=infos[n]["build_s"],
                                  blend_mb=infos[n]["blend_mb"], **{k: v for k, v in built[n].items()
                                                                     if k not in ("racine", "collection")})
                          for n in noms},
                   placements={n: placement(lieu(n)["plan"]) for n in noms}, poses=ecarts_poses(), raccords=raccords(),
                   fenetres=fenetres(), boites=box, etendus=wide, chevauchements=over, empreintes=foot,
                   trous=ev, pas=n_pas,
                   jonctions=junc, profil=[(round(p[0], 1), p[3] and round(p[3], 2), p[4]) for p in prof],
                   sol_berline={f: (round(v[2], 2), v[3]) for f, v in sol.items()}, prises=prises(),
                   couverture={n: [(r[0], round(r[1], 2), round(r[2], 2), round(r[3], 2)) for r in rows]
                               for n, rows in cov.items()},
                   poids=dict(w, assemblage_s=round(t_asm, 1), total_s=round(time.time() - t0, 1),
                              enregistrement_s=round(t_save, 1), blend_mb=round(os.path.getsize(blend) / 1e6)))
    with open(os.path.join(a.out, "ville.json"), "w", encoding="utf-8") as f:
        json.dump(rapport, f, ensure_ascii=False, indent=1)
    txt = rapport_texte(rapport)
    with open(os.path.join(a.out, "ville.txt"), "w", encoding="utf-8") as f:
        f.write(txt + "\n")
    print(txt, flush=True)


def _f(v, fmt="{:+.2f}"):
    return "—" if v is None else fmt.format(v)


def rapport_texte(r):
    L_ = [table(), ""] + texte_chevauchements(r)
    L_.append("jonctions (le long de la route ; écart > 0 : un trou, < 0 : les deux chaussées se recouvrent) :")
    for j in r["jonctions"]:
        L_.append(f"  {j['a']} -> {j['b']}{'' if j.get('continu', True) else ' (ELLIPSE)'} : coupe s {j['s_cut']:.1f} ; fin de {j['a']} s {_f(j['a_end'], '{:.0f}')}, "
                  f"début de {j['b']} s {_f(j['b_start'], '{:.0f}')}, écart {_f(j['gap'], '{:+.0f}')} m ; "
                  f"z {_f(j['za'])} / {_f(j['zb'])} ; largeur {_f(j['wa'], '{:.1f}')} / {_f(j['wb'], '{:.1f}')} m ; "
                  f"milieu de chaussée à {_f(j['oa'], '{:+.1f}')} / {_f(j['ob'], '{:+.1f}')} m à gauche de la route ; "
                  f"axe {_f(j['axa'], '{:+.1f}')}° / {_f(j['axb'], '{:+.1f}')}°")
    L_ += texte_trous(r.get("trous", []), r.get("pas", 0))
    seq = []
    for s, z, who in r["profil"]:
        if not seq or seq[-1][0] != who:
            seq.append([who, s, s])
        else:
            seq[-1][2] = s
    L_.append("le sol sous la route, lieu par lieu (la chaussée la plus haute, large d'au moins 2,4 m) : " +
              ", ".join(f"{w or 'trou'} {a:.0f}..{b:.0f}" for w, a, b in seq))
    p = r["poids"]
    L_.append(f"poids : {p['objets']} objets, {p['mailles']} maillages, {p['images']} images, "
              f"{p['triangles_evalues']} triangles évalués ; assemblage {p['assemblage_s']} s, tout {p['total_s']} s, "
              f"ville.blend {p['blend_mb']} Mo écrit en {p['enregistrement_s']} s")
    for n, d in r["lieux"].items():
        L_.append(f"  {n:11s} {d['how']:9s} (construit en {d['build_s']} s, {d['blend_mb']} Mo), {d['objets']} objets "
                  f"dont {d['lointains']} faux lointains, chargé en {d['load_s']} s ; retirés : "
                  + ", ".join(d["retires"][:10]) + ("…" if len(d["retires"]) > 10 else ""))
    return "\n".join(L_)


# ---- la prise continue

def worker_prise(a):
    import bpy
    bpy.ops.wm.open_mainfile(filepath=os.path.join(a.out, "ville.blend"), load_ui=False)
    scene = bpy.data.scenes["ville"]
    lointains(scene, a.lointains)
    volumes(scene, False)
    r = scene.render
    r.engine = "BLENDER_WORKBENCH"
    r.resolution_x, r.resolution_y, r.resolution_percentage = 360, 640, 100
    r.use_motion_blur = False
    r.use_simplify, r.simplify_subdivision_render = True, 0
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGB"
    sh = scene.display.shading
    sh.light, sh.color_type, sh.show_shadows, sh.show_cavity = "STUDIO", "RANDOM", False, False
    sh.show_object_outline = False
    scene.compositing_node_group = None
    for ob in scene.objects:
        if ob.name.startswith("repere_"):
            ob.hide_render = False
    r.use_stamp = True
    for k in ("use_stamp_date", "use_stamp_time", "use_stamp_render_time", "use_stamp_camera", "use_stamp_lens",
              "use_stamp_scene", "use_stamp_filename", "use_stamp_memory", "use_stamp_hostname", "use_stamp_marker",
              "use_stamp_frame_range", "use_stamp_sequencer_strip", "use_stamp_time"):
        if hasattr(r, k):
            setattr(r, k, False)
    r.use_stamp_frame = True
    r.use_stamp_note = True
    r.stamp_font_size = 14
    d = os.path.join(a.out, "prise")
    os.makedirs(d, exist_ok=True)
    t0 = time.time()
    route_s = {f: hero_city(f)[4] for f in frames()}
    owner = {}
    try:
        with open(os.path.join(a.out, "ville.json"), encoding="utf-8") as fh:
            owner = {int(f): v[1] or "TROU" for f, v in json.load(fh)["sol_berline"].items()}
    except (OSError, ValueError, KeyError):
        pass
    take = {f: k for k, (a0, b0, _) in enumerate(prises()) for f in range(a0, b0 + 1)}
    cur = None
    for f in frames():
        path = os.path.join(d, f"{f:04d}.png")
        if os.path.exists(path):
            continue
        if take[f] != cur:
            cur = take[f]
            noms, _city = charge(prises()[cur][2])
            montrer(scene, noms, a.lointains)
            volumes(scene, False)
            log(f"prise {cur + 1} ({','.join(prises()[cur][2])}) : {', '.join(noms)}")
        shot, fr = shot_of(f)
        r.stamp_note_text = f"{shot} {fr}  s {route_s[f]:.0f} m  {owner.get(f, '')}"
        scene.frame_set(f)
        r.filepath = path[:-4] + ".part.png"
        bpy.ops.render.render(write_still=True)
        os.replace(path[:-4] + ".part.png", path)
        if f % 24 == 0:
            log(f"prise : image {f}/{P.TOTAL}, {(time.time() - t0) / f:.2f} s par image")
    log(f"prise : {P.TOTAL} images en {time.time() - t0:.0f} s -> {d}")


def encode(out):
    """Une vidéo par prise continue (prises()) : prise-1.mp4, prise-2.mp4…"""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        log("! ffmpeg introuvable : les images restent dans prise/")
        return []
    done = []
    for k, (a, b, plans) in enumerate(prises(), 1):
        dest = os.path.join(out, f"prise-{k}.mp4")
        subprocess.run([ffmpeg, "-y", "-v", "error", "-framerate", str(int(FPS)), "-start_number", str(a), "-i",
                        os.path.join(out, "prise", "%04d.png"), "-frames:v", str(b - a + 1), "-c:v", "libx264",
                        "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(int(FPS)), "-movflags", "+faststart", "-an",
                        dest], check=True)
        log(f"prise {k} ({a}-{b}, {','.join(plans)}) -> {dest}")
        done.append(dest)
    return done


# ---------------------------------------------------------------- le pilote, sans Blender

def find_blender(path):
    for p in (path, os.environ.get("BLENDER"), shutil.which("blender")):
        if p and os.path.exists(p):
            return p
    sys.exit("[ville] Blender introuvable : --blender CHEMIN ou BLENDER=…")


def run_blender(blender, out, args, env=None, tag="ville"):
    logpath = os.path.join(out, f"{tag}.log")
    cmd = [blender, "-b", "--factory-startup", "--python-exit-code", "1", "-P", os.path.abspath(__file__), "--",
           "--worker", "--out", out] + args
    t0 = time.time()
    with open(logpath, "a", encoding="utf-8") as lf:
        lf.write(f"\n===== {time.strftime('%Y-%m-%d %H:%M:%S')} {' '.join(cmd)}\n")
        lf.flush()
        p = subprocess.run(cmd, stdout=lf, stderr=subprocess.STDOUT, env=env or os.environ.copy())
    with open(logpath, encoding="utf-8", errors="replace") as lf:
        for line in lf.read().splitlines()[-400:]:
            if line.startswith(("[ville]", "[debit]")) or "Error" in line or "Traceback" in line:
                print(line, flush=True)
    log(f"{tag} : Blender {'fini' if p.returncode == 0 else 'en ÉCHEC'} en {time.time() - t0:.0f} s ({logpath})")
    return p.returncode == 0


def still_cached(out, nom):
    """Le lieu a-t-il déjà son inventaire, et le .blend du cache est-il toujours celui de son code (debit) ?"""
    import debit
    try:
        with open(os.path.join(out, "lieux", f"{nom}.json"), encoding="utf-8") as f:
            info = json.load(f)
        with open(info["blend"][:-6] + ".json", encoding="utf-8") as f:
            meta = json.load(f)
    except (OSError, ValueError, KeyError):
        return False
    return (os.path.isfile(info["blend"]) and meta["head"]["env"] == debit.env_key(env_for(nom))
            and debit.deps_match(meta.get("deps", {})))


def env_for(nom):
    """L'environnement de render_film pour le plan du lieu : FILM3D_PLAN pour la rue seulement (il entre dans la clé
    du cache), rien d'autre."""
    env = os.environ.copy()
    env.pop("FILM3D_PLAN", None)
    plan = lieu(nom)["plan"]
    if source(plan)[0] == "scene_b":
        env["FILM3D_PLAN"] = plan
    return env


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser(description="La ville unique (voir l'en-tête).")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--carte", action="store_true")
    ap.add_argument("--prise", action="store_true")
    ap.add_argument("--cache", action="store_true", help="seulement les lieux en cache et leur inventaire")
    ap.add_argument("--releve", default=None, help="avec --controles : plages d'abscisse s0:s1,s0:s1 du relevé brut")
    ap.add_argument("--controles", action="store_true",
                    help="reprend DIR/ville.blend : sol sous les roues, emprises réelles, carte ; sans reconstruire")
    ap.add_argument("--compose", default=None,
                    help="P:f0-f1,... : scène composée de chaque plan (avec --ville DIR), surfaces empilées à moins de "
                         "2 cm sous la berline ; bloquant (sortie 2) s'il y en a")
    ap.add_argument("--ville", default=None, help="avec --compose : le dossier des lieux en cache (ville.py --cache)")
    ap.add_argument("--plan-sol", default=None, help=argparse.SUPPRESS)
    ap.add_argument("--lieux", default=",".join(NOMS))
    ap.add_argument("--lointains", action="store_true", help="garder les faux lointains")
    ap.add_argument("--legende", default=None, help="la légende de la carte, lignes séparées par | (sinon les poses)")
    ap.add_argument("--out", default=None)
    ap.add_argument("--blender", default=None)
    ap.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--etape", default=None, help=argparse.SUPPRESS)
    ap.add_argument("--lieu", default=None, help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    if a.selftest:
        selftest()
        return
    noms = [n for n in NOMS if n in a.lieux.split(",")]
    if a.worker:
        if a.etape == "cache":
            worker_cache(a.lieu, a.out)
        elif a.etape == "carte":
            worker_carte(a, noms)
        elif a.etape == "prise":
            worker_prise(a)
        elif a.etape == "controles":
            worker_controles(a, noms)
        elif a.etape == "compose":
            worker_compose(a)
        return
    if not (a.carte or a.prise or a.cache or a.controles or a.compose):
        print(table())
        return
    a.out = os.path.abspath(a.out or "ville")
    os.makedirs(a.out, exist_ok=True)
    blender = find_blender(a.blender)
    if a.carte or a.cache:
        for nom in noms:
            if a.carte and not a.cache and still_cached(a.out, nom):
                log(f"{nom} : toujours en cache, inventaire repris")
                continue
            if not run_blender(blender, a.out, ["--etape", "cache", "--lieu", nom], env=env_for(nom), tag=f"cache-{nom}"):
                sys.exit(1)
    if a.carte:
        args = ["--etape", "carte", "--lieux", ",".join(noms)] + (["--lointains"] if a.lointains else [])
        if a.legende:
            args += ["--legende", a.legende]
        if not run_blender(blender, a.out, args, tag="carte"):
            sys.exit(1)
    if a.controles:
        args = ["--etape", "controles", "--lieux", ",".join(noms)] + (["--legende", a.legende] if a.legende else [])
        args += ["--releve", a.releve] if a.releve else []
        if not run_blender(blender, a.out, args, tag="controles"):
            sys.exit(1)
    if a.compose:
        if not a.ville:
            sys.exit("[ville] --compose demande --ville DIR")
        bad = 0
        for spec in a.compose.split(","):
            plan = spec.split(":")[0]
            env = os.environ.copy()
            env.pop("FILM3D_PLAN", None)
            args = ["--etape", "compose", "--plan-sol", spec, "--ville", os.path.abspath(a.ville)]
            if not run_blender(blender, a.out, args, env=env, tag=f"compose-{plan}"):
                sys.exit(1)
            with open(os.path.join(a.out, f"compose-{plan}.txt"), encoding="utf-8") as fh:
                head = fh.readline()
            n = int(re.search(r", (\d+) couples", head).group(1))
            bad += n
            log(f"{plan} : {n} couples de surfaces empilées à moins de 2 cm")
        if bad:
            log(f"BLOQUANT : {bad} couples de surfaces empilées dans les scènes composées")
            sys.exit(2)
    if a.prise:
        args = ["--etape", "prise"] + (["--lointains"] if a.lointains else [])
        if not run_blender(blender, a.out, args, tag="prise"):
            sys.exit(1)
        encode(a.out)


if __name__ == "__main__":
    main()
