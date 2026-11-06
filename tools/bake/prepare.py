# Prépare les modèles tiers de la scène 3D (Sketchfab, CC BY ; Poly Haven, CC0) pour le web.
#
#   SKETCHFAB_API_KEY=… blender -b -P tools/bake/prepare.py [-- nom.glb …]
#
# Télécharge chaque modèle (cache : tools/bake/.cache, hors dépôt ; Poly Haven
# sans clé, en glTF 1K), le remet aux cotes réelles, l'oriente comme la scène
# (repère three.js : y en haut ; l'utilisateur de l'objet est du côté -z :
# l'assis du fauteuil regarde vers -z, la dalle d'un écran et l'avant d'un
# clavier sont tournés vers -z), pose son origine au sol, au centre, compresse
# ses textures en WebP et sa géométrie en meshopt, et l'écrit dans
# web/public/3d. La dalle d'un écran reste un maillage à part, nommé
# « screen », pour que la scène y affiche son propre contenu ; le plateau d'un
# bureau aussi, nommé « top », avec des uv en mètres pour le placage de la
# scène. Un personnage riggé garde son squelette au repos, sans animation,
# avec des noms d'os courts (« upperarm_l »), et regarde vers +z.
# La cabine d'ascenseur est remise aux cotes de la scène, ses pièces animées
# nommées (voir prepare_cabin).
# Les crédits sont dans web/public/3d/CREDITS.txt.
import json
import math
import os
import re
import sys
import urllib.request
import zipfile

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CACHE = os.path.join(ROOT, "tools", "bake", ".cache")
OUT = os.path.join(ROOT, "web", "public", "3d")

# Options : keep / drop, les pièces gardées ou retirées (regex sur les noms) ;
# tilt, une bascule (degrés autour de l'axe gauche-droite) pour coucher un
# objet ; top_at, la hauteur du plateau d'un bureau réglable, atteinte en
# étirant ses colonnes dans la bande lift (m) ; decimate ; tex, la taille
# maximale des textures (1024 par défaut).
# face : comment trouver l'avant du modèle — "back" (le dossier d'un fauteuil,
# le haut du modèle, va vers +z), "screen" (la normale de la dalle va vers -z),
# ou un angle (degrés autour de la verticale) relevé à l'œil.
MODELS = [
    # Fauteuil de travail à accoudoirs alu. Giimann, CC BY 4.0.
    {"uid": "b78e87f34bbc45f297175dd66ece69eb", "out": "chair.glb", "size": ("height", 1.02), "face": "back"},
    # Écran 23 pouces (Dell P2314H). GregorJan, CC BY 4.0.
    {"uid": "c69f09bb812e46cdbd5bf6c62499b848", "out": "monitor.glb", "size": ("width", 0.54), "face": "screen", "screen": r"^Material2\.003$"},
    # Clavier mécanique rétroéclairé, sans son câble. FelikinRuslan, CC BY 4.0.
    {"uid": "1ba4055c33674567b51b783701ed05ce", "out": "keyboard.glb", "size": ("width", 0.44), "face": 180, "drop": r"^(wire|usb)_"},
    # Tasse « Get shit done ». The Lister, CC BY 4.0.
    {"uid": "6c95897de04143aeb5c75b7630707d27", "out": "mug.glb", "size": ("height", 0.098), "face": 0},
    # Lampe de bureau noire, sans son câble, son plateau ni son halo. nickbaker, CC BY 4.0.
    {"uid": "093e9b607a4544818e0c169074037e5f", "out": "lamp.glb", "size": ("height", 0.46), "face": 0, "drop": r"^Object_(2|5|7)$"},
    # Bureau assis-debout à piètement noir (colonnes télescopiques, pieds en T,
    # boîtier de commande) ; le plateau, à part et nommé « top », reçoit le noyer
    # de la scène, réglé à hauteur debout (le dev tape debout). Chairsolutions, CC BY 4.0.
    {"uid": "b7341ee22ddd43efaef9ad3016a224f3", "out": "desk.glb", "size": ("width", 2.2), "face": 180, "top": r"^Object_1[56]$", "top_at": 1.06, "lift": (0.15, 0.35), "decimate": 0.4},
    # Souris Logitech MX Master 3S, scannée (Scaniverse), allégée. Zhirayr, CC BY 4.0.
    {"uid": "be1d82499209475c8cd1d009df9aaa00", "out": "mouse.glb", "size": ("depth", 0.125), "face": 0, "decimate": 0.15},
    # Sous-main de bureau. mfk, CC BY 4.0.
    {"uid": "7690f727d87847aaa737c8110c8e6531", "out": "deskmat.glb", "size": ("width", 0.9), "face": 0, "decimate": 0.15},
    # Casque Sony MDR-7506, posé à plat. AndreiVNK, CC BY 4.0.
    {"uid": "05735b74d3524f00b648231138122a28", "out": "desk-headphones.glb", "size": ("width", 0.19), "face": 0, "tilt": 90, "tex": 512, "decimate": 0.5},
    # Téléphone (iPhone 13 Pro Max) posé écran contre le bureau : sans sa face
    # avant ni son logo. DatSketch, CC BY 4.0.
    {"uid": "4328dea00e47497dbeac73c556121bc9", "out": "phone.glb", "size": ("depth", 0.161), "face": 0, "tilt": -90, "tex": 512, "decimate": 0.5, "drop": r"Wallpaper|Screen Glass|Mic_0|Logo|^Body_(Lens|Camera Glass|Material)_0$"},
    # Gourde inox, sans la sphère d'environnement. Igrium, CC BY 4.0.
    {"uid": "885543a7679c4026abbd6499185caf08", "out": "desk-bottle.glb", "size": ("height", 0.24), "face": 0, "drop": r"^Icosphere$", "tex": 512},
    # Poly Haven (CC0) : carnet fermé en cuir, bloc de post-it, stylo plume, petite plante grasse.
    {"polyhaven": "binder_notebook", "out": "notebook.glb", "size": ("depth", 0.2), "face": 0, "keep": r"_closed$", "tex": 512, "decimate": 0.5},
    {"polyhaven": "office_notepads", "out": "postit.glb", "size": ("width", 0.072), "face": 0, "keep": r"_sticky_stack$", "tex": 512},
    {"polyhaven": "stationery_supplies", "out": "pen.glb", "size": ("width", 0.131), "face": 0, "keep": r"_pen_fancy$", "tex": 512},
    {"polyhaven": "potted_plant_04", "out": "desk-plant.glb", "size": ("height", 0.22), "face": 0, "tex": 512, "decimate": 0.6},
    # Le dev : un personnage Character Creator riggé (squelette complet, doigts, yeux), sans son
    # animation ni ses brassards de combat, sans la peau des jambes (le pantalon la couvre et elle le
    # traversait aux genoux une fois assis) ; lacets et coutures des baskets allégés.
    # Jungle Jim, CC BY 4.0. Il regarde vers +z three.js ; la scène le pose assis (web/src/three/player.ts).
    {"uid": "dbf9fe0cb81d4758ad2525a56d10e2fc", "out": "developer-v4.glb", "size": ("height", 1.8), "rigged": True,
     "drop": r"^(OSteel_|Std_Skin_Leg$)", "decimate": (r"^G8FLincolnSocks_Shape_(Laces|InnerPadding|LaceBrace|SockBody)", 0.25)},
    # La cabine d'ascenseur : un vrai projet de cabine de bureaux (verre blanc laqué, inox brossé,
    # plafond lumineux, boîte à boutons). JNKM Design (Josh Nelson), CC BY 4.0. Voir prepare_cabin.
    {"uid": "be05f33b31dc4b4ebf7ad7ff4cea1631", "out": "cabin.glb", "cabin": True},
]

