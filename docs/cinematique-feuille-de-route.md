# Cinématique : la feuille de route du parcours

Un seul profil de mouvement pour tout le trajet de la berline, découpé aux coupes. Ce document répond à SPEC §18.36 (« le parcours est continu, sans à-coup, coupes comprises ») et se lit avec `docs/cinematique-decoupage-v3.md`. Il ne change aucun plan : il dit quoi appliquer, plan par plan. Tous les nombres sortent de `motion.drive` (Python pur, aucun rendu), par les scripts de calcul tenus hors du dépôt ; le module de l'annexe les reproduit tels quels.

Conventions. Une image se note `plan/image` (la première du plan vaut 1) ou par son rang global `g` (0 = OUV/1). Vitesses en m/s, accélérations en m/s², longitudinale positive quand elle accélère, latérale et cap positifs à gauche. La glisse est l'écart entre le cap de la caisse et celui de la vitesse. Les positions sont données dans le repère de la scène de chaque plan.

## 0. En bref

- **Une seule conduite.** Le film à six étoiles est un seul appel `M.drive` sur une route abstraite : droite, arc à gauche (rond-point), droite, arc à droite (port), droite. Chaque plan en lit une fenêtre de temps, posée dans sa scène par une rotation et une translation. La première image de B est l'image qui suit la dernière de A, à 1/24 s : vitesse, accélérations, lacet, glisse, braquage, roulis et tangage se raccordent par construction, sans réglage plan par plan.
- **Un seul bras de caméra.** Le cap du bras est filtré sur tout le parcours, pas plan par plan : le panoramique est continu aux coupes de dos à dos, courbe comprise.
- **Le film est plus lent que l'hypothèse de départ.** Les limites de conduite donnent 28 à 74 km/h (7,8 à 20,7 m/s), pas 36 à 80. Ce sont deux secondes par plan et 3 m/s² d'accélération qui bornent, pas le profil.
- **Les deux coupes en courbe tombent dans la sortie du virage**, après la mi-sortie : P3 ne montre que les 1,6 derniers degrés du rond-point, P6 les 1,7 derniers du port.
- **Une durée change : P5 passe de 48 à 60 images.** Le fichier de poursuite passe de 376 à 388 images.
- **Trois choses restent discontinues** et se masquent : les lieux (ellipses d'espace à chaque coupe, par nature), le retournement de l'axe autour de P4, l'identité de la patrouille 1 de P3 à P4 et de P5 à P6.

## 1. Le profil du parcours

### 1.1 La route et la vitesse voulue

| Tronçon | Abscisse (m) | Géométrie | Vitesse voulue |
|---|---|---|---|
| Avenue | 0 à 65 | droite | 13,89 jusqu'à 31 m, puis 16,4 |
| Rond-point | 65 à 98,5 | arc à gauche, rayon 30 m, 64°, adouci sur 9,27 m de part et d'autre | 12,8 de 74 m à 89 m, puis les gaz |
| Rue, pont | 98,5 à 182 | droite | elle accélère (30 voulu, jamais atteint) jusqu'à 187 m |
| Port | 182 à 195,1 | arc à droite, rayon 15 m, 50°, adouci sur 6,55 m | 9,47 de 187 m à 191 m, puis les gaz |
| Jetée | 195,1 à 275 | droite | elle accélère |

Réglage de la glisse passé à `M.drive` : `lim=dict(slip_per=16.0, slip_drag=0.14, slip_hold=0.4, slip_max=15.0)`. Le réglage par défaut freinait trop la berline dans le virage serré du port (jusqu'à 5,8 m/s, glisse de plus de 50 images) et ne la faisait presque pas glisser au rond-point.

Les angles de 64° et de 50° sont ceux du parcours abstrait : l'angle vu dans le plan A plus le reliquat vu dans le plan B. Les scènes n'en savent rien. Dans la scène F la berline quitte le cercle de 30 m sur les quinze dernières images de P2 et s'en écarte de 0,19 m ; dans la scène E, de 0,27 m de son cercle de 15 m sur les dix-huit dernières de P5.

### 1.2 Le profil échantillonné toutes les 12 images

`stop` : feux stop allumés (longitudinale sous −2 m/s²).

| g | plan/image | v m/s | km/h | long. | lat. | lacet °/s | cap ° | glisse ° | braquage ° | roulis ° | tangage ° | stop |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | OUV/1 | 13,89 | 50 | 0,00 | 0,00 | 0,0 | 0,0 | 0,0 | 0,0 | 0,00 | 0,00 | |
| 12 | OUV/13 | 13,89 | 50 | 0,00 | 0,00 | 0,0 | 0,0 | 0,0 | 0,0 | 0,00 | 0,00 | |
| 24 | OUV/25 | 13,89 | 50 | 0,00 | 0,00 | 0,0 | 0,0 | 0,0 | 0,0 | 0,00 | 0,00 | |
| 36 | OUV/37 | 13,89 | 50 | 0,00 | 0,00 | 0,0 | 0,0 | 0,0 | 0,0 | 0,00 | 0,00 | |
| 48 | P1/9 | 14,01 | 50 | +0,78 | 0,00 | 0,0 | 0,0 | 0,0 | 0,0 | 0,00 | +0,12 | |
| 60 | P1/21 | 14,72 | 53 | +2,07 | 0,00 | 0,0 | 0,0 | 0,0 | 0,0 | 0,00 | +0,51 | |
| 72 | P1/33 | 15,81 | 57 | +1,75 | 0,00 | 0,0 | 0,0 | 0,0 | 0,0 | 0,00 | +0,62 | |
| 84 | P1/45 | 16,36 | 59 | +0,46 | 0,00 | 0,0 | 0,0 | 0,0 | 0,0 | 0,00 | +0,21 | |
| 96 | P2/9 | 16,14 | 58 | −1,60 | +0,51 | +1,8 | +0,1 | 0,0 | +0,2 | +0,04 | −0,29 | |
| 108 | P2/21 | 14,88 | 54 | −3,38 | +4,89 | +18,8 | +4,8 | 0,0 | +1,9 | +1,75 | −0,86 | X |
| 120 | P2/33 | 13,17 | 47 | −2,84 | +5,77 | +25,1 | +16,6 | +7,8 | −7,0 | +3,55 | −0,97 | X |
| 132 | P2/45 | 12,11 | 44 | −1,32 | +4,89 | +23,1 | +28,6 | +11,5 | −10,3 | +3,17 | −0,49 | |
| 144 | P2/57 | 11,82 | 43 | −0,15 | +4,65 | +22,6 | +40,0 | +2,2 | −2,0 | +2,87 | −0,07 | |
| 156 | P2/69 | 12,05 | 43 | +1,18 | +4,64 | +22,1 | +51,2 | −2,8 | +5,7 | +2,86 | +0,24 | |
| 168 | P2/81 | 12,80 | 46 | +1,99 | +2,99 | +13,4 | +60,6 | +0,4 | +1,3 | +2,41 | +0,48 | |
| 180 | P3/9 | 14,01 | 50 | +2,60 | +0,35 | +1,4 | +63,9 | +0,1 | 0,0 | +0,76 | +0,75 | |
| 192 | P3/21 | 15,35 | 55 | +2,75 | 0,00 | 0,0 | +64,0 | 0,0 | 0,0 | −0,03 | +0,78 | |
| 204 | P3/33 | 16,73 | 60 | +2,76 | 0,00 | 0,0 | +64,0 | 0,0 | 0,0 | 0,00 | +0,79 | |
| 216 | P3/45 | 18,11 | 65 | +2,76 | 0,00 | 0,0 | +64,0 | 0,0 | 0,0 | 0,00 | +0,79 | |
| 228 | P4/9 | 19,49 | 70 | +2,76 | 0,00 | 0,0 | +64,0 | 0,0 | 0,0 | 0,00 | +0,79 | |
| 240 | P4/21 | 20,67 | 74 | +0,90 | 0,00 | 0,0 | +64,0 | 0,0 | 0,0 | 0,00 | +0,59 | |
| 252 | P4/33 | 20,04 | 72 | −3,40 | 0,00 | 0,0 | +64,0 | 0,0 | 0,0 | 0,00 | −0,71 | X |
| 264 | P4/45 | 17,36 | 63 | −6,44 | 0,00 | 0,0 | +64,0 | 0,0 | 0,0 | 0,00 | −1,80 | X |
| 276 | P5/9 | 14,16 | 51 | −6,28 | −0,05 | −0,2 | +64,0 | 0,0 | 0,0 | 0,00 | −1,75 | X |
| 288 | P5/21 | 11,29 | 41 | −4,98 | −4,49 | −22,8 | +59,3 | −2,0 | −2,8 | −1,39 | −1,54 | X |
| 300 | P5/33 | 9,30 | 33 | −3,02 | −5,64 | −34,8 | +43,7 | −13,8 | +12,4 | −3,49 | −0,97 | X |
| 312 | P5/45 | 8,18 | 29 | −1,47 | −3,94 | −27,6 | +27,6 | −13,1 | +11,8 | −2,91 | −0,52 | |
| 324 | P5/57 | 7,85 | 28 | +0,29 | −1,75 | −12,8 | +17,3 | −2,7 | +2,4 | −1,63 | −0,05 | |
| 336 | P6/9 | 8,43 | 30 | +1,95 | −0,25 | −1,7 | +14,1 | −0,6 | +0,4 | −0,43 | +0,47 | |
| 348 | P6/21 | 9,61 | 35 | +2,57 | 0,00 | 0,0 | +13,9 | −0,2 | +0,3 | +0,01 | +0,72 | |
| 360 | P6/33 | 10,94 | 39 | +2,72 | 0,00 | 0,0 | +13,9 | −0,1 | +0,1 | 0,00 | +0,77 | |
| 372 | P6/45 | 12,31 | 44 | +2,75 | 0,00 | 0,0 | +13,9 | 0,0 | 0,0 | 0,00 | +0,79 | |
| 384 | P6/57 | 13,69 | 49 | +2,76 | 0,00 | 0,0 | +13,9 | 0,0 | 0,0 | 0,00 | +0,79 | |
| 387 | P6/60 | 14,03 | 51 | +2,76 | 0,00 | 0,0 | +13,9 | 0,0 | 0,0 | 0,00 | +0,79 | |

La courbe de vitesse, en clair : palier à 13,9 (OUV), montée douce à 16,4 (P1), creux à 11,8 en P2/59, montée continue jusqu'à 20,7 en P4/24, chute à 7,8 en P5/55, remontée à 14,0 à la dernière image.

### 1.3 Les événements

| Événement | Images |
|---|---|
| Elle met les gaz (longitudinale au-dessus de 0,3) | P1/5 ; crête +2,35 à P1/24 ; retombée à +0,13 à P1/48 |
| Feux stop du rond-point | P2/12 à P2/40 |
| Virage à gauche | début P2/9, plein rayon P2/29 à P2/69, mi-sortie P2/82, fin P3/9 |
| Glisse du rond-point | plus de 2° de P2/27 à P2/71, plus de 5° de P2/31 à P2/53, crête 12,2° à P2/42, contre-braquage −11,0° ; un retour de 2,9° de l'autre côté de P2/65 à P2/71 |
| Vitesse la plus basse du rond-point | 11,81 à P2/59 (−12 % dans la glisse) ; elle reprend les gaz à P2/58 |
| Vitesse la plus haute du film | 20,71 à P4/24 |
| Feux stop du port | P4/30 à P5/40 ; freinage établi à −6,44 de P4/42 à P5/9 |
| Virage à droite | début P5/12, plein rayon P5/32 à P5/41, mi-sortie P5/56, fin P6/9 |
| Glisse du port | plus de 2° de P5/22 à P5/58, plus de 5° de P5/25 à P5/53, crête 15,6° à P5/39, contre-braquage +14,1°, aucun retour |
| Vitesse la plus basse du film | 7,84 à P5/55 (−25 % dans la glisse) |

### 1.4 Les limites, sur tout le parcours

| Grandeur | Mesuré | Plafond |
|---|---|---|
| Latérale | 5,95 | 6,5 |
| Freinage | 6,44 | 7 |
| Accélération | 2,76 | 3 |
| Cercle (longitudinale et latérale combinées) | 7,05 | 7,5 |
| À-coup | 11,7 m/s³ | 12 |
| Glisse | 15,6° | 18° |
| Installation de la glisse | 25 °/s (rond-point), 29 °/s (port) | 40 °/s |
| Résorption | 21 °/s, 26 °/s | 30 °/s |
| Retour | 2,9°, puis aucun | un seul, 4° au plus |
| Perte de vitesse dans la glisse | 12 %, 25 % | 10 % au moins |
| Roulis, tangage | 3,6°, 1,84° | 4°, 2° |

## 2. Les états aux coupes

### 2.1 La berline

Une ligne par coupe : l'état à la dernière image de A, puis à la première de B. Les deux diffèrent d'un vingt-quatrième de seconde de la même conduite ; l'écart est celui que mesure `motion.py mesure`.

| Coupe | v | long. | lat. | lacet °/s | glisse ° | braquage ° | roulis ° | tangage ° | feux stop |
|---|---|---|---|---|---|---|---|---|---|
| OUV → P1 | 13,89 / 13,89 | 0,00 / 0,00 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | éteints / éteints |
| P1 → P2 | 16,40 / 16,40 | +0,13 / +0,03 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | +0,12 / +0,09 | éteints / éteints |
| P2 → P3 | 13,07 / 13,17 | +2,30 / +2,38 | +2,18 / +1,92 | +9,5 / +8,4 | +0,43 / +0,41 | +0,60 / +0,44 | +2,07 / +1,94 | +0,56 / +0,59 | éteints / éteints |
| P3 → P4 | 18,45 / 18,57 | +2,76 / +2,76 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | +0,79 / +0,79 | éteints / éteints |
| P4 → P5 | 16,56 / 16,29 | −6,44 / −6,44 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | −1,84 / −1,83 | allumés / allumés |
| P5 → P6 | 7,91 / 7,95 | +0,76 / +0,91 | −1,26 / −1,12 | −9,1 / −8,1 | −1,56 / −1,32 | +1,07 / +0,78 | −1,28 / −1,17 | +0,10 / +0,14 | éteints / éteints |

Le plus grand écart de chaque grandeur, contre son plafond de `test_motion.py` : vitesse 1,6 % (10 %), longitudinale 0,15 (2,0), latérale 0,26 (1,5), lacet 1,1 °/s (8), glisse 0,24° (3), braquage 0,29° (5), roulis 0,13° (1), tangage 0,04° (0,7). Une fois les plans passés sur ce profil, `CUT_STATE_STRICT` peut passer à `True`.

Les coupes sur une droite tombent dans un état stationnaire : vitesse constante (OUV → P1, P1 → P2), accélération établie (P3 → P4), freinage établi (P4 → P5). Elles supportent une image de plus ou de moins au montage. Les deux coupes en courbe tombent dans la sortie du virage, là où tout décroît en même temps.

OUV n'allume plus ses feux stop : `BRAKE = (37, 40)` de `ouv_avenue.py` disparaît, elle ne freine pas.

Le roulis et le tangage sortent de `M.sample`, qui chauffe ses ressorts sur 0,6 s avant la première image. Chaque plan lui passe donc la position du parcours entier (définie avant sa fenêtre), jamais une position qui commence à sa première image.

### 2.2 La caméra

Le bras commun : 7,5 m derrière le centre de la berline, 0,3 m à sa gauche, 2,4 m de haut, 24 mm. Son cap suit le cap de la vitesse par un filtre à deux pôles (0,12 s), calculé sur tout le parcours ; la berline reste en x 50 %, y 58 %. Le décalage latéral vaut 0,3 m à toutes les coupes de dos à dos ; un plan peut l'écarter en cours de route (1,5 m au plus) s'il revient à 0,3 m à sa dernière image.

| Coupe | Panoramique °/s (A / B) | Cap du bras − cap de la vitesse (A / B) | Hauteur, distance |
|---|---|---|---|
| OUV → P1 | 0 / 0 | 0 / 0 | 2,4 m, 7,5 m des deux côtés |
| P1 → P2 | 0 / 0 | 0 / 0 | 2,4 m, 7,5 m |
| P2 → P3 | +15,6 / +14,6 | −3,30° / −3,05° | 2,4 m, 7,5 m |
| P3 → P4 | 0 / caméra fixe | 0 / sans objet | l'axe se retourne |
| P4 → P5 | caméra fixe / 0 | sans objet / 0 | l'axe se retourne |
| P5 → P6 | −16,2 / −14,9 | +3,36° / +3,05° | 2,4 m, 7,5 m |

Sur tout le parcours le panoramique reste sous 33,7 °/s (dans le port) et le bras s'écarte de 7,9° au plus du cap de la vitesse. La vitesse de la berline à l'écran est nulle aux coupes : le bras la tient au centre.

### 2.3 La patrouille 1

Avance : positive quand son centre est devant celui de la berline, le long de la route. La mesure ne compare les deux côtés d'une coupe que si elle est dans le cadre des deux côtés ; à 3,5 m sur le côté, son centre n'entre dans le cadre de dos que si elle a au moins 1,5 m d'avance.

| Coupe | Côté, écart latéral | Avance | Sa vitesse | Dans le cadre |
|---|---|---|---|---|
| OUV → P1 | gauche, 7,65 m (garée) / gauche, 3,45 m | −2,6 m / −3,8 m | 0 / 19,9 | non / non : ellipse de temps |
| P1 → P2 | gauche, 3,45 m / gauche, 3,4 m | +3,0 m / +3,1 m | 16,4 / 16,4 | oui / oui |
| P2 → P3 | gauche, 3,4 m / gauche, 3,4 m | +5,0 m / +4,8 m | 8,4 / 8,2, elle freine à 5 m/s² | oui / oui |
| P3 → P4 | arrêtée 19 m derrière / gauche, 3,6 m | hors champ / −1,3 m | 0 / 21,4 | non / oui : une autre voiture |
| P4 → P5 | gauche, 3,6 m / gauche, 3,5 m | +1,8 m / +1,9 m | 18,7 / 18,4, elle freine à 6,4 m/s² | non / oui |
| P5 → P6 | sortie par la gauche, tout droit / gauche, 3,5 m | hors champ / −6,5 m | 2,7 / 12,5 | non / non : la suivante de la colonne |

## 3. Une fiche par plan

Chaque plan remplace sa cinématique écrite à la main (tables d'accélération, de lacet et de glisse) par la fenêtre du parcours : `H = parcours.hero("P2")` donne `pos`, `heading`, `travel`, `slip`, `steer`, `speed`, `along`, `alat` en fonction de l'image du plan, dans le repère de sa scène ; `parcours.camera("P2", image)` donne la position du bras. Le décor, la lumière, les autres voitures et la visée ne changent que là où la fiche le dit.

### OUV, l'avenue (40 images, inchangé)

- **Entrée et sortie** : 13,89 m/s, droit, aucune accélération.
- **Chemin** : la voie x = 1,75, de y = 244,00 à y = 266,57. Caméra de (1,45 ; 236,50) à (1,45 ; 259,07).
- **Événements** : ceux d'aujourd'hui (la patrouille garée s'éveille à l'image 14, rampe à 34).
- **Ce qui change** : `BRAKE = (37, 40)` disparaît ; le décalage latéral de la caméra passe de 0 à 0,3 m à gauche (ou y arrive à la dernière image).
- **Conduite** : la fenêtre du parcours ; elle redonne exactement `SPEED = 13.89` constant.

### P1, l'avenue (48 images, inchangé)

- **Entrée** : 13,89 m/s, droit, sans accélération. **Sortie** : 16,40 m/s, +0,13 m/s², droit.
- **Vitesse** : 13,89 (1), 13,93 (6), 14,13 (12), 14,48 (18), 15,00 (24), 15,57 (30), 16,01 (36), 16,28 (42), 16,40 (48). L'accélération dessine un triangle : +1,10 à l'image 12, +2,35 à 24, +1,42 à 36, +0,13 à 48. Elle ne dépasse pas 2,35 m/s² : `motion.drive` met 1,06 s à installer une accélération, le plan dure 2 s.
- **Chemin** : x = 1,75, de y = 288,00 à y = 317,55. Elle passe les papiers (y = 309,4) à l'image 36, la caméra à l'image 47.
- **Patrouille 1** : voie opposée (x = −1,70). Avance −3,8 m à l'image 1 (19,9 m/s, 6 m/s de plus qu'elle), −1,0 m à l'image 12, dans le cadre à partir de l'image 25 (+1,5 m), +3,0 m à l'image 44, vitesse égale ensuite. Elle freine de 2,5 à 3,5 m/s² entre les images 12 et 44.
- **Ce qui change** : plus d'arrachement à 3 m/s² à l'image 32 (`T_GO`, `TAU`) : le plan sortait en pleine accélération à 15,0 m/s contre un P2 qui freinait déjà à 17,5. L'ellipse `ELLIPSIS` reste et s'allonge (une dizaine de secondes : le demi-tour et la remontée de la patrouille) ; elle ne se voit pas, la berline est au même état des deux côtés. `cam_back` et `CAM_FOLLOW` laissent la place au bras commun.

### P2, le rond-point (84 images, inchangé)

- **Entrée** : 16,40 m/s, droit, +0,03 m/s². **Sortie** : 13,07 m/s, +2,30 de longitudinale, +2,18 de latérale, lacet +9,5 °/s, glisse +0,4°, roulis +2,07°, cap tourné de 62,0°.
- **Chemin dans la scène F** (centre du cercle de 30 m en (−25,40 ; −28,22), comme aujourd'hui : 1,97 m de la bordure de l'îlot) :

| Image | x | y | cap ° | v | Caméra x, y |
|---|---|---|---|---|---|
| 1 | 4,84 | −39,77 | 0,00 | 16,40 | 4,54 ; −47,27 |
| 12 | 4,83 | −32,33 | +0,51 | 15,91 | 4,54 ; −39,83 |
| 24 | 4,41 | −24,73 | +7,40 | 14,45 | 4,58 ; −32,23 |
| 36 | 2,85 | −18,13 | +19,65 | 12,84 | 4,37 ; −25,48 |
| 48 | 0,19 | −12,57 | +31,44 | 11,98 | 3,22 ; −19,44 |
| 60 | −3,38 | −7,85 | +42,77 | 11,81 | 0,95 ; −13,98 |
| 72 | −7,84 | −3,89 | +53,92 | 12,21 | −2,40 ; −9,05 |
| 84 | −13,21 | −0,60 | +62,00 | 13,07 | −6,95 ; −4,75 |

  La berline part au même endroit qu'aujourd'hui (y = −39,7) : la branche sud n'offre pas un mètre de plus, la caméra est déjà 1,3 m hors du décor et le sol visible commence 1,3 m à l'intérieur de son bord, comme aujourd'hui. À la dernière image elle est sur l'anneau, à 13,2 m du centre de l'îlot, la rue des enseignes devant elle. La caméra reste à plus de 8 m du centre de l'îlot.
- **Événements** : feux stop 12 à 40 ; braquage à partir de 9 ; plein rayon 29 à 69 ; glisse au-dessus de 5° de 31 à 53, crête 12,2° à 42 avec −11° de contre-braquage ; vitesse la plus basse 11,81 à 59 ; gaz à 58 ; retour de 2,9° de 65 à 71 ; roulis 3,6° au plus.
- **Patrouille 1** : la ligne intérieure, 3,4 m à gauche de la route de la berline (rayon 26,6 m, latérale 6,06 au plus). Avance +3,1 m à l'image 1 (16,4 m/s), elle lève le pied à 4 m/s² à partir de l'image 6 jusqu'à 12,6 m/s ; +3,8 m à 37, +4,8 m à 49, +6,0 m à 61 ; elle freine à 5 m/s² à partir de l'image 64 (le barrage est devant) : +6,4 m à 73, +5,0 m et 8,4 m/s à la dernière image.
- **Ce qui change** : `V0`, `S0`, `ACC_KEYS`, `SLIP_KEYS` et les clothoïdes écrites à la main disparaissent. Aujourd'hui le plan entre déjà en freinage à 17,5 m/s et sort à 11,04 m/s avec 4,06 de latérale et 21 °/s de lacet, contre un P3 lancé droit à 29,5 m/s. La patrouille 1 part de +3,1 m à 16,4 m/s (au lieu de 8 m à 15 m/s). La patrouille 2 et le reste du décor se recalent sur les nouvelles images (la berline passe plus tard au milieu de l'anneau). `CHASE_LAG`, `CHASE_SIG` et `CHASE_SLIP` laissent la place au bras commun.

### P3, la rue des enseignes (48 images, inchangé)

- **Entrée** : l'état de sortie de P2 (13,17 m/s, +2,38, latérale +1,92, lacet +8,4 °/s). **Sortie** : 18,45 m/s, +2,76 m/s² établi, droit.
- **Chemin dans la scène B** : elle entre à 0,05 m à gauche de sa droite finale, le nez 1,6° à droite, et finit de tourner à gauche : (0,30 ; 101,31) cap −1,60° à l'image 1 ; (0,35 ; 107,61) à 12 ; (0,35 ; 115,11) à 24 ; (0,35 ; 123,31) à 36 ; (0,35 ; 132,19) à 48. Vitesse 13,17, 14,34, 15,70, 17,08, 18,45. Caméra de (−0,61 ; 93,85) à (0,05 ; 124,69).
- **Événements** : fin du virage à l'image 9 ; elle passe la ligne des cônes (y = 123,3) à l'image 36, la caméra à l'image 47 ; les patrouilles du barrage (y = 126) sortent par les bords du cadre sur les dernières images. Aucun feu stop.
- **Patrouille 1** : x = −3,10 (3,4 m à gauche, 1,5 m entre les caisses). Avance +4,8 m à l'image 1 (8,2 m/s, elle freine à 5 m/s²), +1,4 m à 13, à sa hauteur à 17, derrière la caméra à 31, arrêtée à l'image 40 en y = 112,8, le nez à 8 m des cônes.
- **Ce qui change** : `V0 = 29.5`, `A_LIFT` (les feux stop 21 à 31), `A_GAS`, `X_START`, `Y_AIM` disparaissent : elle n'a plus à lever le pied, elle arrive à 47 km/h. Le plan ne couvre plus que 31 m au lieu d'une soixantaine : il commence à y = 101,3, 22 m avant les cônes. Les caisses (x de 2,05 à 3,05, y de 104,5 à 107,1) sont à 0,75 m de son flanc droit aux images 6 à 11. Les flaques et les repères placés pour l'ancien chemin se recalent. `CAM_SIDE` (−1,45 vers 0) et `CAM_LAG` laissent la place au bras commun, 0,3 m à gauche.

### P4, le pont, de face (48 images, inchangé)

- **Entrée** : 18,57 m/s, +2,76 m/s² établi. **Sortie** : 16,56 m/s, −6,44 m/s² établi, tangage −1,84° (le nez plonge).
- **Vitesse** : 18,57 (1), 19,37 (8), 20,06 (14), 20,62 (20), 20,71 (24, la crête), 20,40 (30), 19,89 (34), 19,15 (38), 18,17 (42), 16,56 (48). Longitudinale : +2,76 jusqu'à l'image 14, zéro à 24, −2,32 à 30 (les feux s'allument, invisibles de face), −5,19 à 38, −6,44 de 42 à la fin.
- **Chemin dans la scène C** : x = 1,80, de y = −73,92 à y = −35,69 (la même dernière position qu'aujourd'hui). Caméra fixe inchangée (1,2 ; 10,0 ; 1,2), 200 mm. Distance et largeur de la berline à l'écran : 83,9 m et 20 % à l'image 1 ; 75,1 m, 23 % à 12 ; 64,9 m, 27 % à 24 ; 54,8 m, 32 % à 36 ; 45,7 m, 39 % à 48.
- **Patrouille 1** (`patrol_0`) : à sa portière, x = −1,80. Elle tient 21,4 m/s et freine en retard, à 6,4 m/s² à partir de l'image 38. Avance −1,3 m à l'image 1, −0,3 m à 12, +0,2 m à 24, +0,7 m à 36, +1,8 m à 48 (18,7 m/s). Elle est au bord du cadre au début et en sort vers l'image 22, quand la berline remplit l'image.
- **Ce qui change** : la berline ne roule plus à 33,3 m/s constants de y = −101 à y = −35,7 : elle part de y = −73,9 et son nez plonge dans la seconde moitié. La meute (`PACK`, le fourgon, les passages de la crête aux images 8, 18, 28, 38) se recale sur une berline à 67 à 75 km/h : à 21 m/s, une voiture partie 13,0 m derrière est à 11,9 m à l'image 24, 11,5 m à 36 et 10,1 m à 48. La meute se resserre de 3 m, surtout quand la berline freine. La patrouille de tête n'est plus 26 m derrière mais à la portière : c'est elle que P5 retrouve devant à gauche.

### P5, le virage du port (60 images, 12 de plus)

- **Entrée** : 16,29 m/s, −6,44 m/s² établi, feux allumés, droit. **Sortie** : 7,91 m/s, +0,76, latérale −1,26, lacet −9,1 °/s, glisse −1,56°, roulis −1,28°, cap tourné de 48,0°.
- **Chemin dans la scène E** (cercle de 15 m centré en (20,50 ; 55,00), parallèle au tracé peint, 1,75 m plus à droite) :

| Image | x | y | cap ° | v | Caméra x, y |
|---|---|---|---|---|---|
| 1 | 5,25 | 43,80 | 0,00 | 16,29 | 4,95 ; 36,30 |
| 12 | 5,25 | 50,59 | −0,17 | 13,38 | 4,95 ; 43,09 |
| 24 | 5,54 | 56,57 | −7,91 | 10,70 | 4,81 ; 49,10 |
| 36 | 6,86 | 61,24 | −24,59 | 8,95 | 4,40 ; 54,15 |
| 48 | 9,11 | 64,79 | −39,59 | 8,01 | 4,77 ; 58,66 |
| 60 | 11,87 | 67,60 | −48,04 | 7,91 | 6,38 ; 62,48 |

  Les poteaux de chaîne (x = 0, y de 52 à 60,1) défilent à 5 m sur sa gauche ; les caisses (x de 18,45 à 20,6) restent à droite de son cap ; les séparateurs (y = 80,6) sont 13 m plus loin. Elle passe au plus près de la flaque actuelle (6,8 ; 63,8) à l'image 42, en (7,90 ; 63,14) : la flaque se déplace d'un mètre, sous ses roues.
- **Événements** : feux stop de 1 à 40 ; braquage à partir de 12 ; plein rayon 32 à 41 ; glisse au-dessus de 5° de 25 à 53, crête 15,6° à 39 avec +14,1° de contre-braquage, résorbée (moins de 2°) à 58 ; vitesse la plus basse 7,84 à 55 ; roulis 3,5° au plus.
- **Patrouille 1** : x = 1,75, tout droit (0,65 m des poteaux de chaîne). Elle freine déjà à 6,4 m/s² depuis P4/38. En y : 45,7 à l'image 1 (18,4 m/s, +1,9 m d'avance), 53,5 à 12 (+2,9 m), 60,4 à 24 (+3,8 m), 65,8 à 36, 69,5 à 48, 71,6 à 60 (2,7 m/s) ; elle s'arrête en y = 72,2, le nez à 5,8 m des séparateurs, dix images après la coupe. Elle manque le virage. Dans le cadre, à gauche, rampe allumée, de l'image 1 à l'image 28 environ ; le panoramique la sort ensuite par la gauche. Appel de départ : `M.drive(dict(start=(1.75, 20.0, 0), pieces=[M.line(52.2)]), 21.4, t0=…, stop=True, kind="patrol")`, `t0` calé pour qu'elle passe y = 45,7 à l'image 1.
- **Ce qui change** : `Y_START`, `V0 = 14.1`, `ACC_STEPS`, `YAW_STEPS` (36 °/s), `SLIP_STEPS` disparaissent. La berline entre sur x = 5,25 (au lieu de 3,5) à 16,3 m/s (au lieu de 14,1), freine droit douze images avant de braquer, et sort à 28 km/h (au lieu de 36) la glisse résorbée. La patrouille 1 n'attend plus sur l'axe : elle arrive à sa portière et la dépasse. `CAM_LEFT` passe de 1,45 à 0,3 m. Le faisceau de l'hélicoptère (`BEAM_FIND = 24`, la fin de `HELI_PATH`) se recale sur la nouvelle position de la berline. La durée du plan change dans `shared/film/cut.ts` et dans toutes les constantes indexées par image de P5 (`test_motion.py`, `fx.py`, `iter_diag.py`, `render_film.py`, `scene_e.py`).

### P6, la jetée (60 images, inchangé)

- **Entrée** : l'état de sortie de P5 (7,95 m/s, +0,91, latérale −1,12, lacet −8,1 °/s, glisse −1,3°). **Sortie** : 14,03 m/s, +2,76 m/s² établi, droit.
- **Chemin dans la scène D** : elle entre à 0,04 m à droite de sa voie, le nez 1,7° à gauche, et finit de tourner à droite : (81,79 ; 318,02) à l'image 1 ; (81,75 ; 321,81) à 12 ; 326,46 à 24 ; 331,76 à 36 ; 337,74 à 48 ; 344,42 à 60. Vitesse 7,95, 8,70, 9,93, 11,28, 12,65, 14,03. La bordure (x = 84,0) reste à 1,3 m de son flanc. Caméra de (82,10 ; 310,52) à (81,45 ; 336,92) ; elle passe le lampadaire de y = 325 vers l'image 38.
- **Événements** : fin du virage à l'image 9 ; accélération de +0,91 (1) à +2,22 (12), +2,63 (24), +2,76 ensuite. La grue (à partir de l'image 30) et les hélicoptères ne changent pas ; les avions se recalent sur la nouvelle position.
- **Patrouille 1** : la suivante de la colonne, voie de gauche (x = 78,25). Avance −6,5 m à l'image 1 (12,5 m/s), elle accélère à 3 m/s² : −4,0 m à 13, −1,4 m à 25, à sa hauteur à 31, +2,8 m à 43, +7,0 m à 60 (19,9 m/s). Dans le cadre à partir de l'image 38.
- **Ce qui change** : la berline ne roule plus à 33,3 m/s constants depuis y = 240 : le plan se pose 78 m plus loin sur la jetée (la pointe 86 m devant à la dernière image) et couvre 26 m au lieu de 83. `P1_DV = 4` devient 4,5 m/s à l'entrée avec 3 m/s² d'accélération. La caméra part du bras commun (0,3 m à gauche) avant la grue.

