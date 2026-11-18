# Les repères de vitesse au ras de la route (18 novembre, « 0 impression de vitesse ») : des plots rétroréfléchissants
# (« yeux de chat ») sur l'axe et sur les lignes de tirets des tronçons rapides, là où la berline passe. À 80–107 km/h,
# un plot tous les 6 m sur l'axe défile à 4–5 par seconde sous la caméra : le sol se met à courir, ce que l'enrobé seul,
# lisse et sombre, ne donne pas. Les tirets passent eux aussi de 12 à 9 m de pas (road.mat_asphalt, 3 m peints).
#
# Par LIEU et non par plan (ville.LIEUX) : le même lieu porte les mêmes plots, qu'il soit la scène du plan ou un voisin
# chargé du cache (ville.voisins) ; rien n'apparaît ni ne disparaît à une coupe. Les plots s'arrêtent au bord de leur
# lieu (le joint du rond-point au bout de l'avenue, le boulevard au bout de la rue, le pied du pont).
#
# Les plots sont une seule maille par lieu (quelques dizaines de pavés de 10 × 10 × 1,8 cm), posés sur le sol de la
# conduite (parcours.sol, le tablier du pont compris) et le bombé de la chaussée (road.road_z). Leur lumière est faible
# (celle des phares de la berline qui les éclaire devant elle), sans échantillonnage de lumière : ils n'éclairent rien.
# Les catadioptres des poteaux de glissière du pont sont posés par lieux.roadway, même matière (catadioptre()).
#
# FILM3D_VITESSE=0 : aucun repère (et le bras commun rivé d'avant, parcours.rig).

import math

import parcours as PC

STUD = (0.10, 0.10, 0.018)       # m : largeur, longueur, hauteur
STUD_GLOW = 5.0                  # sous un feu arrière (9), au-dessus d'un panneau vierge (3)
BLANC, AMBRE = "#f4f1e8", "#ffb347"

# lieu : [(x de la ligne, pas en m, teinte)], (y début, y fin) dans le repère de la scène du lieu
LIEUX = {
    # l'avenue (scène A, axe x = 0, la berline à x 1,75 vers +y) : double axe et tirets à 3,5 m (road.AVENUE) ;
    # du départ de OUV au joint du rond-point (y 340,69, scene_a.VILLE)
    "avenue": ([(0.0, 6.0, AMBRE), (3.5, 9.0, BLANC), (-3.5, 9.0, BLANC)], (192.0, 338.0)),
    # la rue des enseignes (scène B, repère de la conduite, la berline à x 0,3 vers +y) : double axe seul ; jusqu'au
    # passage piéton du boulevard du quai (s 162)
    "rue": ([(0.0, 6.0, AMBRE)], (96.0, 158.0)),
    # le pont (scène C, axe x = 0, la berline de x 0,35 à 1,80 vers +y) : la chaussée de l'avenue (road.AVENUE) ; du
    # quai au pied de la rampe côté port
    "pont": ([(0.0, 6.0, AMBRE), (3.5, 9.0, BLANC), (-3.5, 9.0, BLANC)], (-336.0, -211.0)),
}


def on():
    return PC.vitesse_on()


def catadioptre(name, color, strength=STUD_GLOW):
    """La matière d'un catadioptre : un corps sombre qui renvoie faiblement la lumière, sans échantillonnage (il
    n'éclaire rien)."""
    import scene_a as S
    m = S.mat_emit(name, S.lin(color) if hasattr(S, "lin") else color, strength)
    try:
        m.emission_sampling = "NONE"
    except (AttributeError, TypeError):
        try:
            m.cycles.emission_sampling = "NONE"
        except Exception:
            pass
    return m


def plots(nom):
    """[(x, y, teinte)] des plots du lieu, sans Blender."""
    if nom not in LIEUX:
        return []
    lignes, (y0, y1) = LIEUX[nom]
    out = []
    for x, pas, teinte in lignes:
        # la phase tirée de la ligne : les plots des deux lignes de tirets ne tombent pas côte à côte
        y = y0 + (0.37 * pas * (1.0 + x / 7.0)) % pas
        while y <= y1:
            out.append((x, y, teinte))
            y += pas
    return out


def poser(plan, scene=None):
    """Pose les plots du lieu du plan dans sa scène (une maille par teinte). Rend le nombre de plots."""
    if not on():
        return 0
    try:
        import bmesh
        import bpy
    except ImportError:                             # hors de Blender (test_fx appelle fx.dress) : rien à poser
        return 0
    import road
    import ville
    nom = ville.lieu_of_shot(plan)[0]
    pts = plots(nom)
    if not pts:
        return 0
    scene = scene or bpy.context.scene
    w, l, h = STUD
    a = 6.5                                         # le bord de l'enrobé du profil (road.asph sur l'avenue et le pont)
    n = 0
    for teinte in sorted({p[2] for p in pts}):
        bm = bmesh.new()
        for x, y, t in pts:
            if t != teinte:
                continue
            z = PC.sol(plan, x, y) - road.CROWN * min(1.0, abs(x) / a) ** 2
            vs = [bm.verts.new((x + sx * w / 2, y + sy * l / 2, z + sz * h))
                  for sz in (-0.3, 1.0) for sy in (-1, 1) for sx in (-1, 1)]
            for f in ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)):
                bm.faces.new([vs[i] for i in f])
            n += 1
        name = f"reperes_plots_{nom}_{'ambre' if teinte == AMBRE else 'blanc'}"
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(catadioptre(f"catadioptre_{'ambre' if teinte == AMBRE else 'blanc'}", teinte))
        ob = bpy.data.objects.new(name, me)
        scene.collection.objects.link(ob)
    print(f"[reperes] {plan} ({nom}) : {n} plots", flush=True)
    return n


def selftest():
    for nom, (lignes, (y0, y1)) in LIEUX.items():
        pts = plots(nom)
        assert pts and all(y0 <= p[1] <= y1 for p in pts), nom
        for x, pas, _ in lignes:
            ys = sorted(p[1] for p in pts if p[0] == x)
            assert all(abs(b - a - pas) < 1e-9 for a, b in zip(ys, ys[1:])), (nom, x)
    # les plots sur la conduite de chaque lieu : la berline passe entre y0 et y1
    for nom, plans in (("avenue", ("OUV", "P1")), ("rue", ("P3",)), ("pont", ("P4",))):
        y0, y1 = LIEUX[nom][1]
        for shot in plans:
            n = dict(PC.SHOTS)[shot]
            ys = [PC.hero(shot)["pos"](f)[1] for f in (1, n)]
            assert y0 - 1e-6 <= min(ys) and max(ys) <= y1 + 25.0, (nom, shot, ys)
    print("[reperes] selftest : lignes, pas, lieux sur la conduite : ok")


if __name__ == "__main__":
    selftest()
