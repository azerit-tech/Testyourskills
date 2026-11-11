# Film 3D : tests de look en Blender (Cycles)

Les assets et les rendus restent hors du dépôt, dans `Azerit/design/film/` (`assets/`, `ref/`). Crédits : `CREDITS.md`.

**Télécharger les assets** (Sketchfab CC BY avec la clé du `.env`, Poly Haven CC0) :

```sh
python3 tools/film3d/fetch.py
```

**Construire la scène de l'image A** (écrit `assets/scene-a.blend`) :

```sh
nice -n 19 taskpolicy -b /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/scene_a.py
```

**Rendre l'image fixe** (écrit `ref/test-a.png`, plus `test-a-raw.png` sans grain) :

```sh
nice -n 19 taskpolicy -b /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 -P tools/film3d/render.py -- --samples 512
```

Options de `render.py` : `--shot a|b|c|d` (a l'ouverture ; b drone, deux patrouilles gyrophares allumés ; c trois quarts arrière bas, une patrouille collée ; d profil à hauteur de roue ; b à d en flou de bougé, écrits `test-b-drone.png`, `test-c-arriere.png`, `test-d-profil.png`), `--blur` (flou de bougé, obturateur 180°, la scène roule à 50 km/h ; écrit `test-a-blur.png`), `--preview` (360 × 640, 64 échantillons), `--samples N`, `--threads N` (2 par défaut pour laisser le Mac utilisable, 0 = tous), `--gpu` (Metal, ou OptiX/CUDA sur une machine louée ; CPU par défaut), `--grain` (intensité du grain ffmpeg, 0 = aucun).

Le premier rendu Metal d'une session compile ses noyaux pendant environ deux minutes. Un rendu Metal plein format a planté une fois à la compilation (`MetalKernelPipeline`) et est passé au second essai.

**Le banc d'essai du réalisme** (`lab/`) : un même bout de rue (une parcelle de 20 m, la chaussée, deux palmiers, trois lampadaires, le ciel et le réflecteur du film) et deux caméras fixes, 360 × 640 à 64 échantillons, pour comparer des méthodes à armes égales. `lab/bench.py` le construit, `lab/baseline.py` y pose la façade actuelle ; chaque méthode est un script `lab/<méthode>.py` qui écrit `ref/lab/<méthode>-large.png` et `-pres.png`. Les téléchargements d'essai passent par `python3 -I tools/film3d/lab/labfetch.py sketchfab|polyhaven|ambientcg …` (les fonctions de `fetch.py`, ambientCG compris).

```sh
lockf -k <verrou> nice -n 19 taskpolicy -b /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/lab/baseline.py
```