## 4. Les durées

| Plan | Avant | Après | |
|---|---|---|---|
| OUV | 40 | 40 | |
| P1 | 48 | 48 | |
| P2 | 84 | 84 | |
| P3 | 48 | 48 | |
| P4 | 48 | 48 | |
| P5 | 48 | **60** | +12 |
| P6 | 60 | 60 | |
| Fichier de poursuite | 376 | **388** | +12 (une demi-seconde) |
| Film à six étoiles (poursuite et fin de 104 images) | 480 | **492** | |

Pourquoi douze images de plus dans P5. En 48 images, le virage de 15 m ne tient pas entre un freinage vu de dos et une sortie redressée : soit elle braque dès la première image et la patrouille n'a pas le temps de la dépasser, soit la coupe tombe avant la mi-sortie, avec 3,9 de latérale, 28 °/s de lacet et 13° de glisse, et P6 doit montrer vingt degrés de courbe sur une jetée droite bordée à 1,3 m. Les douze images paient trois choses : les feux stop vus de dos avant le braquage (ils étaient invisibles dans P4), la patrouille qui file tout droit pendant qu'elle tourne, et la glisse résorbée dans le plan.

Seules les variantes qui passent par P5 (cinq et six étoiles) s'allongent, d'une demi-seconde.

## 5. Les variantes courtes

