# Le débit des rendus : ce qui rend une itération plus rapide sans changer l'image du rendu final.
#
# 1. La scène en cache (FILM3D_CACHE, actif par défaut ; FILM3D_CACHE=0 l'éteint). La construction d'un plan
#    (Python, un seul cœur : 107 s pour P3, 39 s pour P6) est faite une fois, la scène enregistrée en .blend
#    (0,7 s), puis rouverte (1 s) tant que rien de ce qu'elle a lu n'a changé. La clé : le plan et son argument, la
#    version de Blender, toutes les variables FILM3D_* qui pèsent sur la construction, et l'empreinte (sha1) de
#    chaque fichier du dépôt que la construction a importé ou ouvert (modules de tools/film3d et lab/, cut.ts),
#    plus taille et date des assets ouverts. Une retouche de scene_d.py n'invalide donc que les plans de scene_d.
#    Le cache est partagé entre les copies du code (dossier FILM3D_CACHE_DIR, sinon <assets>/../cache) : deux
#    agents au même code pour un plan se le partagent. Écriture atomique, plus ancien supprimé au-delà de
#    FILM3D_CACHE_GB (40 Go par défaut). Les images réduites en mémoire pendant la construction (Image.scale) sont
#    rangées dans le .blend, sinon il relirait les fichiers en pleine taille. Vérifié sur P3 et P6 par render_film :
#    image construite et image du cache diffèrent d'au plus 1 à 4 / 255 sur moins de 1 % des pixels, comme deux
#    rendus du même .blend (bruit de Cycles) ; deux constructions de P3 diffèrent, elles, de 0,19 / 255 en moyenne.
import hashlib
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
# les scripts qui appellent la construction sans y prendre part : les retoucher n'invalide pas le cache
CALLERS = {"render_film.py", "render_lieux.py", "iter_diag.py", "debit.py"}
# les variables qui ne changent pas la scène construite (rendu, chemins de sortie, ce module)
NOT_KEY = {"FILM3D_BLEND", "FILM3D_RENDER", "FILM3D_DRAFT", "FILM3D_CACHE", "FILM3D_CACHE_DIR", "FILM3D_CACHE_GB",
           "FILM3D_PHASES"}


def log(msg):
    print(f"[debit] {msg}", flush=True)


def flag(name, default=False):
    v = os.environ.get(name)
    if v is None or v == "":
        return default
    return v.strip().lower() not in ("0", "non", "no", "false", "off")


# ---------------------------------------------------------------- la clé, sans Blender

