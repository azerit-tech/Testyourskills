# Découpage v2 de la poursuite

Film de 296 images, 24 i/s, vertical 9:16. Ce document remplace le découpage du brouillon ; il ne touche ni aux lieux ni, sauf mention, aux trajectoires.

**Conventions de lecture.** Dans le cadre, `x` se compte depuis la gauche et `y` depuis le bas, en pourcentage. La zone utile va de y 15 % à y 88 % (affichage du site en haut et en bas). « Berline 54–99 % » veut dire que sa boîte occupe cette tranche de la largeur. Le lacet est celui de `motion.key_camera` (0 regarde vers −y, 180 vers +y, positif vers −x). Tous les chiffres de cadrage viennent d'une projection des boîtes des véhicules sur les trajectoires actuelles (scripts jetables, hors dépôt), pas d'un rendu : ils sont justes à trois points près et servent de valeurs de départ pour l'essai.

---

## 1. Diagnostic du brouillon

### Vue d'ensemble

- **Aucune caméra ne voyage avec la berline** entre l'ouverture et la fin. Cinq caméras sur huit sont fixes (P3, P4, P5 en panoramique sur pied, FIN, et la plongée P2 qui ne fait que regarder). La vitesse ne se lit donc jamais par le défilement.
- **La vedette est petite de P2 à P6** : une fourmi vue du ciel (P2), un éblouissement de phares (P3), 20 à 32 % de la largeur (P4), une bande basse (P5), une tache blanche (P6). Sur un téléphone de 390 px, on ne reconnaît la berline que dans OUV, FIN et FIN6.
- **Trois plans de face « elle vient vers nous »** (P3, P4, P6) plus FIN : l'axe se répète et la poursuite n'avance pas, elle revient.
- **La pression n'est presque jamais dans le même cadre que la berline.** Seul P4 (la meute empilée derrière elle) y arrive : c'est la meilleure idée du brouillon et elle reste.
- **Les deux moments de conduite (les deux virages) sont filmés de la pire façon pour un format vertical** : de dessus (P2) et de profil lointain (P5).

### Plan par plan

| Plan | Ce que fait le brouillon | Ce qui ne marche pas |
|---|---|---|
| OUV | 3/4 arrière, 10 m derrière, 1,5 m de haut, 35 mm, fixe par rapport à la voiture | La hauteur de 1,5 m est celle d'une vue à la troisième personne : pas de vitesse, la moitié basse du cadre est de l'asphalte vide. Le fond (bande corail, palmiers) est beau et reste. |
| P1 | Dans l'habitacle, par-dessus l'épaule, la patrouille dans le rétroviseur | Interdit. Et inefficace : le battement du plan (« une patrouille démarre ») tient dans un rétroviseur de quelques pixels. |
| P2 | Plongée verticale à 40 m sur le rond-point | Interdit sur le dérapage. La glisse devient un schéma, la voiture mesure 3 % du cadre, la patrouille n'entre que par le bord bas, sous l'affichage. |
| P3 | Caméra fixe basse derrière le barrage, 26 mm, la berline arrive de face | La berline n'est qu'un halo jusqu'à l'image 20 ; une silhouette d'agent masque le centre droit ; on ne comprend le trou du barrage qu'au dernier quart. |
| P4 | 200 mm fixe de face, meute empilée sur la rampe | Bon principe, mais la berline reste entre 20 et 32 % de large et trop haut : elle ne grossit pas assez pour qu'on sente qu'elle arrive. |
| P5 | Panoramique bas depuis l'intérieur du virage, 28 mm | Berline de profil, petite, dans le tiers bas ; 60 % du cadre est du ciel et le faisceau ; la meute est hors champ. Le second dérapage ne se lit pas. |
| P6 | Grue aérienne de 14 à 38 m, 24 mm, de face | Aucune vitesse, la berline est une tache, les avions sont des points. Le tableau « toute la ville à ses trousses » est là, mais sans vedette. |
| FIN | Fixe à 20 cm, 24 mm, la patrouille en amorce | Image finale bonne. Mais la berline ne parcourt que 4,5 m : l'arrivée n'a pas d'élan. Un hélicoptère avec faisceau est dans le cadre alors que FIN sert les films de une à cinq étoiles. |
| FIN6 | Orbite basse de 7 m, 18 mm | Bon. Seul plan où la caméra bouge autour de la voiture. |

### Coupe par coupe

