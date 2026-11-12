# essai : la berline exclue des lueurs et des flaques de rampe de l'anneau (leurs collections « _glow_exclude »,
# qui n'excluaient que la rampe) : vingt-deux points corail et lilas à 14 m la passaient-ils au rose ?
hero = bpy.data.objects["hero"]
body = [o for o in hero.children_recursive if o.type == "MESH"]
n = 0
for col in bpy.data.collections:
    if not col.name.endswith("_glow_exclude"):
        continue
    for o in body:
        if o.name not in col.objects:
            col.objects.link(o)
    for co in col.collection_objects:
        co.light_linking.link_state = "EXCLUDE"
    n += 1
users = sum(1 for o in scene.objects if o.type == "LIGHT" and o.light_linking.receiver_collection
            and o.light_linking.receiver_collection.name.endswith("_glow_exclude"))
print(f"[diag] berline exclue de {n} collections de rampe ({users} lumières)", flush=True)