La fin entre à sa deuxième image à 6,50 m/s, en plein freinage (−6,44 m/s²), après deux images d'encre. L'état de chaque plan à son avant-dernière image :

| Bascule | v | long. | lat. | lacet °/s | glisse ° | Lecture |
|---|---|---|---|---|---|---|
| P1 → FIN | 16,39 | +0,24 | 0 | 0 | 0 | elle a freiné sous l'encre |
| P2 → FIN | 12,98 | +2,21 | +2,44 | +10,8 | +0,4 | fin de courbe, puis l'encre |
| P3 → FIN | 18,34 | +2,76 | 0 | 0 | 0 | elle a freiné sous l'encre |
| P4 → FIN | 16,83 | −6,44 | 0 | 0 | 0 | la meilleure : le freinage commencé continue sous l'encre |
| P5 → FIN | 7,89 | +0,61 | −1,42 | −10,3 | −1,9 | presque la même vitesse |
| P6 → FIN6 | 13,92 | +2,76 | 0 | 0 | 0 | elle a freiné sous l'encre |

Partout elle arrive plus vite qu'elle ne repart (plafond `CUT_INK_DV` : 0,5 m/s) ; le cas le plus serré est P5, avec 1,4 m/s de marge. Aucune bascule ne demande d'accélérer sous l'encre. Seule la plausibilité est exigée ici (SPEC §18.36) : rien à changer dans `fin_pointe.py` ni dans `fin6_orbite.py`.

