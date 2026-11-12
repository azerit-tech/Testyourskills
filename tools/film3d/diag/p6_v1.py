# la variante V1 de P6 (découpage v2) : la caméra v2 au ras du sol jusqu'à l'image 22, puis la grue haute du
# brouillon sur toute la colonne (images 23 à 40) ; la coupe intérieure se fait entre 22 et 23, franche (clés en
# 22,49 et 22,51)
import p6_jetee as P6

frames = range(P6.F0 - 1, P6.F0 + P6.FRAMES + 1)
P6.key_camera_v1(scene.camera, frames)
print(f"[diag] P6 en variante V1 : coupe entre {P6.V1_CUT} et {P6.V1_CUT + 1}", flush=True)
