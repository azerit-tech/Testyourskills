# Plan de lumière v3.1 de la poursuite

Le positif des règles de lumière v3.1 (`SPEC.md` §18.36) : une seule intention, de la première image à la dernière, et ce que chaque plan doit montrer. Écrit le 12 novembre 2026 sur les brouillons v3.1 (`design/film/ref/iter/v31/`), sans rendu. Les règles A à F du §18.36 restent la loi ; ce document dit quoi faire à l'intérieur. Les désaccords sont à part, en section 6.

Conventions. Les luminances sont en % sRGB sur l'image affichée (Rec. 709, comme `lumiere/*/mesure.txt`). Les images sont comptées depuis 1 ; les positions dans le cadre, x depuis la gauche et y depuis le haut. P2 et FIN6 changent de durée en ce moment : leurs images sont désignées par ce qu'elles montrent. « EV » : un diaphragme, un facteur 2 d'éclairement. Les puissances sont des **valeurs de départ** : c'est le critère à l'image qui tranche, pas le chiffre en watts. Extraits et mesures de travail : `design/film/ref/iter/v31/plan-lumiere/`.

---

## 1. L'intention

1. **L'heure** : la fin de l'heure bleue, vingt-cinq minutes après le coucher du soleil, juste après l'averse. Le ciel porte encore, la ville vient de s'allumer. Rien de cela ne bouge en quinze secondes.
2. **L'ambiance** : deux teintes seulement se partagent l'image, l'indigo violet du ciel (froid, partout, doux) et l'ambre des lampadaires (chaud, en îlots). Tout le reste est petit : des points, pas des nappes.
3. **Ce que l'œil suit** : les deux feux arrière rouges de la berline et le reflet indigo rosé du ciel sur son toit et son coffre, identiques dans tous les plans de dos. Au second regard, le point crème du phare, toujours à droite ou au-dessus d'elle.
4. **Ce que la lumière raconte** : elle quitte la ville chaude pour la mer froide. L'ambre est dense rue des enseignes, s'espace sur le pont et le port, n'est plus qu'une file sur la jetée, une seule lampe à la pointe ; en sens inverse, la bande corail de l'horizon et la lanterne du phare grandissent. À la fin il ne reste qu'elle, tenue par un faisceau froid au pied d'une lanterne chaude.
5. **Les poursuivants** sont des étincelles corail et violet rose qui se multiplient (une rampe, deux, le barrage, dix). C'est leur nombre qui monte, jamais leur éclairement : aucune ne peint le décor.

La seule progression est celle des lieux. Le ciel, l'exposition, la chaussée, la teinte des lampadaires et la lumière de la berline ne changent pas d'un plan à l'autre.

---

## 2. Le système commun

### 2.1 Le ciel

Un seul monde : `scene_a.make_world`, posé partout par `lieux.sky(scene, yaw)`. Ses valeurs ne se touchent plus.

| | Horizon | | | | Zénith |
|---|---|---|---|---|---|
| Côté mer (hauteur) | 0° | 1,7° | 4,6° | 17,5° | ≥ 44° |
| teinte | `#ff6a3d` (corail) | `#b9586f` | `#4b4fb8` (indigo) | `#303c80` | `#243152` |
| Côté nuit (hauteur) | 0° | 5,7° | ≥ 30° | | |
| teinte | `#3c3f86` | `#2f3a78` | `#243152` | | |

- Passage d'un côté à l'autre : cos³ de l'écart à l'azimut de la mer (la bande a 75° de large à mi-force). Force du fond 0,55, nuages de l'image de ciel comprimés (0,9 × racine), 5 % de sa couleur.
- À l'écran, mesuré sur l'avenue : ciel côté mer entre 10 et 25° de hauteur `#5c5b89` à `#6a649c` (37 à 41 %) ; à la mesure commune, teinte 236 à 238°, saturation 35 %, luminance 33 %. Côté nuit : `#1e264a` (15 %). Ce sont les deux cibles, à ± 3 points.
- **La bande est dans l'azimut de la mer, donc devant la berline dans tous les plans de dos.** Par lieu :

| Lieu | Aujourd'hui | À poser |
|---|---|---|
| Avenue (`scene_a`) | bande vers +y, au point de fuite | inchangé |
| Rond-point (`scene_f`, `scene_carrefour`) | `A.make_world`, bande au nord ; fin de plan sur un ciel marine vide (`#202b49`, 17 %) | `lieux.sky(scene, yaw=radians(35))` : bande 35° à gauche de l'axe de l'avenue, vers la sortie ; visible au bord gauche à l'entrée, devant à la sortie |
| Rue des enseignes (`scene_b`) | son propre monde `blue_hour_b`, sans bande, bleu saturé (`#282c5a`, saturation 56 %) | `scene_b.make_world` retiré ; `lieux.sky`, bande dans l'axe de la rue, derrière le pylône du pont |
| Pont (`scene_c`, P4) | `yaw = pi − 70°`, plus `p4_sky_veil` | `yaw = 0` : la bande est derrière la caméra, le cadre voit le côté nuit du même ciel (15 %) |
| Port, jetée, pointe (`scene_e`, `scene_d`) | `yaw = pi` (défaut de `lieux.sky` et `lieux.panorama`) : bande derrière la ville, donc derrière la caméra ; ciel `#1a2245` (14 %) | **défaut à `0`** : bande vers +y, derrière le phare |