## 6. Ce qui reste discontinu, et comment le masquer

| Coupe | Ce qui saute | Masque |
|---|---|---|
| OUV → P1 | Le temps : une dizaine de secondes (la patrouille fait demi-tour et remonte). La berline est au même état, sur la même avenue. | La secousse de la première étoile. Rien d'autre : l'état est stationnaire. |
| P1 → P2 | Le lieu : 80 m d'avenue jusqu'à l'îlot. Berline et patrouille 1 au même état. | La secousse ; le rond-point visible devant sur les douze dernières images de P1. |
| P2 → P3 | Le décor de la rue (scène F, puis scène B). Le mouvement est continu, panoramique compris (15 °/s des deux côtés) : c'est une coupe dans l'action. | La secousse ; la patrouille 1 à la même place à gauche des deux côtés. |
| P3 → P4 | L'axe (de dos à de face, 24 mm à 200 mm) et la patrouille 1 : celle de P3 est arrêtée au barrage, celle de P4 est la tête de la meute. | Les patrouilles du barrage, qui balaient les bords du cadre sur les images 40 à 47 de P3 ; le retournement de l'axe cache l'échange. |
| P4 → P5 | L'axe, environ 80 m de pont et la voie (x = 1,8 puis 5,25). Le freinage est établi des deux côtés. | Le nez qui plonge dans P4, les feux stop allumés dès la première image de P5 : la même action vue des deux côtés. |
| P5 → P6 | Le lieu : 70 m de quai et le virage à gauche vers la jetée. Elle finit une courbe à droite de 1,7° à l'entrée de P6. La patrouille 1 change : celle de P5 a filé tout droit, celle de P6 arrive de derrière. | La secousse ; le faisceau de l'hélicoptère ou un mât qui traverse le cadre à la coupe. |
| Pn → FIN, P6 → FIN6 | La vitesse (elle freine sous l'encre). | Les deux images d'encre. |

Option, si P4 → P5 se lit mal sur une image test : poser la berline et la patrouille 1 de P4 sur x = 5,25 et x = 1,75, les voies de P5, et recadrer la caméra fixe.

## 7. Les risques, et le plan B

| Risque | Plan B |
|---|---|
| La glisse du rond-point ne perd que 12 % de vitesse, pour 10 % exigés ; la crête (12,2°) est sous les 14 à 16° visés. | `VA2 = 12.4`, `B2 = 10.0` : −14 %, la mi-sortie glisse à P3/3 et la coupe tombe à +3,2 de latérale. Rien d'autre ne change : la continuité vient de la conduite unique, pas du réglage. |
| Les douze images de P5 ne passent pas (montage, son, étoiles). | P6 à 48 images : le total revient à 376, P6 sort à 12,6 m/s et la grue n'a plus que 18 images. |
| Le freinage du rond-point se confond avec le braquage (feux à P2/12, braquage à P2/9) : la branche sud n'a pas de ligne droite à offrir. | Prolonger la branche sud d'une dizaine de mètres : le profil se décale d'autant et se recalcule (`S_GO`, `S_ARC2`, `S_ARC5`, l'ancre de P2). |
| P3 se lit court : 22 m avant le barrage, à 47 à 61 km/h. | Aucun dans les limites : pour arriver plus vite au barrage il faut sortir plus vite du rond-point, donc un rayon plus grand que l'anneau. |
| La patrouille 1 à la portière dans P4 sort du cadre à l'image 22. | Viser entre les deux voitures (la berline à x 45 %) ; ou garder la tête de la meute derrière et accepter que la patrouille 1 n'entre dans le cadre de P5 qu'à l'image 40. |
| La patrouille 1 de P5 s'arrête trop près des séparateurs si elle freine plus tard. | Elle tient 21,0 m/s et freine dès P4/37 : arrêt en y = 70,3, le nez à 7,7 m. |
| Un plan garde un filtre de caméra à lui : le panoramique saute à la coupe. | Le cap du bras se lit dans le module, jamais recalculé dans le plan. |
| Les éléments calés sur l'ancien chemin (flaques, papiers, faisceau, avions, patrouille 2, meute) tombent à côté. | Chaque fiche les nomme ; l'agent du plan les recale et vérifie sur le diagnostic du plan avant tout rendu. |

