# essai P6 : les phares de la berline au tiers (à 7 m devant elle, au ras du sol, leur nappe sur l'enrobé mouillé
# brûlait toute la moitié basse) ; les spots des lampadaires hors de la brume (le nuage de grains autour des têtes
# qui passent près de l'objectif)
hero = bpy.data.objects["hero"]
heads = [o for o in hero.children_recursive if o.type == "LIGHT" and o.data.type == "SPOT"]
for o in heads:
    o.data.energy *= 0.3
lamps = [o for o in scene.objects if o.type == "LIGHT" and o.name.startswith("lamp") and o.name.endswith("_light")]
for o in lamps:
    o.visible_volume_scatter = False
print(f"[diag] {len(heads)} phares au tiers ({[o.name for o in heads][:4]}), {len(lamps)} lampadaires hors brume",
      flush=True)