def sha1(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def env_key(environ=None):
    environ = os.environ if environ is None else environ
    return {k: v for k, v in sorted(environ.items()) if k.startswith("FILM3D_") and k not in NOT_KEY}


def head_key(plan, arg, blender_version, environ=None):
    """La partie de la clé connue avant de construire : plan, argument, Blender, variables."""
    return {"plan": plan, "arg": arg, "blender": blender_version, "env": env_key(environ)}


def head_hash(head):
    return hashlib.sha1(json.dumps(head, sort_keys=True).encode()).hexdigest()[:12]


def deps_match(deps, root=ROOT):
    """Les fichiers lus par la construction sont-ils encore les mêmes ? (code : sha1 ; assets : taille et date)"""
    for rel, want in deps.get("code", {}).items():
        p = os.path.join(root, rel)
        try:
            if sha1(p) != want:
                return False
        except OSError:
            return False
    for p, (size, mtime) in deps.get("assets", {}).items():
        try:
            st = os.stat(p)
        except OSError:
            return False
        if st.st_size != size or int(st.st_mtime) != mtime:
            return False
    return True


def cache_dir(assets):
    d = os.environ.get("FILM3D_CACHE_DIR") or os.path.join(os.path.dirname(os.path.abspath(assets)), "cache")
    os.makedirs(d, exist_ok=True)
    return d


def find(d, head):
    """Le .blend du cache dont l'en-tête est celui-ci et dont les fichiers lus n'ont pas changé, sinon None."""
    hh = head_hash(head)
    best = None
    for name in os.listdir(d):
        if not (name.startswith(f"{head['plan']}-{hh}-") and name.endswith(".json")):
            continue
        try:
            meta = json.load(open(os.path.join(d, name), encoding="utf-8"))
        except (OSError, ValueError):
            continue
        blend = os.path.join(d, meta.get("blend", ""))
        if meta.get("head") != head or not os.path.isfile(blend) or not deps_match(meta.get("deps", {})):
            continue
        if best is None or meta.get("made", 0) > best[1].get("made", 0):
            best = (blend, meta)
    return best


def evict(d, keep_gb):
    """Les plus anciennes scènes (dernier usage) supprimées au-delà de keep_gb."""
    items = []
    for name in os.listdir(d):
        if name.endswith(".blend"):
            p = os.path.join(d, name)
            st = os.stat(p)
            items.append((max(st.st_atime, st.st_mtime), st.st_size, p))
    total = sum(s for _, s, _ in items)
    for _, size, p in sorted(items):
        if total <= keep_gb * 1e9:
            break
        for q in (p, p[:-6] + ".json"):
            try:
                os.remove(q)
            except OSError:
                pass
        total -= size
        log(f"cache plein : {os.path.basename(p)} supprimé")


# ---------------------------------------------------------------- dans Blender

class Reads:
    """Les fichiers ouverts pendant la construction (crochet d'audit) : sous le dépôt, et les assets."""

    def __init__(self, assets):
        self.assets = os.path.realpath(assets)
        self.on = True
        self.files = set()
        sys.addaudithook(self._hook)

    def _hook(self, event, args):
        if self.on and event == "open" and args and isinstance(args[0], (str, bytes, os.PathLike)):
            try:
                self.files.add(os.path.realpath(os.fsdecode(args[0])))
            except (TypeError, ValueError):
                pass


def collect_deps(reads, root=ROOT):
    code, assets = {}, {}
    files = set(reads.files)
    for m in list(sys.modules.values()):
        f = getattr(m, "__file__", None)
        if f:
            files.add(os.path.realpath(f))
    cut = os.path.join(root, "shared", "film", "cut.ts")
    if os.path.exists(cut):
        files.add(os.path.realpath(cut))
    rroot = os.path.realpath(root)
    for p in files:
        if not os.path.isfile(p):
            continue
        if p.startswith(reads.assets + os.sep):
            st = os.stat(p)
            assets[p] = [st.st_size, int(st.st_mtime)]
        elif p.startswith(rroot + os.sep) and p.endswith((".py", ".ts", ".json")) and "__pycache__" not in p:
            rel = os.path.relpath(p, rroot)
            if rel.startswith(("tools/film3d/", "shared/film/")) and os.path.basename(p) not in CALLERS:
                code[rel] = sha1(p)
    return {"code": code, "assets": assets}


def cached_build(plan, arg, build, assets, blend_out=None, use=None):
    """build() -> scène, ou la même scène rouverte depuis le cache. Rend (scène, 'cache'|'construite'|'sans cache',
    secondes, assets lus par la construction). blend_out : le .blend que la construction aurait écrit (FILM3D_BLEND),
    lié depuis le cache."""
    import bpy
    use = flag("FILM3D_CACHE", True) if use is None else use
    t0 = time.time()
    if not use:
        return build() or bpy.context.scene, "sans cache", time.time() - t0, []
    d = cache_dir(assets)
    head = head_key(plan, arg, bpy.app.version_string)
    hit = find(d, head)
    if hit:
        blend, meta = hit
        bpy.ops.wm.open_mainfile(filepath=blend, load_ui=False)
        os.utime(blend)
        if blend_out and os.path.abspath(blend_out) != blend:
            try:
                if os.path.exists(blend_out):
                    os.remove(blend_out)
                os.link(blend, blend_out)
            except OSError:
                pass
        scene = bpy.data.scenes.get(meta.get("scene", "")) or bpy.context.scene
        log(f"{plan} : scène reprise du cache ({os.path.basename(blend)}, construite le "
            f"{time.strftime('%d/%m %H:%M', time.localtime(meta.get('made', 0)))} en {meta.get('build_s', 0):.0f} s), "
            f"ouverte en {time.time() - t0:.1f} s")
        return scene, "cache", time.time() - t0, sorted(meta.get("deps", {}).get("assets", {}))
    reads = Reads(assets)
    scene = build() or bpy.context.scene
    reads.on = False
    t_build = time.time() - t0
    deps = collect_deps(reads)
    tag = f"{plan}-{head_hash(head)}-{hashlib.sha1(json.dumps(deps, sort_keys=True).encode()).hexdigest()[:10]}"
    blend = os.path.join(d, tag + ".blend")
    tmp = os.path.join(d, f"{tag}.{os.getpid()}.part.blend")
    t1 = time.time()
    try:
        # les images retouchées en mémoire (réduites par Image.scale : lieux, scene_d, cast_vehicles…) ne sont pas
        # dans le .blend, qui relirait le fichier d'origine en pleine taille : on les y range telles quelles (PNG pour
        # les images 8 bits, OpenEXR pour les flottantes)
        packed = 0
        for img in bpy.data.images:
            if img.is_dirty and img.packed_file is None and img.has_data:
                img.pack()
                packed += 1
        bpy.ops.wm.save_as_mainfile(filepath=tmp, copy=True, compress=False)
        os.replace(tmp, blend)
        meta = dict(head=head, deps=deps, blend=os.path.basename(blend), scene=scene.name, made=time.time(),
                    build_s=round(t_build, 1))
        with open(blend[:-6] + ".json.part", "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=1)
        os.replace(blend[:-6] + ".json.part", blend[:-6] + ".json")
        log(f"{plan} : construite en {t_build:.0f} s, mise en cache en {time.time() - t1:.1f} s "
            f"({len(deps['code'])} fichiers de code, {len(deps['assets'])} assets dans la clé, {packed} images "
            f"retouchées rangées dans le .blend)")
        evict(d, float(os.environ.get("FILM3D_CACHE_GB") or 40))
    except Exception as e:                     # le cache ne doit jamais empêcher un rendu
        log(f"! mise en cache impossible ({e!r}), rendu sans cache")
        for p in (tmp,):
            try:
                os.remove(p)
            except OSError:
                pass
    return scene, "construite", t_build, sorted(deps["assets"])