## 8. La vitesse à l'image

Vu de 2,4 m au 24 mm, le sol n'entre dans le cadre qu'à 2,6 m devant la caméra et l'horizon ne bouge pas : la vitesse ne se lit que par ce qui passe près. La règle : un repère à moins de 3 m de la caméra toutes les douze images au plus, donc un pas d'une demi-seconde de route.

| Plan | km/h | Pas des repères | Ce qui porte la vitesse |
|---|---|---|---|
| OUV | 50 | 7 m | Les tirets de l'axe et les lampadaires ; c'est le plan calme, la vitesse n'a pas à s'y lire. |
| P1 | 50 à 59 | 7 à 8 m | La patrouille qui remonte à 6 m/s de plus et se cale à sa portière ; les papiers à 0,5 m de son flanc (image 36), sous la caméra à l'image 47. |
| P2 | 59 à 43 | 6 m | Le panoramique (25 °/s), l'îlot qui défile à 2 m sur la gauche, la glisse, les feux stop, la patrouille qui gagne par l'intérieur. La vitesse ici est celle de l'arrière-plan qui tourne. |
| P3 | 47 à 66 | 7 à 9 m | Les enseignes et les caisses à 0,75 m de son flanc, la patrouille 1 qui recule dans le cadre (elle freine, la berline accélère), les cônes puis les patrouilles du barrage qui sortent par les bords : la rue est étroite, tout est près. |
| P4 | 67 à 75 | sans objet | Le 200 mm écrase les distances : la berline passe de 20 à 39 % de la largeur, les lampadaires du pont (tous les 30 m) se serrent derrière elle, la meute grossit, le nez plonge. |
| P5 | 59 à 28 | 4 à 8 m | La patrouille qui la dépasse à 2 m/s de plus et file tout droit, le panoramique (34 °/s), la glisse, la flaque sous ses roues. Les poteaux de chaîne (tous les 2,7 m) sortent par la gauche du cadre 12 m devant la caméra, un toutes les cinq images : trop loin pour le flou, assez serrés pour le rythme. C'est le plan le plus lent ; il se lit par le freinage, pas par la vitesse. |
| P6 | 29 à 51 | 4 à 7 m | Le point faible. Les lampadaires sont à 30 m : un seul passe dans le plan. Il faut des repères au sol (joints de dalle ou bittes d'amarrage tous les 5 m le long de la bordure, à 2,5 m de la caméra), la patrouille qui la dépasse (elle gagne 13,5 m en 2,5 s) et les avions. |

Le flou de mouvement (obturateur à 180°) ne marque que les trois premiers mètres de sol à ces vitesses : il aide dans P3 et P5, peu ailleurs. Rien ici ne triche avec la physique : aucun repère ne bouge, aucune vitesse n'est gonflée.

## 9. Ce que je conteste

1. **L'hypothèse de 10 à 22 m/s.** Les limites donnent 7,8 à 20,7 m/s. Le bas vient du rayon de 15 m du port (9,5 m/s à 6 m/s² de latérale, moins la glisse). Le terre-plein est une dalle nue : un virage de 22 m de rayon y tient et laisserait de l'ordre de 10 m/s à la sortie et 16 m/s au bout de la jetée (estimation, non calculée). Je ne l'ai pas retenu parce qu'il quitte le tracé peint ; c'est le premier levier si la jetée paraît lente.
2. **Le temps d'installation d'une accélération dans `motion.drive`.** La vitesse y est lissée sur 1,06 s (freinage plus accélération, divisés par l'à-coup), alors que l'à-coup de 12 m/s³ installerait 3 m/s² en un quart de seconde. C'est ce qui réduit le bond de P1 à 2,5 m/s et empêche P4 de tenir sa crête. Une fenêtre propre à chaque changement de régime rendrait 1 à 2 m/s à P1, P3 et P6 sans toucher aux plafonds (estimation). Changement de `motion.py`, hors de cette feuille.
3. **Le plafond d'accélération de 3 m/s².** Avec le point 2, c'est lui qui borne P3, P4 et P6. Sur route mouillée une berline puissante tient 4 m/s² ; P6 sortirait vers 60 km/h au lieu de 51 (estimation).
4. **L'adoucissement unique de `motion.make_route`.** Une seule longueur pour toute la route : l'arc de 15 m du port, derrière celui de 30 m, y passait à 26,6 m de rayon effectif. Le module de l'annexe construit sa route lui-même, avec une longueur par arc ; `motion.py` n'est pas touché.
5. **Le cadre de poursuite sur la jetée.** 2,4 m de haut, 7,5 m derrière et 24 mm tiennent partout, sauf à 30 km/h sur une jetée vide de 8 m de large, où ils donnent une image lente. Je garde le cadre et je demande des repères au sol (section 8) ; si cela ne suffit pas sur une image test, le bas de la plage autorisée (2,1 m, 6,5 m) sur les trente premières images de P6.

## Annexe : le module commun

À ajouter par l'agent qui ouvre l'exécution, sous `tools/film3d/parcours.py`. Vérifié hors du dépôt : il reproduit tous les nombres de ce document.

```python
# Le parcours unique de la berline : une seule conduite pour tout le film à six étoiles, découpée aux coupes.
# Chaque plan en lit une fenêtre de temps, posée dans sa scène par une rotation et une translation : la berline et
# la caméra quittent un plan dans l'état exact où elles entrent dans le suivant. Python pur.
import math

import motion as M

FPS = 24.0
SHOTS = (("OUV", 40), ("P1", 48), ("P2", 84), ("P3", 48), ("P4", 48), ("P5", 60), ("P6", 60))
START, _f = {}, 0                 # première image globale de chaque plan (0 = OUV/1)
for _n, _d in SHOTS:
    START[_n] = _f
    _f += _d
TOTAL = _f                        # 388

# ---- le profil (abscisses en m depuis OUV/1)
V_OUV, V1, V_FAR = 50 / 3.6, 16.4, 30.0     # l'avenue ; avant le rond-point ; jamais atteinte : elle accélère
S_GO = 31.0                                 # elle met les gaz
S_ARC2, R2, A2 = 65.0, 30.0, 64.0           # le rond-point : début nominal, rayon, angle (à gauche)
VA2, B2, G2 = 12.8, 9.0, 24.0               # vitesse d'arc, où elle la demande, où elle remet les gaz (m après S_ARC2)
S_ARC5, R5, A5 = 182.0, 15.0, 50.0          # le port (à droite)
VA5, B5, G5 = 9.47, 5.0, 9.0
TAIL = 80.0
LIM = dict(slip_per=16.0, slip_drag=0.14, slip_hold=0.4, slip_max=15.0)
JERK = 12.0 * 0.72


def _ease(radius):
    """La longueur d'adoucissement d'un arc : celle que motion.drive prendrait pour lui seul."""
    lat = LIM.get("lat", 6.5) * LIM.get("margin", 0.92)
    return max(2.0, lat * math.sqrt(lat * radius) / JERK)       # 9,27 m pour 30 m ; 6,55 m pour 15 m


def _route(pieces, ds=0.1):
    """pieces = [(longueur, courbure, adoucissement)] : chaque arc lissé par deux moyennes glissantes de SA longueur
    (motion.make_route n'en prend qu'une pour toute la route : l'arc de 15 m y perdait son rayon)."""
    n = sum(max(1, int(round(L / ds))) for L, _, _ in pieces)
    kappa, i = [0.0] * n, 0
    for L, k, ease in pieces:
        m = max(1, int(round(L / ds)))
        if k:
            w = max(1, int(round(ease / ds)) | 1)
            pad = 2 * w
            raw = [0.0] * (i + pad) + [k] * m + [0.0] * (n - i - m + pad)
            sm = M._box(M._box(raw, w), w)[pad:pad + n]
            kappa = [a + b for a, b in zip(kappa, sm)]
        i += m
    return M.Route(0.0, 0.0, 0.0, kappa, ds)


def _drive():
    l2, l5 = R2 * math.radians(A2), R5 * math.radians(A5)
    e2, e5 = _ease(R2), _ease(R5)
    route = _route([(S_ARC2, 0.0, 0.0), (l2, 1.0 / R2, e2), (S_ARC5 - S_ARC2 - l2, 0.0, 0.0), (l5, -1.0 / R5, e5),
                    (TAIL, 0.0, 0.0)])
    speed = [(0.0, V_OUV), (S_GO, V_OUV), (S_GO + 0.1, V1),
             (S_ARC2 + B2 - 0.1, V1), (S_ARC2 + B2, VA2), (S_ARC2 + G2, VA2), (S_ARC2 + G2 + 0.1, V_FAR),
             (S_ARC5 + B5 - 0.1, V_FAR), (S_ARC5 + B5, VA5), (S_ARC5 + G5, VA5), (S_ARC5 + G5 + 0.1, V_FAR)]
    return M.drive(route, speed, t0=0.0, kind="hero", lim=LIM, ease=max(e2, e5), t_span=(-2.0, TOTAL / FPS + 2.5))


DRIVE = _drive()


def t_of(shot, frame):
    """L'instant du parcours (s depuis OUV/1) de l'image `frame` (1 = la première) du plan."""
    return (START[shot] + frame - 1) / FPS


CAP_B = DRIVE.travel(t_of("P4", 10))           # la droite après le rond-point : +63,98°
CAP_D = DRIVE.travel(TOTAL / FPS + 1.0)        # la droite après le port : +13,94°
# plan : (image de référence, où la berline s'y trouve dans la scène, cap de la droite de la scène qui monte vers +y)
ANCHOR = {
    "OUV": (1, (1.75, 244.0), 0.0),
    "P1": (1, (1.75, 288.0), 0.0),
    "P2": (1, (4.84, -39.77), 0.0),
    "P3": (36, (0.35, 123.30), CAP_B),
    "P4": (48, (1.80, -35.69), CAP_B),
    "P5": (1, (5.25, 43.80), CAP_B),
    "P6": (60, (81.75, 344.42), CAP_D),
}


def placer(shot):
    """(to_scene(x, y), cap) : la transformation du parcours vers la scène du plan, et le cap à retrancher."""
    frame, (tx, ty), cap = ANCHOR[shot]
    ax, ay = DRIVE.pos(t_of(shot, frame))
    c, s = math.cos(math.radians(cap)), math.sin(math.radians(cap))

    def to_scene(x, y):
        dx, dy = x - ax, y - ay
        return tx + c * dx + s * dy, ty - s * dx + c * dy
    return to_scene, cap


def hero(shot):
    """Les fonctions de l'image du plan (décimale admise) : pos (scène), heading et travel (degrés, 0 = +y de la
    scène, positif à gauche), slip, steer, speed, along, alat."""
    to_scene, cap = placer(shot)
    t = lambda f: t_of(shot, f)                                    # noqa: E731
    return dict(pos=lambda f: to_scene(*DRIVE.pos(t(f))), heading=lambda f: DRIVE.heading(t(f)) - cap,
                travel=lambda f: DRIVE.travel(t(f)) - cap, slip=lambda f: DRIVE.slip(t(f)),
                steer=lambda f: DRIVE.steer(t(f)), speed=lambda f: DRIVE.speed(t(f)),
                along=lambda f: DRIVE.along(t(f)), alat=lambda f: DRIVE.alat(t(f)))


# ---- le bras commun de la caméra : deux pôles (tau 0,12 s) sur le cap de la vitesse, filtrés sur tout le parcours
CAM_TAU, CAM_BACK, CAM_LEFT, CAM_Z = 0.12, 7.5, 0.3, 2.4
_H, _T0 = 1.0 / 240.0, -1.5


def _cam_table():
    a1 = a2 = DRIVE.travel(_T0)
    out = []
    for k in range(int((TOTAL / FPS + 0.5 - _T0) / _H)):
        a = DRIVE.travel(_T0 + k * _H)
        a1 += (a - a1) * _H / CAM_TAU
        a2 += (a1 - a2) * _H / CAM_TAU
        out.append(a2)
    return out


_CAM = _cam_table()


def cam_cap(shot, frame):
    """Le cap du bras (degrés, repère de la scène du plan)."""
    return _CAM[int(round((t_of(shot, frame) - _T0) / _H))] - placer(shot)[1]


def camera(shot, frame, back=CAM_BACK, left=CAM_LEFT, z=CAM_Z):
    """La position de la caméra dans la scène : `back` derrière le centre de la berline le long du bras, `left` à sa
    gauche. Le plan la vise comme aujourd'hui (la boîte de la berline en x 50 %, y 58 %)."""
    x, y = hero(shot)["pos"](frame)
    a = math.radians(cam_cap(shot, frame))
    fx, fy = -math.sin(a), math.cos(a)             # l'avant du bras ; sa gauche : (-fy, fx)
    return x - back * fx - left * fy, y - back * fy + left * fx, z
```

Les feux stop d'un plan : `parcours.DRIVE.brake_windows(f0=1 - parcours.START[plan], frames=range(1, n + 1))`, soit (12, 40) pour P2, (30, 48) pour P4, (1, 40) pour P5 et rien ailleurs.

Les ancres valent pour ces paramètres. Si l'un d'eux change, P2 et P5 gardent le centre de leur cercle, (−25,40 ; −28,22) et (20,50 ; 55,00) : leur ancre se décale en y de ce dont l'abscisse de la berline à leur première image a bougé (53,39 m pour P2, 170,7 m pour P5 aujourd'hui).

L'ordre d'exécution : le module, puis P2 et P5 (les deux virages, où tout se joue), puis P3 et P6 (leurs entrées), P1, P4, OUV ; `motion.py mesure` après chaque plan, `CUT_STATE_STRICT = True` à la fin.
