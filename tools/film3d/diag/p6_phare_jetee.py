# iter_diag --exec p6_phare_jetee : P6 vu de la jetée vers la pointe (contrôle du phare, découpage v3 §3), caméra
# fixe à la place de l'image 1 de la v3 (y 233, voie de droite, 1,6 m), 24 mm, tournée vers +y
import math

c = scene.camera  # noqa: F821  (l'espace de noms d'iter_diag)
c.animation_data_clear()
c.data.animation_data_clear()
c.location = (80.75, 233.0, 1.6)
c.rotation_mode = "XYZ"
c.rotation_euler = (math.radians(92.0), 0.0, 0.0)
c.data.lens = 24.0
c.data.dof.use_dof = False