# Les os de Character Creator sous les noms de Renderpeople, ceux que pose
# web/src/three/player.ts. Les os de torsion, de partage (coude, genou) et du
# visage gardent leur nom et suivent leur parent. L'avant-bras porte deux os de
# torsion : le second, entre le coude et le poignet, prend la pronation.
CC_BONES = {
    "Hip": "hip", "Waist": "spine_01", "Spine01": "spine_02", "Spine02": "spine_03",
    "NeckTwist01": "neck", "Head": "head",
    **{
        k.replace("#", s.upper()): v.replace("#", s)
        for s in "lr"
        for k, v in {
            "#_Eye": "eye_#", "#_Clavicle": "shoulder_#", "#_Upperarm": "upperarm_#", "#_Forearm": "lowerarm_#",
            "#_ForearmTwist02": "lowerarm_twist_#", "#_Hand": "hand_#",
            "#_Thigh": "upperleg_#", "#_Calf": "lowerleg_#", "#_Foot": "foot_#", "#_ToeBase": "ball_#",
            **{f"#_{cc}{i}": f"{rp}_0{i}_#" for cc, rp in (("Index", "index"), ("Mid", "middle"), ("Ring", "ring"), ("Pinky", "pinky"), ("Thumb", "thumb")) for i in (1, 2, 3)},
        }.items()
    },
}

# La cabine, aux cotes de la scène (web/src/three/cabin.ts) : portes de 2,1 m
# de haut, la face intérieure de la façade en z = 0, la cabine vers +z.
# L'ouverture reste à 1 m pour rejoindre les portes palières de l'open space.
CABIN_WIDTH = 2.6
CABIN_DEPTH = 3.0
CABIN_HEIGHT = 2.37
DOOR_H = 2.1
DOOR_W = 1.0
# le chambranle d'inox laissé autour de l'ouverture, dans la façade en noyer (m)
DOOR_FRAME = 0.05
# Le calepinage du sol et du plafond, en moulinet (coordonnées three.js) : une
# dalle centrale entre x = ±0,5 et z = 1 à 2, entourée de quatre grandes dalles
# qui tournent autour d'elle. Joints et bordure du sol en marbre sombre ;
# joints du plafond en creux noirs (m).
PINWHEEL_X = (-0.5, 0.5)
PINWHEEL_Z = (1.0, 2.0)
FLOOR_JOINT = 0.05
FLOOR_BORDER = 0.08
CEILING_JOINT = 0.04
# ce qui ne se voit pas de l'intérieur, ou qui fermerait le passage des portes :
# les deux coques extérieures, les faces arrière des parois (grille d'Unreal),
# le doublon de l'afficheur de la boîte à boutons
CABIN_DROP = r"(Outer_Wall|Int_Wall_Lift|WorldGridMaterial|Plane_44|M_poster|Lift_Button_Board|LIft_Buttoon)"


def env_key():
    key = os.environ.get("SKETCHFAB_API_KEY")
    if key:
        return key
    with open(os.path.join(ROOT, ".env")) as f:
        for line in f:
            if line.startswith("SKETCHFAB_API_KEY="):
                return line.split("=", 1)[1].strip().strip("'\"")
    raise SystemExit("SKETCHFAB_API_KEY manquant (variable d'environnement ou .env)")


def get(url, path=None):
    """Un GET avec un User-Agent : Poly Haven refuse celui de Python."""
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "testyourskills-prepare"})) as r:
        data = r.read()
    if path is None:
        return json.loads(data)
    with open(path, "wb") as f:
        f.write(data)


def fetch(spec):
    os.makedirs(CACHE, exist_ok=True)
    if "polyhaven" in spec:
        # Poly Haven (CC0) : le glTF 1K et ses fichiers, sans clé
        ph = spec["polyhaven"]
        folder = os.path.join(CACHE, "polyhaven", ph)
        gltf = get(f"https://api.polyhaven.com/files/{ph}")["gltf"]["1k"]["gltf"]
        path = os.path.join(folder, os.path.basename(gltf["url"]))
        if not os.path.exists(path):
            for rel, f in [*gltf["include"].items(), (os.path.basename(gltf["url"]), gltf)]:
                os.makedirs(os.path.dirname(os.path.join(folder, rel)), exist_ok=True)
                get(f["url"], os.path.join(folder, rel))
        return path
    uid = spec["uid"]
    path = os.path.join(CACHE, f"{uid}.glb")
    if not os.path.exists(path):
        req = urllib.request.Request(f"https://api.sketchfab.com/v3/models/{uid}/download", headers={"Authorization": f"Token {env_key()}"})
        links = json.load(urllib.request.urlopen(req))
        urllib.request.urlretrieve(links["glb"]["url"], path)
    return path


