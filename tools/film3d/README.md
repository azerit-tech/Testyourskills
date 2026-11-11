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

**La règle des rendus** : un seul Blender à la fois sur le Mac, derrière le verrou commun (`lockf -k <verrou>`), toujours avec `-t 2`. La carte graphique (Metal) est permise.

**Les variantes de la rue** se choisissent au moment de construire la scène, par des variables d'environnement lues par `scene_a.py` :

- `FILM3D_FACADE=base|kit|proc|mix` : les boîtes d'origine, les pièces assemblées (`facade_kit.py`), tout en nœuds (`facade_proc.py`), ou le mélange, par défaut (`facade_mix.py` : étages en enduit photographique, rez-de-chaussée en boutiques de bibliothèque).
- `FILM3D_ROUTE=base|pluie|sechage` : l'enrobé d'origine, la rue juste après l'averse ou la rue qui sèche (`road.py`), par défaut depuis le choix de Jacques du 11 novembre.
- `FILM3D_RDC=terrasse|sobre` (façades `mix`) : stores et guirlandes (par défaut) ou devantures nues, avec moins d'objets.
- `FILM3D_PARKED` : les voitures garées sont là par défaut, `FILM3D_PARKED=0` les retire.
- `FILM3D_HERO=w111|slc|coupe` : la voiture poursuivie, la berline des années 60 par défaut, le coupé des années 70 (les deux par `lab/hero_cars.py`) ou le coupé d'origine. Elle garde le nom d'objet `coupe` et ses roues `wheel_*` (`render.py` la cherche ainsi), phares crème et feux arrière allumés, roues qui tournent dans les plans en flou de bougé.
- `FILM3D_DRIVER=0` : la voiture d'époque roule vide ; par défaut le conducteur à capuche y est assis (`lab/cast_people.py`, `cast_driver_in_car` : volant mesuré sur sa matière, assise, dossier et pavillon trouvés par lancers de rayons ; le journal de construction donne les cotes et l'écart des mains). Le coupé d'origine roule vide dans la rue.
- `FILM3D_BLEND` : le nom du `.blend` écrit dans `assets/` (`scene-a.blend` par défaut).

```sh
FILM3D_FACADE=kit FILM3D_ROUTE=sechage lockf -k <verrou> nice -n 19 taskpolicy -b /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/scene_a.py
```

`render.py --percent N` rend à N % de 720 × 1280 (75 donne 540 × 960) ; `--gpu` rend sur la carte graphique.

**La distribution** : `cast.py` écrit `assets/cast.blend`, une collection par famille. `cast_interior` : le coupé, son rétroviseur intérieur, le conducteur assis mains au volant, une patrouille gyrophare allumé derrière, vue dans le rétroviseur. `cast_people` : le conducteur mains levées, les agents (visée debout, accroupi, garde), arme en main. `cast_vehicles` : la patrouille, le fourgon, l'hélicoptère, l'avion et les plots. Les gens et les véhicules viennent des modules du laboratoire (`lab/cast_people.py`, `lab/cast_vehicles.py`) ; leurs modèles sont dans `assets/cast/<rôle>/`, téléchargés par `fetch.py`. L'assemblage n'a pas encore été rendu (11 novembre).

```sh
lockf -k <verrou> nice -n 19 taskpolicy -b /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --factory-startup -P tools/film3d/cast.py
lockf -k <verrou> nice -n 10 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 -P tools/film3d/cast_render.py -- --sheet interieur
```

`cast_render.py` rend une planche depuis `cast.blend` : `--sheet interieur` (540 × 960, écrit `ref/cast-interieur.png`), `personnes` (éclairés de face, `cast-personnes.png`), `contrejour` (`cast-personnes-contrejour.png`) ou `vehicules` (`cast-vehicules.png`), en 1600 × 900 pour les trois dernières. GPU Metal par défaut (`--cpu` sinon), 128 échantillons (`--samples N`), `--scale N` en pourcentage de la résolution.

**Le laboratoire** (`lab/`) garde le banc d'essai et les candidats. Les méthodes du banc : `A_kit.py` (pièces assemblées), `B_upper_test.py` (les étages en enduit photographique), `C_proc.py` (tout en nœuds), `D_road.py` (la chaussée mouillée), `P_palms.py` (les palmiers), `W_wagon.py` (les voitures garées), `A_pres.py` (plan fixe rapproché de la scène mélange). Les candidats de la distribution :

- `lab/cast_vehicles.py -- --sheet …` : `van`, `helico`, `avion`, `props` mettent les candidats côte à côte dans un studio gris, la patrouille à gauche pour l'échelle (`ref/lab/cast-vehicules-comparatif-<planche>.png`) ; `crepuscule` montre les retenus à l'heure bleue et écrit `assets/cast/lab-vehicles.blend` ; `patrouille-choisie`, `avant-apres`, `finalistes-patrouille`, `finalistes-helico`, `finalistes-avion` sont des planches de choix.
- `lab/hero_cars.py -- --sheet avant-apres --car w111|slc` et `--sheet finalistes` : la voiture poursuivie, deux voitures d'époque CC BY retravaillées (marques retirées, peinture, chromes, feux allumés, habitacle) ; le modèle livré à gauche, le retravaillé à droite (`ref/lab/mercedes-<car>-avant-apres.png`), puis les deux face au coupé actuel (`ref/lab/voiture-heros-finalistes.png`). `--sheet usure` met la berline usée à côté de la même voiture neuve (`--usure-avant`, 0 par défaut) : trois quarts avant, trois quarts arrière, calandre et pare-chocs (`ref/lab/mercedes-metal-avant-apres.png`). L'usure de la berline se dose sans recoder par `FILM3D_USURE=0..1` (0,5 par défaut ; `--usure` dans le laboratoire) : chromes voilés et rayés, ternis dans les creux, vernis à micro-rayures circulaires, taches d'eau et gouttes sur le dessus, vitres voilées, poussière de route en bas de caisse, pneus mats ; ses cartes d'imperfections viennent d'ambientCG par `fetch.py`. `cast.py` les prend avec `FILM3D_HERO=w111` ou `slc` (le coupé actuel reste le défaut ; le conducteur assis n'est pas encore recalé sur leur volant).
- `lab/cast_people_render.py -- --only front,back,interior,final,situation` : les gens en studio de face, à contre-jour, le conducteur dans le coupé, les finalistes, les agents en situation derrière la patrouille (`ref/lab/`, et `assets/cast/lab-people.blend`). `interior` et `situation` n'ont pas encore été lancés.
- `lab/lieux_sheet.py -- --sheet port,pont,marina,rue,distribution` : les modèles de bibliothèque des lieux du parcours (`assets/lieux/<lieu>/<nom>/`) et les pièces ajoutées à la distribution, une vignette Workbench 480 × 360 par modèle tel que livré, chargé seul, avec triangles, emprise et plus grande texture en légende (`ref/lab/lieux-<planche>.png`). Une quinzaine de secondes et moins de 0,7 Go pour trois planches, sans Cycles.

Les planches comparatives citent aussi des candidats écartés que `fetch.py` ne télécharge pas ; un candidat s'essaie avec `lab/labfetch.py`, et `fetch.py` reçoit ensuite ce qui est retenu.