- `plan_FIN` veut déjà remettre la bande devant, mais sa boucle teste `n.type == "VECT_ROTATE"` et le brouillon n'a pas de bande (ciel `#1c2447` à l'horizon) : le type du nœud posé par `lieux.sky` est à ma connaissance `VECTOR_ROTATE`, la boucle ne trouverait donc rien (non vérifié, je n'ai rien exécuté : une ligne dans la console le dit). Avec le défaut à 0, cette boucle disparaît de toute façon.
- Sont retirés, parce qu'ils fabriquent un second ciel : `scene_f.build_dusk` (`horizon_glow`, le bosquet `se_up_*` à 5 × 3000 W, `lamp_se_*`, faits pour une caméra qui n'existe plus) ; dans `p4_sky_veil`, la branche réservée aux rayons réfléchis (voile et lueur montés jusqu'à 15° pour teinter les flaques). Le voile de nuages de P4 vu par la caméra peut rester, à la teinte du côté nuit.

### 2.2 L'exposition

AgX, contraste « Medium High », `film_exposure = 1.0`, `view_settings.exposure = 0.0` : `scene_a.render_settings` pour tous, aucun plan n'y touche. Même halo de compositing partout.

| Zone | Cible | Plage |
|---|---|---|
| Ciel côté mer (10 à 25° de hauteur) | 37 % | 34 à 41 |
| Ciel côté nuit (P4) | 15 % | 13 à 18 |
| Chaussée, médiane (45 % du bas, hors berline) | 12 % | 8 à 16 |
| Chaussée au cœur d'une flaque de lampadaire | 20 % | ≤ 22 |
| Marquages au sol | — | ≤ 40 |
| Caisse de la berline, médiane (mesure commune) | 15 % | 13 à 17 |
| Coffre, à plat (le diffus de la peinture) | 11 % | 9 à 13, teinte 340 à 358°, saturation ≥ 45 % |
| Toit, le reflet du ciel | 20 % | 18 à 24 |
| Façades (P3), médiane | 28 % | ≤ 35, crête ≤ 50 |

Les sources, à l'écran : lentille de rampe allumée 60 à 80 %, saturée, jamais blanche ; feux arrière 35 à 50 % (`#c63f1b` aujourd'hui, juste), feux stop 60 à 70 % ; tête de lampadaire 80 à 90 %, **ambre** (aujourd'hui `#fffbf3`, 98 %, blanche) ; cœurs de phare et lanterne du phare : les seuls à atteindre le blanc.

### 2.3 La hiérarchie

L'éclairement du ciel sur une surface à plat est la référence (0 EV). Sur l'image : le ciel est la plus grande plage claire, la berline est un cran sous lui, la chaussée un cran sous elle.

| Source | Sur quoi | Rapport au ciel |
|---|---|---|
| Ciel | tout | 0 EV : c'est la lumière d'ambiance du film |
| Lampadaire, au cœur de sa flaque | chaussée, berline | + 1 EV au plus (aujourd'hui environ + 2) |
| Appoint de poursuite (2.5) | berline seule | + 0,5 EV sur le coffre |
| Phares d'un poursuivant | chaussée devant lui ; bas de caisse de la berline | + 1,5 EV au cœur du cône, à 5 m ; + 1 EV sur la berline à 14 m, + 2 à 6 m |
| Rampe | toit et capot de sa patrouille ; chaussée | − 1,5 EV à 3 m, − 3 EV à 6 m ; rien de mesurable sur la peinture de la berline |
| Enseignes et guirlandes (P3) | façades, chaussée | + 1,5 EV sur les façades, + 0,5 sur la chaussée |
| Faisceau d'hélicoptère | sa tache, la berline | + 2 EV sur le toit : la plus forte lumière posée sur elle, réservée à P5, P6, FIN, FIN6 |
| Lanterne du phare | la tour, la pointe (FIN, FIN6) | + 0,5 EV au pied ; ailleurs elle ne fait que se voir |

La lumière principale du film est donc **le ciel**, relevé par les lampadaires. Phares, rampes, enseignes sont des accents. Le faisceau est l'accent de la fin.

### 2.4 La palette

| Famille | Teinte | Température | Valeur de départ | Aujourd'hui |
|---|---|---|---|---|
| Lampadaires (tous lieux, mâts du port compris) | `#ffc36b` | ≈ 2300 K | spot 130°, 1200 W pour une tête à 8,2 m (`energy = 1200 × (h / 8,2)²` : 660 W rue des enseignes) ; tête émissive à 4 | 2600 W (avenue, rond-point, jetée), 1800 W (rue), 3200 W (pointe), mâts du port 45 à 60 kW ; têtes à 40 |
| Guirlandes et lanternes (P3) | `#ffcf8a` | ≈ 2700 K | ampoules à 6, lanternes à 8, `lantern_*_down` 250 W | 28, 40, 500 W |
| Phares de la berline | `#ffe6b8` | ≈ 3000 K, plus jaunes que les autres : on la retrouve dans la meute | 150 W par phare, codes | 90 W (avenue), 400 W (rond-point), 900 W (rue) |
| Phares des poursuivants | `#fff1dc` | ≈ 4000 K | 150 W par phare, codes | 450 W, ramenés à 120, 135 ou 150 au cas par cas |
| Feux arrière | `#ff2a1a` | rouge | émission 9 ; stop × 3 ; lueur portée 3 W | `hero_cars.TAIL` est corail `#ff6a3d` : à passer au rouge |
| Rampe, côté gauche | `#ff6a3d` corail | — | lentille `BAR_GLOW` 2, cœur × 2,2 ; `lightbar_lights(energy=40)` | 600 W |
| Rampe, côté droit | `#c27af2` violet rose | — | idem | 600 W |
| Enseignes | crème `#ffe2b0`, menthe `#6dff9a`, turquoise `#4ad8ff`, rose `#ff7ab0`, ambre `#ffb03a` | — | émission ≤ 6 | `SIGN_COLORS` contient aussi `#ff4a3a`, `#ff6a3d`, `#b07aff` |
| Faisceau d'hélicoptère | `#e2eaff` | ≈ 7500 K, la seule lumière froide | cône de 5°, cône visible (`beam_cones`) à 0,6 | 8 kW à 1,6 MW selon le plan |
| Lanterne du phare | `#fff9cb` crème | ≈ 5000 K | émission 30 de près, 150 de loin ; pinceaux `#fff4dc` | juste |
| Habitacle | `#ffcf9a` | — | `cabin_light` 25 W | juste |

- **Corail et violet rose sont réservés aux rampes.** Aucune enseigne, aucun feu de décor de ces teintes : les trois couleurs en trop sortent de `SIGN_COLORS`, les feux du pylône (`pylone_feu`, corail, 4000 W) passent à l'ambre fixe, 400 W. C'est ce qui rend une rampe lisible à 60 m sans la gonfler.
- **Le blanc froid est réservé aux hélicoptères, le crème à la lanterne et aux guirlandes.**
- **Codes pour tout le monde** : un phare est un spot de 24°, fondu 0,5, incliné de 11° vers le sol. Il éclaire la chaussée de 2 à 40 m devant sa voiture et s'éteint au-delà ; il n'envoie rien au-dessus de l'horizon. Un seul réglage dans `cast_vehicles.headlight_spots` et pour la berline, plus de retouche par scène.
- **Brume** : densité 0,0006, `#b8b4d8`, anisotropie 0,45 partout (P4 reste à 0,0002, il regarde à travers 300 m d'air ; P5 descend de 0,0016 à 0,0008). Seuls prennent corps dans la brume les faisceaux d'hélicoptère et les pinceaux du phare, en géométrie émissive. Rampes, lampadaires et phares : `visible_volume_scatter = False`.

### 2.5 La berline reste bordeaux et lisible

Vue du cadre de poursuite (2,4 m, 7,5 m derrière, 24 mm), on voit le toit, la lunette, le coffre et le panneau arrière. Quatre choses la tiennent, les mêmes à chaque plan :

1. **Le reflet du ciel.** Le toit et le coffre renvoient le ciel entre 7 et 14° de hauteur, droit devant : l'indigo juste au-dessus de la bande corail, à un quart ou un tiers de sa force. Il suffit que la bande soit devant elle (2.1) pour que ce reflet soit le même de l'avenue à la pointe. C'est lui qui manque en P6 et en FIN (toit `#191319`).
2. **L'appoint de poursuite**, le seul appoint lié à la berline, identique dans tous les plans de dos : `lieux.car_fill(hero, loc=(0.0, -4.0, 6.0), energy=900.0, color="#ffd4b4", size=6.0)` (4 m derrière, 6 m au-dessus, lié à elle seule, sans les vitres ni la plaque, invisible à la caméra, à la brume et aux reflets). Au banc il donne le coffre à 347°, 14 %. De face (P4) : `loc=(0.4, 8.0, 2.2)`, 500 W, même teinte. Tous les autres appoints sont retirés : `hero_fill` de `scene_b` (150 W), l'appoint de flanc de `scene_f.keep_paint` (800 W, `#ffc89a`), `scene_e.car_fill` porté par la caméra (1400 W) et `car_side` (3000 W), l'appoint de face de `p6_clean_haze` (250 W).
3. **Les feux arrière**, toujours allumés : deux points rouges à 35 à 50 %, et sous eux deux virgules rouges sur le mouillé, d'un mètre au plus.
4. **L'habitacle** à 25 W : la tête et les épaules du conducteur en sombre sur un fond chaud.

Elle reçoit les lumières du décor à leur vraie force (c'est ce qui la pose dans le lieu) : les exclusions de `keep_paint` (lampadaires et projecteurs de l'îlot coupés pour elle) et de `fin_pack_lights` (phares de la meute coupés pour elle) sont levées. Si elle sort du bordeaux sous une source (coffre au-dessus de 17 % ou teinte hors de 340 à 358°), on baisse la source pour tout le monde. En dernier recours seulement, une jumelle liée (`scene_d.split_for_car`), jamais sous la moitié de ce que reçoit le sol. Sous le faisceau, la jumelle crème `#fff0d8` reste : la peinture ne supporte pas le xénon.

### 2.6 La chaussée humide

Un seul réglage, dans `road.STYLES["sechage"]` et `road.wet_shader`, pour toutes les chaussées. Sont retirées les recettes locales : `scene_c.p4_deck_puddles`, les flaques posées de P2, P3 et P6 (`scene_b.puddle_mat`) hors des caniveaux.

| | Départ | Aujourd'hui |
|---|---|---|
| Pellicule d'eau (`Coat Weight`) sur l'enrobé humide | 0,45 | 1,0 |
| dans une flaque | 1,0 | 1,0 |
| Rugosité de la pellicule, humide (`cr`) | 0,28 à 0,38 | 0,20 à 0,34 |
| Rugosité d'une flaque | 0,08 | 0,035 (0,05 en P4) |
| Seuil des flaques (`puddle`) | (0,75 ; 1,3), à régler pour que la part de surface en flaque soit ≤ 10 % | (0,45 ; 1,0) |
| Où sont les flaques | caniveaux, bord de chaussée, ornières de la voie d'en face | partout |

Aucune flaque dans la voie de la berline ni à moins de 3 m de la route de la caméra : c'est là que naissent les disques blancs du bas du cadre (une flaque y renvoie la tête d'un lampadaire en miroir).

**Vue à 2,4 m** (tous les plans de dos) :

- Du bas du cadre à l'arrière de la berline (de 4 à 6 m de l'objectif), l'eau renvoie moins de 10 % de ce qu'elle reflète : c'est de l'asphalte sombre et satiné, 8 à 14 %, sans aucune source lisible dedans. Toute plage claire à cet endroit est un éclairage direct trop fort, pas un reflet.
- Les reflets vivent au-delà de la berline, de 12 à 40 m, là où l'angle rase : sous chaque source, une traînée verticale, pas plus longue que la hauteur d'une voiture à l'écran (60 px à 390 px de large), pas plus large que deux fois la source, à la moitié de sa luminance au plus et jamais au-dessus de 45 %.
- Le reflet du ciel dans la chaussée lointaine la tient à 12 à 16 % : c'est ce qui sépare la chaussée du trottoir, pas une lumière.

**Au 200 mm rasant** (P4, objectif à 1,2 m, chaussée vue sous 0,5 à 5°) :

- La chaussée reflète le côté nuit du ciel : elle est sombre, médiane 8 à 16 % (aujourd'hui 35 %).
- Sous chaque paire de phares, deux traînées fines, longues d'une demi-hauteur de voiture pour la meute du fond, d'une hauteur et demie pour la berline en fin de plan ; cœur à 55 % au plus. Elles ne se touchent pas : entre deux voitures, la chaussée est noire.
- Sous chaque rampe, un trait de couleur plus court que la voiture qui le porte. **La chaussée ne change pas de teinte quand les rampes battent.**
- Moins de 1,5 % du cadre au-dessus de 70 %.

---

## 3. Les fiches

### OUV — Une belle soirée, une voiture qui rentre

- **Principale** : le ciel, bande corail au point de fuite (x 50 %). Les lampadaires des deux trottoirs, alternés tous les 15 m, la relèvent : à 50 km/h, une flaque passe toutes les 26 images.
- **Accents** : ses feux arrière et leurs deux virgules ; les vitrines et auvents de gauche (`shop_*`, `canopy_*`, `wash_*`, `blade_*`), qui n'éclairent que leurs façades et leur trottoir ; les phares de la patrouille garée à l'image 14 (deux points blanc chaud, de face, en codes) ; le phare à x 83 %.
- **À retirer ou baisser** :
  - `fill_*` (`scene_a`, huit réflecteurs de 2200 W, 32 × 9 m, « lumière de cinéma ») : retirés, sans source. Si les stucs tombent sous 12 %, ce sont les `wash_*` qui montent.
  - lampadaires 2600 → 1200 W, têtes 40 → 4 : la chaussée passe de 11 à 24 % en vingt images (image 20, `#533920`), le passage piéton est à 45 % à l'image 40.
  - les deux disques clairs en bas à droite à l'image 20 (x 70 à 82 %, y 83 à 85 % depuis le haut) : une flaque sous la caméra.
  - le phare ne se lit pas (on ne voit que son cap sombre) : halo de 6 à 8 px à 390 px de large, crème, le point le plus vif au-dessus de l'horizon (`phare_lointain`, `halo_deg`, `lanterne`).
- **Image clé : 20.** Berline au centre, ciel à 37 %, bande au point de fuite, la patrouille garée encore dans le cadre à gauche avec ses deux phares, le phare lisible à droite, chaussée entre 9 et 16 % sans plage claire, coffre à 11 %.
- **Raccords** : c'est l'ouverture. Vers P1 : même scène, même tout ; l'amplitude des flaques de lampadaire tenue à + 1 EV, la phase à la coupe n'a plus d'importance.

### P1 — Repérée : une présence dans son dos, puis à côté d'elle

- **Principale** : ciel et lampadaires, comme OUV.
- **L'événement est une lumière** : les phares de la patrouille 1, hors champ derrière, de 14 à 5 m. Ils éclairent la chaussée de part et d'autre de la berline et **jettent son ombre devant elle** ; sur elle, ils n'allument que le pare-chocs et le bas du panneau arrière (≤ 30 %). Blanc chaud, jamais blanc.
- **Accents** : la rampe entre par le bord gauche aux images 24 à 30. Elle se lit par sa lentille, en alternance ; un liseré sur son toit et son capot ; une lueur sur la chaussée dans 4 m.
- **À retirer ou baisser** :
  - `PATROL_HEAD_W` 450 → 150, en codes : la plage `#726154` (39 %) en bas à gauche de l'image 1 descend sous 25 %.
  - la lueur corail de la rampe est aujourd'hui une traînée rouge de 4 m (images 12 et 40, `#924721`, 33 %) : `lightbar_lights` à 40, la lueur sous 18 %, moins de 3 m, orangée et non rouge.
  - la portière crème de la patrouille est écrêtée à l'image 1 (x 0 à 20 %, y 48 à 60 %) : `patrol_rim` 400 → 200 W, portière ≤ 60 %.
  - les disques beiges en bas à droite (images 1 et 48) : flaques sous la caméra.
- **Image clé : 30.** La patrouille entrée (x 0 à 26 %), sa lentille allumée et saturée, la berline à 15 %, son ombre devant elle sur une chaussée éclairée par les phares, aucune plage blanche.
- **Raccords** : depuis OUV, rien ne change. Vers P2 : même ciel, mêmes lampadaires, la patrouille au bord gauche des deux côtés ; vers FIN (film à une étoile) : même ciel et bande devant, c'est le correctif du 2.1 qui fait ce raccord.

### P2 — Le premier coup de volant : elle choisit la mer

- **Principale** : ciel et lampadaires du rond-point. La bande est à gauche à l'entrée et devant à la sortie : elle tourne vers elle.
- **Accents** : l'îlot, pivot du plan, palmiers éclairés par le pied (`island_up_*` 3500 → 1800 W, `island_low_*` 700 → 350 W, ambre) ; la lentille de la patrouille 2 qui débouche de l'avenue nord ; en fin de plan, la bouche de la rue des enseignes, guirlandes et enseignes allumées.
- **À retirer ou baisser** :
  - `build_dusk` en entier et le ciel propre (2.1).
  - `keep_paint` : exclusions levées, appoint de flanc retiré, appoint de poursuite commun. La berline est aujourd'hui rouge vif (`#4d1c26` puis `#330309`), une autre voiture que celle de l'avenue.
  - le dernier tiers du plan est vide : ciel marine, horizon noir, un bloc gris sans fenêtres. La bouche de la rue des enseignes doit être la zone la plus chaude du cadre sur les 12 dernières images (30 à 45 %), le phare au-dessus des toits à x 65 %.
  - passage piéton à 49 % (`#9c7758`) : sous 40 % avec les lampadaires à 1200 W.
  - les gerbes gris rosé autour de la berline sur tout le brouillon : règle F.
  - feux arrière de la patrouille 1 : `tail_lights(energy=30)` → 8 W ; leur reflet fait une traînée rouge de 3 m au bord gauche (dernière image, `#763f3c`).
- **Image clé : le milieu de la glisse.** Flanc gauche visible, bordeaux (teinte 340 à 358°), palmiers ambre à droite, bande corail sur la moitié gauche, lentille de la patrouille 2 lisible à droite. Et la dernière image : la rue chaude devant elle.
- **Raccords** : depuis P1, même ciel et patrouille 1 à gauche. Vers P3 : la lumière de la rue existe déjà devant elle à la fin de P2 ; la caisse est à 5 % en fin de P2 et à 16 à 25 % en P3, les deux reviennent à 15 %.

### P3 — Le goulot : trop de monde, trop de lumière, et le piège au bout

- **Principale** : les guirlandes et les lanternes, un plafond de petites lampes crème qui prend le toit et le coffre par-dessus. C'est le plan le plus chaud et le plus dense du film, sans être le plus clair.
- **Accents** : enseignes (palette du 2.4), vitrines ; les lampadaires de la rue à 660 W ; au bout, **le barrage**.
- **Le barrage se lit de loin sans être gonflé**, par quatre choses : les 30 derniers mètres avant lui sont une poche plus sombre (guirlandes éteintes et `wash_*` coupés de y 100 à 130, rideaux baissés) ; les deux patrouilles ont leurs phares en codes vers nous (quatre points blanc chaud, 120 W) et leurs deux lentilles en alternance ; derrière elles, la bande corail et le pylône, sur lesquels les patrouilles et les agents se découpent ; aucune enseigne corail ou violette dans la rue.
- **À retirer ou baisser** :
  - `scene_b.make_world`.
  - la nappe lavande en bas à gauche, images 1 à 24 puis 42 (`#bdbce0`, 75 %, plus grande que la patrouille) : phares de la patrouille 1 (2 × 450 W, 40°, à 1,5 m devant l'objectif) et lueur violette de 600 W. Codes à 150 W, lueur à 40 : sous 25 %.
  - façades à 55 % (`#bb8171`) : `wash_*` 1800 → 600 W, médiane sous 35 %.
  - écrêtage à 1,02 % : ampoules 28 → 6, lanternes 40 → 8.
  - phares de la berline 900 W « de route » → 150 W en codes ; ce sont eux qui éclairent les flancs des patrouilles et les agents quand elle arrive (images 30 à 40), et c'est juste.
  - `hero_fill` → appoint commun ; caisse de 25 % à 15 %.
  - `rim_*` (1500 W, `#e6ecff`, un contre-jour froid par agent) : 400 W et `#fff1dc` ; le froid est aux hélicoptères.
- **Image clé : 24.** Au fond, sous la bande et le pylône, deux traits de couleur et quatre points blancs dans une poche sombre ; la berline à 15 % sous les guirlandes ; rien de clair en bas à gauche ; façades sous 35 %. Et la 40 : elle passe entre les rampes à 4 m, qui ne posent qu'un filet sur ses chromes.
- **Raccords** : depuis P2, la rue annoncée. Vers P4, la seule rupture voulue du film : du chaud serré au froid ouvert, avec l'inversion d'axe ; ce qui tient la coupe, c'est le pylône ambre au centre des deux côtés, les lampadaires de la même teinte et la caisse à ± 20 %.

### P4 — La meute : elle n'est plus poursuivie, elle est chassée

- **Principale** : le contre-jour des phares de la meute, 25 m et plus derrière elle, qui cernent son toit et jettent son ombre vers nous. De face, la bande corail est derrière la caméra : c'est elle qui éclaire doucement les calandres, sans source ajoutée ; l'appoint de face (500 W) la complète.
- **Accents** : six rampes puis dix, des traits de couleur au-dessus de paires de points blancs ; on doit pouvoir les compter. Ses deux phares, plus jaunes que les autres. Le pylône et les lampadaires du pont, ambre. Des images 36 à 48, la lumière ambre du port lèche sa calandre (source liée à elle seule, + 1 EV, rien sur le tablier).
- **À retirer ou baisser** :
  - `p4_deck_puddles` et la chaussée commune du 2.6 : aujourd'hui la chaussée est à 53 % (`#a68076`, image 24) puis 59 % (`#9e9490`, image 42), elle passe du rose au lavande à chaque éclat, les flaques y font des taches sombres en négatif.
  - `yaw` et la branche « reflets » de `p4_sky_veil` (2.1).
  - lueurs de rampe 600 → 40 : dix patrouilles et un fourgon font aujourd'hui 12 kW de couleur à 2 m du tablier.
  - phares 350 et 450 W à 40° → 150 W en codes : les traînées s'arrêtent à 40 m devant chaque voiture.
  - têtes de lampadaire blanches à gauche du cadre → ambre.
- **Image clé : 24.** Ciel à 15 %, chaussée à 8 à 16 %, une traînée courte sous chaque phare, huit rampes que l'on compte, la berline à 15 % avec ses deux phares jaunes ; entre les images 24 et 30, la teinte de la chaussée ne bouge pas.
- **Raccords** : depuis P3, voir plus haut. Vers P5 : la lumière ambre du port sur sa calandre est celle que P5 montre ; de face à de dos, la bande revient devant elle.

### P5 — Le ciel s'en mêle : le premier faisceau la trouve

Pas de brouillon v3.1 de ce plan : fiche écrite d'après le code.

- **Principale** : les mâts du port (ambre, sources visibles), une lumière haute et large sur le terre-plein, tenue au plafond des lampadaires (chaussée ≤ 22 %).
- **L'événement est une lumière** : le faisceau froid de l'hélicoptère, devant et à droite. Sa tache court sur le quai et se pose sur elle à l'image 24 : le toit prend + 2 EV (≤ 40 %, rosé, pas blanc). La tache au sol fait une voiture et demie au plus, 45 % au plus : la plage la plus claire de la chaussée de tout le film, parce que c'est l'événement. Le cône se voit de l'hélicoptère jusqu'à elle.
- **Accents** : la rampe de la patrouille 1 à gauche ; le phare à x 70 % sur les 20 premières images, un pinceau dans le ciel à la fin.
- **À retirer ou baisser** :
  - `boost_bars(glow=20000.0)` : 20 kW par côté de rampe et lentilles × 8. C'est la pire entorse à la règle C du code. Retiré ; lentilles au réglage commun.
  - `light_tower` (50 kW crème, posée pour l'ancienne caméra de face) : retirée. Si le virage est trop sombre, un mât du port de plus, de la même famille.
  - `scene_e.car_fill` et `car_side` → appoint commun.
  - le faisceau : aujourd'hui 1,6 MW pour la brume, une jumelle de 100 kW pour le sol, une de 50 kW pour la berline. L'architecture reste (un seul faisceau à l'image), les niveaux se règlent sur les rapports ci-dessus.
  - mâts du port 45 à 60 kW : à ramener au plafond de 22 % sur la chaussée.
- **Image clé : 30.** La glisse, le flanc gauche, le faisceau posé sur le toit, la tache devant elle, la patrouille 1 arrêtée à gauche avec sa lentille.
- **Raccords** : depuis P4, l'ambre du port. Vers P6 : en fin de plan la caméra regarde l'est, la bande est sortie à gauche ; elle revient pleine en P6 parce que la berline a tourné vers la mer. Un hélicoptère devant elle des deux côtés de la coupe.

### P6 — Plus de ville : le ciel, l'eau, une ligne droite vers le phare

- **Principale** : le ciel et sa bande, droit devant, que la lagune renvoie des deux côtés de la jetée. C'est le plan qui change le plus : aujourd'hui la bande est dans le dos de la caméra et le plan est une nuit marine (14 %).
- **Accents** : la file des dix lampadaires, ambre, un toutes les 22 images à 120 km/h ; leurs têtes glissent en virgules ambre sur le toit (pas plus larges que 15 % du toit) ; le phare au-dessus du toit, posé sur la bande ; trois hélicoptères et leurs trois cônes froids, qui se croisent 2 m devant elle : une porte de lumière froide vers laquelle elle roule ; la patrouille 1 à gauche à partir de l'image 20.
- **À retirer ou baisser** :
  - `yaw` (2.1).
  - sous chaque lampadaire, la berline devient cuivre (images 15, 50 et 60 : coffre `#a14817`, 34 %) et la chaussée pompe de 20 à 5 % : lampadaires 2600 → 1200 W, têtes à 4.
  - les deux disques en bas de l'image 15 (`#926d3f`, 44 %) : flaques `fx_flaque_*` sous la caméra, rugosité 0,08 et têtes à 4.
  - les hélicoptères sont des silhouettes sans faisceau : `beam_cones` à 0,6, comme en FIN.
  - le phare ne se distingue pas des lampadaires : sa lanterne deux fois plus grosse à l'écran qu'une tête de lampadaire, halo crème, les têtes passées à l'ambre.
  - la bouffée blanche à droite de la berline aux images 50 et 60 (x 58 %, y 46 % depuis le haut) : éclaboussure d'une flaque prise dans un faisceau ; plafonnée à la luminance de la chaussée + 10 points.
  - `aim_helis(car_energy=50000)` : à régler sur + 2 EV au toit.
- **Image clé : 30.** Ciel à 37 %, bande à l'horizon et dans l'eau, la lanterne crème au-dessus du toit, trois silhouettes et trois cônes froids, chaussée à 8 à 16 %, coffre à 11 %. Et la 60 : la pointe découverte, le phare sur la bande.
- **Raccords** : depuis P5, la bande retrouvée. Vers FIN6 : même ciel, même phare ; la berline passe de 15 % à 20 à 25 % sous trois faisceaux, c'est voulu (4).

### FIN — C'est fini : seule sous le phare, tenue par un faisceau

- **Principale, des images 1 à 36** : le faisceau froid de l'hélicoptère, devant et au-dessus, à contre-jour. Il cerne le toit et le capot et jette l'ombre de la berline vers nous. Le ciel et l'appoint commun tiennent l'arrière à 15 %.
- **Principale, de 36 à 52** : les phares de la meute, derrière la caméra, qui s'allument l'un après l'autre. Chaque paire ajoute un tiers de diaphragme sur l'arrière de la berline : la dernière image est la plus claire sur elle (panneau arrière à 22 à 28 %). C'est cette lumière, chaude, de dos, qui éclaire les mains sorties par la vitre ; le faisceau froid les borde de l'autre côté.
- **Accents** : le phare entier, sa tour éclairée par sa lanterne (claire en haut, sombre au pied) et découpée sur la bande ; la rampe de la patrouille 1 arrêtée à son pied ; l'unique lampadaire de la pointe, ambre.
- **À retirer ou baisser** :
  - la bande absente du brouillon (le test `VECT_ROTATE`, 2.1).
  - `fin_pack_lights` exclut la berline des phares de la meute : exclusion levée, `PACK_HEAD_W` 260 → 150, codes. Aujourd'hui elle est noire, sans lumière principale (coffre `#170208`, 2,7 % à l'image 1 ; 7 % à l'image 52).
  - la flaque rouge de 3 m derrière elle, de l'image 26 à la fin : la plus grande plage de couleur du cadre. Feux stop (`hero_cars.STOP_GAIN`) réglés pour une lueur de 1,5 m au plus et 20 % au plus.
  - `lamp_pointe` 1300 W `#ffe2c2` → ambre commun, 1200 W.
  - la tour du phare, gris uniforme : une lumière crème à la lanterne (2000 W, vers le bas) à la place de la lumière de pied.
  - les disques blancs en bas à droite (toutes les images, x 80 à 100 %) : flaques sous la caméra.
- **Image clé : 49.** Les mains ouvertes, la chose la plus claire près de la berline (35 à 50 %) ; l'arrière de la berline à 22 à 28 % ; son ombre vers nous ; le phare sur la bande ; la lentille de la patrouille 1.
- **Raccords** : depuis P1, P2, P3 ou P5, de dos à de dos, même ciel, même bande ; le phare minuscule devenu immense. Depuis P4, à travers l'encre.

### FIN6 — Le temps s'arrête : toute la ville autour d'une voiture

Pas de brouillon v3.1 : fiche écrite d'après le code.

- **Principale** : trois faisceaux froids qui tombent sur elle (+ 2 EV au toit) ; elle est l'objet le plus clair du cadre, à 20 à 25 %.
- **L'anneau l'éclaire pour de bon** : vingt-deux phares en codes à 14,5 m, tout autour, lui donnent une lumière sans ombre de + 1 EV, chaude, qui la garde bordeaux sur tout l'arc de l'orbite. `car_out_of_rigs` (la berline exclue de 42 lumières et 66 lueurs de l'anneau) est levé : avec les phares à 150 W et les lueurs à 40, il n'a plus de raison.
- **Accents** : dix rampes qui battent, étincelles sur l'anneau ; la lanterne au bord gauche au départ, un pinceau gelé au-dessus d'elle ; la bande derrière le phare.
- **À retirer ou baisser** :
  - `scene_d.glows` (lueurs corail et lilas hors champ, sans source) : plus appelée, à supprimer pour qu'elle ne revienne pas.
  - à 0,35 m du sol, face aux phares d'en face, c'est la géométrie de P4 : mêmes plafonds de reflets (2.6), dalle de la pointe à pellicule 0,3.
  - `aim_helis(car_energy=15000)` × 3 et la jumelle du lampadaire : à régler sur les rapports.
- **Image clé : la pose validée (dernière image).** Trois quarts avant, mains levées lisibles, calandre bordeaux, l'anneau en étincelles, aucune plage blanche au sol.
- **Raccords** : depuis P6, même ciel, le phare au bord gauche.

---

## 4. Les défauts, par gravité à l'écran

Ce que l'on voit en premier à 390 px de large, du pire au moins grave.

| # | Où | Image | Ce qu'on voit | Cause probable | Correction |
|---|---|---|---|---|---|
| 1 | P4 | toutes | la chaussée est un miroir rose puis lavande (53 à 59 %, médiane 35 %), sa teinte change à chaque éclat | pellicule d'eau à 1,0 vue en rasant, `p4_deck_puddles`, 22 phares à 40° vers l'objectif, 12 kW de lueurs de rampe, ciel gonflé pour les reflets | chaussée commune (2.6), codes à 150 W, lueurs à 40, `p4_sky_veil` sans sa branche reflets |
| 2 | P3 | 1 à 24, 42 | nappe lavande en bas à gauche, 75 %, plus grande qu'une voiture | phares de la patrouille 1 à 1,5 m de l'objectif, lueur violette de 600 W | codes à 150 W, lueur à 40 |
| 3 | P6, FIN | toutes | une autre heure : nuit marine sans bande (14 %) après un crépuscule violet (37 %) | `yaw = pi` par défaut ; dans `plan_FIN`, le test `VECT_ROTATE` qui, semble-t-il, ne trouve pas le nœud | défaut à 0 |
| 4 | P6 | 15, 50, 60 | la berline devient cuivre (34 %) et la chaussée pompe de 20 à 5 % toutes les 22 images | lampadaires à 2600 W, têtes à 40 reflétées par le toit | 1200 W, têtes à 4 |
| 5 | FIN | toutes | la berline est noire (3 à 7 %), rien ne l'éclaire ; derrière elle une flaque rouge de 3 m | elle est exclue des phares de la meute, le faisceau est à contre-jour, pas d'appoint ; feux stop | exclusion levée, appoint commun, feux stop plafonnés |
| 6 | P3 | toutes | façades à 55 %, ciel bleu saturé, berline deux fois plus claire que sur l'avenue (+ 106 %), écrêtage à 1 % | `wash_*` à 1800 W, monde propre à la rue, guirlandes à 28 | `wash_*` à 600, ciel commun, ampoules à 6 |
| 7 | P2 | dernier tiers | le plan finit sur du vide : ciel marine, horizon noir, bloc gris | bande au nord, rue des enseignes ni bâtie ni allumée de ce côté | ciel à 35°, bouche de la rue éclairée |
| 8 | P2 | toutes | berline rouge vif, gerbes gris rosé à ses roues | `keep_paint` (exclusions, appoint de flanc ambré) ; gerbes de scène | appoint commun ; règle F |
| 9 | OUV, P1 | 20, 40 ; 1, 48 | la chaussée passe du noir au beige (11 à 45 %), disques clairs en bas à droite | lampadaires à 2600 W, flaques sous la caméra, `fill_*` | 1200 W, pas de flaque dans sa voie, `fill_*` retirés |
| 10 | P1 | 1 ; 12, 40 | plage blanche sous la patrouille, portière écrêtée ; traînée rouge de 4 m sous la rampe | phares à 450 W, `patrol_rim` à 400 W, lueur à 600 W | 150 W, 200 W, 40 |
| 11 | OUV, P1, P6 | toutes | le phare ne se lit pas (invisible sur l'avenue, un lampadaire de plus sur la jetée) | lanterne sous-dimensionnée de loin, têtes de lampadaire blanches comme elle | halo de 6 à 8 px à 390 px, têtes ambre |
| 12 | P6 | toutes | trois hélicoptères sans faisceau | cônes non posés | `beam_cones` |
| 13 | partout | — | têtes de lampadaire blanches (98 %) | émission 40 | 4 |
| 14 | P5, FIN6 | non rendus | à prévoir : rampes à 20 kW et tour de 50 kW (P5), sol en miroir sous l'orbite basse (FIN6) | `boost_bars`, `light_tower` ; phares de l'anneau vers l'objectif | retirés ; codes et plafonds du 2.6 |

Les défauts 1 à 5 se corrigent par quatre réglages communs (ciel, chaussée, lampadaires, sources des véhicules) et une exclusion levée : ils passent avant tout travail par plan.

---

## 5. Ce qui ne se juge qu'en mouvement

Sur un brouillon de chaque plan, à la cadence, à 390 px de large ; puis sur le bout-à-bout.

1. **Le battement des rampes.** Deux éclats par seconde (`motion.flash_bars`, période 12), décalage par véhicule : juste. Mais les clés sont constantes : la rampe claque d'une image à l'autre. Profil sur les six images d'un éclat : 0,5 ; 1 ; 1 ; 1 ; 0,6 ; 0,25, puis 0,06. Contrôle : la luminance moyenne du cadre entier ne varie pas de plus de 1,5 point d'une image à la suivante du seul fait des rampes (2 points en P4 et FIN6). Si le cadre bat, ce sont les lueurs qu'on baisse, pas les lentilles.
2. **Le pompage des lampadaires.** Une flaque toutes les 26 images sur l'avenue, 22 sur la jetée : c'est un rythme, pas un défaut, tant que l'amplitude tient. Contrôle sur la série des images : moyenne de la chaussée, maximum sur minimum ≤ 2 (en luminance linéaire) ; médiane de la caisse, ≤ 1,5.
3. **Le stroboscope des guirlandes (P3).** À 110 km/h, une guirlande passe au-dessus d'elle toutes les 6 images environ : leur reflet sur le toit et la lunette peut battre à 4 Hz. Contrôle : sur le toit, pas plus de 10 points d'écart d'une image à l'autre. Sinon, ampoules à 4.
4. **Le scintillement des reflets.** Grain et papillons sur le mouillé : ne se juge pas à 64 échantillons. Douze images consécutives au nombre d'échantillons final, sur P4 et sur P6 ; un reflet qui grouille d'une image à l'autre se règle par la rugosité de la pellicule (+ 0,05), pas par le débruitage.
5. **Les coupes.** Luminance moyenne du cadre entier entre la dernière image d'un plan et la première du suivant : ± 25 %, sauf P3 → P4 (la rupture voulue, jusqu'à − 40 %). Caisse à ± 20 %. Aucune coupe ne tombe sur une image où la berline est au cœur d'une flaque d'un côté et entre deux flaques de l'autre, tant que l'amplitude dépasse + 1 EV.
6. **Les pinceaux du phare et les faisceaux.** Un pinceau qui traverse le ciel ne doit pas l'éclaircir de plus de 3 points ; la tache d'un faisceau se déplace sans sauter (≤ 1 m par image par rapport à la berline).
7. **Les feux stop** (OUV 37 à 40, P3, FIN) : un signal de quatre images doit se lire comme voulu, feux + 25 points, virgules allongées de moins d'un mètre.

Mesure sans rien écrire de neuf : `ffmpeg -i plan.mp4 -vf "crop=L:H:X:Y,signalstats,metadata=print:key=lavfi.signalstats.YAVG" -f null -` donne la luminance moyenne d'une zone image par image. Pour savoir quelle famille de sources fait une plage claire, `lab/lightgroups.py` rend une passe par groupe en un seul rendu : y ranger ciel, lampadaires, rampes, phares, faisceaux, appoints.

---

## 6. Les règles que je discute, et les décisions qui touchent le découpage

1. **Règle C contre l'ouverture.** Le découpage fait raconter l'éveil de la patrouille par sa lumière seule (image 34, hors champ : corail et violet sur les façades, la chaussée et le flanc de la berline). Avec une rampe qui n'éclaire plus qu'à 4 ou 6 m, ce temps ne se voit plus. Je garde la règle et je déplace le temps : `BARS_ON` de 34 à 26, quand la patrouille est encore au bord gauche du cadre. On voit sa lentille s'allumer, deux éclats, puis elle sort ; les feux stop de la berline répondent à 37. L'histoire passe par la lentille, pas par le décor.
2. **Contrôle 3 (apport des rampes, 6 % du cadre par patrouille visible).** Avec dix patrouilles (P4, FIN6), le plafond devient 60 % du cadre : il autorise exactement ce que le client refuse. À remplacer par un plafond global : toutes les rampes ensemble, 12 % du cadre au plus.
3. **Règle A et le contrôle de continuité du ciel.** « Un seul ciel » ne veut pas dire « la même luminance de ciel dans tous les cadres » : P4 regarde à l'opposé de la mer et voit le côté nuit du même ciel (15 % contre 37 %). Le contrôle 4 doit comparer la teinte (il le fait) et accepter cette luminance pour P4 seul.
4. **Contrôle 2 (médiane de la chaussée de 6 à 20 %).** Trop large pour tenir un film : entre 6 et 20 il y a presque deux diaphragmes. Je vise 8 à 16.
5. **Règle E et les lampadaires.** Je l'étends : même teinte **et même éclairement au sol** partout, mâts du port compris (ils sont ambre dans le code, le découpage parle de « lumière crème du port » : c'est l'ambre qui gagne, une teinte de moins).
6. **Les mains de FIN.** Elles sont éclairées de dos par les phares de la meute : il leur faut des mains claires. Les gants et manches sombres prévus pour la silhouette (découpage v3, FIN) vont contre la lecture ; à trancher par celui qui tient les personnages.

---

## 7. L'ordre

1. Le commun, par un seul agent : ciel (`lieux.sky`, défaut à 0, mondes locaux retirés), chaussée (2.6), lampadaires (1200 W, têtes à 4).
2. Les sources portées, par un seul agent : phares en codes à 150 W, `lightbar_lights` à 40, profil du battement, feux arrière rouges, appoint de poursuite commun.
3. Une image par plan à 64 échantillons (les images clés ci-dessus), la mesure commune, la planche côte à côte. Rien d'autre ne commence avant que les défauts 1 à 5 aient disparu de cette planche.
4. Les fiches, plan par plan : seulement ce qui reste propre au lieu (poche sombre du barrage, bouche de la rue en P2, cônes des hélicoptères, tour du phare, phares de la meute en FIN).
5. Les contrôles en mouvement (5), sur brouillons puis sur le bout-à-bout.
