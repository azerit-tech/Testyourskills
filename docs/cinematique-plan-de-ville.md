# Cinématique : le plan de ville

Plan d'exécution de la décision du 13 novembre (`SPEC.md` §18.36, « une seule ville, une seule route, un monde continu »). Étude sans rendu : les cotes viennent du code des scènes, les calculs de `parcours.py` et `motion.py` (Python pur), par des scripts tenus hors du dépôt. Se lit avec `docs/cinematique-feuille-de-route.md` (la conduite unique), `docs/cinematique-decoupage-v3.md` et `docs/cinematique-lumiere-v3-1.md`.

Conventions. Repère de ville : celui du pont (`scene_c.py`, `lieux.py`), z = 0 sur la chaussée, eau à −1,5 m, caps selon `lieux.put` (0 vers +y, positif vers −x). Une pose de lieu s'écrit `rot, t` : p_ville = R(rot) · p_lieu + t, et cap_ville = cap_lieu + rot. Les images se notent `plan/image`.

**`FILM3D_VILLE`** (variable d'environnement, défaut « 1 ») : à « 1 », chaque lieu se construit rogné pour la ville, comme décrit en 2.5 ; à « 0 », l'ancien lieu autonome, avec ses faux lointains.

## 0. En bref

- **La route du module fait 295 m, la vraie chaussée des lieux construits environ 1 200.** Un monde continu ne s'obtient donc pas en posant les lieux tels quels : on rogne les lieux à leurs jonctions et on les rapproche.
- **Le monde n'a plus de trou : la route existe en entier**, de l'avenue à la pointe. Avenue et rond-point, rond-point et rue, rue et pont, pont et port se touchent en rognant ; port et jetée en redécoupant le nord-est du terre-plein.
- **Une seule coupe saute de la route : de la rue au pont**, 331 m, soit 11,5 s de conduite que le film ne montre pas. C'est une ellipse de temps dans un monde sans trou. Elle se lit si le vrai pont est dans l'axe à la fin de P3, et si la rive quittée est derrière la meute au début de P4 (2.5, rue : deux immeubles de 30 à 33 m au quai).
- **Le film gagne 26 images**, toutes dans P2 : le rond-point construit tourne de 90°, la route du module de 64°. Poursuite 414 images, film à six étoiles 518.
- **Trois conduites** : OUV, P1, P2 et P3 d'un seul tenant (246 images, 10,25 s) ; P4 ; P5 et P6 d'un seul tenant (120 images). P4 vers P5 est un changement de caméra dans un temps et un espace continus.
- **La bande corail a un seul azimut : −70°**, la bissectrice de l'avenue et de la jetée.

```
        y (nord)
  +123        * phare
  +101       ( ) pointe, rayon 30
             /
            /  jetée, cap -50°, 71 m
  +36      /
  +26   .-'   virage du port, rayon 22          PORT   x -60..100, y -66..54
   -5   ||    pied de la rampe (fin de P4, début de P5)
        ||
 -130   ++    crête 7,2 m, pylône 52 m          LAGUNE, 256 m de quai à quai
        ||
 -320   ||    début du tablier
 -325 ==++==  quai de la ville, deux immeubles de 30 à 33 m aux angles de la rue
 -344 --||--  boulevard du quai
        ||    rue des enseignes, 71 m ; barrage en y -380      <-- ellipse de temps, 331 m, de P3 à P4
 -415   ||
 -433  ( o )  rond-point ------ l'avenue continue vers l'est
 -435 ========================>  avenue, cap -90° (vers +x)
        OUV x -95..-72      P1 x -72..-42
 -445 ........ mur de promenade, plage, océan au sud
```

## 1. L'emprise de chaque lieu, dans son repère (état actuel, `FILM3D_VILLE=0`)

| Lieu | Chaussée | Bâti | Eau, relief | Faux lointains | Filmé |
|---|---|---|---|---|---|
| Avenue (`scene_a`) | axe x 0, vers +y, 14 m (demi 7), de y −30 à 900 ; trottoirs 4,5 m | côté ville : façades en x −11,5, de y 20 à 640 (lumières jusqu'à 320), deux rangs derrière (x −37,5 et −63,5, y −20 à 420) ; rues transversales en y 120, 266, 452 ; dalles jusqu'à x −200 | mur de promenade x 11,5, plage jusqu'à x 34 (z −1,5), océan au-delà ; plat | « pointe de la baie » (7 immeubles, x 85, y 650 à 916), `sea_far`, phare lointain 14° à droite | OUV y 244 à 266,6 ; P1 y 288 à 317,6 ; caméra 7,5 m derrière |
| Rond-point (`scene_f`) | îlot rayon 6, anneau 6 à 15, trottoir jusqu'à 19,2 ; branches à 0° (plage, 8 m), 90° (avenue nord, 14 m, jusqu'à y 400), 180° (enseignes, 8 m, jusqu'à x −46), 270° (avenue sud, 14 m, jusqu'à y −46) | aucun aux angles (terrasses à 22 à 29 m) ; un rang côté ville le long de l'avenue nord, de y 24 à 400 | mur de promenade x 46, plage jusqu'à x 120, océan ; plat | sol sombre jusqu'à −160, dalle jusqu'à x −200 | P2 : de (4,84 ; −39,8) à (−12,7 ; −0,9) |
| Rue des enseignes (`scene_b`) | axe x 0, s de 1 à 162, 8 m, trottoirs 3 m | façades à ±7, 2 à 4 niveaux (7 à 14 m), dix immeubles par côté ; barrage s 126, plots s 123,3 | boulevard du quai s 162 à 178, mur du quai s 181 ; plat | îlot en s −16 et sa place ; pont de s 181 à 600 (plateau à 7,2 m de s 301 à 440, pylône en s 330) ; eau, autre rive, mâts du port | P3 : s 101,7 à 132,0 |
| Pont (`scene_c`) | axe x 0, 14 m, trottoirs 2 m, bord extérieur ±9,7 ; tablier de y −320 à −20 | pylône en H à la crête (jambes x ±11, sommet 52 m), piles tous les 35 m, lampadaires tous les 30 m | plat de −320 à −255, rampe à 6 %, crête 7,2 m en −130, pied en −5 | avenue de la ville de 14 m, de y −1000 à −320 ; ville lointaine de 900 m de profondeur (`lieux.distant_city`) | P4 : y −74,8 à −35,7, caméra fixe y 10 |
| Port (`scene_e`) | voie du pont x ±7 jusqu'aux séparateurs (y 80,6) ; voie du quai, axe y 70, de x 0 à 80 | terre-plein x −60 à 100, y −20 à 100 ; murs de conteneurs le long de la voie du pont, mur en y 84,2 (x −30 à 30), piles au nord-est (38 ; 88), files à l'est ; mâts de 25 m aux angles et en (32 ; 90) ; portique, grues, cargo | quai sur tout le pourtour ; plat | pont, jetée et pointe par `lieux.panorama` | P5 : de (5,25 ; 43,6) à (13,6 ; 72,2) |
| Jetée, pointe (`scene_d`) | axe x 80, de y 100 à 400, 8 m, bord ±6,7 ; lampadaires tous les 20 m | pointe centrée en (80 ; 430), rayon 30 ; phare en (75,0 ; 458,3), 17,9 m | eau des deux côtés ; plat | pont et port lointains, ville lointaine, autre rive | P6 : y 313,2 à 344,4 ; FIN, FIN6 sur la pointe |

Tout est à z = 0, sauf le tablier. Les largeurs se raccordent déjà : l'avenue et les branches nord et sud du rond-point font 14 m, la rue et la branche ouest 8 m.

## 2. Le plan de ville

### 2.1 Ce qui change dans `parcours.py` (décidé le 13 novembre)

| | Aujourd'hui | Ville | Formule, raison |
|---|---|---|---|
| `A2` | 64° | **90°** | les branches du rond-point sont à angle droit |
| `R2` | 30 m | 30 m | gardé : le creux reste à 41 km/h |
| `G2` | 24,0 | 37,62 | `R2 · rad(A2) − 9,5` : la remise des gaz reste 9,5 m avant la fin de l'arc |
| `S_ARC5` | 182,0 | 195,61 | `182 + R2 · (rad(90) − rad(64))` |
| P2 | 84 images | **110** | même état à la coupe (13,15 m/s, 2,4° de courbe restants) ; total 414 |
| `CAP_B` | lu sur la route | `A2`, exact | 0,05° de lissage feraient 6 cm sur 71 m de rue et 28 cm sur l'avenue |
| Ancre d'OUV | (1,75 ; 244,0) | **(1,75 ; 264,85)** | `288 − (y_route(P1/1) − y_route(OUV/1))` = 288 − 23,15 : le placement de P1 |
| Ancre de P2 | (4,84 ; −48,156) | **(1,75 ; −49,84)** | la voie de l'avenue ; y = `0,35 − (y_sortie − (S_ARC2 − 20))`, y_sortie = 95,19, l'ordonnée de la droite de sortie sur la route |
| Ancre de P4 | (1,80 ; −35,69) | **(5,25 ; −5,69)** | fenêtre glissée de 30 m, voie de P5 ; caméra fixe (4,65 ; 40,0 ; 1,2) |
| Ancres de P1, P3, P5, P6 | | inchangées | |

- Profil de vitesse : rien ne change hors du rond-point. Dans le rond-point : creux à 11,5 m/s (11,8), glisse 12,2°, lacet 24,9 °/s, latérale 5,86, dans les plafonds. Le cercle nominal passe à 5,1 m de la bordure de l'îlot (1,97 aujourd'hui).
- OUV : avancer son ancre vaut mieux que reculer P1, qui déplacerait l'avenue de 20,85 m par rapport au rond-point, donc l'îlot, le rognage et le décor réglé de P1. La patrouille garée passe à y_A 284,85, soit 4,85 m après l'angle de la rue transversale (y_A 266 à 280) : à P1/1 elle est à 52° à gauche de la caméra, hors champ, 3,15 m derrière la berline.
- Durées : poursuite 414 images (17,25 s), film à six étoiles 518, total à rendre 546 avec FIN.

