# Brief des illustrations à générer : les décors de profil

Quatorze images : une par profil criminel (13) et une par défaut, pour les fiches sans profil. Jacques les génère, Claude les découpe et les pose (SPEC §18.28).

## 1. À quoi elles servent

Chaque profil a son « lieu du crime ». La même image sert à quatre endroits :

| Endroit | Taille à l'écran | Ce qui est posé dessus |
|---|---|---|
| **Tuile de profil**, sous la fiche et sur la page partagée | 350 × 233 px sur téléphone | en bas à gauche, le nom du profil en capitales crème et sa phrase, sur un voile sombre |
| **Mur des 13 profils** sur l'accueil (« Lequel es-tu ? ») | vignettes de 175 px de large | le nom seulement |
| **Images de partage** (1200 × 630, 1080 × 1350, plus tard 1080 × 1920) | fond, derrière la fiche | la fiche, la note, le titre |
| **Carton de fin** de la révélation | plein écran | le niveau et le profil |

Elles ne vont pas dans la fiche elle-même : la photo d'identité et la note couvriraient le sujet.

Le test qui décide de tout : **réduite à 175 px de large, l'image doit encore dire son idée en une seconde.** Un seul objet, une seule idée.

## 2. Format

- **Ratio 3:2, paysage.**
- **Taille** : 1536 × 1024 au minimum. Mieux : 3072 × 2048 (agrandissement ×2 de l'outil).
- **Fichier** : PNG, ou JPG en qualité 90 et plus, sRGB.
- **Image nue** : pas de cadre, pas de coins arrondis, pas de bordure blanche, pas de filigrane, pas de signature. L'arrondi et le voile se font en CSS.
- **Nom** : `{id}.png` (les `id` sont dans le tableau du §6).
- **Dépôt** : dossier `design/profiles/`, à côté du projet (`Azerit/design/profiles/`). Il n'est pas versionné. Claude en tire les versions web dans `web/public/profiles/` : `{id}.jpg` (1152 × 768, environ 140 Ko) et `{id}-s.jpg` (576 × 384, environ 40 Ko).

## 3. Composition

Un plan large, à hauteur d'yeux, caméra posée, comme un plan d'ouverture de film. Le lieu est vide : quelqu'un vient de partir.

Zones, sur une image de 1536 × 1024 :

```
┌──────────────────────────────────────────────┐
│  CIEL SEUL (0 à 20 % de la hauteur)          │  recadré dans le format 1200 × 630
│                                              │
│        ┌──────────────────────────┐          │
│        │   SUJET                  │          │  x : 20 à 80 %   (307 à 1229 px)
│        │   l'objet qui dit l'idée │          │  y : 25 à 75 %   (256 à 768 px)
│        └──────────────────────────┘          │
│                                              │
│  SOL CALME, DANS L'OMBRE (78 à 100 %)        │  le titre se pose ici, en bas à gauche
└──────────────────────────────────────────────┘
```

- **Le sujet tient dans le carré central** (1024 × 1024) : c'est ce qui reste dans les formats verticaux.
- **L'objet principal est au centre ou un peu à droite**, jamais en bas à gauche (le titre y est).
- **Le bas est un aplat sombre** (sol, bitume, plancher dans l'ombre violette), sans détail important.
- **Rien d'essentiel à moins de 6 % des bords.**
- Trois plans lisibles : un premier plan dans l'ombre, le sujet, un fond de ville en silhouettes.

## 4. Style

**En une phrase** : une affiche de voyage peinte en aplats, dans une ville côtière de Floride au crépuscule, mate, sans néon.

**Les règles**

- **Aplats peints**, façon gouache ou sérigraphie : grandes formes nettes, un dégradé doux à l'intérieur de chaque forme, un trait fin plus sombre sur les objets principaux, un léger grain de papier.
- **Aucune ombre noire.** Les ombres sont violettes ou prune.
- **Palmiers et immeubles lointains en silhouettes de la teinte du ciel, en plus foncé** : prune sur pêche, lavande sur rose. Jamais noirs.
- **Brume** : plus c'est loin, plus ça vire au lavande.
- **Saturation un peu au-dessus du réel, mais mat** : pas de lueur, pas de halo, pas de reflet chromé.
- **Niveau de détail moyen** : on reconnaît les objets, on ne compte pas les boulons.
- **Ton** : calme et un peu ironique. C'est une comédie policière, pas un film noir : pas d'arme, pas de sang, pas de violence.

**Quatre lumières**, pour que le mur de l'accueil ne soit pas quatorze ciels roses :

| Lumière | Ciel, de haut en bas | Silhouettes et ombres | Profils |
|---|---|---|---|
| **A. Heure rose** | lavande `#ccc2f5` → rose brumeux `#e8a3c6` → pêche pâle `#ffd9c2` | prune `#7a4f6e`, ombres `#4b2f54` | kingpin, hoarder, chameleon, sleeper_agent |
| **B. Heure dorée** | rose `#ec8fa0` → pêche `#fcbf96` → pêche-jaune `#ffc27a`, soleil bas en disque plein | prune chaud `#583660`, lumière rasante orangée | forger, delivery_machine, arsonist, repeat_offender, old_school |
| **C. Heure bleue** | indigo `#4b4fb8` → marine `#243152`, fine bande corail `#ff6a3d` à l'horizon | marine `#1f1f38`, lumières de ville en points ambre `#ffc36b` | mastermind, night_owl, ghost, default |
| **D. Aube** | lilas clair `#e5ddff` → pêche `#ffd4a8` → citron pâle `#effa9e` | lilas froid `#9a8fc9` | fresh_blood |

## 5. Inspirations

À regarder pour l'œil, **jamais à donner à l'outil comme image de référence** :

- **Les affiches de voyage en sérigraphie** des années 1930 à 1950 (parcs nationaux américains, compagnies aériennes) : aplats, peu de couleurs, grandes formes.
- **Les cartes postales de Floride** et l'architecture **Art déco de Miami Beach** : façades pastel, angles arrondis, auvents, cabanes de sauveteurs.
- **Les illustrations officielles du jeu** (page médias de son site, étudiées dans `docs/inspiration-gta6.md` §1.1 à §1.4) : ciels lavande et rose, ombres violettes, palmiers ton sur ton. On prend l'heure et la palette, rien d'autre.
- **Notre scène 3D** : l'open space au crépuscule de la révélation. Les illustrations doivent sembler être la même ville.

**Interdits**

- **Aucune personne**, aucune silhouette humaine, aucune main. Raison : nos textes sont épicènes, une image ne doit pas donner un genre ; et aucun personnage ne doit rappeler ceux du jeu.
- **Aucun texte**, lettre, chiffre, enseigne écrite, plaque d'immatriculation lisible. Les outils écrivent mal, et le site est bilingue.
- **Aucune marque** : pas de logo, pas de modèle de voiture reconnaissable.
- **Dans le prompt : ni le nom du jeu, ni celui de l'éditeur, de la ville ou de l'État du jeu.** Ne pas téléverser d'image du jeu.
- **Pas les clichés de la jaquette** : hélicoptère, alligator, flamant rose, moto en roue arrière, hors-bord.
- **Pas de synthwave** : néon, grille, soleil rayé, chrome, duo magenta-cyan, effet VHS.
- **Pas de photo réaliste ni de rendu 3D**, pas de style dessin animé à gros contours, pas de pixel art.

## 6. Les quatorze images

Chaque prompt se compose ainsi : **bloc STYLE** + **bloc LUMIÈRE** de la lettre indiquée + **SCÈNE**. Les blocs sont au §7.

| # | `id` | Profil | Sa phrase | Lumière | Ce qu'on doit lire en une seconde |
|---|---|---|---|---|---|
| 1 | `arsonist` | Pyromane | Déploie le vendredi soir. Sans peur, sans rollback | B | des serveurs qui fument, un extincteur que personne n'a touché |
| 2 | `forger` | Faussaire | Le CV le plus convaincant de la ville | B | un atelier de faux diplômes |
| 3 | `kingpin` | Légende du milieu | Ses PR font la loi dans tous les quartiers | A | un fauteuil vide qui domine la ville |
| 4 | `mastermind` | Cerveau | Chaque casse commence par un schéma d'architecture | C | un mur de plans reliés par des fils rouges |
| 5 | `delivery_machine` | Machine à livrer | Livre plus vite que la police ne lit | B | une camionnette lancée, des cartons qui volent |
| 6 | `night_owl` | Oiseau de nuit | Les meilleurs coups partent à 3 h du matin | C | une seule fenêtre allumée |
| 7 | `repeat_offender` | Récidiviste | fix, fix2, final fix : une signature de légende | B | une cellule ouverte, un mur de bâtons de comptage |
| 8 | `hoarder` | Écureuil | Des repos en planque partout, au cas où | A | un box de stockage qui déborde |
| 9 | `chameleon` | Caméléon | Change de langage comme de planque | A | un caméléon aux couleurs du ciel |
| 10 | `fresh_blood` | Jeune pousse | À peine en ville, déjà sur tous les radars | D | une valise seule, la ville au loin |
| 11 | `old_school` | Vieille école | Du code d'époque, toujours en état de marche | B | une vieille décapotable, un ordinateur beige sur la banquette |
| 12 | `ghost` | Fantôme | Aucune trace publique : du travail de pro | C | un parking vide, une seule trace de pneus |
| 13 | `sleeper_agent` | Cellule dormante | En sommeil, jusqu'au jour du grand coup | A | un pavillon trop tranquille, volets clos |
| 14 | `default` | (sans profil) | | C | la ville sur la baie, rien d'autre |

## 7. Les prompts

Les outils suivent mieux l'anglais. Coller STYLE, puis la LUMIÈRE, puis la SCÈNE.

### STYLE (à coller dans chaque prompt)

```
Flat-colour painted illustration in the manner of a gouache or screen-printed vintage travel poster. Large clean shapes, a soft matte gradient inside each shape, a very fine darker outline on the main objects, subtle paper grain. A subtropical coastal city in Florida with pastel art deco buildings. Palm trees and distant buildings are flat silhouettes in a darker shade of the sky colour, never black. Shadows are violet and plum, never black. Atmospheric haze: distant things fade toward lavender. Colours slightly more saturated than reality but matte: no glow, no neon, no lens flare, no chrome, no gloss. Medium level of detail. Wide establishing shot at eye level, static camera, three clear depth planes, calm and slightly ironic mood, the place is empty as if someone just left. Composition: the top fifth of the frame is plain sky, the bottom fifth is plain ground in shadow with no detail, the main subject sits in the centre of the frame, slightly right of centre, well away from the edges. No people, no human figures, no hands, no text, no letters, no numbers, no logos, no brands, no written signs, no weapons, no frame, no border. Aspect ratio 3:2, landscape.
```

### LUMIÈRE

```
A. Pink hour: sky graded from lavender (#ccc2f5) at the top through hazy pink (#e8a3c6) to pale peach (#ffd9c2) at the horizon. Silhouettes in plum (#7a4f6e), shadows in deep plum (#4b2f54).
```

```
B. Golden hour: sky graded from pink (#ec8fa0) at the top through peach (#fcbf96) to warm yellow-peach (#ffc27a) at the horizon, a low sun as a plain flat disc with no rays. Warm raking orange light, long shadows in warm plum (#583660).
```

```
C. Blue hour: sky graded from indigo (#4b4fb8) at the top to deep navy (#243152), with a thin coral band (#ff6a3d) along the horizon. City lights are small amber dots (#ffc36b). Shadows in dark navy (#1f1f38), never pure black.
```

```
D. Dawn: sky graded from light lilac (#e5ddff) at the top through peach (#ffd4a8) to pale lemon (#effa9e) at the horizon. Fresh, clear air, cool lilac shadows (#9a8fc9).
```

### SCÈNES

**1. `arsonist`** (B)
```
Scene: the open loading door of a small server room at the back of a pastel office building, on a Friday evening. Inside, a row of tall server racks; thick smoke pours out of the door and rises into the sky, turning pink and peach as it catches the sunset. In the foreground, on the ground and slightly right of centre, a bright red fire extinguisher stands upright, clean and clearly unused. No flames visible, only smoke. Palm silhouettes behind the building.
```

**2. `forger`** (B)
```
Scene: a forger's desk by a large window, seen from the side. On the desk: a neat stack of blank diploma certificates with red ribbons and round wax seals, a row of wooden rubber stamps, an open ink pad, a magnifying lamp, and a small office printer feeding out a blank sheet. Golden light comes through the window blinds and lays long striped shadows across the desk. Through the window, palm and city silhouettes. All papers are blank: no writing anywhere.
```

**3. `kingpin`** (A)
```
Scene: the terrace of a penthouse, high above the city. One large empty lounge armchair, seen from behind and slightly right of centre, faces the view; beside it a low table with a single glass. The edge of an infinity pool reflects the sky. Far below, the whole city spreads out to the sea as layered flat silhouettes fading into haze, with a few palm tops rising at the terrace edge.
```

**4. `mastermind`** (C)
```
Scene: inside a home garage at dusk, the roll-up door half open onto the blue-hour sky and city lights. The back wall is covered with pinned architectural blueprints, floor plans and diagrams made only of boxes, lines and arrows, all connected by taut red strings between pins. A single desk lamp throws a warm amber pool of light on the wall. A stool and a workbench with rolled plans in the foreground shadow. The diagrams contain no words or numbers.
```

**5. `delivery_machine`** (B)
```
Scene: a plain boxy delivery van speeding from left to right across a long low causeway bridge over calm water. Its rear doors have swung open and cardboard parcels are flying out behind it, tumbling through the air in a trail. The van is a generic model with no markings, its windows are dark, no driver visible. Motion is shown by the tilt of the van and the trail of parcels, not by blur. Low sun over the water, distant city silhouette at the end of the bridge.
```

**6. `night_owl`** (C)
```
Scene: the facade of a mid-rise art deco apartment building at 3 a.m., seen straight on from across the street. Every window is dark except one, slightly right of centre, glowing warm amber with the cool blue flicker of a screen inside and a desk lamp silhouette. A large pale full moon sits in the sky beside the building. One palm silhouette, an empty street with a single sodium streetlamp.
```

**7. `repeat_offender`** (B)
```
Scene: the interior of a small empty jail cell, its barred door standing wide open. The back wall is entirely covered with hand-scratched tally marks in groups of five, hundreds of them, from floor to ceiling. Golden evening light enters through a small barred window and projects the shadow of the bars across the wall. A simple bunk with a folded blanket on the left. Tally marks only: no letters and no digits.
```

**8. `hoarder`** (A)
```
Scene: a row of self-storage units with roll-up doors, receding in perspective. One unit, slightly right of centre, has its door rolled up and is packed far beyond capacity: stacks of cardboard boxes, crates and bags spilling out onto the tarmac in a soft avalanche. All the other doors are closed. The boxes are plain, with no labels. Palm silhouettes and a pink sky above the flat roofs.
```

**9. `chameleon`** (A)
```
Scene: a chameleon perched on the curved metal arm of a tall blank roadside motel sign, seen in close profile, slightly right of centre. Its skin takes on the exact gradient of the sky behind it, lavender on its back shading to pink and peach on its belly, so that it almost blends in. In the background, a low pastel motel with a row of identical doors and an empty parking area, palm silhouettes. The sign panel is completely blank.
```

**10. `fresh_blood`** (D)
```
Scene: a single small suitcase standing upright on the kerb of an empty bus station at sunrise, slightly right of centre, casting a long cool shadow. A simple bus shelter and an empty bench beside it. A straight road leads from the kerb toward the city skyline in the distance, drawn as pale silhouettes in the morning haze. A few young palm trees along the road. The suitcase has no tags and no stickers.
```

**11. `old_school`** (B)
```
Scene: a well-kept vintage 1960s convertible, generic design with no badge, parked at the kerb in front of a pastel art deco hotel facade, seen in three-quarter rear view. On the back seat, clearly visible, sits a beige 1980s desktop computer with a bulky CRT monitor and a keyboard, seat belt fastened around it. Golden evening light on the car's paint, matte, without chrome reflections. Palm silhouettes along the street. No number plate text.
```

**12. `ghost`** (C)
```
Scene: a vast empty car park at night, seen from a slightly raised viewpoint. A single curving set of tyre tracks crosses the faded parking bays and leaves the frame. One tall sodium lamp, slightly right of centre, casts a cone of amber light on an empty parking space. No vehicle anywhere. In the distance, the city as small amber dots under an indigo sky, two palm silhouettes at the edge of the lot.
```

**13. `sleeper_agent`** (A)
```
Scene: a modest, perfectly tidy single-storey suburban house seen straight on from the street. All shutters are closed. A lawn sprinkler runs on a flawless lawn, a car sits under a fitted cover in the driveway, and a plain mailbox stands at the kerb. On the roof, one antenna slightly too large for such a house. Everything is a little too calm. Pink-hour sky, two palm silhouettes, identical houses fading into haze on either side.
```

**14. `default`** (C)
```
Scene: the skyline of the city seen from across a calm bay at blue hour. Low and mid-rise buildings as layered flat silhouettes with small amber lights, reflected as soft vertical streaks in the still water. A few palm silhouettes on the near shore in the foreground shadow. Nothing else: no boats, no vehicles.
```

## 8. Réglages par outil

- **ChatGPT (génération d'images)** : demander « 1536 × 1024, paysage ». Rester dans la même conversation pour toute la série et commencer chaque demande suivante par « Same style, same palette treatment and same level of detail as the first image ».
- **Midjourney** : ajouter `--ar 3:2 --style raw --no people, text, letters, logo, neon`. Une fois la première image validée, ajouter `--sref <son adresse>` à toutes les autres. Agrandir ×2.
- **Gemini et autres** : demander le ratio 3:2 et la plus grande taille. Retirer tout filigrane visible : s'il est dans un coin, régénérer plutôt que recadrer.

## 9. Ordre de travail

1. **Générer d'abord `arsonist` seul**, en quatre variantes. C'est le profil le plus parlant, il fixe le style.
2. Le déposer dans `design/profiles/arsonist.png`. Claude le pose dans la tuile, vérifie à 390 px et à 175 px, et valide ou corrige le bloc STYLE.
3. **Générer les treize autres** avec la première image comme référence de style.
4. Tout déposer dans `design/profiles/`.

## 10. Grille pour garder ou jeter une image

On jette si l'une de ces lignes est vraie :

- une personne, une silhouette humaine ou une main est visible ;
- il y a du texte, des lettres ou des chiffres, même illisibles ;
- une ombre ou un palmier est noir ;
- il y a une lueur de néon, un halo, un reflet chromé ;
- l'image a l'air d'une photo ou d'un rendu 3D ;
- le sujet touche un bord, ou sort du carré central ;
- le bas à gauche est chargé de détails ;
- réduite à 175 px de large, on ne comprend plus l'idée ;
- posée à côté de la première image validée, elle n'a pas l'air de la même série.
