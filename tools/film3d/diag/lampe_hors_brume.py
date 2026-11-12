# essai : le spot du lampadaire de la pointe n'éclaire plus la brume : est-ce lui qui fait le nuage de grains ?
lp = bpy.data.objects.get("lamp_pointe_light")
if lp:
    lp.visible_volume_scatter = False
print(f"[diag] lampadaire de la pointe hors brume : {bool(lp)} ; arbre de lumières {scene.cycles.use_light_tree}, "
      f"{sum(1 for o in scene.objects if o.type == 'LIGHT')} lumières", flush=True)
