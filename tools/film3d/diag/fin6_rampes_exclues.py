# essai : l'inventaire des lumières de l'anneau (patrouilles, fourgon) et de leur liaison, puis la berline exclue
# de toutes, sauf de ses jumelles (« _hero ») : 130 lumières de rampe la passaient-elles au rose ?
from collections import Counter

hero = bpy.data.objects["hero"]
body = [o for o in hero.children_recursive if o.type == "MESH"]
out_c = bpy.data.collections.get("hero_lumiere_sans")
if out_c is None:
    out_c = bpy.data.collections.new("hero_lumiere_sans")
    for o in body:
        out_c.objects.link(o)
    for co in out_c.collection_objects:
        co.light_linking.link_state = "EXCLUDE"
rigs = [o for o in scene.objects if o.parent is None and (o.name.startswith("patrol") or o.name.startswith("van"))]
inv, fixed = Counter(), 0
for r in rigs:
    for o in r.children_recursive:
        if o.type != "LIGHT" or o.name.endswith("_hero"):
            continue
        rc = o.light_linking.receiver_collection
        kind = "_".join(o.name.split("_")[-3:-1]) if "_" in o.name else o.name
        inv[(o.data.type, rc.name if rc else None)] += 1
        if rc is None:
            o.light_linking.receiver_collection = out_c
            fixed += 1
        elif hero.name not in [x.name for x in rc.all_objects] and not set(body) <= set(rc.objects):
            if any(co.light_linking.link_state == "EXCLUDE" for co in rc.collection_objects):
                for b in body:
                    if b.name not in rc.objects:
                        rc.objects.link(b)
                for co in rc.collection_objects:
                    co.light_linking.link_state = "EXCLUDE"
                fixed += 1
for (t, rc), n in sorted(inv.items(), key=lambda kv: -kv[1]):
    print(f"[diag] anneau : {n} {t}, liaison {rc}", flush=True)
print(f"[diag] {len(rigs)} véhicules, {fixed} lumières corrigées (la berline exclue)", flush=True)
