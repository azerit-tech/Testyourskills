# Rend une image fixe des lieux de la ville (scene-b.blend, la rue des enseignes, scene-carrefour.blend,
# scene-f.blend) : une enveloppe de render_lieux.py --scene, gardée pour que les appels existants tournent encore.
#
#   lockf -k <verrou> nice -n 19 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 \
#     -P tools/film3d/render_b.py -- [--scene scene-b.blend] [--engine workbench|cycles] [--percent 50] \
#     [--samples 32] [--gpu] [--threads 2] [--out chemin.png] [--grain 0]
#
# Mêmes arguments et mêmes défauts qu'avant : scene-b.blend si --scene manque, grain 0, Workbench en couleurs des
# matières ; sortie Azerit/design/film/ref/lieux/<scène>-<moteur>.png par défaut. Tout le reste est dans
# render_lieux.py (voir son en-tête).
import os
import runpy
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if "--scene" not in argv:
    argv = ["--scene", "scene-b.blend"] + argv
sys.argv = sys.argv[:sys.argv.index("--")] + ["--"] + argv if "--" in sys.argv else sys.argv + ["--"] + argv
runpy.run_path(os.path.join(HERE, "render_lieux.py"), run_name="__main__")
