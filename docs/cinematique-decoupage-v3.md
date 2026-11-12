# Découpage v3 de la poursuite

Remplace `docs/cinematique-decoupage-v2.md` pour les caméras, les durées et les raccords. Les lieux, les véhicules, la lumière et l'arc ne changent pas. Écrit le 12 novembre 2026 après le premier bout-à-bout v2 (`design/film/ref/iter/v2/bout-a-bout/planche-v2.png`).

## Le film en dix lignes

1. Un seul trajet : l'avenue, le rond-point, la rue des enseignes, le pont, le port, la jetée, la pointe. Chaque plan finit en montrant devant la berline le lieu du plan suivant.
2. Un seul repère : **le phare de la pointe**, une tour blanche de 16 m, une lanterne crème et deux pinceaux qui tournent. Il est à l'horizon dès OUV et grossit de plan en plan ; FIN s'arrête à son pied.
3. Derrière par défaut : sept plans sur neuf sont de dos. De face : P4 (la meute au 200 mm) et la fin de l'orbite de FIN6. FIN est de dos.
4. Le point de coupe : à chaque coupe, la berline a son centre vers x 50 %, y 55 %, et 40 à 45 % de la largeur du cadre.
5. La patrouille 1 (celle qui s'éveille en OUV) est toujours à gauche de la berline. Le nombre monte : une, deux, le barrage, la meute, l'hélicoptère, les avions.
6. Caméras lentes : panoramique 40°/s au plus au grand-angle, 3 m/s au plus de rapprochement ou d'éloignement, grue 2,5 m/s au plus, tout amorti. Un seul mouvement vif : le panoramique de P5.
7. Durées : OUV 40, P1 à P5 48 chacun, P6 60, FIN 52, FIN6 80 images.
8. Fichier `poursuite` : 340 images (14,2 s). Film à une étoile : 164 images (6,8 s). Film à six étoiles : 444 images (18,5 s).
9. Total à rendre : **472 images** (plafond 480).
10. Un événement par plan, en trois temps (mise en place, action, résultat), lisible sans le son à 390 px de large.

---

## 1. Ce qui change, et pourquoi

Le verdict de Jacques sur le bout-à-bout v2 : « pas assez long et on comprend rien, il y a pas de lien entre les plans », « on est toujours devant la voiture », « les mouvements de caméra sont parfois trop rapides ».

Ce que montre la planche v2 :

- Cinq plans sur neuf regardent la berline de face ou de profil (P1, P2, P4, P5, P6, plus FIN). Le sens de la course s'inverse à chaque coupe.
- Aucune coupe ne garde la berline au même endroit ni à la même taille : 55 % de large en P1, une bande de profil en P2, 20 % en FIN.
- Rien ne relie les lieux. On ne sait jamais où elle va.
- Mesure des caméras v2 (`python3 tools/film3d/motion.py mesure`) ; part derrière : OUV 100 %, P3 100 %, P5 57 %, FIN6 30 %, P1, P2, P4, P6 et FIN 0 %.

| Plan v2 | Mesure | Plafond v3 | Dépassement |
|---|---|---|---|
| P2 | panoramique 86°/s (fin de plan, la berline double la caméra) | 40°/s | ×2,1 |
| P5 | panoramique 116°/s (image 23), bascule 14°/s, accélération relative 32 m/s² | 75°/s (le seul vif), 12°/s, 4 m/s² | ×1,5 ; ×1,2 ; ×8 |
| P6 | bascule 29°/s, accélération relative 100 m/s² (départ de l'envol) ; montée 12,8 m/s | 12°/s, 4 m/s², 2,5 m/s | ×2,4 ; ×25 ; ×5 |
| FIN6 | orbite 109°/s | 30°/s | ×3,6 |
| P3 | accélération relative 126 m/s² (le coup de frein avant le barrage, image 24) | 4 m/s² | ×30 |
| P1 | accélération relative 30 m/s² (le rattrapage) | 4 m/s² | ×7 |
| P3, P6 | largeur de la berline 41 → 20 % et 41 → 17 % (elle se perd en fin de plan) | ≥ 30 % sur les deux tiers du plan | — |

Ce qui reste du v2 : les principes 1 (bas, près, grand-angle), 2 (la longue focale pour empiler, une fois), 3 (quelque chose défile près de l'objectif), 6 (rester du même côté), 9 (changer deux choses sur trois à la coupe, sauf la position de la berline), 10, 11 et 12 ; la règle des plans bas (centre de la berline entre 50 et 62 % de la hauteur quand la caméra est à 1 m ou moins) ; les sources. Le principe 4 (alterner voyage et fixe) est remplacé par « derrière par défaut ».

---

## 2. Les règles v3

### 2.1 Conventions

- Cadre : `x` depuis la gauche, en %. Le `y` du **centre de la berline** (fiches et tableau des coupes) se compte **depuis le haut** du cadre, comme la règle des plans bas (centre entre 50 et 62 % de la hauteur) : y 55 % la met un peu sous le milieu. Tous les autres `y` (phare, hélicoptères, avions, pylône, rampes) et la zone utile y 15–88 % se comptent **depuis le bas**. `motion.py mesure --v3` suit cette lecture (`CAM_Y_FROM_TOP = True`).
- « Largeur » : la largeur de la boîte de la berline projetée, en % de la largeur du cadre.
- Position de la caméra « par rapport à la berline » : « derrière d » = d mètres derrière son centre, **le long de sa vitesse** (pas de sa caisse : en glisse, la caisse tourne, la caméra reste derrière la route) ; « à gauche » = à gauche de sa route ; hauteur au-dessus du sol.
- Capteur 36 mm sur la hauteur, cadre 9:16 (comme `p5_virage.project`). Demi-champ horizontal : 21 mm 25,7°, 24 mm 22,9°, 200 mm 2,9°.
- Les deux images d'encre couvrent la dernière image du plan joué et la première de la fin : les raccords Pk → FIN se mesurent entre l'image N−1 de Pk et l'image 2 de FIN.

### 2.2 Derrière

- Une image est « derrière » quand l'angle entre (berline → caméra) et l'opposé de la vitesse de la berline est de 60° au plus. « De face » : 60° au plus de sa vitesse. Pour la berline arrêtée (FIN après l'arrêt, FIN6), on prend l'axe de sa caisse.
- Plans de dos : OUV, P1, P2, P3, P5, P6, FIN. Chacun passe au moins 80 % de ses images derrière (P2 et P5, les virages : 67 %).
- Plans de face : P4 (tout le plan) et FIN6 (ses 36 dernières images, l'orbite finit de trois quarts avant). Jamais deux de suite, jamais P1.
- Film à six étoiles : au moins 60 % des images derrière, au plus 25 % de face. Film à une étoile (OUV, P1, FIN) : au moins 85 % derrière.

### 2.3 Le lien à chaque coupe

- **Sens** : la berline s'enfonce dans l'image. Les deux plans de face sont dans l'axe (neutres), ils n'inversent pas la gauche et la droite. La patrouille 1 reste du côté gauche **de la berline** (en P4, de face, elle passe donc à droite de l'écran : c'est voulu).
- **Point de coupe** (dernière image d'un plan, première du suivant) : centre x 50 ± 6 %, y 55 ± 5 %, largeur 42 ± 8 %. Une seule exception : l'entrée de P4 (la longue focale démarre à 17 %), compensée par le pylône du pont, au centre des deux côtés de la coupe.
- **Le repère** : le phare (section 3).
- **Le lieu suivant** est visible devant la berline sur les 12 dernières images de chaque plan de dos (liste dans les fiches).
- **Les poursuivants** : la patrouille 1 est la même voiture d'OUV à FIN, toujours à gauche. Chaque plan ajoute un échelon et le montre dans le cadre de la berline.

### 2.4 Plafonds de caméra

Mesurés sur la caméra sans tremblé (`camera_rail(t)`, voir 6), en différences centrées sur trois images, à 24 i/s.

| Grandeur | Plafond | Amorti |
|---|---|---|
| Lacet (panoramique) | 0,8 largeur de cadre par seconde : 41°/s à 21 mm, 37°/s à 24 mm, 4,6°/s à 200 mm | accélération ≤ 1,2 largeur/s² (55°/s² à 24 mm) |
| Site (bascule) | 12°/s | ≤ 25°/s² |
| Roulis de la caméra | 3° au total, 6°/s | — |
| Orbite autour de la berline | 30°/s d'azimut | ≤ 40°/s² |
| Écart caméra–berline (caméra qui roule avec elle) | variation ≤ 3 m/s | accélération relative ≤ 4 m/s² |
| Accélération propre de la caméra | ≤ 8 m/s² | — |
| Grue (vitesse verticale) | ≤ 2,5 m/s | ≤ 3 m/s² |
| Focale | ≤ 4 %/s, ≤ 10 % sur le plan ; seul P4 zoome | — |
| Tremblé | 0,12° à 24 mm (× 24/focale) ; 0,3° sur 8 images au passage des avions (P6) | — |

**Le seul mouvement vif** : le panoramique de P5, jusqu'à 75°/s (1,45 largeur/s à 21 mm) pendant 16 images au plus, amorti en entrée et en sortie (accélération ≤ 3 largeurs/s²).

Chaque mouvement part et s'arrête avec une rampe d'au moins 6 images (vitesse et accélération continues). Une caméra qui roule avec la berline à distance constante a le droit de suivre ses accélérations à elle : c'est l'écart qui est plafonné.

---

## 3. Le repère : le phare de la pointe

**Choix** : `scene_d.py` n'a au bout de la pointe que le feu de musoir de FIN6 (3,8 m, invisible au-delà de 100 m). Il devient un phare. C'est le plus simple à poser : un tube, une lanterne émissive, deux cônes émissifs comme `scene_d.beam_cones`.

- **Le modèle** (`lieux.phare(at, scale=1, phase=0)`, nouveau) : tour de béton blanc cassé, 16 m, 1,6 m de diamètre au pied, 1,1 m en haut ; galerie sombre à 16 m ; lanterne crème `#fff9cb` de 16,2 à 17,4 m, forte (lisible à 2 km) ; deux pinceaux opposés, cônes émissifs de 1,5° de demi-angle et 400 m de long, crème très pâle, sans diffusion dans la brume (`visible_volume_scatter = False`), qui tournent à 45°/s (un tour en 8 s). Aucune inscription. Pas de corail ni de lilas (réservés aux rampes), pas de blanc bleuté (réservé aux hélicoptères).
- **Sa place** : sur le couronnement de la pointe, azimut 100°, à 28,7 m du centre : **(75,0 ; 458,3)**. Le feu de musoir est retiré (`pointe_musoir` remplacé par `lieux.phare`).
- **Dans les scènes du monde de l'eau** (C, D, E : même repère que `lieux.py`) : à sa vraie place, ajouté par `lieux.panorama(..., phare=True)` (vrai par défaut).
- **Dans les autres scènes** (A, F, B) : `lieux.phare_lointain(scene, cap, ecart, hauteur_deg, phase)` pose le même modèle à 600 m au plus, à l'échelle qui donne la taille voulue, sur l'horizon ou au-dessus des toits. Les pinceaux restent à leur longueur, à l'échelle.
- **Les pinceaux** : la phase est choisie par plan pour qu'un pinceau traverse le ciel du cadre pendant le plan, jamais à moins de 20° de l'objectif (pas d'éclair dans la caméra). Dans FIN6, ils sont gelés, un pinceau au-dessus de la berline.

**Taille de la tour à l'écran, plan par plan** (hauteur angulaire ; 1° ≈ 1,4 % de la hauteur à 24 mm) :

| Plan | Où | Hauteur | Images |
|---|---|---|---|
| OUV | sur l'horizon marin, 14° à droite de l'axe de l'avenue (x ≈ 80 %) | 1,0° | toutes |
| P1 | idem (x ≈ 75 %) | 1,2° | toutes |
| P2 | au-dessus des toits de la rue des enseignes (x ≈ 65 %) | 1,4° | 30 à 48 |
| P3 | au-delà du pont, à droite du pylône (x ≈ 62 %) | 1,8° | toutes |
| P4 | derrière la caméra : absent (sa lumière seule n'y est pas non plus) | — | — |
| P5 | à sa vraie place, 10° à droite de l'axe à l'approche (x ≈ 70 %) ; ses pinceaux dans le ciel ensuite | 2,2° | 1 à 20 |
| P6 | à sa vraie place, au-dessus du toit de la berline (x ≈ 47 %, y ≈ 64 %) | 4° → 5° | toutes |
| FIN | à sa vraie place, tour entière, lanterne à y ≈ 77 % | 26° | toutes |
| FIN6 | au bord gauche au départ de l'orbite, puis hors champ | — | 1 à 15 |

La berline ne le cache jamais : il doit être à plus de 9° de son centre ou au-dessus de son toit (d'où la caméra de P6 à 1,6 m).

---

## 4. Les fiches

Vitesses gardées : avenue 50 km/h (le bond de P1 jusqu'à 62), rond-point 70, rue des enseignes 106 à 118, pont 120, port 85 puis 70, jetée 120, pointe 45 puis l'arrêt.

**Les routes** (ce que les plans v3 parcourent, caméra comprise, contre ce qui est construit) :

| Lieu | Construit | Utilisé en v3 | À faire |
|---|---|---|---|
| Avenue (`scene_a`) | chaussée y −30 à 900, immeubles jusqu'à y ≈ 620 | OUV y 236 à 267, P1 y 280 à 320 ; regard jusqu'à l'îlot posé en y 440 | rien à allonger ; poser l'îlot |
| Rond-point (`scene_f`) | branches de 30 m (bord du décor à 46 m du centre) ; avenue nord jusqu'à y 400 | branche sud de y −39 à −28, arc jusqu'à 65° ; regard vers l'ouest jusqu'à 200 m | **rue des enseignes à prolonger de x −46 à x −200 (154 m)**, angles nord-ouest et sud-ouest |
| Rue des enseignes (`scene_b`) | chaussée y 1 à 162, puis quai et pont | y 64,5 à 134 | rien |
| Pont (`scene_c`) | crête en y −130, pied en y −5 | berline y −101 à −35 ; meute jusqu'à y −320 au départ | vérifier le tablier jusqu'à y −320 (environ 190 m au-delà de la crête) |
| Port (`scene_e`) | terre-plein y −20 à 100, quai x −7 à 87 | y 44 à 72,5, x 0 à 24 | rien ; jetée « loin » au panorama |
| Jetée et pointe (`scene_d`) | jetée y 100 à 400, pointe de 30 m de rayon | P6 y 233 à 322 ; FIN y 415 à 430 | rien ; regard vers +y (côté mer) à habiller |

### OUV — La patrouille garée s'éveille (40 images)

- **Événement** : la berline passe devant une patrouille garée ; dans son dos, la rampe s'allume.
- **Temps** : 1–12, l'avenue au crépuscule, la patrouille garée à l'angle (devant à gauche, x 25–35 %), le phare sur l'horizon marin. 14, ses phares s'allument. 24–32, elle glisse hors du bord gauche. 34, sa rampe s'allume hors champ : corail et lilas sur les façades de gauche, la chaussée mouillée et le flanc gauche de la berline. 37–40, les feux stop de la berline s'allument quatre images : elle a vu.
- **Caméra** : image 1, 8,0 m derrière, 0,6 m à gauche, 0,55 m, 24 mm, site +4,5°. Image 20, 8,8 m derrière. Image 40, 9,6 m derrière. Rail à la vitesse de la berline moins 1 m/s, sans rotation. Max : écart 1 m/s. Lacet recalé pour le centre à x 50 %.
- **Berline** : début x 50, y 54, largeur 39 % ; fin x 50, y 54, largeur 34 % (mesure v2 : 39 → 33 avec la même caméra).
- **Poursuivants** : la patrouille 1, garée, à gauche ; puis sa lumière.
- **Lien d'entrée** : l'ouverture du film. **Sortie vers P1** : même avenue, même hauteur, caméra du même côté, la rampe déjà allumée ; P1 la montre. (OUV n'est jamais suivi de FIN.)
- **Lieu suivant devant** : l'avenue, et au bout l'îlot du rond-point (petit, 140 m).
- **Travaux** :
  - `ouv_avenue.py` : `FRAMES = 40` ; `Y0 = PATROL[1] - 20.0` (elle part 20 m avant la patrouille, la caméra la dépasse vers l'image 30) ; `WAKE = 14` ; nouvelle constante `BARS_ON = 34` (rampe de la patrouille garée) ; `BRAKE = (37, 40)` (feux stop) ; `CAM_YAW` recalé pour x 50 %.
  - `scene_a.py` : la rampe de la patrouille garée à `BARS_ON` (`lieux.flash_bars`), liée pour éclairer la berline ; clés des feux stop ; `lieux.phare_lointain` (14° à droite, 1,0°) ; l'îlot du rond-point posé sur l'axe de l'avenue à y 440 (îlot de 12 m, bordure éclairée, grand palmier, lampadaires ; repris de `scene_f.build_island`), marquages arrêtés 20 m avant.
- **Risque** : le phare caché par le mur de promenade et les palmiers à 0,55 m de haut. **Repli** : le poser sur un cap sombre (base à 0,5° au-dessus de l'horizon) et monter à 1,3°.

### P1 — La patrouille fond sur elle, elle bondit (48 images)

- **Événement** : la patrouille remonte la berline par la gauche et entre dans le cadre ; la berline bondit.
- **Ellipse** depuis OUV : 1,5 s (au lieu de 2,5). La patrouille a fait demi-tour et roule derrière, rampe allumée.
- **Temps** : 1–10, la patrouille hors champ, 14 m derrière la berline ; ses phares jettent l'ombre de la berline devant elle, ses éclats battent sur la caisse. 10, elle accélère (6 m/s², jusqu'à 85 km/h), à cheval sur la double ligne (x −0,6, 2,35 m à gauche de la berline). 24–30, son capot puis sa rampe entrent par le bord gauche. 32, la berline bondit (4 m/s²). 34, la patrouille plafonne à sa vitesse. 36–44, la berline soulève les papiers à sa droite. 48, la patrouille tient le bord gauche.
- **Caméra** : image 1, 7,0 m derrière, 0,4 m à gauche, 0,6 m, 24 mm, site +4°. Image 24, idem. Image 48, 8,5 m derrière (lâchée à partir de 32). Rail ; max écart 2,5 m/s, lacet 3°/s.
- **Berline** : début x 52, y 54, largeur 44 % ; fin x 58, y 54, largeur 38 %.
- **Poursuivants** : la patrouille 1, à gauche ; à la fin, x 0–26 %, rampe à y 65–72 %, son nez 5 m derrière le centre de la berline.
- **Sortie vers P2** : la berline au centre droit, la patrouille au bord gauche, l'îlot du rond-point devant (120 m, centre x 50, y 58), le phare. **Sortie vers FIN** (film à une étoile) : FIN s'ouvre de dos, même hauteur, berline au centre ; le phare, petit à l'horizon, est soudain là, immense : elle est arrivée.
- **Travaux** :
  - `p1_avenue.py` : caméra de dos (remplace la caméra de face) ; `FRAMES = 48`, `ELLIPSIS = 1.5`, `T_GO = t_of(32)`, `GAP0 = 14.0`, `T_PUSH = t_of(10)`, `PUSH = 6.0` plafonné à 85 km/h puis aligné sur la berline à 34 ; la patrouille à x −0,6 dès l'image 1 (`PULL_OUT` devient une position, plus une glissade) ; `bars_on` vrai dès l'image 1 ; `PAPERS` reposés 20 m devant, à 1,4 m à droite de sa ligne ; `PUDDLE` retiré (la flaque ne se voit pas de dos).
  - `scene_a.py` : l'îlot à y 440 (voir OUV) ; les phares de la patrouille pleins (plus de veilleuse) et liés pour faire l'ombre de la berline ; `phare_lointain` à 1,2°.
- **Risque** : le flanc de la patrouille passe à 0,95 m de l'objectif, flou et noir sur la moitié gauche. **Repli** : caméra 0,9 m à droite de la berline ; la patrouille entre alors par le bord gauche à 3 m de l'objectif.

### P2 — Le dérapage, sous le nez de la deuxième patrouille (48 images)

- **Événement** : la berline jette sa glisse autour de l'îlot ; une deuxième patrouille surgit de l'avenue nord pour lui couper la route et la rate.
- **Trajectoire** : arc de 30 m à gauche (inchangé), 70 km/h, de s = −4 m à s = +34 m (de 0 à 65° d'arc). Glisse installée à 12° de 1 à 6, jetée à 25° de 6 à 10, tenue jusqu'à 34, rattrapée à 8° de 34 à 48 avec la remise des gaz.
- **Temps** : 1–6, l'approche, l'îlot et son palmier devant à droite. 6–10, le coup de volant. 14, la patrouille 2 débouche de l'avenue nord, derrière les palmiers de l'îlot, rampe allumée. 14–22, elle freine en travers et s'arrête dans la bouche nord, à 8 m au moins de la trajectoire. 10–34, la berline glisse, flanc gauche visible, fumée des pneus arrière qui part à sa droite. 34–48, elle se redresse vers la rue des enseignes ; la patrouille 1 revient par la gauche ; la patrouille 2 repart, bord droit.
- **Caméra** : image 1, 7,0 m derrière, 1,5 m à gauche (à l'intérieur du virage), 0,5 m, 21 mm, site +4°. Image 24, idem, lacet 36°/s. Image 48, 7,5 m derrière, 1,2 m à gauche. Suiveur amorti (constante 0,25 s) sur la route de la berline décalée vers l'intérieur. Max : lacet 40°/s, accélération de lacet 55°/s², écart 1 m/s.
- **Berline** : début x 50, y 55, largeur 40 % ; au plus fort de la glisse x 52, largeur 55 % ; fin x 52, y 55, largeur 44 %.
- **Poursuivants** : la patrouille 1 au bord gauche à l'image 1 (son nez 2 m devant l'objectif), elle freine à l'entrée et sort du cadre vers 10, coupe 2 m plus serré (arc de 28 m) et revient par la gauche de 38 à 48 ; la patrouille 2 devant à droite de 14 à 48.
- **Effets** : la fumée et la gerbe à droite de la berline (x 60–95 %), jamais entre elle et l'objectif.
- **Sortie vers P3** : devant, la bouche de la rue des enseignes, guirlandes et enseignes allumées, sur 150 m ; le phare au-dessus des toits. **Sortie vers FIN** : de dos à de dos, berline au centre.
- **Travaux** :
  - `p2_arc.py` : `FRAMES = 48` ; abscisses de s = −4 à +34 (remplace `THETA0`, `THETA1`) ; `DRIFT = 25.0` et le profil de glisse aux images ci-dessus ; nouvelle caméra `chase_cam(t)` (remplace `low_cam_pos`, `low_cam_aim`) ; `GAP1 = 7.5` au départ, la patrouille 1 sur un arc de 28 m qui freine à 8 m/s² pendant 0,5 s à l'entrée ; trajectoire de la patrouille 2 (de l'avenue nord vers la bouche nord, arrêt en travers à 22, départ à 44). Contrôle des écarts (`M.min_gap`) : 1,5 m au moins entre les caisses.
  - `scene_f.py` (le plus lourd du film) : la branche ouest devient l'entrée de la rue des enseignes, prolongée de x −46 à x −200 (façades à boutiques du kit de `scene_b`/`facade_b`, enseignes aux seuls mots génériques, guirlandes en travers, lampadaires, voitures garées) ; les angles nord-ouest et sud-ouest bâtis à hauteur de voiture ; l'avenue nord vue de biais (déjà là, à vérifier depuis 0,5 m) ; la patrouille 2 posée ; `phare_lointain` à 1,4°.
  - `scene_carrefour.py` : la caméra basse v2 retirée, `chase_cam` posée.
- **Risque** : à 37°/s le décor file vite au premier plan droit. **Repli** : partir à s = +4 (approche raccourcie) et ne couvrir que 50° d'arc, lacet 30°/s.

### P3 — Le barrage, elle passe, nous aussi (48 images)

- **Événement** : la berline force le barrage par le trou des plots ; la caméra passe à sa suite entre les deux patrouilles.
- **Trajectoire** : la berline de y 71,5 à y 134 (62 m), 106 km/h puis la remise des gaz. La rue suffit : la chaussée va de y 1 à y 162 (93 m derrière le départ v2 en y 94, 33,6 m devant sa fin en y 128,4) ; la caméra part de y 64,5, la berline finit 28 m avant le quai. Rien à allonger.
- **Temps** : 1–16, le barrage visible dès l'image 1 au fond de la rue (rampes et leurs reflets sur la chaussée mouillée, x 45–55 %, y 52–58 %), il grossit au-dessus du toit. 16–30, la feinte à droite, les agents tirent (images 22, 28, 34). 30, elle revient dans l'axe ; 36, elle remet les gaz ; 38, les agents plongent derrière leurs portières. 40, elle passe entre les plots (0,33 m à gauche, 0,83 m à droite). 45, la caméra passe à son tour ; les deux patrouilles balaient les bords. 48, devant : le quai, le pont qui monte, le pylône.
- **Caméra** : image 1, 7,0 m derrière, 0,6 m à gauche, 1,9 m, 21 mm, site −1,5°, visée 0,9 m à droite. Image 24, 6,2 m derrière, 1,6 m (descente commencée à 16). Image 38, 5,8 m derrière, 0,7 m, site +5°. Image 48, 6,5 m derrière, 0,7 m. Plus de freinage : la caméra garde sa vitesse à partir de 30, la berline s'éloigne. De 30 à 36 elle rejoint l'axe du trou (x −0,25) et y reste. Max : grue 1,5 m/s, écart 1 m/s, site 8°/s.
- **Berline** : début x 50, y 48, largeur 38 % ; fin x 50, y 55, largeur 40 %.
- **Poursuivants** : la patrouille 1 au bord gauche à l'image 1 (x 0–15 %, 6 m derrière la berline), elle lâche et sort du cadre vers 12 ; le barrage : deux patrouilles et deux agents.
- **Sortie vers P4** : le pont et son pylône au centre (x 50, y 72), la berline au centre : P4 s'ouvre sur le même pylône. **Sortie vers FIN** : de dos à de dos.
- **Travaux** :
  - `p3_enseignes.py` : `FRAMES = 48` ; `Y_LAST = 134.0` (donc `Y_START` ≈ 71,5) ; `T_KICK = (t_of(30), t_of(38))` ; `Y_FEINT = (80, 100)`, `Y_AIM = (100, 119.5)` ; `SHOTS = {0: (22, 34), 1: (28, 34)}` ; `COVER` à couvert à 38 et 39 ; `_build_cam` sans freinage, `CAM_SIDE` et `AIM_RIGHT` ramenés à 0 de 30 à 36, descente de 16 à 38 ; `CHASE` = la patrouille 1, x −2,4, 6 m derrière au départ, 27 m/s.
  - `scene_b.py` : les rampes du barrage lisibles de dos à 55 m dès l'image 1 (énergie, reflets) ; aucune flaque de y 116 à 130 dans l'axe (la caméra y passe à 0,7 m) ; les agents et les capots vus à 1,3 m de l'objectif (détail, matières) ; `phare_lointain` à droite du pylône, 1,8°.
- **Risque** : à 1,3 m, les agents et les plots montrent leur modèle. **Repli** : la caméra monte de 0,7 à 1,4 m de 38 à 45 et passe au-dessus des plots et des capots.

### P4 — La meute passe la crête, une rampe après l'autre (48 images, de face)

- **Pourquoi de face** : c'est le plan jugé le plus fort des trois premiers en v2 ; la longue focale n'empile la meute derrière la berline que de face. Il est seul de son côté : P3 et P5 sont de dos.
- **Événement** : la berline descend la rampe vers nous ; derrière elle, les patrouilles franchissent la crête l'une après l'autre.
- **Trajectoire** : la berline de y −101 à y −35 (de 111 à 45 m de l'objectif), 120 km/h. Cinq patrouilles et le fourgon comme en v2, plus quatre qui passent la crête aux images 8, 18, 28 et 38 : on compte six rampes au début, dix à la fin.
- **Caméra** : fixe en (1,2 ; 10,0 ; 1,2), 17 m plus près que la v2. 200 mm à l'image 1, 212 mm à l'image 48 (3 %/s). Lacet de suivi ≤ 2°/s, site de suivi ≤ 0,6°/s pour garder le centre de la berline entre 52 et 56 % de la hauteur. Tremblé 0,05°.
- **Berline** : début x 50, y 56, largeur 17 % ; fin x 50, y 52, largeur 44 %.
- **Poursuivants** : la meute empilée sur la rampe jusqu'à la crête ; la patrouille 1 en tête, à gauche de la berline (à droite de l'écran), 25 m derrière elle.
- **Lien d'entrée** : P3 finit sur le pylône au centre, P4 s'ouvre avec le pylône au centre haut (x 50, y 70) et la berline au centre, petite. Le saut de taille (40 → 17 %) est la seule entorse au point de coupe.
- **Sortie vers P5** : de face à de dos dans l'axe ; la berline reste au centre, de 44 à 40 % ; la lumière crème du port, qui lèche sa calandre de 36 à 48, est celle que P5 montre. **Sortie vers FIN** : même chose, l'axe s'inverse à travers l'encre.
- **Travaux** :
  - `p4_pont.py` : `FRAMES = 48` ; `CAM = (1.2, 10.0, 1.2)` ; `D0 = 146.0` (berline en y −101 à l'image 1) ; quatre entrées de plus dans `PACK`, écarts réglés pour passer la crête (y −130) aux images 8, 18, 28, 38 ; zoom +6 % sur 2 s ; suivi en site.
  - `scene_c.py` : vérifier que le tablier existe au-delà de la crête jusqu'à y −320 (les quatre nouvelles patrouilles y roulent avant d'apparaître) ; la tour d'éclairage crème du port, derrière la caméra, liée, qui monte de 0 à sa force sur les images 36 à 48 et ne touche que la calandre et le tablier.
- **Risque** : 17 % au début, la berline se lit mal. **Repli** : berline de y −90 à −24 (de 100 à 34 m), 19 % puis 58 %, et zoom arrière de 6 % au lieu d'avant.

### P5 — L'hélicoptère fond sur le quai, elle glisse dessous (48 images)

- **Événement** : la berline vire à droite en glisse au bout du pont ; un hélicoptère plonge sur le quai devant elle, faisceau sur elle.
- **Trajectoire** : la berline part de (3,5 ; 52) à 85 km/h, freine à 70, entre dans l'arc à l'image 10 (y 61), arc de 12 m de 10 à 36 (glisse −20°, −42°, −10° comme en v2), sort sur la voie du quai de 36 à 48 en accélérant, finit vers (24 ; 72,5).
- **Temps** : 1–10, l'approche ; l'hélicoptère arrive de l'est au-dessus des conteneurs (devant à droite) ; le phare à droite de l'axe. 4–12, la patrouille 1 double la caméra par la gauche. 10–36, la glisse ; la patrouille 1 freine, ne prend pas le virage, s'arrête vers les séparateurs à 30. 24, le faisceau la trouve. 36–48, elle file sur le quai, l'hélicoptère devant elle, à 9 m, nez vers elle.
- **Caméra** : image 1, 8,0 m derrière, 1,0 m à gauche, 2,0 m, 21 mm, site −4°. Image 10, 8,0 m derrière (elle freine à 6 m/s² au plus avec la berline). De 10 à 46, elle quitte la ligne de la berline : arc de 30 m de rayon à droite, à 13–15 m/s, et panoramique qui garde la berline. Lacet total ≈ 70° ; **le seul mouvement vif du film** : crête ≤ 75°/s sur 16 images au plus, ailleurs ≤ 40°/s. Grue de 2,0 à 2,6 m. Image 48, caméra vers (10 ; 70 ; 2,6), berline 12–14 m devant, de trois quarts arrière gauche. Caméra à 2 m au moins des séparateurs (y 80,6) et à 0,8 m au moins des poteaux de la chaîne.
- **Berline** : début x 50, y 54, largeur 40 % ; au plus fort de la glisse largeur 60 % (le flanc gauche qui chasse vers l'objectif) ; fin x 56, y 52, largeur 36 %.
- **Poursuivants** : la patrouille 1 à gauche de 4 à 30 ; la meute par ses phares (l'ombre de la berline projetée devant elle) ; l'hélicoptère, nouveau, devant. À l'image 48 : hélicoptère x 55, y 76, le faisceau qui relie les deux.
- **Sortie vers P6** : devant, le quai vers l'est, au fond à gauche la file des lampadaires de la jetée ; un pinceau du phare traverse le ciel. **Sortie vers FIN** : de dos, l'hélicoptère devant ; FIN reprend un hélicoptère devant elle.
- **Travaux** :
  - `p5_virage.py` : caméra nouvelle (rail puis arc et panoramique ; plus de pied fixe) ; `FRAMES = 48` ; `V0 = 23.6` freinée à 19,4 à l'entrée ; départ en y 52 (remplace `D0`) ; `HELI_PATH` de (70 ; 40 ; 22) à (40 ; 72 ; 9), 25 à 30 m devant elle à la fin ; `beam_target` sur elle dès 24 ; la patrouille 1 dans `PACK_START` (x −2,4, qui double la caméra puis freine) ; le reste de la meute à 30 m derrière au moins.
  - `scene_e.py` : `L.panorama(..., jetty="loin", phare=True)` (aujourd'hui `jetty` vaut None) ; le décor des 40 derniers mètres de la voie du pont vu de dos à 2 m (séparateurs, chaîne, mâts) ; l'est du quai à hauteur de voiture jusqu'à x 87 (déjà construit) ; les phares de la meute, derrière, liés pour faire l'ombre de la berline.
- **Risque** : le flou du panoramique vif efface la glisse. **Repli** : 18 mm, crête à 60°/s.

### P6 — Deux avions rasent la jetée et ferment le ciel au-dessus de la pointe (60 images)

- **Événement** : sous trois hélicoptères, la berline file vers la pointe, un cul-de-sac entouré d'eau ; deux avions arrivent de derrière nous, passent au-dessus de tout et s'écartent au-dessus de la pointe. Ils ne tirent rien.
- **Trajectoire** : la berline de y 240 à y 322 (82 m), 120 km/h, voie de droite (x 81,75).
- **Temps** : 1–20, la jetée, l'eau des deux côtés, la pointe et le phare droit devant ; les hélicoptères devant et au-dessus d'elle, faisceaux sur elle ; la colonne par ses lumières. 20, la patrouille 1 entre par la gauche (voie de gauche). 26–30, les avions entrent par le haut du cadre, la caméra tremble. 30–44, ils filent vers la pointe et rapetissent. 28–60, la caméra monte ; 44–60, les avions s'écartent à gauche et à droite et montent au-dessus de la mer ; la pointe se découvre : plus d'issue.
- **Caméra** : image 1, 7,0 m derrière, 1,0 m à gauche (x 80,75), **1,6 m** (au ras du toit : le phare reste au-dessus de lui), 24 mm, site −8°. Image 28, idem (rail à sa vitesse). Image 60, 8,0 m derrière, 3,6 m, site −16°. Grue de 28 à 60. Max : grue 2,4 m/s, écart 1,2 m/s, site 7°/s ; tremblé 0,3° de 26 à 34.
- **Berline** : début x 50, y 52, largeur 42 % ; fin x 50, y 50, largeur 37 %.
- **Poursuivants** : la patrouille 1, voie de gauche, de 14 à 6 m derrière la berline, au bord gauche à partir de 20 (x 0–22 %, rampe en amorce) ; la colonne derrière, par ses lumières ; trois hélicoptères devant, en (72 ; +16 ; 8), (90 ; +24 ; 9,5), (80 ; +38 ; 12) (x monde ; y devant la berline ; hauteur), à y 75–80 % du cadre ; deux avions.
- **Sortie vers FIN6** : de dos en hauteur à l'orbite basse de trois quarts arrière gauche : même côté, berline au centre, de 37 à 44 %. (P6 n'est jamais suivi de FIN.)
- **Travaux** :
  - `p6_jetee.py` : `FRAMES = 60` ; la caméra v3 remplace `camera_path` (et `camera_grue`, `camera_v1`, `key_camera_v1` sont retirées) ; `HELIS` devant, avec leur hauteur ; `beam_target` 2 m **devant** la berline (la tache claire au-delà d'elle, plus entre elle et l'objectif) ; `JETS` à 24 et 28 m, x 70 et 90, qui passent au-dessus de la caméra vers l'image 24 et au-dessus de la pointe vers 44, puis s'écartent (cap ±25°) et montent ; `COLUMN[1]` = la patrouille 1, voie de gauche, 14 m puis 6 m ; `STILL_FRAME` recalé.
  - `scene_d.py` `plan_P6` : `lieux.phare` à (75,0 ; 458,3) ; la pointe vue de la jetée à 1,6–3,6 m (couronnement, garde-corps, bornes, l'eau, la marina) ; le ciel vers +y (côté mer, jamais vu jusque-là) avec une bande d'horizon et les feux lointains de l'autre rive ; projecteurs des hélicoptères tournés vers l'arrière et le bas ; lumières de la colonne derrière la caméra, liées.
- **Risque** : les hélicoptères touchent les 12 % du haut quand la caméra monte. **Repli** : grue jusqu'à 3,0 m seulement, site −14°.

### FIN — Cernée au pied du phare, les mains levées (52 images, une à cinq étoiles)

- **Pourquoi de dos** : les mains se lisaient mal derrière le reflet du pare-brise en v2 ; en contre-jour, vues par la lunette arrière et la vitre du conducteur contre le faisceau et les phares, elles deviennent des silhouettes, ce qui se lit le mieux sur un téléphone. Et le film à une étoile reste de dos de bout en bout.
- **Événement** : la berline glisse sur la pointe et s'arrête, bloquée par l'eau, deux patrouilles et l'hélicoptère ; le conducteur lève les mains.
- **Trajectoire** : elle entre à 45 km/h, glisse sur 7,8 m (1 g), son cap passe de 0 à 25° (comme `scene_d.slide_pose`), arrêt au centre de la pointe à l'image 30.
- **Temps** : 1–30, la glisse, la fumée des pneus à côté d'elle. 6–20, la patrouille 1 double la caméra par la gauche et s'arrête à gauche de la berline, à 4,5 m de son flanc, un peu en arrière de son essieu arrière ; portière ouverte, son agent vise la vitre du conducteur, de côté (jamais vers l'objectif). La patrouille de la v2, déjà arrêtée à droite et un peu en avant, portière ouverte, agent accroupi qui se redresse à 32. L'hélicoptère devant, bas (8 m), 22 m devant la berline, face à elle ; son faisceau se pose sur elle à 30. 30–35, temps mort, seules battent les rampes. 35–46, les mains montent lentement, en silhouette. 46–52, on tient. Les trois poursuivants de la v2 arrivent derrière la caméra : seulement leurs phares, qui projettent l'ombre de la berline vers le phare.
- **Caméra** : image 1, 7,0 m derrière, 1,2 m à gauche, 0,6 m, 24 mm, site +4°. Image 30, 5,3 m derrière (la caméra freine à 8 m/s², la berline à 10). Image 37, arrêt de la caméra, 5,0 m derrière. De 37 à 52, grue de 0,6 à 1,3 m (≤ 0,9 m/s), glissement à gauche de 1,2 à 2,4 m (contournement d'environ 12°, ≤ 10°/s), site de +4 à −2°. Image 52, fixe.
- **Berline** : début x 50, y 55, largeur 44 % ; fin x 50, y 55, largeur 50 %.
- **Le phare** : tour entière, x ≈ 40 %, lanterne à y ≈ 77 %.
- **Liens d'entrée** : depuis P1, P2, P3, P5, de dos à de dos, au point de coupe ; depuis P4, l'axe s'inverse à travers l'encre (neutre). Le phare, qu'on a vu grandir, est là.
- **Travaux** :
  - `fin_pointe.py` : `FRAMES = 52` ; caméra nouvelle (suiveur arrière, arrêt, grue) ; `SLIDE_D = 7.8`, `F_STOP = 30`, vitesse d'entrée 12,5 m/s ; `DRIVER_KEYS = (35, 46)` ; `OFFICER_KEYS = [(20, "crouch"), (32, "aim")]` ; trajectoire de la patrouille 1 ; `focus_point` sur la lunette arrière.
  - `scene_d.py` `plan_FIN` : `lieux.phare` ; la vue vers +y (le côté mer de la pointe, l'horizon, l'autre rive) ; l'hélicoptère déplacé devant ; habitacle éteint, gants et manches sombres pour la silhouette (`lieux.hands_up`, `lab/cast_people.py`) ; la lunette arrière sans la tache blanche (chez l'agent de la berline, `lab/hero_cars.py`) ; phares des poursuivants derrière la caméra, liés.
- **Risque** : les mains illisibles à travers la lunette. **Repli** : le cadre de face validé en v2, avec le nouveau minutage sur 52 images (FIN n'est jamais dans le film à six étoiles, la règle des plans de face n'en souffre pas).

### FIN6 — Le temps gelé, toute la ville autour d'elle (80 images, six étoiles)

- **Événement** : le temps est gelé ; la caméra fait le tour de la berline cernée, du trois quarts arrière au trois quarts avant, et finit sur les mains levées.
- **Caméra** : orbite de **9,5 m** de rayon, 0,35 m, 18 mm, visée à 1,4 m. Azimut de 245° (trois quarts arrière gauche) à 160° (trois quarts avant gauche) : 85°. 30°/s constants des images 1 à 56, puis amorti sur les 24 dernières (rampe en cosinus), vitesse et accélération nulles à 80. Max : 30°/s.
- **Berline** : début x 50, y 54, largeur 44 % ; fin x 50, y 54, largeur 46 %.
- **Poursuivants** : l'anneau (dix patrouilles et le fourgon) à 14,5 m, les agents à 12,0 m (10,6 m en v2 : trop près de l'orbite à 9,5 m) ; trois hélicoptères et leurs cônes ; les deux avions gelés haut au-dessus de la mer, qui s'écartent (visibles en haut des premières images, sous les 88 %).
- **Le phare** : au bord gauche de 1 à 15, puis hors champ ; ses pinceaux gelés.
- **Lien d'entrée** : P6 finit de dos, en hauteur, la berline au centre ; FIN6 repart de trois quarts arrière, du même côté gauche, au ras du sol, déjà en mouvement.
- **Travaux** :
  - `fin6_orbite.py` : `FRAMES = 80` ; `ORBIT_R = 9.5`, `ORBIT_Z = 0.35`, `AIM_Z = 1.4` ; `A0, A1 = 245.0, 160.0` ; `ease` remplacé par la loi vitesse constante puis amorti ; `RING_R = 14.5`, `COP_R = 12.0`.
  - `scene_d.py` `plan_FIN6` : `lieux.phare` à la place de `pointe_musoir` ; vérifier que le lampadaire (azimut 313°) reste hors de l'arc ; les avions gelés (optionnel).
- **Risque** : de trois quarts avant gauche, les mains derrière le reflet du pare-brise. **Repli** : arc de 200° à 115° (départ de profil, fin presque de face) ; la coupe depuis P6 change alors de 90°, ce qui reste neutre.

---

## 5. Les coupes

Valeurs : centre x, centre y, largeur, à la dernière image du plan sortant puis à la première du plan entrant (pour FIN, l'image 2).

| Coupe | Berline (sortant → entrant) | Ce qui raccorde |
|---|---|---|
| OUV → P1 | 50/54/34 → 52/54/44 | même avenue, même hauteur, caméra à gauche ; la rampe allumée en fin d'OUV bat sur la caisse au début de P1 |
| P1 → P2 | 58/54/38 → 50/55/40 | l'îlot vu au bout de l'avenue est là, devant ; la patrouille 1 au bord gauche des deux côtés |
| P2 → P3 | 52/55/44 → 50/48/38 | la bouche de la rue des enseignes devant, puis dedans ; la patrouille 1 au bord gauche ; la hauteur change (0,5 → 1,9 m) |
| P3 → P4 | 50/55/40 → 50/56/17 | le pylône au centre des deux côtés ; de dos à de face dans l'axe ; seule entorse de taille |
| P4 → P5 | 50/52/44 → 50/54/40 | de face à de dos dans l'axe ; la lumière crème du port ; la meute devient l'ombre projetée devant elle |
| P5 → P6 | 56/52/36 → 50/52/42 | la jetée vue au fond à gauche, puis dessus ; un hélicoptère devant, puis trois ; la patrouille 1 à gauche |
| P6 → FIN6 | 50/50/37 → 50/54/44 | de dos à trois quarts arrière du même côté ; en hauteur puis au ras du sol ; la caméra déjà en mouvement |
| P1 → FIN | 58/54/38 → 50/55/44 | de dos à de dos ; la patrouille 1 à gauche ; le phare, minuscule, devient immense |
| P2 → FIN | 52/55/44 → 50/55/44 | de dos à de dos, même taille |
| P3 → FIN | 50/55/40 → 50/55/44 | de dos à de dos ; 0,7 → 0,6 m |
| P4 → FIN | 50/52/44 → 50/55/44 | de face à de dos dans l'axe, à travers l'encre |
| P5 → FIN | 56/52/36 → 50/55/44 | de dos à de dos ; l'hélicoptère devant elle des deux côtés |

---

## 6. Ce que `test_motion.py` vérifie

Chaque fichier de plan expose `camera_rail(t)` : la caméra sans tremblé (mêmes sept valeurs que `camera(t)`). `motion.py` gagne `frame_box(cam, pose, dims)` (la projection de `p5_virage.frame_box`, généralisée) et `behind_angle(cam, pose)`.

Les constantes en tête de `test_motion.py` (mesurées par `motion.py mesure`) :

```python
CAM_PAN_MAX = 40.0      # °/s, panoramique, focales de 28 mm et moins (0,8 largeur de cadre par seconde)
CAM_TILT_MAX = 12.0     # °/s, bascule
CAM_VREL_MAX = 3.0      # m/s, variation de l'écart caméra-berline (caméras qui roulent avec elle)
CAM_AREL_MAX = 4.0      # m/s², accélération de la caméra par rapport à la berline
CAM_BEHIND_MIN = 0.80   # part des images derrière (60° ou moins de l'arrière de sa route)
CAM_LIMITS_PLAN = {
    "P2": {"pan": 41.0, "behind": 0.67},                     # 21 mm, le virage de 30 m
    "P4": {"pan": 4.6, "vrel": None, "arel": None, "behind": 0.0},   # fixe, 200 mm, de face
    "P5": {"pan": 75.0, "pan_frames": 16, "behind": 0.67},   # le seul mouvement vif du film
    "FIN6": {"behind": 0.0, "orbit": 30.0},                  # orbite, berline arrêtée
}
```

1. **Durées** : `FRAMES` de chaque fichier égale à `cut.ts` (OUV 40, P1 à P5 48, P6 60, FIN 52, FIN6 80) et à `render_film.FALLBACK_FRAMES`.
2. **Derrière** (`CAM_BEHIND_MIN`) : part des images à 60° ou moins de l'arrière (section 2.2) : ≥ 80 % pour OUV, P1, P3, P6, FIN ; ≥ 67 % pour P2 et P5. Film à six étoiles ≥ 60 % derrière et ≤ 25 % de face ; film à une étoile ≥ 85 % derrière. P1 : aucune image de face.
3. **Vitesses** (sur `camera_rail`, différences centrées sur trois images) : `CAM_PAN_MAX` (× 24/focale au-delà de 28 mm), `CAM_TILT_MAX`, `CAM_VREL_MAX`, `CAM_AREL_MAX`, et les autres plafonds de 2.4 (grue 2,5 m/s, orbite 30°/s, focale 4 %/s). Une seule fenêtre de dépassement de `CAM_PAN_MAX` dans tout le film : P5, ≤ 16 images, ≤ 75°/s.
4. **Raccords** : pour chaque ligne du tableau 5, |Δx| ≤ 8 points, |Δy| ≤ 6 points, rapport des largeurs entre 0,75 et 1,33 ; P3 → P4 ne vérifie que x et y.
5. **Cadre** : la boîte de la berline dans y 15–88 % sur 90 % des images au moins ; centre entre 50 et 62 % de la hauteur quand la caméra est à 1 m ou moins (sauf P4, 52–56 %) ; largeur ≥ 30 % sur les deux tiers de chaque plan, sauf P4 (≥ 17 %).
6. **Le phare** : sa lanterne projetée dans x 5–95 %, y 15–88 %, hors de la boîte de la berline, sur les images du tableau 3.
7. **Aucune collision** : `M.min_gap` ≥ 1,5 m entre caisses sur chaque plan, nouvelles trajectoires comprises (patrouille 1 en P1, P2, P5, P6, FIN ; patrouille 2 en P2) ; caméra à 0,8 m au moins de tout véhicule et de tout poteau.
8. **Hauts de cadre** : hélicoptères et avions sous y 88 % (P5, P6, FIN, FIN6) dès qu'ils sont dans le cadre en largeur.

---

## 7. `shared/film/cut.ts`

```ts
export const SHOT_FRAMES: Record<ChaseShot, number> = { OUV: 40, P1: 48, P2: 48, P3: 48, P4: 48, P5: 48, P6: 60 };

export const ENDINGS: Record<EndingId, EndingCut> = {
  fin: { shot: "FIN", video: 52, freeze: 14, flash: 10, rise: 4 },
  fin6: { shot: "FIN6", video: 80, freeze: 12, flash: 12, rise: 4 },
};
```

- `CHASE_FRAMES` : 340 (commentaire « 204 images » à corriger).
- `endingFrames` : 76 pour FIN, 104 pour FIN6 (commentaire « 60 pour FIN, 80 pour FIN6 » à corriger).
- `SHOT_START` : OUV 0, P1 40, P2 88, P3 136, P4 184, P5 232, P6 280.
- Durée des films : une étoile 164 images, deux 212, trois 260, quatre 308, cinq 356, six 444.
- Avec : `tools/film3d/render_film.py` (`FALLBACK_FRAMES`), les tests du site et du HUD qui écrivent les anciennes valeurs en dur, `scripts/film-assemble.ts` (il lit `cut.ts`, à relancer).

---

## 8. Ordre d'essai

Trois images fixes par plan (première, milieu, dernière), basse qualité, jugées à 390 px de large avant tout rendu long ; puis le bout-à-bout en brouillon et chaque film d'une à six étoiles.

1. `lieux.phare` et `phare_lointain` d'abord : tous les plans en dépendent.
2. OUV, P1 et FIN : le film à une étoile doit se comprendre seul.
3. P3, P4, P6 : caméra et trajectoires, peu de décor.
4. P5 : le mouvement vif.
5. P2 : le décor le plus lourd (la rue des enseignes dans `scene_f`).
6. FIN6.

Critère de passage d'un plan : la berline reconnue en moins d'une demi-seconde, l'événement compris sans le son, et le lieu suivant visible devant elle à la dernière image.
