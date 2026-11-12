# essai : la tête des lampadaires se voit mais n'éclaire plus (son spot éclaire) : la petite matière émissive très
# forte, échantillonnée comme lumière depuis la brume, faisait-elle le nuage de grains autour de la tête ?
m = bpy.data.materials.get("lamp_head")
if m:
    m.cycles.emission_sampling = "NONE"
print(f"[diag] tête des lampadaires : {'non échantillonnée' if m else 'introuvable'}", flush=True)