- **OUV → P1** : même axe (on regarde devant), seul changement : on entre dans la voiture. La coupe ne montre rien de neuf, elle enferme.
- **P1 → P2** : d'une épaule en gros plan à une fourmi vue du ciel. Saut de grosseur maximal, aucun point commun pour l'œil, la vitesse retombe à zéro.
- **P2 → P3** : du ciel au sol, mais la berline est minuscule des deux côtés de la coupe. L'œil la cherche pendant la moitié de P3.
- **P3 → P4** : face fixe sur face fixe. Même axe, même immobilité : c'est un faux raccord de fait, la berline « revient » au fond du cadre après nous avoir dépassés.
- **P4 → P5** : le seul vrai changement d'axe, mais on quitte une berline centrée pour une berline basse et petite, et la meute qu'on vient de voir disparaît.
- **P5 → P6** : du profil au ciel, troisième « vers nous », la berline devient illisible au moment où la pression est maximale.
- **P6 → FIN / FIN6** : du ciel au ras du sol, bon contraste. C'est la seule coupe du brouillon qui fait un effet.

---

## 2. Principes retenus

Les numéros entre crochets renvoient à la section 6.

1. **Bas, près, grand-angle : c'est la recette de la vitesse.** Caméra à hauteur de moyeu, à moins de dix mètres de la voiture, focale courte [1][2][3][12][13].
2. **La longue focale sert à empiler, pas à aller vite** : elle tasse les poursuivants sur la poursuivie et ralentit l'approche ; on s'en sert une fois, pour la meute [1][19].
3. **Il faut que quelque chose défile près de l'objectif** : premier plan en travelling latéral, rue étroite, taches de lumière et d'ombre [1][17].
4. **Alterner une caméra qui voyage avec la voiture et une caméra fixe qu'elle frôle** ; jamais deux fixes de suite [1].
5. **Pas de plan large qui regarde la poursuite de loin ou d'en haut** : la caméra est sur une voiture ou contre elle ; la vue aérienne aplatit [11][14].
6. **Rester du même côté de la ligne d'action ; les plans dans l'axe (face, dos) sont neutres** et servent de charnière pour changer de côté [8].
7. **Faire venir ou partir la voiture en diagonale plutôt qu'en travers** [8] ; en vertical c'est encore plus vrai, un profil pur fait de la voiture une bande de 10 % de la hauteur (constat sur les images du brouillon).
8. **À une seconde par plan, le sujet reste au même endroit du cadre d'un plan à l'autre** : ici le tiers central, entre 30 et 60 % de la hauteur [5][6][7].
9. **À chaque coupe, changer au moins deux des trois : hauteur, angle horizontal, grosseur** [9].
10. **En vertical, travailler l'axe de profondeur et les verticales** (palmiers, pylône, faisceau) ; panoramiques courts et motivés, tremblé retenu, parce que le format les amplifie [10].
11. **Le lieu dicte la place de la caméra** : chaque décor a un point (le trou du barrage, la crête de la rampe, la sortie de la baïonnette) [16].
12. **Poursuivie et poursuivants dans le même cadre** : à une seconde par plan il n'y a pas le temps d'un montage alterné, la pression doit être dans l'image (déduction du format, pas une source).

**La structure qui en sort.** Le film alterne « ce qui se ferme devant » et « ce qui grossit derrière », et les deux virages sont les deux seuls plans de côté :

| OUV | P1 | P2 | P3 | P4 | P5 | P6 | FIN | FIN6 |
|---|---|---|---|---|---|---|---|---|
| dos | face, voyage | côté, voyage | dos, voyage | face, fixe longue focale | fixe, la voiture passe | face, voyage puis envol | face, bas, arrêt | orbite |

P1, P4 et P6 sont volontairement le même regard (« derrière elle »), avec une patrouille, puis la meute, puis tout : c'est la rime qui fait monter la pression.

---

## 3. Nouveau découpage

### OUV — Le dos, au ras de l'avenue (24 images)