def join(obs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = name
    return ob


def textures(limit):
    """Toutes les textures en RGBA 8 bits (l'encodeur WebP refuse les niveaux de gris), `limit` px au plus."""
    for img in list(bpy.data.images):
        if max(img.size) > limit:
            img.scale(min(limit, img.size[0]), min(limit, img.size[1]))
        w, h = img.size
        rgba = bpy.data.images.new(img.name + "-rgba", w, h, alpha=True)
        rgba.colorspace_settings.name = img.colorspace_settings.name
        rgba.pixels.foreach_set(list(img.pixels))
        img.user_remap(rgba)


def export(spec):
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, spec["out"]),
        export_format="GLB",
        use_selection=True,
        export_image_format="WEBP",
        export_meshopt_compression_enable=True,
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_extras=True,
    )
    if "polyhaven" in spec:
        meta = get(f"https://api.polyhaven.com/info/{spec['polyhaven']}")
        print(f"[prepare] crédit : « {meta['name']} » par {', '.join(meta['authors'])}, CC0, https://polyhaven.com/a/{spec['polyhaven']}", flush=True)
        return
    meta = json.load(urllib.request.urlopen(f"https://api.sketchfab.com/v3/models/{spec['uid']}"))
    print(f"[prepare] crédit : « {meta['name']} » par {meta['user']['displayName']}, {meta['license']['label']}, {meta['viewerUrl']}", flush=True)


def prepare_rigged(spec):
    """Un personnage riggé : on garde son squelette au repos et son maillage
    habillé, sans animation ; mis aux cotes réelles, les pieds au sol."""
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    body = [o for o in bpy.data.objects if o.type == "MESH" and o.find_armature() is arm]
    if arm.animation_data:
        arm.animation_data_clear()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    # des noms d'os courts : « rp_nathan_…_walking_upperarm_l_024 » devient « upperarm_l »
    # (les groupes de sommets suivent le renommage ; « _rootJoint », ajouté par Sketchfab, reste tel quel)
    named = [b for b in arm.data.bones if not b.name.startswith("_")]
    prefix = os.path.commonprefix([b.name for b in named])
    for b in named:
        b.name = re.sub(r"_\d+$", "", b.name[len(prefix):])
    # un squelette Character Creator (« CC_Base_L_Forearm ») prend les noms de web/src/three/player.ts
    for b in named:
        b.name = CC_BONES.get(b.name, b.name)
    # les nœuds d'emballage de Sketchfab et les formes de bones de l'import
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    for o in list(bpy.data.objects):
        # (les pièces se reconnaissent au nom de leur maillage ou de leur matière : Sketchfab numérote les objets)
        if o is not arm and o not in body or "drop" in spec and o.type == "MESH" and any(re.search(spec["drop"], n) for n in [o.data.name, *(m.name for m in o.data.materials if m)]):
            bpy.data.objects.remove(o)
    body = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in body:
        # les expressions du visage (148 formes par maillage chez Character Creator) pèseraient
        # plusieurs mégaoctets : la scène anime le visage par les os
        o.shape_key_clear()
        if "decimate" in spec and re.search(spec["decimate"][0], o.data.name):
            # avant le squelette : les poids des sommets restants sont interpolés
            mod = o.modifiers.new("decimate", "DECIMATE")
            mod.ratio = spec["decimate"][1]
            with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
                bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
                bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.update()
    vs = [b.matrix_world @ v.co for b in body for v in b.data.vertices]
    lo = Vector([min(v[i] for v in vs) for i in range(3)])
    hi = Vector([max(v[i] for v in vs) for i in range(3)])
    axis, target = spec["size"]
    s = target / {"height": hi.z - lo.z, "width": hi.x - lo.x, "depth": hi.y - lo.y}[axis]
    c = (lo + hi) / 2
    arm.location = (arm.location - Vector((c.x, c.y, lo.z))) * s
    arm.scale *= s
    bpy.ops.object.select_all(action="DESELECT")
    for o in [arm, *body]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    size = (hi - lo) * s
    print(f"[prepare] {spec['out']}: {sum(len(b.data.polygons) for b in body)} faces, {len(arm.data.bones)} os, {size.x:.3f} × {size.z:.3f} × {size.y:.3f} m (l × h × p)", flush=True)
    textures(1024)
    bpy.ops.object.select_all(action="SELECT")
    export(spec)


def split(ob, name_neg, name_pos):
    """Coupe un maillage en deux selon x = 0 (les deux vantaux d'une porte d'un seul tenant)."""
    halves = []
    for name, keep in ((name_neg, lambda x: x < 0), (name_pos, lambda x: x >= 0)):
        o = ob.copy()
        o.data = ob.data.copy()
        bpy.context.collection.objects.link(o)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(f.calc_center_median().x)], context="FACES")
        bm.to_mesh(o.data)
        bm.free()
        o.name = o.data.name = name
        halves.append(o)
    bpy.data.objects.remove(ob)
    return halves


def pinwheel():
    """Les cinq dalles du moulinet (x0, x1, z0, z1, en three.js) : quatre autour de la centrale."""
    w2, d = CABIN_WIDTH / 2, CABIN_DEPTH
    (x0, x1), (z0, z1) = PINWHEEL_X, PINWHEEL_Z
    return [(-w2, x0, 0, z1), (x0, w2, 0, z0), (x1, w2, z0, d), (-w2, x1, z1, d), (x0, x1, z0, z1)]


def pinwheel_slab(rects, x, z, border, joint):
    """L'indice de la dalle sous (x, z), ou None dans la bordure ou un joint."""
    w2, d = CABIN_WIDTH / 2, CABIN_DEPTH
    if min(w2 - abs(x), z, d - z) < border:
        return None
    for i, (x0, x1, z0, z1) in enumerate(rects):
        if x0 <= x <= x1 and z0 <= z <= z1:
            inner = [x - x0 if x0 > -w2 else 1, x1 - x if x1 < w2 else 1, z - z0 if z0 > 0 else 1, z1 - z if z1 < d else 1]
            return None if min(inner) < joint else i
    return None