### 2.2 (a) Les poses

| Lieu | rot | t | Du lieu à la ville | Repères en ville |
|---|---|---|---|---|
| Pont (C) | 0 | (0 ; 0) | identité | crête (0 ; −130), pied (0 ; −5) |
| Port (E) | 0 | (0 ; −46,40) | (x_E ; y_E − 46,40) | terre-plein de y −66,4 à 53,6 |
| Jetée, pointe (D) | −50° | (−280,16 ; −113,76) | (0,6428 x_D + 0,7660 y_D − 280,16 ; −0,7660 x_D + 0,6428 y_D − 113,76) | joint avec le port (23,1 ; 36,3) ; pointe (100,67 ; 101,33) ; phare (119,14 ; 123,35) |
| Rue (B) | 0 | (0 ; −506,0) | (x_B ; s − 506,0) | début de rue y −415 ; barrage y −380 ; mur du quai y −325 |
| Rond-point (F) | −90° | (0 ; −433,20) | (y_F ; −x_F − 433,20) | îlot (0 ; −433,20) |
| Avenue (A) | −90° | (−359,69 ; −433,20) | (y_A − 359,69 ; −x_A − 433,20) | l'îlot en (0 ; 359,69) de A |

- Une pose se recalcule des ancres : pose(lieu) = pose(pont) ∘ placer(plan du pont) ∘ placer(plan du lieu)⁻¹, de proche en proche (P4, P5, P6 pour l'eau ; P3, P2, P1 pour la ville). `ville.py` le fait ; les nombres ci-dessus sont à 5 cm près.
- Les deux moitiés sont posées l'une par rapport à l'autre par le réel : l'axe de la rue sur l'axe du pont, le mur du quai de la rue (s 181) sur la rive (y −325).
- Correction sur l'envoi précédent : t de l'avenue en y vaut −433,20 et non −433,48 (le résidu de 0,05° de cap, supprimé par `CAP_B = A2`).

### 2.3 Les jonctions, une par une

| Jonction | Écart aujourd'hui | Décision | Images | Repli |
|---|---|---|---|---|
| OUV → P1 | 20,85 m, même avenue | **fermée** : l'ancre d'OUV avance de 20,85 m | 0 | |
| P1 → P2, avenue et rond-point | 82,7 m d'avenue | **rapprocher** : l'îlot en y_A 359,69 au lieu de 440 ; joint en y_A 340,69 | 0 | |
| P2 → P3, rond-point et rue | 100 m de rue et 26° d'angle | **rogner et allonger** : la rue perd ses 90 premiers mètres (il en reste 71), la route tourne de 90° | +26 | |
| P3 → P4, rue et pont | 330,6 m, 4,9 m en travers | **ellipse de temps, la seule** : la route existe (fin de rue 30 m, boulevard 16 m, plat et montée 195 m, crête, 86 m de descente), le film saute 11,5 s | 0 | |
| P4 → P5, pont et port | 76 m de tablier, 3,45 m en travers | **rapprocher** : le port avancé de 46,4 m, P4 glissé de 30 m, berline dans la voie x 5,25 | 0 | P4 à sa place, saut de 76 m caché par l'inversion d'axe |
| P5 → P6, port et jetée | 60 m de quai, un virage à gauche, 213 m de jetée | **rapprocher et rogner** : la jetée part de la sortie du virage, à 50° à droite ; il en reste 71 m ; le nord-est du terre-plein redécoupé | 0 | si l'agent du port échoue : coupe gardée, quai et jetée réels |
| P6 → FIN6 | 86 m | **l'encre**, inchangée : elle freine sous les deux images | 0 | |

Pourquoi l'ellipse de P3 à P4 reste. La raccourcir : même sans plat côté ville et avec la rue coupée après le barrage, il reste 240 m. La parcourir : la berline sort de P3 à 17,3 m/s, atteint 30 m/s en 109 m, et met 11,5 s, soit 276 images. C'est aussi la seule que l'histoire exige : la meute de dix ne se forme pas en un vingt-quatrième de seconde.

### 2.4 (b) Les conflits, par gravité

1. **Jetée contre port.** Posée sur la sortie du virage, la jetée traverse le nord-est du terre-plein : le mât clé (32 ; 90) est à 9 cm de son axe, le bout du mur de conteneurs (x 17 à 30, y 84,2) et les piles (38 ; 88) sont dessus. Sans découpe, toute la fenêtre de P6 roule sur le béton du port. Réglé par le polygone de 2.5 (port).
2. **Le 200 mm de P4 contre le port.** Son objectif tombe en (4,65 ; 86,4) du port : 5,8 m derrière les séparateurs, 1 m derrière le mur de conteneurs. Réglé en reculant ce mur à y_E 89,0.
3. **Rue et pont** : 331 m que le film ne parcourt pas. Ellipse de temps ; le décor doit la rendre lisible (immeubles du quai).
4. **Rond-point** : 64° contre 90°, voie x 4,84 contre 1,75. Réglé en 2.1.
5. **Avenue trop longue** : construite jusqu'à y_A 900, elle recouvre le rond-point, la rue et le quai.
6. **Rue trop longue**, avec son faux îlot et son faux pont (pylône en s 330, le vrai en s 376).
7. **Le pont côté ville** : son avenue de 14 m sur 680 m et son sol de 80 m de large traversent la rue, le rond-point et l'océan. La ville lointaine a 900 m de profondeur ; la vraie fait 150 m du quai à la promenade.
8. **La rampe sur le terre-plein** : le port avancé passe sous les 61 derniers mètres de la rampe (tablier à 3,7 m au mur sud).
9. **Dalles** de A et de F jusqu'à 200 m côté ville : 90 m dans la lagune.
10. **Angles du rond-point** : les terrasses des deux angles ouest sont là où arrivent le rang de l'avenue et les premiers immeubles de la rue.
11. **Petits raccords** : trottoirs de 4,5 m (A) contre 4,0 (F) ; 8 m sans enrobé entre le boulevard et le tablier ; ouverture du quai ±8,5 contre tablier ±9,7 ; une paire de lampadaires de jetée (y_D 315) dont la droite tombe dans la voie du quai.
12. **Mer et phare** : chaque scène a son azimut de mer et, de l'avenue à la rue, un faux phare. Un seul azimut (−70°), un seul phare.

### 2.5 (c) Lieu par lieu : quoi retirer, quoi ajouter, à quel raccord arriver

Règles communes, sous `FILM3D_VILLE=1` :

- Un lieu ne construit rien au-delà de ses joints : ni route, ni sol, ni bâti, ni faux lointain. Le ciel, l'eau (un seul plan à z −1,5), l'autre rive et les voisins viennent de `ville.py`.
- Chaque lieu garde son repère ; `ville.py` applique la pose. Tous les joints sont à z = 0, chaussée contre chaussée, sans marche.
- L'azimut de la mer de chaque scène vaut −70° − rot : +20° pour A et F, −70° pour B, C et E, −20° pour D.
- Critère commun : sur la carte de `ville.py`, aucune emprise ne recouvre celle d'un voisin ; en gris (`render_film.py --dry`), le cadre du plan porté ne change pas de plus de 2 % hors des zones nommées ci-dessous.

#### Avenue, `scene_a.py` (OUV, P1)

Sens de marche +y_A, mer à +x_A. Du lieu à la ville : (y_A − 359,69 ; −x_A − 433,20).

- **Joint avec le rond-point : la droite y_A = 340,69** (y_F −19,00), 19 m avant le centre de l'îlot. Chaussée 14 m (bordures x_A ±7,0), trottoirs 4,5 m (façades x_A −11,5, mur de promenade x_A +11,5), axe x_A 0 sur l'axe x_F 0. Voie de la berline x_A +1,75.
- **Garder** : y_A de 200 à 340,69 (en deçà de 200, facultatif : la caméra d'OUV part de y_A 257 et regarde devant).
- **Retirer** : tout ce qui dépasse y_A 340,69 (chaussée, trottoirs, mur, plage, lampadaires, palmiers, voitures) ; le rang de façades s'arrête à y_A ≤ 338, les deux rangs arrière aussi ; la « pointe de la baie », `sea_far`, `far_lighthouse` ; dalles et rangs arrière limités à x_A ≥ −89 (au-delà : le boulevard du quai, puis la lagune).
- **Ajouter** : un retour du mur de promenade le long de y_A 340,69, de x_A 11,5 à 46 (le mur du rond-point est en x_F 46) ; la plage s'arrête à ce retour.
- **Plans** : OUV, ancre (1,75 ; 264,85), berline de y_A 264,85 à 287,42, patrouille garée en y_A 284,85 ; P1 inchangé (y_A 288,0 à 317,55). Les 22 premiers mètres de P2 sont aussi sur l'avenue (y_A 318,2 à 340,7).
- **Devant la caméra** : l'îlot dans l'axe, de 102 m (OUV/1) à 50 m (P1/48) ; la bouche de la rue à gauche, de 104 à 53 m (x 30 % puis 8 %) ; au-delà de l'îlot, l'avenue nord du rond-point tient le point de fuite.

#### Rond-point, `scene_f.py` (P2)

La berline arrive par la branche sud (270°, vers +y_F), sort par la branche des enseignes (180°, vers −x_F). Du lieu à la ville : (y_F ; −x_F − 433,20).

- **Joint sud, avec l'avenue : y_F = −19,00.** Chaussée 14 m (x_F ±7,0), trottoirs à porter de 4,0 à 4,5 m entre y_F −15 et −19 (façades x_F −11,5, mur +11,5). Rien au sud : branche sud, places, terrasses et sol retirés pour y_F < −19.
- **Joint ouest, avec la rue : x_F = −18,20** (s 91,0 de la rue). Chaussée 8 m (y_F ±4,0), trottoirs 3 m, façades y_F ±7,0. Rien à l'ouest pour y_F < 24 : branche des enseignes, sol, terrasses retirés pour x_F < −18,2.
- **Garder** : l'anneau, l'îlot, la branche de la plage, l'avenue nord jusqu'à y_F 400 avec son rang (y_F ≥ 24), son mur (x_F 46), sa plage ; la dalle de ce rang limitée à x_F ≥ −89.
- **Retirer aussi** : les terrasses des deux angles ouest si elles touchent le bâti de la rue ou de l'avenue (carte) ; le sol sombre et la dalle au-delà des limites ci-dessus ; le faux phare.
- **Plan** : P2, 110 images, ancre `(("s", S_ARC2 - 20), (1.75, -49.84), 0)`. Cercle nominal de centre (−28,25 ; −29,84), rayon 30 : il passe à 11,1 m du centre de l'îlot. P2/1 en (1,75 ; −41,45), sur l'avenue ; P2/110 en (−29,15 ; 0,25), 11 m dans la rue. P2 filme donc l'avenue, le rond-point et la rue : les trois sont dans sa scène.
- **Devant la caméra à P2/110** : le barrage à 31 m, le quai à 86 m, le pylône du vrai pont à 281 m (10,5° de haut).

#### Rue des enseignes, `scene_b.py` (P3)

Du lieu à la ville : (x_B ; s − 506,0). Repère de vue du fichier : y_vue = 134 − s.

- **Joint avec le rond-point : s = 91,0** (y_vue 43). Chaussée 8 m (x_B ±4,0), trottoirs 3 m, façades ±7,0. Le centre de l'îlot est en s 72,8 (y_vue 61,2), x_B 0.
- **Joint avec le pont : s = 178** (y −328), fin du boulevard du quai. Le pont apporte la chaussée de 14 m de s 178 à 186 (début du tablier) ; la rue garde le boulevard (s 162 à 178), le mur du quai (s 181) et son garde-corps, avec une ouverture de ±9,7 m au lieu de ±8,5.
- **Retirer** : tout ce qui est à y_vue > 43. `Y_END` 133 → 43 ; `LEFT` garde les dessins de y_vue −28, −16, 2, 14, 32 ; `RIGHT` ceux de −28, −16, 4, 22 et celui de 34 raccourci à 9 m ; `SPANS` de 46 et plus, `LAMPS` de 46, 76 et 106, les trois `PARKED` ; l'enseigne sur mât (y_vue 72) ramenée à y_vue 38 ou retirée ; `build_ring_end` entier ; dans `build_street_end`, le faux pont (s 181 à 600) et son pylône, `rue_eau`, l'autre rive, les mâts du port ; le faux phare.
- **Ajouter : les deux immeubles du quai.** Le dernier dessin de chaque côté (y_vue −28, s 150 à 162) passe à 9 ou 10 niveaux (30 à 33 m), fenêtres éclairées, un bandeau lumineux sans texte en couronne. Raison : depuis le 200 mm de P4, la crête du pont cache tout ce qui est plus bas que 1,2 + 0,0353 × d (d = distance à l'objectif), soit 14,8 à 15,2 m à ces immeubles (d = 384 à 396 m) ; toute la rue actuelle (7 à 14 m) est cachée. À 32 m, on en voit 17 m : 2,5°, un quart de la hauteur du cadre. Chaque niveau en plus ou en moins vaut 0,5°. Le cadre de P4 ne fait que 37 m de large à cette distance (x de −14 à 23) : ce sont ces deux immeubles ou rien. Une version lointaine (boîtes à fenêtres procédurales, bandeau) pour la scène de P4.
- **Plan** : P3, ancre inchangée. P3/1 en s 102,5, sa caméra en s 95,0, 4 m après le début de la rue ; barrage s 126.
- **Devant la caméra** : le vrai pont dans l'axe, pylône à 281 puis 252 m (10,5 puis 11,7° de haut), encadré par les deux immeubles du quai. Le phare (7 à 13° à droite, 520 à 550 m) reste caché par le côté droit de la rue.

#### Pont, `scene_c.py` (P4)

Pose : identité.

- **Joint avec la rue : y = −328.** `pont_ville` ramené à y de −328 à −320 : 14 m (x ±7,0), trottoirs 2 m, sans lampadaire. La culée limitée à y de −325 à −320 ; le sol de l'avenue retiré.
- **Joint avec le port : le pied de la rampe, y = −5** (z nul à partir de y +1). Parapets, trottoirs et garde-corps continuent jusqu'à y −5 (ils s'arrêtent à −20). Le mur sud du port est en y −66,4 : de là au pied, la rampe passe sur le terre-plein (tablier à 3,7 m au mur) ; des murs de soutènement sous ses rives (x ±9,7) remplacent les piles de −55 et −20.
- **Retirer** : l'avenue de la ville (y −1000 à −328) et ses lampadaires ; dans `plan_P4`, le port, la jetée et le phare de `L.panorama` (ils viennent de la ville, à leur pose) ; la ville lointaine ramenée à `depth=100, gap=(-8, 8)`.
- **Plan** : P4, ancre `(48, (5.25, -5.69), CAP_B)`, caméra fixe (4,65 ; 40,0 ; 1,2). La berline dans la voie x 5,25 (1,80 aujourd'hui), de y −43,84 à −5,69 ; la meute décalée d'autant, dans x ±6. La crête est à 170 m de l'objectif (140 aujourd'hui) : étagement −18 %, à juger en gris sur les six rampes de P4/1.
- **Derrière la meute** : la crête et le pylône à 170 m, puis les deux immeubles du quai à 384 à 396 m, la fente de la rue entre eux, la ville lointaine de part et d'autre. Flou de 7 pixels sur 1 080 à cette distance (200 mm, f/4, point à 46 à 84 m) : des boîtes suffisent.

#### Port, `scene_e.py` (P5)

Du lieu à la ville : (x_E ; y_E − 46,40).

- **Joint avec le pont : le pied de la rampe en y_E = 41,4**, z nul à partir de y_E 47,4. De y_E −20 à 41,4 la rampe passe au-dessus du terre-plein : hauteur `scene_c.deck_z(y_E - 46.4)`, à rendre par `deck_ground` pour |x_E| ≤ 9,7. La voie plate du pont, ses marquages et les murs de conteneurs qui la bordent ne commencent qu'à y_E 41,4. Voie de la berline x_E 5,25.
- **Joint avec la jetée : le segment de (27,5 ; 77,6) à (18,85 ; 87,86)**, perpendiculaire à l'axe de la jetée (y_D 328,8), 13,4 m. L'axe de la jetée passe en (12,13 ; 73,47), cap −50°, direction (0,766 ; 0,643) ; il coupe le joint en (23,1 ; 82,7). Chaussée de 8 m centrée sur l'axe.
- **Le terre-plein devient le polygone** (−60 ; −20), (100 ; −20), (100 ; 77,6), (27,5 ; 77,6), (18,85 ; 87,86), (10 ; 80,43), (10 ; 100), (−60 ; 100). L'eau entre donc au nord de la voie du quai à droite de la jetée, et dans une encoche de 50° à sa gauche, dès y_D 317,3.
- **Retirer** : le terre-plein hors du polygone ; les piles de conteneurs du nord-est ((38 ; 88) et suivantes) ; le mât (94 ; 92) ; l'ouverture de la jetée en x_E 80 dans `_edges`.
- **Déplacer** : le mur de conteneurs de y_E 84,2 à **89,0**, de x_E −30 à 8 : l'objectif de P4 est en (4,65 ; 86,4 ; 1,2) et regarde vers −y ; rien de plus haut que 0,9 m devant lui entre x_E 3 et 6,5 (les séparateurs de y_E 80,6 à vérifier). Le mât clé de (32 ; 90), à 9 cm de l'axe de la jetée, à **(38,4 ; 82,3)**, sur un épaulement de 5 × 5 m accolé au flanc droit de la jetée ; son faisceau vers le virage tourne de 16°, à reprendre par la lumière de P5.
- **Ajouter** : quai, couronnement et garde-corps le long de y_E 77,6 (de x_E 27,5 à 100) et le long de l'encoche ((18,85 ; 87,86), (10 ; 80,43), (10 ; 100)) ; les deux rives d'une voie de 8 m peintes sur le terre-plein, de la sortie du virage (13,1 ; 71,9) au joint.
- **Plan** : P5, ancre inchangée. P5/1 en (5,25 ; 41,50), sur le raccord du pied (z 9 cm, nul à l'image 9) ; sa caméra est sur la rampe, en y_E 34,0, tablier à 0,44 m. P5/60 en (12,79 ; 71,43), cap −46,6°.
- **Devant la caméra à P5/60** : la jetée, la pointe à 124 m, le phare à 152 m (6,7° de haut).

#### Jetée et pointe, `scene_d.py` (P6, FIN, FIN6)

Du lieu à la ville : (0,6428 x_D + 0,7660 y_D − 280,16 ; −0,7660 x_D + 0,6428 y_D − 113,76).

- **Joint avec le port : la droite y_D = 328,8**, perpendiculaire à l'axe x_D 80. Chaussée 8 m (x_D 80 ± 4,0), trottoirs 2 m, couronnement à ±6,7. Avant, c'est le terre-plein du port.
- **Retirer** : la jetée pour y_D < 328,8 (`JY0` 100 → 328,8), ses lampadaires avant y_D 315, le lampadaire droit de y_D 315 (il tomberait dans la voie du quai ; le gauche reste, sur le terre-plein) ; le pont et le port lointains de `L.panorama`.
- **Garder** : la jetée de 328,8 à 400, la pointe, le phare ; garde-corps à partir du joint.
- **Plans** : P6, ancre inchangée : P6/1 en (81,86 ; 313,18), sur le terre-plein ; l'eau à gauche à partir de y_D 317,3 (image 10), à droite à partir de 328,8 (image 33, le passage du joint). FIN et FIN6 inchangés sur la pointe ; leur fond change : le coin du port est à 40 m du bord de la pointe (330 aujourd'hui), à juger en gris.

## 3. Ce que chaque caméra voit

Cadre de poursuite : 24 mm, demi-champ 22,9° en largeur. « x » depuis la gauche.

### 3.1 Les voisins dans le champ

| Image | Devant | Aussi dans le champ |
|---|---|---|
| OUV/1 à OUV/40 | l'îlot dans l'axe, à 123 puis 101 m ; ses palmiers font 5,6 puis 6,8° | la bouche de la rue à gauche, x 33 puis 29 % |
| P1/1 à P1/48 | l'îlot à 79 puis 50 m (8,6 puis 13,6°) | la bouche de la rue à x 24 puis 8 %, à 53 m : ses premières façades et ses guirlandes |
| P2/110 | **le barrage à 31 m** (x 41 %), le quai à 86 m | le pylône à 281 m, 10,5° de haut, x 38 % ; les mâts du port au-dessus du tablier |
| P3/1 à P3/48 | le barrage à 31 puis 2 m ; le quai à 86 puis 57 m | le pylône à 281 puis 252 m (10,5 puis 11,7°), au centre ; le phare à 548 puis 519 m (1,9°), x 65 puis 78 % : **caché par les deux derniers immeubles de droite** |
| P4 | la meute sur la rampe, la crête à 170 m | derrière la crête : voir 3.2 |
| P5/1 | le terre-plein, les murs de conteneurs | le virage à 32 m à droite |
| P5/60 | **la jetée, la pointe à 124 m**, x 67 % | le phare à 152 m, 6,7° de haut, x 63 % |
| P6/1 à P6/60 | la pointe à 123 puis 93 m | le phare à 152 puis 122 m (6,7 puis 8,4°), x 62 puis 44 % ; le bord de la voie du quai au bord droit sur les premières images |

- **Le rond-point.** Le bloc sombre et le vide de la fin de P2 sont l'angle nord-ouest du décor actuel, où rien n'est bâti. Dans la ville, la rue rognée commence à 17 m de l'îlot : la fin de P2 montre ses guirlandes, le barrage à 31 m, le quai, le pylône éclairé. C'est la zone la plus chaude du cadre, sans rien ajouter.
- **La rue.** Le pont au fond se garde, mais c'est le vrai : crête et pylône 46 m plus loin que le faux, pylône de 52 m au lieu de 59, donc 11,7° au lieu de 16° à la dernière image.
- **Le phare** n'est plus visible depuis l'avenue : il est à 55° à gauche, derrière les immeubles. Il n'entre dans le film qu'à la fin de P5. Option pour le voir dès P3 : remplacer les deux derniers immeubles de droite (s 130 à 162) par une placette basse ; le phare, la pointe et le port s'ouvrent alors à droite du pylône. Non retenu d'office : c'est le décor du barrage.

### 3.2 Le 200 mm du pont regarde la ville qu'on vient de quitter

De l'objectif (1,2 m de haut), la crête est à 2,0° ; le cadre monte jusqu'à 7,3°. Derrière la crête, on ne voit donc que ce qui dépasse :

| Lieu | Distance | Visible au-dessus de | Ce qui y est | Verdict |
|---|---|---|---|---|
| Quai de la ville | 365 m | 14,1 m | immeubles d'angle de 11 m | caché |
| Rue des enseignes | 381 à 454 m | 14,6 à 17,2 m | façades de 7 à 14 m, guirlandes à 9 m | cachée, sauf réservoirs de toit |
| Îlot | 473 m | 17,9 m | palmiers de 12,5 m | caché |
| Avenue | 485 m | 18,3 m | lampadaires de 8,2 m ; immeubles de 14 à 23 m | seuls les deux plus hauts dessins dépassent de 5 m |

La ville vraie est trop basse : ni la rue, ni ses guirlandes, ni les lampadaires de l'avenue ne passent la crête. Il faut de la hauteur éclairée au quai :

- **Deux immeubles de 9 à 10 niveaux (30 à 33 m) aux angles du boulevard du quai**, de part et d'autre de la sortie de la rue (x de ±8 à ±26, y −344 à −358), couronnés d'un bandeau lumineux sans texte. De P4 on en voit les 16 à 19 m du haut : 2,5 à 3,0°, un quart de la hauteur du cadre, sur 57 % de sa largeur ; entre eux, la fente de la rue.
- **La ville lointaine ramenée au vrai** : ouverture de ±8 m (la rue) au lieu de ±22, profondeur 100 m. Ses rangs flanquent la fente.
- **Le poids** : au 200 mm à f/4, mise au point sur la berline à 46 à 84 m, le fond à 365 m est flou de 7 pixels sur 1 080. Des boîtes à fenêtres procédurales (la matière de la ville lointaine) suffisent : une douzaine d'objets, aucune texture.
- Ces deux immeubles encadrent aussi le pylône à la fin de P2 et dans tout P3.
- Le ciel de P4 reste le côté nuit. Ce qui l'accorde aux autres plans : la ville éclairée derrière la meute, P3 qui passe lui aussi au côté nuit (3.3), et, si la lumière le veut, la bande rose pâle qu'un vrai crépuscule porte à l'opposé du couchant (5 à 15° de hauteur).

### 3.3 La bande corail : un seul azimut

L'avenue va à −90°, la rue et le pont à 0°, la jetée à −50°. Force de la bande (cos³ de l'écart, loi actuelle) au bord gauche, au centre et au bord droit du cadre :

| Azimut de la mer | Avenue (OUV, P1) | Rue (P3), début de P5 | Jetée (fin de P5, P6, FIN) | P4 |
|---|---|---|---|---|
| 0° (devant sur le pont) | 0,06 / 0 / 0 | 0,78 / 1 / 0,78 | 0,85 / 0,42 / 0,08 | 0 |
| −45° | 0,80 / 0,35 / 0,05 | 0,05 / 0,35 / 0,80 | 0,72 / 0,99 / 0,84 | 0 |
| **−70°** | 1,00 / 0,83 / 0,39 | 0 / 0,04 / 0,32 | 0,39 / 0,83 / 1,00 | 0 |
| −90° (devant sur l'avenue) | 0,78 / 1 / 0,78 | 0 / 0 / 0,06 | 0,12 / 0,45 / 0,87 | 0 |

**Recommandation : −70°**, la bissectrice de l'avenue et de la jetée, sans toucher à la loi du ciel. Plan par plan, écart à l'axe de la caméra :

| Plan | Bande | Lecture |
|---|---|---|
| OUV, P1 | 20° à gauche | au point de fuite, un peu à gauche ; 83 % au centre |
| P2 | de 20° à gauche à 64° à droite | elle sort par la droite quand la berline tourne vers la rue |
| P3 | 65 à 70° à droite | hors champ, derrière les façades ; le ciel de la fente est le côté nuit, la rue s'éclaire seule |
| P4 | 110° | côté nuit, comme P3 : la coupe ne change plus d'heure |
| P5 | de 70° à 29° à droite | elle rentre par la droite pendant le virage |
| P6, FIN | 20° à droite | pleine au bord droit ; le phare est sur la bande à 78 % |

Ce que cela raconte : le couchant à l'ouverture, la ville qui le cache, le large qui le rend. À juger sur deux images, P1/30 et P6/30, à ±10° près. Dans chaque lieu, `mer` = −70° − rot du lieu : +20° pour A et F, −70° pour B, C et E, −20° pour D.

## 4. Les raccords transversaux

Les raccords de chaque lieu sont en 2.5. Restent ceux qui n'appartiennent à aucun lieu :

| Raccord | Quoi | Fichier | Effort |
|---|---|---|---|
| Lointains vrais | `L.panorama` ne pose plus pont, port ni jetée : ils viennent de la ville, à leur pose, dans leur version « loin » ou « près » selon la scène ; `distant_city(depth=100, gap=(-8, 8))`, jamais avec A, F ou B | `lieux.py`, `ville.py` | 2 h |
| Eau | un seul plan (z −1,5) pour la lagune et l'océan ; A, F et B ne posent plus le leur | `ville.py` | 0,5 h |
| Mer | `MER_VILLE` = −70° ; chaque scène reçoit −70° − rot ; `phare_lointain` plus appelé | `lieux.py`, scènes | 1 h |
| Immeubles du quai, version lointaine | boîtes à fenêtres et bandeau, aux cotes de 2.5 (rue) | `scene_b.py` ou `lieux.py` | 1 h |

Effort des lieux (2.5) : avenue 1,5 h, rond-point 1,5 h, rue 4 h, pont 1,5 h, port 5 h, jetée 1,5 h.

## 5. Le poids

Mesuré : P3 synchronise 2 464 objets et 311 textures, 6 à 7 Go de mémoire vidéo, construction 107 s ; P6, 39 s. La carte a 48 Go : la mémoire n'est pas la limite, c'est la construction (un cœur) et la synchronisation par image.

Estimé d'après le code, à mesurer dès la première carte (`lieux.stats()` par lieu) :

| Lieu | Objets, près | Loin |
|---|---|---|
| Avenue entière | 2 000 à 2 500 | la ville lointaine |
| Avenue, y_A 200 à 340 | 700 | |
| Rond-point (avenue nord coupée à 200 m) | 500 | |
| Rue rognée, barrage compris | 1 300 | 300 (à écrire) |
| Pont, pylône | 80, plus 12 véhicules | 40 |
| Port | 600 | 150 |
| Jetée et pointe | 250 | 60 |

**La règle : une scène par prise, pas par plan.** Une coupe ne disparaît que si les deux côtés montrent le même monde au même niveau de détail.

| Prise | Près | Loin | Objets, ordre de grandeur |
|---|---|---|---|
| OUV | avenue (y_A 200 à 340), rond-point | rue | 1 500 |
| P1 + P2 + P3 | avenue (y_A 250 à 340), rond-point, rue, barrage | pont et pylône, mâts du port, immeubles du quai | 2 900 |
| P4 | pont, meute | socle du port, ville lointaine, immeubles du quai | 300 |
| P5 + P6 | port, jetée, pointe, phare | pont (sous la caméra à P5/1), autre rive | 1 000 |
| FIN, FIN6 | pointe, jetée, phare | port (à 50 à 150 m : conteneurs en blocs), pont, ville lointaine | 500 |

Plafond par prise : 4 000 objets, 12 Go, 180 s de construction, faite une fois (`debit.py` : la clé du cache prend la prise au lieu du plan). `ville.py` ne charge d'un lieu que ce qui entre dans le champ d'au moins une image de la prise (marge 10°) ou se trouve à moins de 30 m de la caméra.

## 6. Les films et les coupes

| Raccord | Avant | Dans la ville |
|---|---|---|
| OUV / P1 | coupe | coupe : ellipse de temps |
| P1 / P2 | coupe, 83 m sautés | **disparaît** : même prise, même bras |
| P2 / P3 | coupe, 100 m sautés | **disparaît** : le barrage est déjà dans le cadre 40 images avant |
| P3 / P4 | coupe | coupe : 331 m, inversion d'axe |
| P4 / P5 | coupe, 76 m sautés | changement de caméra, temps et espace continus |
| P5 / P6 | coupe, 290 m sautés | **disparaît** |
| P6 / FIN6, Pn / FIN | encre | encre |

- La prise P1 à P3 dure 206 images (8,6 s), la prise P5 à P6 120 (5 s).
- Les débuts de plan restent les seuils d'étoiles : `SHOT_START` devient OUV 0, P1 40, P2 88, P3 198, P4 246, P5 294, P6 354. Un film court s'arrête sur un seuil, au milieu d'une prise, sous l'encre.
- Films : une étoile 164 images (inchangé), deux 274, trois 322, quatre 370, cinq 430, six 518. Tout film de deux étoiles et plus gagne 26 images.
- La bascule vers FIN ne change pas : la fin est à la pointe, l'encre couvre le trajet. Son décor devient le vrai : port à 50 m, pont, ville.
- À mettre à jour ensemble : `shared/film/cut.ts`, `render_film.FALLBACK_FRAMES`, `test_motion.py`, les constantes de P2 indexées par image.

## 7. Le plan d'exécution

Chaque étape se vérifie en gris (`render_film.py --dry`) et sur la carte de `ville.py`.

| # | Étape | Fichiers | Critère chiffré | Avec |
|---|---|---|---|---|
| 0 | Socle : poses, carte, prise continue (en cours) | `ville.py` | les poses de 2.2 à 5 cm près ; la carte liste les chevauchements de 2.4 et aucun autre | |
| 1 | La route : 2.1 | `parcours.py`, `cut.ts`, `test_motion.py` | `motion.py mesure` dans les plafonds ; P2/110 en (−29,15 ; 0,25) dans F ; P4/48 à 0,79 m de P5/1 ; total 414 | 0 |
| 2 | Rognages, un agent par fichier | `scene_a`, `scene_f`, `scene_b`, `scene_c` | carte : aucune emprise de A, F, B, C ne se recouvre ; cadres gris d'OUV, P1, P3 inchangés à 2 % près | après 0 |
| 3 | Port et jetée | `scene_e`, `scene_d` | de P6/1 à P6/60, l'eau à moins de 7 m des deux côtés à partir de l'image 20 ; aucun objet à moins de 3 m de la berline, 0,8 m de la caméra | avec 2 |
| 4 | Raccords de sol et immeubles du quai (section 4) | `scene_a`, `scene_b`, `scene_c`, `scene_e` | prise continue grise : aucun trou de sol, aucune marche de plus de 2 cm sous les roues | après 2 et 3 |
| 5 | Prises et lointains vrais | `ville.py`, `lieux.py`, `debit.py`, `render_film.py` | une construction par prise, moins de 180 s et de 4 000 objets ; aux trois coupes supprimées, deux images consécutives diffèrent de moins de 2 % hors berline | après 4 |
| 6 | Plans recalés : P2 (110 images), P4 (fenêtre, caméra, voies de la meute) | `p2_arc`, `scene_f`, `p4_pont`, `scene_c` | contrôles v3.1 de `motion.py mesure` ; six rampes comptées à P4/1 | après 1, avec 2 à 5 |
| 7 | Mer et phare | `lieux.py`, scènes | une image éclairée par prise ; ciel au centre de P1/30 et de P6/30 entre 30 et 41 % | après 5 |

Ce qui se garde tel quel : `parcours.py` dans sa structure, le bras commun, les plans portés OUV, P1, P3, P5 et P6 (ancres inchangées ; P3 à P6 ne font que commencer 26 images plus tard), la lumière commune (sources, chaussée, phares), le cache. Ce qui est à refaire : le portage de P2 (ancre, durée, minutage des patrouilles), celui de P4 (ancre, caméra, voies), le phare lointain d'OUV à P3, l'azimut du ciel de chaque scène, le mât clé de P5, les appels à `panorama`.

Trois portes, à trancher sur une image grise, sans attendre :

- **P4 glissé.** Son objectif tombe derrière les séparateurs et le mur de conteneurs. Soit ce mur et deux séparateurs sont absents de la prise de P4 (étagement −18 %), soit la caméra recule devant eux, en (4,65 ; 31,6), au 163 mm (étagement −29 %). Si aucune des deux ne tient les six rampes : P4 reste à sa place et le port aussi (t = 0), saut de 76 m caché par l'inversion d'axe.
- **Port et jetée.** Si la prise grise P5 + P6 n'est pas propre vendredi soir : la jetée reste à sa place (pose du port), coupe gardée P5 / P6.
- **P2 à 110 images.** Si c'est trop long à l'image : `R2` = 24 m.

## 8. Avis

- **Ce qui tient avant dimanche midi** : la ville d'un seul tenant de l'avenue au quai, la prise continue P1 à P3, le vrai pont au bout de la rue, le pont raccordé au port, un seul ciel. C'est du rognage et du paramétrage de décors existants, vérifiable en gris en une demi-journée.
- **Ce qui est à pile ou face** : le port redécoupé. Sept heures de décor, puis la lumière de P5 à reprendre (son mât clé bouge) et le fond de FIN6 à revoir (le port passe de 330 à 50 m de la pointe). La porte de vendredi soir est là pour ça.
- **Ce qui ne tiendra pas** : un film sans aucune coupe d'espace. Le trou de la rue au pont reste. Il ne se verra pas comme un défaut : on quitte la rue en voyant le pont, on retrouve la berline dessus, la ville derrière elle.
- **Le risque principal n'est pas le décor mais le plan préféré du client.** P4 change de place, de voie et de fond ; il faut le juger en gris avant tout le reste, et garder sa version actuelle prête.
- **Le calendrier** : ville grise complète vendredi midi ; raccords et prises vendredi soir ; une image éclairée par prise samedi matin ; brouillons samedi après-midi ; rendu final dans la nuit de samedi. 546 images au lieu de 520, et la prise P1 à P3 pèse plus que P3 seul : compter 10 % de temps de rendu en plus.