- **Lieu** : avenue, inchangé.
- **Caméra** : 8 m derrière le centre de la berline (5,5 m derrière son pare-chocs), 1,4 m à sa gauche, **0,55 m** de haut. Monde : (0,35 ; 85,0 ; 0,55) → (0,35 ; 97,35 ; 0,55). Lacet 180,6, site +5°.
- **Focale** : 24 mm, f/4, point sur la berline.
- **Mouvement** : travelling suiveur à 46 km/h, un mètre par seconde moins vite qu'elle : elle prend un mètre d'avance sur le plan. Pas de tremblé, une vibration lente seulement.
- **Premier plan** : la chaussée qui file sous l'objectif (bandes blanches). **Milieu** : la berline, la patrouille garée à l'angle de la rue transversale. **Fond** : la fuite de l'avenue, les palmiers, la bande corail.
- **Berline** : début x 54–99 %, y 37–55 % (45 % de large) ; fin x 53–92 % (38 %). À recaler d'un degré de lacet pour qu'elle ne touche pas le bord droit.
- **Patrouille** : x 20–31 % au début, x 1–22 % à la fin (on la longe, elle glisse vers le bord gauche).
- **Sens à l'écran** : elle s'éloigne, légèrement vers la droite.
- **Raccord suivant** : berline à droite, patrouille à gauche ; P1 garde cette géographie.
- **Décor regardé** : vers +y, entièrement construit. Rien à vérifier.

### P1 — « Une patrouille démarre » (28 images)

**Option A (recommandée) — travelling avant de face, 3/4 avant droit.**