def prepare_cabin(spec):
    """La cabine d'ascenseur : tout le décor vient du modèle, la scène n'y
    ajoute que ce qui bouge ou change par carte. Le modèle est remis aux
    cotes de la scène, sa profondeur étirée (verre, inox brossé et pierre
    s'y prêtent), ses deux vantaux séparés, et les pièces que la scène
    anime nommées : « door_l », « door_r », « cop_display » (l'afficheur latéral
    de la boîte à boutons), « ceiling_light » (le plafond lumineux),
    « button_arrival » (l'anneau de destination). La nouvelle platine latérale
    regroupe l'afficheur et quatre boutons ; leurs centres sont exportés."""
    for o in [o for o in bpy.data.objects if o.type == "MESH"]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = next(o for o in bpy.data.objects if o.type == "MESH")
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.data.objects):
        if o.type != "MESH" or re.search(CABIN_DROP, o.name):
            bpy.data.objects.remove(o)
    # la photo de baseball du fond (droits incertains, hors sujet) : le même verre blanc que les côtés
    glass = bpy.data.materials["M_White_Glass"]
    for o in bpy.data.objects:
        for i, m in enumerate(o.data.materials):
            if m.name == "M_Oil_Bottel1":
                o.data.materials[i] = glass
    obs = {o.name: o for o in bpy.data.objects}
    find = lambda pat: [o for n, o in obs.items() if re.search(pat, n)]

    def bounds(objs):
        vs = [v.co for o in objs for v in o.data.vertices]
        return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])

    door_lo, door_hi = bounds(find(r"Lift_door"))
    x0 = (door_lo.x + door_hi.x) / 2
    y_face = bounds(find(r"EntryWall"))[0].y  # la face intérieure de la façade
    y_back = bounds(find(r"Back_Wall"))[1].y  # la face du fond
    s = DOOR_H / door_hi.z
    k = CABIN_DEPTH / ((y_face - y_back) * s)
    # cotes de la scène, en Blender (z en haut ; l'export donne y en haut et
    # z three.js = -y Blender) : la cabine du côté des y négatifs, étirée en profondeur
    for o in bpy.data.objects:
        for v in o.data.vertices:
            y = (v.co.y - y_face) * s
            x = (v.co.x - x0) * s
            # Élargir les joues, sans étirer l'ouverture ni les vantaux.
            if abs(x) > 0.5:
                x = math.copysign(0.5 + (abs(x) - 0.5) * (CABIN_WIDTH - 1), x)
            v.co = Vector((x, y * k if y < 0 else y, v.co.z * s))
        o.data.update()
    # Fermer l'enveloppe : le modèle source est un assemblage de panneaux
    # flottants, avec des jours de 3 à 8 cm aux angles, au sol et au plafond.
    # Les cadres partagent maintenant les mêmes limites et se recouvrent
    # légèrement dans les angles. Le placage est ensuite prolongé lui-même.
    for pattern, axis, target in [
        (r"Left_Wall001|Right_Wall002", 1, (-3.025, 0.008)),
        (r"Back_Wall_14", 0, (-1.315, 1.315)),
    ]:
        group = find(pattern)
        lo, hi = bounds(group)
        for o in group:
            for v in o.data.vertices:
                t = (v.co[axis] - lo[axis]) / (hi[axis] - lo[axis])
                v.co[axis] = target[0] + t * (target[1] - target[0])
            o.data.update()
    # Le soubassement sombre et son cadre inox disparaissent : le placage
    # descend jusqu'au sol, les mains courantes se fixent dans le bois.
    for o in find(r"(Left_Wall001|Right_Wall002|Back_Wall_14).*(M_door_backplate|M_side_Lower)"):
        bpy.data.objects.remove(o)
    # Les platines plates des mains courantes deviennent des tiges rondes,
    # du profil de la main courante jusque dans le bois.
    handle_mat = bpy.data.materials["M_Handle"]
    for o in find(r"handle.*M_Handle"):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        seen, parts = set(), []
        for v in bm.verts:
            if v in seen:
                continue
            seen.add(v)
            stack, part = [v], []
            while stack:
                a = stack.pop()
                part.append(a)
                for e in a.link_edges:
                    b = e.other_vert(a)
                    if b not in seen:
                        seen.add(b)
                        stack.append(b)
            parts.append(part)
        # les platines : les pièces qui touchent la paroi
        wall = max(abs(v.co.x) for v in bm.verts) if "rear" not in o.name else min(v.co.y for v in bm.verts)
        brackets = [p for p in parts if any(abs(abs(v.co.x) - wall) < 0.002 if "rear" not in o.name else abs(v.co.y - wall) < 0.002 for v in p)]
        rods = []
        for p in brackets:
            lo = Vector([min(v.co[i] for v in p) for i in range(3)])
            hi = Vector([max(v.co[i] for v in p) for i in range(3)])
            c = (lo + hi) / 2
            axis = 0 if hi.x - lo.x > hi.y - lo.y else 1
            # jusqu'à 1 cm derrière la face du bois
            end = hi[axis] + 0.01 if hi[axis] > 0 else lo[axis] - 0.01
            start = lo[axis] if hi[axis] > 0 else hi[axis]
            mid = c.copy()
            mid[axis] = (start + end) / 2
            rods.append((mid, axis, abs(end - start)))
        bmesh.ops.delete(bm, geom=[v for p in brackets for v in p], context="VERTS")
        bm.to_mesh(o.data)
        bm.free()
        o.data.update()
        for mid, axis, length in rods:
            bpy.ops.mesh.primitive_cylinder_add(
                vertices=32, radius=0.0115, depth=length, end_fill_type="NOTHING", location=mid,
                rotation=(0, math.pi / 2, 0) if axis == 0 else (math.pi / 2, 0, 0),
            )
            rod = bpy.context.object
            rod.name = "handrail_rod"
            rod.data.materials.append(handle_mat)
            bpy.ops.object.shade_smooth()
    # Même placage, agrandi jusqu'aux raccords : pas de bande de remplissage.
    # Les UV du bois sont recalculés ci-dessous sur les panneaux entiers,
    # donc les rallonges ne créent pas de rupture dans le veinage.
    for o in bpy.data.objects:
        if not any(m == glass for m in o.data.materials):
            continue
        top = max(v.co.z for v in o.data.vertices)
        if top < 2.2:
            continue
        bottom = min(v.co.z for v in o.data.vertices)
        axis = 0 if "Back_Wall" in o.name else 1
        lo, hi = bounds([o])
        target = (-1.315, 1.315) if axis == 0 else (-3.025, 0.002)
        for v in o.data.vertices:
            t = (v.co[axis] - lo[axis]) / (hi[axis] - lo[axis])
            v.co[axis] = target[0] + t * (target[1] - target[0])
            if v.co.z > top - 0.015:
                v.co.z = CABIN_HEIGHT
            elif v.co.z < bottom + 0.015:
                v.co.z = 0
        o.data.update()
    # Images PBR embarquées dans le GLB, aussi disponibles
    # dans Blender : couleur, rugosité et normales de la même surface.
    def pbr_material(material, asset, cache_name, normal_strength, provider="polyhaven"):
        folder = os.path.join(CACHE, cache_name)
        os.makedirs(folder, exist_ok=True)
        files = {key: os.path.join(folder, key + "_2k.jpg") for key in ["Diffuse", "nor_gl", "Rough"]}
        missing = [key for key, path in files.items() if not os.path.exists(path)]
        if missing and provider == "ambientcg":
            archive = os.path.join(folder, asset + "_2K-JPG.zip")
            if not os.path.exists(archive):
                get(f"https://ambientcg.com/get?file={asset}_2K-JPG.zip", archive)
            suffixes = {"Diffuse": "Color", "nor_gl": "NormalGL", "Rough": "Roughness"}
            with zipfile.ZipFile(archive) as source:
                for key in missing:
                    data = source.read(f"{asset}_2K-JPG_{suffixes[key]}.jpg")
                    with open(files[key], "wb") as target:
                        target.write(data)
        elif missing:
            source = get(f"https://api.polyhaven.com/files/{asset}")
            for key in missing:
                get(source[key]["2k"]["jpg"]["url"], files[key])
        nodes, links = material.node_tree.nodes, material.node_tree.links
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        surface = nodes.new("ShaderNodeBsdfPrincipled")
        links.new(surface.outputs["BSDF"], output.inputs["Surface"])
        surface.inputs["Metallic"].default_value = 0
        for key, input_name in [("Diffuse", "Base Color"), ("Rough", "Roughness"), ("nor_gl", "Normal")]:
            tex = nodes.new("ShaderNodeTexImage")
            tex.image = bpy.data.images.load(files[key])
            if key != "Diffuse":
                tex.image.colorspace_settings.name = "Non-Color"
            if key == "nor_gl":
                normal = nodes.new("ShaderNodeNormalMap")
                normal.inputs["Strength"].default_value = normal_strength
                links.new(tex.outputs["Color"], normal.inputs["Color"])
                links.new(normal.outputs["Normal"], surface.inputs[input_name])
            else:
                links.new(tex.outputs["Color"], surface.inputs[input_name])

    pbr_material(glass, "walnut_veneer_02", "cabin-walnut-veneer-02", 0.15)
    dark_marble = bpy.data.materials.new("M_Floor_Dark")
    dark_marble.use_nodes = True
    pbr_material(dark_marble, "Marble016", "cabin-marble-016", 0.08, provider="ambientcg")
    # Une dalle de marbre continue, sans quadrillage ; couverture de 3 m.
    for o in find(r"Floor_41|Threashold_38"):
        me = o.data
        uv = me.uv_layers.active
        for loop in me.loops:
            co = me.vertices[loop.vertex_index].co
            uv.data[loop.index].uv = ((co.x + CABIN_WIDTH / 2) / 3, -co.y / 3)
    # Le sol en moulinet : cinq dalles de marbre blanc, chacune son morceau de
    # la feuille, séparées par des joints de marbre sombre et bordées d'une
    # bande sombre le long des parois. Découpé dans la dalle elle-même, sans
    # géométrie superposée.
    pbr_material(bpy.data.materials["M_Floor"], "Marble021", "cabin-marble-021", 0.08, provider="ambientcg")
    rects = pinwheel()
    w2, j, b = CABIN_WIDTH / 2, FLOOR_JOINT / 2, FLOOR_BORDER
    floor = find(r"Floor_41")[0]
    me = floor.data
    me.materials.append(dark_marble)
    bm = bmesh.new()
    bm.from_mesh(me)
    cuts = [(x, 0) for x in (-w2 + b, w2 - b, *(c + d for c in PINWHEEL_X for d in (-j, j)))]
    cuts += [(z, 1) for z in (b, CABIN_DEPTH - b, *(c + d for c in PINWHEEL_Z for d in (-j, j)))]
    for at, axis in cuts:
        bmesh.ops.bisect_plane(
            bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
            plane_co=(at, 0, 0) if axis == 0 else (0, -at, 0),
            plane_no=(1, 0, 0) if axis == 0 else (0, 1, 0), dist=1e-6,
        )
    uv = bm.loops.layers.uv.active
    for f in bm.faces:
        c = f.calc_center_median()
        slab = pinwheel_slab(rects, c.x, -c.y, b, j)
        if slab is None:
            f.material_index = len(me.materials) - 1
            continue
        ou, ov = (slab * 0.382) % 1, (slab * 0.618) % 1
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = ((co.x + w2) / 3 + ou, -co.y / 3 + ov)
    bm.to_mesh(me)
    bm.free()
    me.update()
    # Feuilles de placage à livre ouvert. Découper aux joints pour que les
    # UV ne s'interpolent pas entre deux feuilles. Même mapping dans Blender
    # et sur le web ; le motif ne se répète pas deux fois sur la hauteur.
    for o in list(bpy.data.objects):
        if glass not in list(o.data.materials):
            continue
        side = "Back_Wall" not in o.name
        bm = bmesh.new()
        bm.from_mesh(o.data)
        for plane in [-1, -2] if side else [0]:
            bmesh.ops.bisect_plane(
                bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                plane_co=(0, plane, 0) if side else (plane, 0, 0),
                plane_no=(0, 1, 0) if side else (1, 0, 0), dist=1e-6,
            )
        bm.to_mesh(o.data)
        bm.free()
        me = o.data
        me.update()
        uv = me.uv_layers.active or me.uv_layers.new()
        for poly in me.polygons:
            c = poly.center
            n = (int(-c.y >= 1) + int(-c.y >= 2) + (3 if c.x > 0 else 0)) if side else 6 + int(c.x >= 0)
            for li in poly.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                along = -co.y if side else co.x
                u = co.z / 2.4 + (n * 0.382) % 1
                v = along / 1.3 * (-1 if n % 2 else 1) + (n * 0.618) % 1
                uv.data[li].uv = (u, 1 - v)
    # La façade, autour des portes : sa face intérieure passe au noyer, en
    # deux feuilles de part et d'autre de l'axe, comme le fond ; un chambranle
    # d'inox de 5 cm reste autour de l'ouverture, avec ses tableaux.
    facade = find(r"EntryWall")[0]
    me = facade.data
    me.materials.append(glass)
    frame_x, frame_z = DOOR_W / 2 + DOOR_FRAME, DOOR_H + DOOR_FRAME
    bm = bmesh.new()
    bm.from_mesh(me)
    for co, no in [((-frame_x, 0, 0), (1, 0, 0)), ((frame_x, 0, 0), (1, 0, 0)), ((0, 0, frame_z), (0, 0, 1))]:
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=co, plane_no=no, dist=1e-6)
    uv = bm.loops.layers.uv.active
    for f in bm.faces:
        c = f.calc_center_median()
        if f.normal.y > -0.9 or abs(c.y) > 0.002 or (abs(c.x) < frame_x and c.z < frame_z):
            continue
        f.material_index = len(me.materials) - 1
        n = 8 + int(c.x >= 0)
        for loop in f.loops:
            co = loop.vert.co
            u = co.z / 2.4 + (n * 0.382) % 1
            v = co.x / 1.3 * (-1 if n % 2 else 1) + (n * 0.618) % 1
            loop[uv].uv = (u, 1 - v)
    bm.to_mesh(me)
    bm.free()
    me.update()
    # Platine à quatre commandes, en vraies dimensions, indépendante de
    # l'élargissement des parois. Les coordonnées ci-dessous sont Three.js.
    steel = bpy.data.materials["M_Steel1"]
    glow = bpy.data.materials["M_Glow2"]
    dark = bpy.data.materials.new("M_Control_Dark")
    dark.diffuse_color = (0.025, 0.028, 0.032, 1)
    dark.use_nodes = True
    dark.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = dark.diffuse_color
    dark.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = 0.65
    control_steel = bpy.data.materials.new("M_Control_Steel")
    control_steel.use_nodes = True
    surface = control_steel.node_tree.nodes.get("Principled BSDF")
    surface.inputs["Base Color"].default_value = (0.48, 0.5, 0.52, 1)
    surface.inputs["Metallic"].default_value = 0.8
    surface.inputs["Roughness"].default_value = 0.42

    def block(name, at, size, mat, bevel=0):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(at[0], -at[2], at[1]))
        ob = bpy.context.object
        ob.name = name
        ob.dimensions = (size[0], size[2], size[1])
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        if bevel:
            mod = ob.modifiers.new("soft_edges", "BEVEL")
            mod.width, mod.segments = bevel, 3
            bpy.ops.object.modifier_apply(modifier=mod.name)
        ob.data.materials.append(mat)
        return ob

    # Fond plein derrière les cadres : les joints de menuiserie ne donnent
    # jamais dans le vide. Ces trois panneaux ont une vraie épaisseur pour
    # le futur calcul de lumière Blender, sans toucher au passage des portes.
    backing = bpy.data.materials["M_door_backplate"]
    for side in [-1, 1]:
        block("wall_backing", (side * 1.345, (CABIN_HEIGHT + 0.08) / 2, 1.505), (0.04, CABIN_HEIGHT + 0.1, 3.05), backing)
    block("rear_backing", (0, (CABIN_HEIGHT + 0.08) / 2, 3.045), (2.73, CABIN_HEIGHT + 0.1, 0.04), backing)

    # Le plafond en moulinet, comme le sol : cinq panneaux du même marbre
    # blanc séparés par des creux noirs de 4 cm, un pavé LED carré au centre
    # et un spot rond dans chacun des quatre grands panneaux. Remplace le
    # plafond poli et la grande dalle lumineuse du modèle.
    for o in find(r"Ceiling_16|Ceiling_Light_18"):
        bpy.data.objects.remove(o)
    # une copie de la matière du sol : mêmes images (une seule fois dans le
    # GLB), réglée à part par la scène
    ceiling_marble = bpy.data.materials["M_Floor"].copy()
    ceiling_marble.name = "M_Ceiling_Marble"
    block("ceiling_reveal", (0, CABIN_HEIGHT + 0.04, CABIN_DEPTH / 2), (2.73, 0.01, 3.1), dark)
    g = CEILING_JOINT / 2
    for i, (x0, x1, z0, z1) in enumerate(pinwheel()):
        panel = block("ceiling_panel", ((x0 + x1) / 2, CABIN_HEIGHT + 0.01, (z0 + z1) / 2), (x1 - x0 - 2 * g, 0.02, z1 - z0 - 2 * g), ceiling_marble, 0.002)
        me = panel.data
        uv = me.uv_layers.active or me.uv_layers.new()
        # chaque panneau son morceau de la feuille, décalé de ceux du sol
        ou, ov = ((i + 7) * 0.382) % 1, ((i + 7) * 0.618) % 1
        for loop in me.loops:
            co = panel.matrix_world @ me.vertices[loop.vertex_index].co
            uv.data[loop.index].uv = ((co.x + CABIN_WIDTH / 2) / 3 + ou, -co.y / 3 + ov)
    ceiling_glow = bpy.data.materials.new("M_Ceiling_Glow")
    glows = []
    cx, cz = sum(PINWHEEL_X) / 2, sum(PINWHEEL_Z) / 2
    block("ceiling_led_frame", (cx, CABIN_HEIGHT - 0.002, cz), (0.52, 0.004, 0.52), control_steel, 0.001)
    bpy.ops.mesh.primitive_plane_add(size=0.48, location=(cx, -cz, CABIN_HEIGHT - 0.007), rotation=(math.pi, 0, 0))
    glows.append(bpy.context.object)
    for x, z in [(-0.9, 0.5), (0.9, 0.5), (0.9, 2.5), (-0.9, 2.5)]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.045, depth=0.004, location=(x, -z, CABIN_HEIGHT - 0.002))
        bpy.context.object.data.materials.append(control_steel)
        bpy.ops.mesh.primitive_circle_add(vertices=48, radius=0.032, fill_type="NGON", location=(x, -z, CABIN_HEIGHT - 0.007), rotation=(math.pi, 0, 0))
        glows.append(bpy.context.object)
    for o in glows:
        o.data.materials.append(ceiling_glow)
    ceiling_light = join(glows, "ceiling_light")

    block("control_gasket", (0.9, 1.46, 0.005), (0.432, 1.092, 0.008), dark, 0.009)
    block("control_plate", (0.9, 1.46, 0.012), (0.42, 1.08, 0.012), control_steel, 0.006)
    block("display_bezel", (0.9, 1.75, 0.022), (0.364, 0.344, 0.012), dark, 0.006)
    # Face plane de l'écran, UV projetés plus bas.
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0.9, -0.029, 1.75), rotation=(math.pi / 2, 0, 0))
    display = bpy.context.object
    display.scale = (0.34, 0.32, 1)
    display.data.materials.append(bpy.data.materials["M_Glow1"])
    centers = [(0.9, 1.43, 0.033), (0.83, 1.28, 0.033), (0.97, 1.28, 0.033), (0.9, 1.13, 0.033)]
    arrival = None
    for i, (x, y, z) in enumerate(centers):
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.029, depth=0.01, location=(x, -(z - 0.005), y), rotation=(math.pi / 2, 0, 0))
        button = bpy.context.object
        button.name = f"control_button_{i}"
        button.data.materials.append(control_steel)
        mod = button.modifiers.new("rim", "BEVEL")
        mod.width, mod.segments = 0.001, 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.ops.mesh.primitive_torus_add(major_segments=32, minor_segments=8, major_radius=0.03, minor_radius=0.0015, location=(x, -(z - 0.001), y), rotation=(math.pi / 2, 0, 0))
        ring = bpy.context.object
        ring.data.materials.append(glow if i == 0 else dark)
        if i == 0:
            arrival = ring
    for x in [0.715, 1.085]:
        for y in [0.945, 1.975]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.003, depth=0.002, location=(x, -0.019, y), rotation=(math.pi / 2, 0, 0))
            bpy.context.object.data.materials.append(steel)
            block("screw_slot", (x, y, 0.0202), (0.004, 0.0007, 0.0003), dark)
    block("sill", (0, 0.012, -0.055), (1.0, 0.012, 0.15), steel, 0.002)
    for z in [-0.105, -0.06, -0.015]:
        block("sill_track", (0, 0.0182, z), (0.984, 0.0006, 0.005), dark)

    # Deux objets muraux à hauteur des yeux : tirage photo et information.
    # Leurs cadres font partie du modèle pour le futur calcul de lumière.
    paper = bpy.data.materials.new("M_Cabin_Paper")
    paper.use_nodes = True
    paper_surface = paper.node_tree.nodes.get("Principled BSDF")
    paper_surface.inputs["Base Color"].default_value = (0.72, 0.69, 0.63, 1)
    paper_surface.inputs["Roughness"].default_value = 0.9
    photo = bpy.data.materials.new("M_Cabin_Photo")
    photo.use_nodes = True
    photo_surface = photo.node_tree.nodes.get("Principled BSDF")
    photo_surface.inputs["Roughness"].default_value = 0.82
    photo_image = photo.node_tree.nodes.new("ShaderNodeTexImage")
    photo_image.image = bpy.data.images.load(os.path.join(OUT, "cabin-architecture.jpg"))
    photo.node_tree.links.new(photo_image.outputs["Color"], photo_surface.inputs["Base Color"])

    def wall_frame(name, side, y, z, width, height, inset, material):
        # Vues depuis l'intérieur, les faces regardent vers le centre.
        block(name + "_frame", (side * 1.272, y, z), (0.026, height, width), dark, 0.003)
        block(name + "_mat", (side * 1.257, y, z), (0.004, height - 0.016, width - 0.016), paper)
        w, h = width - inset * 2, height - inset * 2
        points = [(side * 1.254, y + dy * h / 2, z + side * dz * w / 2) for dz, dy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(x, -z0, y0) for x, y0, z0 in points], [], [(0, 1, 2, 3)])
        mesh.materials.append(material)
        uv = mesh.uv_layers.new()
        for loop, co in zip(uv.data, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            loop.uv = co
        ob = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(ob)
        return ob

    wall_frame("wall_photo", -1, 1.57, 0.55, 0.46, 0.66, 0.045, photo)
    notice = wall_frame("wall_notice", 1, 1.53, 0.55, 0.32, 0.44, 0.014, paper)
    # Appliquer les transformations avant la projection UV et la fusion.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.scene["buttons"] = json.dumps(centers)
    me = display.data
    lo, hi = bounds([display])
    uv = me.uv_layers.active
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((co.x - lo.x) / (hi.x - lo.x), (co.z - lo.z) / (hi.z - lo.z))
    door_l, door_r = split(find(r"Lift_door")[0], "door_l", "door_r")
    named = {"cop_display": display, "ceiling_light": ceiling_light, "button_arrival": arrival, "wall_notice": notice}
    for n, o in named.items():
        o.name = o.data.name = n
    # le reste, immobile, en un seul objet (un maillage par matière dans three.js)
    keep = {door_l, door_r, *named.values()}
    join([o for o in bpy.data.objects if o not in keep], "cabin")
    lo, hi = bounds(list(bpy.data.objects))
    print(f"[prepare] {spec['out']}: {sum(len(o.data.polygons) for o in bpy.data.objects)} faces, échelle {s:.4f}, profondeur ×{k:.3f}, "
          f"{hi.x - lo.x:.3f} × {hi.z - lo.z:.3f} × {hi.y - lo.y:.3f} m (l × h × p), {len(centers)} boutons", flush=True)
    textures(2048)
    bpy.ops.object.select_all(action="SELECT")
    export(spec)


def prepare(spec):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # un personnage : la pose de repos vient des nœuds, pas des matrices de liaison ; chez Character
    # Creator, la cuisse, le bras et l'avant-bras ne pèsent sur aucun sommet (leurs os de torsion le
    # font) et leur matrice de liaison les mettrait à l'origine
    bpy.ops.import_scene.gltf(filepath=fetch(spec), guess_original_bind_pose=not spec.get("rigged"))
    if spec.get("rigged"):
        return prepare_rigged(spec)
    if spec.get("cabin"):
        return prepare_cabin(spec)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in [o for o in bpy.data.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o)
    # les pièces en trop, et les maillages vides (arêtes seules) des exports SketchUp
    for o in list(bpy.data.objects):
        if not o.data.polygons or ("drop" in spec and re.search(spec["drop"], o.name)) or ("keep" in spec and not re.search(spec["keep"], o.name)):
            bpy.data.objects.remove(o)
    name = os.path.splitext(spec["out"])[0]
    # des pièces à part, nommées pour la scène : la dalle d'un écran, le plateau d'un bureau
    sep = {}
    for k in ("screen", "top"):
        if k in spec:
            sep[k] = join([o for o in bpy.data.objects if o not in sep.values() and re.search(spec[k], o.name)], k)
            for m in sep[k].data.materials:
                m.name = k
    screen = sep.get("screen")
    parts = [join([o for o in bpy.data.objects if o not in sep.values()], name), *sep.values()]
    if "decimate" in spec:
        for p in parts:
            # soudé d'abord : un scan découpé en îlots s'ouvrirait (les uv, par coin, restent)
            bm = bmesh.new()
            bm.from_mesh(p.data)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4 * max(p.dimensions))
            bm.to_mesh(p.data)
            bm.free()
            bpy.context.view_layer.objects.active = p
            mod = p.modifiers.new("decimate", "DECIMATE")
            mod.ratio = spec["decimate"]
            bpy.ops.object.modifier_apply(modifier=mod.name)
    if "tilt" in spec:
        # couché : on le bascule autour de l'axe gauche-droite avant de l'orienter
        for p in parts:
            p.data.transform(Matrix.Rotation(math.radians(spec["tilt"]), 4, "X"))

    def verts():
        return [v.co.copy() for p in parts for v in p.data.vertices]

    vs = verts()
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    h = hi.z - lo.z
    # l'utilisateur côté -z three.js, soit +y Blender
    face = spec["face"]
    if face == "back":
        top = [v for v in vs if v.z > lo.z + 0.72 * h]
        foot = [v for v in vs if v.z < lo.z + 0.08 * h]
        d = (sum(top, Vector()) / len(top)) - (sum(foot, Vector()) / len(foot))
        ang = math.atan2(-1, 0) - math.atan2(d.y, d.x)  # le dossier vers -y Blender
    elif face == "screen":
        n = Vector()
        for poly in screen.data.polygons:
            n += poly.normal * poly.area
        # la dalle vers +y Blender ; si la normale pointe dans le dos, l'écran est retourné
        ang = math.atan2(1, 0) - math.atan2(n.y, n.x)
    else:
        ang = math.radians(face)
    for p in parts:
        p.data.transform(Matrix.Rotation(ang, 4, "Z"))
    vs = verts()
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    axis, target = spec["size"]
    s = target / {"height": hi.z - lo.z, "width": hi.x - lo.x, "depth": hi.y - lo.y}[axis]
    if face == "back":
        foot = [v for v in vs if v.z < lo.z + 0.08 * (hi.z - lo.z)]
        c = sum(foot, Vector()) / len(foot)
    else:
        c = (lo + hi) / 2
    m = Matrix.Scale(s, 4) @ Matrix.Translation((-c.x, -c.y, -lo.z))
    for p in parts:
        p.data.transform(m)
        p.data.update()
    if "top_at" in spec:
        # un pied réglable : ses colonnes s'allongent ou se raccourcissent dans
        # une bande de hauteur (lift, en m) pour amener le plateau à top_at
        b0, b1 = spec["lift"]
        d = spec["top_at"] - max(v.co.z for v in sep["top"].data.vertices)
        for p in parts:
            for v in p.data.vertices:
                v.co.z += d * min(1.0, max(0.0, (v.co.z - b0) / (b1 - b0)))
            p.data.update()
    vs = verts()
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    size = hi - lo
    if "top" in sep:
        # le plateau : uv en mètres (projection par la face dominante), le fil
        # le long du bureau ; la scène y pose son propre placage
        me = sep["top"].data
        uv = me.uv_layers.active or me.uv_layers.new()
        for poly in me.polygons:
            n = poly.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for li in poly.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                uv.data[li].uv = [(co.y, co.z), (co.x, co.z), (co.x, co.y)][ax]
    if screen is not None:
        # la dalle : uv projetés sur son plan, de 0 à 1, l'image à l'endroit
        # pour qui la regarde (depuis +y Blender) ; l'export glTF retourne v
        me = screen.data
        xs = [v.co.x for v in me.vertices]
        zs = [v.co.z for v in me.vertices]
        uv = me.uv_layers.active or me.uv_layers.new()
        for loop in me.loops:
            co = me.vertices[loop.vertex_index].co
            uv.data[loop.index].uv = ((max(xs) - co.x) / (max(xs) - min(xs)), (co.z - min(zs)) / (max(zs) - min(zs)))
    print(f"[prepare] {spec['out']}: {sum(len(p.data.polygons) for p in parts)} faces, {size.x:.3f} × {size.z:.3f} × {size.y:.3f} m (l × h × p)", flush=True)
    textures(spec.get("tex", 1024))
    bpy.ops.object.select_all(action="SELECT")
    export(spec)


only = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
for spec in MODELS:
    if not only or spec["out"] in only:
        prepare(spec)
