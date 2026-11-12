# la brume de P6 : son fond relevé au-dessus de l eau (-1,2 au lieu de -1,5), en coordonnées du monde
ob = bpy.data.objects["haze"]
mw, mi = ob.matrix_world, ob.matrix_world.inverted()
for v in ob.data.vertices:
    w = mw @ v.co
    if w.z < -1.0:
        w.z = -1.2
        v.co = mi @ w
ob.data.update()