- **Lieu** : avenue, même tronçon.
- **Caméra** : 12 m devant le centre de la berline, 2,8 m à sa droite (côté océan, x = 4,55, sur la voie extérieure, libre), **0,5 m** de haut. Monde : (4,55 ; 153,6 ; 0,5) → (4,55 ; ~167,9 ; 0,5). Lacet +12,5 → +14, site +2,5°. Elle regarde donc en arrière, vers la ville.
- **Focale** : 50 mm, f/5,6, point à 20 m (berline et patrouille nettes toutes les deux).
- **Mouvement** : travelling avant à la vitesse de la berline jusqu'à l'image 19 ; à partir de là, quand la berline accélère, la caméra se laisse rattraper de 12 à 10,5 m. La berline grossit dans le cadre au moment où elle met les gaz.
- **Premier plan** : le capot et la calandre, phares vers nous. **Milieu** : la patrouille, 30 à 32 m derrière, sa rampe corail et lilas s'allume à l'image 8. **Fond** : les façades côté ville et la rue transversale d'où elle sort.
- **Berline** : début x 28–89 % (61 % de large), y 37–58 % ; fin x 26–98 %, y 34–60 %.
- **Patrouille** : x 5–19 %, y 42–48 % (13 à 15 % de large). Pour la grossir sans rien refaire : écart initial `GAP0` de 32 à 22 m.
- **Sens à l'écran** : vers nous.
- **Raccord précédent** : dos → face, 24 → 50 mm, même hauteur basse : hauteur conservée, angle et grosseur changés. La patrouille reste à gauche, la berline à droite.
- **Raccord suivant** : plan de face, neutre ; P2 peut prendre le côté gauche de la berline sans faux raccord.
- **Décor regardé** : vers −y. Le point de fuite de l'avenue tombe juste hors du bord gauche du cadre, mais les 20 % de gauche à hauteur d'horizon regardent au-delà de y = 20, là où les immeubles s'arrêtent (la chaussée finit à −30) et où le ciel n'a pas de bande corail. **À vérifier dans une image fixe.** Deux parades : déplacer toute l'action d'OUV et P1 à la rue transversale de y = 266 (paramètres `PATROL` et `Y0` ; 250 m d'avenue construite derrière), ou poser un fond bon marché au sud (deux ou trois silhouettes à fenêtres allumées, des lampadaires).
- Les chiffres de cadrage sont le miroir de la simulation faite caméra à gauche ; la géométrie est symétrique, le fond non (à gauche on regarderait l'océan, noir).

**Option B — embarquée extérieure sur l'aile.**

- Caméra fixée à la caisse : 1,9 m devant le centre, 0,3 m à l'écart du flanc droit, 0,75 m de haut, 28 mm, regard vers l'arrière le long du flanc ; le rétroviseur extérieur en amorce haute, la patrouille le long de l'aile arrière. Non simulée.
- C'est l'idée du rétroviseur, vue de dehors. Défaut : on ne voit de la berline qu'une bande de tôle, elle n'est pas reconnaissable.

**Recommandation** : A, parce que la berline et la patrouille tiennent entières dans le même cadre, et que c'est le premier terme de la rime P1 / P4 / P6.

### P2 — Le dérapage du rond-point (28 images)

**Option A (recommandée) — travelling bas à l'intérieur de l'arc.**

- **Lieu** : rond-point, trajectoire inchangée (arc de 30 m à gauche, 70 km/h).
- **Caméra** : sur un arc de 21 m de rayon autour du centre de l'arc de la berline, donc 9 m à l'intérieur de sa ligne, **0,35 m** de haut. Elle part 9° en avance sur la berline et finit 4° en retard : la berline la double. Monde (repère de la scène) : (−7,6 ; −16,2 ; 0,35) → (−14,8 ; −9,6 ; 0,35), soit 9,9 m à 30 km/h. Lacet −95 → −164, site +8°, visée à 1,6 m du sol sur la berline.
- **Focale** : 24 mm.
- **Mouvement** : travelling circulaire plus lent que la voiture, panoramique de 70° qui la suit. Tremblé faible.
- **Paramètre** : angle de glisse `DRIFT` de 12 à 22–25°. À 12° la glisse ne se lit pas ; c'est un paramètre, pas une trajectoire refaite.
- **Premier plan** : le bitume, la fumée des pneus arrière. **Milieu** : la berline à 9–9,8 m. **Fond** : l'îlot éclairé derrière elle ; la couronne du grand palmier traverse le haut du cadre de gauche (image 10) à droite (image 22) à y 86–91 %, et le fond pivote de l'est vers la bande corail au nord.
- **Berline** : 3/4 avant gauche au début (vue à 63°), plein flanc gauche à la fin (87°), roues avant contre-braquées vers nous. x 16–86 % (64 à 72 % de large), y 38–51 %, centrée tout le plan.
- **Sens à l'écran** : vers la gauche ; c'est le fond qui file vers la droite.
- **Patrouilles** : hors champ, présentes par leurs éclats corail et lilas sur la carrosserie et la fumée. Essai optionnel : `GAP1` vers 9–10 m et arrêt du panoramique à l'image 20, pour que la première patrouille entre par la droite quand la berline sort par la gauche (la simulation montre qu'avec l'écart actuel de 26 m elle n'entre jamais).
- **Raccord précédent** : face → côté, 50 → 24 mm, la berline reste au centre.
- **Raccord suivant** : elle sort vers la rue des enseignes ; P3 la reprend de dos, au centre.
- **Décor regardé** : la scène du rond-point a été faite pour la plongée : **ni immeubles ni mer**, des branches de 30 m. Vers l'est et le nord, derrière l'îlot et les terrasses, il n'y a que le sol sombre. À compléter : mur de promenade et mer à l'est, palmiers, lampadaires et deux ou trois façades le long de la branche nord. **Vérifier aussi** que le trajet de la caméra, à 17,6–17,9 m du centre de l'îlot (hors chaussée, avant les terrasses), ne traverse ni lampadaire ni mobilier.

**Option B — caméra fixe au pied de l'îlot, panoramique filé.**

- Caméra fixe au bord sud de l'îlot, (0,4 ; −6,3 ; 0,5), 21 mm, panoramique de 125° (lacet −11 → +114).
- Image 1 : berline à 9,1 m, de 3/4 avant, les deux patrouilles empilées derrière elle (x 52–60 % et 60–64 %). Image 10 : elle passe à 3,6 m, l'arrière balaie l'objectif (elle déborde du cadre). Images 18 à 28 : elle s'éloigne de dos, de 6 à 14 m (27 % de large), vers la rue des enseignes.
- Défauts : la berline n'est entière que le premier et le dernier tiers ; il faut l'embouchure de la rue à l'ouest ; et P3 s'ouvrant aussi de dos, les deux plans se répètent (il faudrait alors revoir P3).

**Recommandation** : A, parce que la glisse dure tout le plan avec la berline à 70 % de la largeur, et que c'est la réponse directe à « ça n'exploite pas tout le potentiel ».

### P3 — Le barrage, de dos (28 images)

- **Lieu** : rue des enseignes, trajectoire inchangée mais **le plan commence cinq images plus tôt** (berline de y 93,5 à 127,3) : à la dernière image elle est exactement entre les deux patrouilles. Les éclairs de bouche tombent alors aux images 14, 18 et 22 environ.
- **Caméra** : derrière la berline, 0,3 m à gauche de son axe, de 7 m à 5,5 m derrière son centre. **Hauteur 1,9 m jusqu'à l'image 14, puis descente à 0,6 m à l'image 26.** Monde : (−1,66 ; 86,5 ; 1,9) → (−0,35 ; 121,8 ; 0,6). Lacet 180,6, site de 0° à +6°.
- **Focale** : 21 mm.
- **Mouvement** : travelling suiveur qui se rapproche et grue qui descend. La caméra s'arrête avant la ligne des cônes (y 123,2) : elle ne passe pas le barrage, la berline oui.
- **Pourquoi cette hauteur** : simulation faite, une caméra basse dans l'axe cache le barrage derrière la berline jusqu'à l'image 18. À 1,9 m le barrage se lit au-dessus du toit (y 46–50 %) pendant la première moitié ; en descendant, les deux patrouilles ressortent par les côtés (gauche x 1–43 %, droite x 64–110 % à l'image 22) et finissent par balayer les deux bords du cadre.
- **Premier plan** : le toit et les feux arrière. **Milieu** : les deux patrouilles nez à nez, les cônes, les silhouettes des agents. **Fond** : le couloir d'enseignes, puis ce qu'il y a au bout de la rue.
- **Berline** : début x 33–75 %, y 22–46 % ; fin x 24–89 %, y 33–61 % (65 % de large).
- **Sens à l'écran** : elle s'éloigne, dans l'axe.
- **Raccord précédent** : côté → dos, la berline reste au centre.
- **Raccord suivant** : dos → face, 21 → 200 mm ; la berline finit au centre bas, P4 l'y reprend.
- **Décor regardé** : vers le bout de la rue. Les immeubles s'arrêtent à 150 m d'abscisse, soit 24 m après le barrage ; au-delà, rien. **À compléter** : un fond de rue, de préférence le pont vu de loin avec ses lampadaires (c'est le lieu suivant, ça prépare P4). **À vérifier** : les agents, faits pour être vus de dos, restent-ils des silhouettes vus de face ? Couper leur lumière d'appoint et les éclairer par les phares des patrouilles. La lumière de la scène est réglée pour l'ancienne caméra : à reprendre.
- **Repli** : hauteur fixe de 1,9 m, sans descente (berline y 10–47 %, donc un peu basse ; baisser le site de 2°).

### P4 — La meute, à la longue focale (28 images)

- **Lieu** : pont, trajectoires inchangées.
- **Caméra** : fixe, **18 m plus près et plus bas** que le brouillon : (1,2 ; 27 ; 1,2).
- **Focale** : 200 mm, zoom lent de +6 %, tremblé de longue focale. Léger suivi pour garder la berline au centre.
- **Premier plan** : rien, c'est voulu : air tassé, chaleur, phares. **Milieu** : la berline, de 80 à 42 m. **Fond** : la meute empilée sur la rampe (y 43–64 %), le fourgon qui passe la crête (y 54–68 %), le pylône et les haubans.
- **Berline** : début 24 % de large, y 48–59 % ; milieu 31 % ; fin **46 %**, y 29–49 %. Elle double presque de taille, ce que le brouillon ne faisait pas.
- **Sens à l'écran** : vers nous.
- **Raccord précédent** : dos au grand-angle → face à la longue focale : le contraste le plus fort du film.
- **Raccord suivant** : face → fixe de passage au 32 mm ; la berline est au centre des deux côtés de la coupe.
- **Décor regardé** : même direction que le brouillon. Rien à construire. Vérifier seulement que le voile rose sur la chaussée mouillée (déjà corrigé par la rotation du ciel) ne revient pas à 1,2 m de haut.

### P5 — La baïonnette du port, au point de sortie (28 images)

- **Lieu** : port, trajectoire de la berline inchangée, **plan décalé de quatre images plus tard** (berline de (3,7 ; 57,4) à (14,6 ; 69,5)).
- **Caméra** : fixe, à l'extérieur du virage, dans le prolongement de la ligne d'arrivée : **(0 ; 76 ; 0,45)**, à 4,6 m de la barrière.
- **Focale** : 32 mm.
- **Mouvement** : panoramique de 56° vers la gauche qui suit la berline (lacet −12 → −68), site de +3° à +13° pour finir sur l'hélicoptère.
- **Ce qu'on voit** : image 1, la berline arrive droit sur nous à 19 m, déjà en travers, la meute derrière elle à droite (x 77–92 %) pendant six images, la rampe et le pylône au fond. Images 13 à 20, elle passe en plein flanc gauche à 13,2–13,5 m (63 à 65 % de large), l'arrière chassant vers l'objectif. Image 28, elle s'éloigne de 3/4 arrière à 16 m.
- **Berline** : début x centre 52 %, y 42–50 % (36 % de large) ; passage x centre 60 %, y 24–43 % ; fin x centre 58 %, y 29–39 % (39 %).
- **Hélicoptère** : sa trajectoire actuelle (à l'ouest) sort du cadre. **Le déplacer** pour qu'il monte derrière les conteneurs de l'est, vers (46 ; 56 ; 27) : il entre en haut à gauche vers l'image 19 et finit à x 54 %, y 76 %, juste au-dessus de la berline, faisceau sur elle. C'est l'entrée en scène des hélicoptères, dans le même cadre que la vedette.
- **Sens à l'écran** : vers nous, puis vers la gauche, comme en P2.
- **Raccord précédent** : fixe sur fixe, mais 200 → 32 mm et une caméra qui panote ; c'est la seule entorse au principe 4, à surveiller.
- **Raccord suivant** : 3/4 arrière → face ; berline au centre des deux côtés.
- **Décor regardé** : au début le sud (rampe et pylône, construits par ce plan). À la fin l'est-sud-est du terre-plein : au palier « socle » le quai est nu, **il faut le palier « conteneurs » ou « portique »** pour qu'il y ait un fond. La lumière (projecteur du mât pointé sur le virage) était réglée pour l'ancienne caméra : depuis la nouvelle il devient un contre-jour latéral, plutôt favorable, mais à régler.
- **Repli « caméra seule »** : garder la caméra intérieure du brouillon en la rapprochant à (13,5 ; 62,5), 24 mm.

### P6 — La jetée : tout derrière elle, puis l'envol (40 images)

- **Lieu** : jetée, trajectoire de la berline et colonne inchangées.
- **Caméra** : devant la berline, 0,75 m à sa gauche (x = 81,0), **7 m devant, 0,55 m de haut** jusqu'à l'image 24, site +8°. Puis elle décolle : 5 m de haut et 13 m devant à l'image 40, site −8°.
- **Focale** : 21 mm.
- **Mouvement** : travelling avant de face, puis montée accélérée en reculant. Secousse au passage des avions.
- **Paramètres** : hélicoptères resserrés derrière la berline, décalages (−9 ; −20 ; 14), (10 ; −30 ; 18), (1 ; −50 ; 24) au lieu d'être autour d'elle ; avions abaissés à 30–34 m d'altitude. Ils ne tirent rien.
- **Ce qu'on voit** : images 1 à 24, la berline de face à 44 % de large, la colonne en chapelet de rampes derrière elle (y 40–44 %), les trois hélicoptères au-dessus (y 65–70 %), les deux avions qui grossissent au centre (y 48 → 55 %). Images 25 à 40, la caméra monte : la colonne se déplie en profondeur (y 49–57 %), les avions passent au-dessus de nous et sortent par le haut entre les images 34 et 40.
- **Berline** : début x 12–56 %, y 34–53 % avec la visée simulée ; **tourner le lacet de 6° environ** pour l'amener à x 24–68 %. Fin 18 % de large, y 32–45 %.
- **Sens à l'écran** : vers nous.
- **Raccord précédent** : 3/4 arrière fixe → face en voyage.
- **Raccord suivant (FIN6)** : face en hauteur, petite → 3/4 arrière au ras du sol, proche : hauteur, angle et grosseur changent tous les trois.
- **Décor regardé** : vers la ville, comme le brouillon, donc construit. À vérifier : la brume au ras de l'eau vue de 0,55 m (la bande rose déjà corrigée une fois).
- **Limite assumée** : à 0,55 m la colonne n'est qu'une ligne de lumières ; son dessin ne se lit que dans les douze dernières images.

### FIN — L'arrêt à la pointe (36 images, une à cinq étoiles)

- **Lieu** : pointe, inchangé. L'image finale validée ne bouge pas.
- **Caméra** : au sol, 0,2 m, **avancée courte de 2,2 m** qui atterrit sur la position validée (80,7 ; 438,97 ; 0,2) à l'image 22, quand la berline s'arrête, puis fixe jusqu'à la fin. Lacet et site validés (site +14°).
- **Focale** : 24 mm.
- **Premier plan** : l'avant de la patrouille en amorce gauche (x −5–42 % au début, −36–40 % à la fin). **Milieu** : la berline. **Fond** : la ville de l'autre côté de l'eau.
- **Berline** : début 23 % de large, x centre 51 %, y 32–40 % ; fin 57 % de large, x centre 63 %, y 31–47 %.
- **Sens à l'écran** : vers nous, jusqu'à l'arrêt.
- **Paramètre optionnel** : allonger la glisse visible (par exemple 60 km/h sur 14 m au lieu de 36 km/h sur 4,5 m).
- **Incohérence à lever** : l'hélicoptère et son faisceau sont dans ce plan, qui sert aussi les films à une étoile. Le sortir du cadre, ou le réserver à FIN6.
- **Raccord avec chaque Pn** : la coupe est couverte par les deux images d'encre. La plus fragile est P4 → FIN (face sur face) ; la grosseur et la focale changent assez pour qu'elle tienne, à vérifier quand même.
- **Décor regardé** : inchangé.

### FIN6 — L'encerclement (56 images, six étoiles)

Inchangé : orbite de 7 m à 0,25 m de haut, 18 mm, azimut 245° → 95°. Elle commence de 3/4 arrière gauche, ce qui inverse proprement la fin de P6.

### Variantes, à part

| Variante | Ce que c'est | Ce que ça coûte |
|---|---|---|
| V1 | P6 en deux cadrages dans le même fichier : 22 images au ras du sol, 18 images hautes sur toute la colonne | Rien pour le site (durée inchangée). Une mise en place de rendu de plus et une coupe intérieure sans étoile. |
| V2 | FIN en deux cadrages : 12 images au ras des roues qui glissent, 24 images sur le cadre validé | Idem. |
| V3 | Changer les durées : P2 à 32 images, P4 à 24 (total toujours 296) | `cut.ts`, les repères de l'affichage, les tests du site, et deux plans à rendre à une autre longueur. Non recommandé tant que la v2 n'a pas été vue. |

---

## 4. Ce que ça change dans la construction

| Plan | Nature | Détail | Risque |
|---|---|---|---|
| OUV | Caméra seule | Position, hauteur, focale | Nul |
| P1 (A) | Caméra seule, décor à vérifier | Fond sud de l'avenue ; parade par paramètres (`PATROL`, `Y0`) ou petit fond | Faible |
| P2 (A) | Décor à compléter | Mer et mur à l'est, palmiers et façades au nord ; `DRIFT` 22–25° ; trajet caméra à dégager | Moyen : le rond-point n'avait été bâti que pour être vu de dessus |
| P3 | Décor à compléter | Fond de rue, agents vus de face, lumière à reprendre, plan avancé de 5 images | Moyen : c'est le plan le plus retourné |
| P4 | Caméra seule | 18 m plus près, 30 cm plus bas | Nul |
| P5 | Caméra et trajectoire (hélicoptère) | Hélicoptère et cible du faisceau déplacés (deux points, une dizaine de lignes), palier « conteneurs » au moins, lumière, plan retardé de 4 images | Moyen |
| P6 | Caméra et paramètres | Décalages des hélicoptères, altitude des avions | Faible |
| FIN | Caméra seule | Avancée de 2,2 m ; hélicoptère à sortir ; glisse en option | Nul sur l'image finale |
| FIN6 | Rien | | Nul |

Aucune trajectoire de la berline n'est refaite. Les collisions restent impossibles : aucun écart entre véhicules n'est réduit, sauf l'essai optionnel de `GAP1` en P2 (à contrôler s'il est tenté).

---

## 5. Ordre d'essai

Images fixes d'abord, en basse qualité, trois par plan (première, milieu, dernière) ; aucun rendu long avant que les cadres soient validés à 390 px de large.

1. **P4 et P1-A** : caméra seule, une demi-heure chacun. Ils disent tout de suite si la rime « regard derrière » tient.
2. **P2-A** : le plan que Jacques a critiqué. D'abord avec le décor actuel, pour juger le cadre et la glisse à 22° ; le décor ne se complète que si le cadre plaît.
3. **P6** : pour trancher grosseur de la vedette contre tableau de la ville, et décider de la variante V1.
4. **OUV et FIN** : réglages, sans risque.
5. **P3** : après, parce qu'il demande un fond et une lumière ; essayer d'abord la hauteur fixe de 1,9 m, puis la descente.
6. **P5** : en dernier, c'est le seul qui touche à une trajectoire.
7. Enfin le bout-à-bout en basse qualité, pour juger les coupes, et chaque film de une à six étoiles pour les coupes vers FIN.

Critère de passage pour chaque plan : la berline reconnue en moins d'une demi-seconde sur téléphone, et sa menace visible dans le même cadre.

---

## 6. Sources

Lues en entier :

1. Neil Oseman, « How to Make Chase Scenes Look Fast » — https://neiloseman.com/?p=6289
2. Motion Picture Association, entretien avec Phedon Papamichael sur *Ford v Ferrari* — https://www.motionpictures.org/2019/11/ford-v-ferrari-cinematographer-phedon-papamichael-on-the-need-for-real-speed/
3. American Society of Cinematographers, « Ford v Ferrari: Inside the Arena » — https://theasc.com/articles/ford-v-ferrari-inside-the-arena
4. No Film School, entretien avec Phedon Papamichael — https://nofilmschool.com/ford-ferrari-phedon-papamichael-interview
5. Vashi Nedomansky, « The Editing of MAD MAX: Fury Road » — https://vashivisuals.com/?p=5288
6. David Bordwell, « Off-center: MAD MAX's headroom » — https://www.davidbordwell.net/blog/?p=33299
7. Eugene Wei, « Creating order out of the chaos of Mad Max: Fury Road » — https://www.eugenewei.com/blog/2015/5/31/creating-order-out-of-the-chaos-of-mad-max-fury-road
8. Videomaker, « Screen Direction » — https://www.videomaker.com/article/12986-screen-direction
9. Videomaker, « Edit Suite: Continuity » — https://www.videomaker.com/article/c3/7046-edit-suite-continuity/
10. Adam Sébire, « Tips & Tricks for working in 9:16 vertical video » — https://www.adamsebire.info/vertical-film-festival/9-16-tips-and-tricks/
11. Slashfilm, entretien avec Anders Langlands sur la poursuite de *The Batman* — https://www.slashfilm.com/818872/the-batman-vfx-supervisor-on-crafting-that-batmobile-chase-cgi-vs-practical-and-more-interview
12. Hagerty UK, Simon Hucknall, « How Ronin out-drove other action films » — https://www.hagerty.co.uk/articles/how-ronin-out-drove-other-action-films/
13. RedShark News, Neil Oseman, « Five dynamic camera rigs spotted on Mission: Impossible 7 » — https://www.redsharknews.com/five-dynamic-camera-rigs-spotted-on-mission-impossible-7
14. YM Cinema, tournage de monoplaces au drone et au bras motorisé — https://ymcinema.com/2022/04/22/shooting-a-formula-1-combination-of-dsmc2-dsmc3-fpv-drone-and-russian-arm/
15. DGA Quarterly, « Fast and Furious » (sur *Baby Driver*) — https://www.dga.org/craft/dgaq/issues/1703-summer-2017/fast-and-furious
16. Filmsupply, Shane Hurlbut, « How to Shoot a Car Chase » — https://wpengine.fm.co/filmsupply/how-to-shoot-a-car-chase-advice-from-shane-hurlbut-asc/
17. Critpoints, « Feeling of Speed » — https://critpoints.net/2016/11/24/feeling-of-speed/

Connues seulement par les résumés de recherche (page non lue, à ne pas citer comme vérifiées) :

18. Holm, Skovhus, Kraus (2017), étude sur la vitesse perçue selon le champ de vision — https://eudl.eu/doi/10.1007/978-3-319-55834-9_14
19. PetaPixel, « Why You Seem to Move Slower When Shooting at Longer Focal Lengths » — https://petapixel.com/2023/06/09/why-you-seem-to-move-slower-when-shooting-at-longer-focal-lengths
20. Walter Murch, la règle des six et la trace du regard — https://nofilmschool.com/2016/11/6-rules-good-cutting-according-oscar-winning-editor-walter-murch
21. Karel Reisz, *The Technique of Film Editing* — https://lantern.mediahist.org/catalog/techniquefilmedit00reis_0073
22. British Cinematographer, Greig Fraser sur *The Batman* — https://britishcinematographer.co.uk/greig-fraser-asc-acs-the-batman/
23. American Society of Cinematographers, « The Ins and Outs of 2nd Unit » — https://theasc.com/articles/shot-craft-the-ins-and-outs-of-2nd-unit
