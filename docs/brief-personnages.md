# Brief des illustrations à générer : les suspects

Six portraits de personnages, un par profil criminel choisi. Ils donnent des visages à la couverture de l'accueil (SPEC §18.31). Jacques les génère, Claude les découpe et les pose. Il prolonge le brief des quatorze décors, livrés et posés le 9 novembre 2026 (SPEC §18.28 ; ce brief est retiré du dépôt, il reste dans l'historique git) : même ville, même peinture, mêmes lumières.

## 1. À quoi ils servent

Notre accueil n'a que des lieux vides. Une affiche de jeu tient par ses personnages : ce sont eux qui manquent.

| Endroit | Taille à l'écran | Ce qui est posé dessus |
|---|---|---|
| **La couverture de l'accueil** : une mosaïque de cases, décors et suspects mêlés | case haute de 120 × 180 px sur téléphone, 240 × 360 px sur ordinateur | rien, ou le nom du profil en petit, en bas |
| **Mur « Lequel es-tu ? »** | vignette de 175 px de large | le nom du profil, en bas à gauche |
| **Images de partage** et carton de fin (plus tard) | fond ou médaillon | la fiche, le titre |

Ils ne vont pas dans la fiche : la fiche porte la photo du joueur.

Le test qui décide de tout : **réduit à 120 px de large, on doit lire un visage, une attitude et un objet.** Un personnage, un objet, une idée.

## 2. Format

- **Ratio 2:3, portrait.**
- **Taille** : 1024 × 1536 au minimum. Mieux : 2048 × 3072 (agrandissement ×2 de l'outil).
- **Fichier** : PNG, ou JPG en qualité 90 et plus, sRGB.
- **Image nue** : pas de cadre, pas de coins arrondis, pas de bordure, pas de filigrane, pas de signature. Le fond est peint (le décor du profil), pas transparent.
- **Nom** : `{id}.png` (les `id` sont au §6).
- **Dépôt** : dossier `Azerit/design/characters/`, à côté de `design/profiles/`. Il n'est pas versionné. Claude en tire `web/public/characters/{id}.jpg` (768 × 1152) et `{id}-s.jpg` (384 × 576).

## 3. Composition

Un portrait en plan américain : de la mi-cuisse à la tête, caméra un peu en dessous du regard (contre-plongée légère, comme une affiche de film). Le personnage est de trois quarts, il tient **un seul objet** qui dit son profil. Derrière lui, son lieu du crime, simplifié.

Zones, sur une image de 1024 × 1536 :

```
┌────────────────────────────┐
│ ciel du décor (0 à 8 %)    │
│   ┌──────────────────┐     │
│   │  TÊTE ET ÉPAULES │     │  x : 22 à 78 %   (225 à 800 px)
│   │                  │     │  y : 8 à 42 %    (120 à 645 px)
│   └──────────────────┘     │
│   ┌──────────────────┐     │
│   │  BUSTE ET OBJET  │     │  y : 42 à 72 %   (645 à 1105 px)
│   └──────────────────┘     │
│  bas du corps, dans        │  y : 72 à 100 % : peut être coupé,
│  l'ombre, sans détail      │  le nom du profil se pose ici
└────────────────────────────┘
```

- **La tête, les épaules et l'objet tiennent dans le carré du haut** (1024 × 1024, de y = 5 % à y = 72 %) : c'est ce qui reste dans une case carrée.
- **Le visage occupe 18 à 24 % de la hauteur de l'image.** Plus petit, il disparaît à 120 px.
- **L'objet est tenu à hauteur de poitrine**, du côté opposé au regard. Une seule main visible si possible : les outils ratent les mains.
- **Le regard part hors champ, ou droit dans l'objectif** avec un demi-sourire. Jamais de pose de mannequin.
- **Le décor derrière est flou de détail, pas flou optique** : trois ou quatre grandes formes du lieu du crime, et le ciel. Rien qui dispute le visage.
- **Rien d'essentiel à moins de 6 % des bords.**

## 4. Style

**En une phrase** : les habitants de nos affiches de voyage. Des portraits peints en aplats, mats, au crépuscule, dans une comédie policière.

**Les règles**

- **Même peinture que les décors** : gouache ou sérigraphie, grandes formes nettes, un dégradé doux dans chaque forme, un trait fin plus sombre, un léger grain de papier.
- **Proportions réalistes stylisées** : ni caricature, ni dessin animé à grosse tête, ni photo. Le visage est simplifié en plans : deux ou trois valeurs par teinte, pas de pores, pas de rides détaillées.
- **Aucune ombre noire, y compris sur la peau.** Les ombres du visage sont violettes ou prune ; un liseré de la couleur du ciel éclaire le côté du visage tourné vers l'horizon.
- **La lumière est celle du décor du profil** (lettres A à D, au §7 ; la lumière de chaque profil est dans `shared/scenes.ts`).
- **Vêtements en aplats pastel**, coupés simplement : chemise à manches courtes, veste de lin, sweat à capuche, polo. Un motif au plus (rayure ou palmes ton sur ton).
- **Mat** : pas de lueur, pas de halo, pas de reflet chromé, pas de peau brillante.
- **Ton** : sûr de soi et un peu ironique. Ce sont des devs qui se prennent pour des hors-la-loi. Leur arme est un ordinateur, un tampon, un café.

**La troupe doit être mélangée** : trois femmes, deux hommes, une personne androgyne ; des âges de 22 à 55 ans ; des couleurs de peau et des cheveux différents d'un portrait à l'autre. C'est écrit dans chaque scène : ne pas le changer, sinon l'outil rend six fois la même personne.

## 5. Inspirations

À regarder pour l'œil :

- **Les affiches de voyage et de cinéma en sérigraphie** des années 1950 à 1970 : visages en trois aplats, lumière de côté.
- **Les portraits peints des couvertures de romans policiers de gare** : une attitude, un objet, un fond de ville.
- **Nos quatorze décors** (`Azerit/design/profiles/`) : c'est la référence de style à donner à l'outil. **On peut téléverser nos propres décors comme image de référence**, ils sont à nous.
- **La jaquette et les illustrations du jeu**, pour une seule leçon : chaque case montre quelqu'un avec une attitude. On ne prend ni ses personnages, ni son trait.

**Interdits**

- **Ne jamais téléverser une image du jeu**, et ne jamais écrire dans le prompt le nom du jeu, de l'éditeur, de sa ville ou d'un de ses personnages. Pas de « in the style of » suivi d'un studio ou d'un artiste vivant.
- **Aucune ressemblance avec les personnages du jeu ni avec une personne réelle.** Donc pas de : débardeur blanc et tatouages, queue-de-cheval brune et créoles, chaînes en or, lunettes miroir, bandana, maillot de bain, chemise ouverte sur le torse.
- **Aucune arme**, aucun billet, aucune drogue, pas de sang. Les objets sont ceux d'un bureau.
- **Aucun texte**, lettre, chiffre, logo, marque : écran d'ordinateur vide ou en aplat, papiers vierges, gobelet sans logo, vêtements sans inscription.
- **Pas de synthwave** : néon, grille, chrome, duo magenta-cyan.
- **Pas de photo réaliste ni de rendu 3D**, pas de manga, pas de dessin animé à gros contours, pas de pixel art.
- **Pas de pose sexualisée**, pas de décolleté ni de torse nu.

## 6. Les six suspects

Chaque prompt se compose ainsi : **bloc STYLE** + **bloc LUMIÈRE** de la lettre indiquée + **PERSONNAGE**. Les blocs sont au §7.

| # | `id` | Profil | Sa phrase | Lumière | Qui | L'objet | Ce qu'on doit lire en une seconde |
|---|---|---|---|---|---|---|---|
| 1 | `arsonist` | Pyromane | Déploie le vendredi soir. Sans peur, sans rollback | B | une femme de 30 ans, cheveux courts décolorés | un gobelet de café | elle boit son café, tout fume derrière elle |
| 2 | `forger` | Faussaire | Le CV le plus convaincant de la ville | B | un homme de 45 ans, costume de lin, lunettes de lecture | un diplôme vierge à ruban rouge | un charmeur qui vous tend un faux diplôme |
| 3 | `kingpin` | Légende du milieu | Ses PR font la loi dans tous les quartiers | A | une femme de 55 ans, cheveux argent, tailleur pastel | aucun : les bras croisés | la patronne, la ville à ses pieds |
| 4 | `mastermind` | Cerveau | Chaque casse commence par un schéma d'architecture | C | un homme de 35 ans, chemise à manches courtes, crayon sur l'oreille | des plans roulés sous le bras | il réfléchit déjà au coup suivant |
| 5 | `night_owl` | Oiseau de nuit | Les meilleurs coups partent à 3 h du matin | C | une personne androgyne de 25 ans, capuche, casque audio autour du cou | un ordinateur portable ouvert | un visage éclairé par un écran, la lune derrière |
| 6 | `fresh_blood` | Jeune pousse | À peine en ville, déjà sur tous les radars | D | une femme de 22 ans, sac à dos, cheveux bouclés | la poignée d'une valise | elle vient d'arriver et regarde la ville |

Les sept autres profils garderont leur décor seul. On les fera si ces six-là tiennent.

## 7. Les prompts

Coller STYLE, puis la LUMIÈRE, puis le PERSONNAGE. En anglais : les outils suivent mieux.

### STYLE (à coller dans chaque prompt)

```
Character portrait as a flat-colour painted illustration, in the manner of a gouache or screen-printed vintage travel or film poster. Large clean shapes, a soft matte gradient inside each shape, a very fine darker outline, subtle paper grain. Stylised realistic proportions: not a cartoon, not a caricature, not a photograph. The face is simplified into two or three flat tonal planes per colour, no pores, no fine wrinkles. Shadows on skin and clothes are violet and plum, never black or grey; a thin rim of light in the sky colour runs along the side of the face that turns toward the horizon. Clothes are plain pastel flat shapes with no writing and no logo. Matte finish: no glow, no neon, no lens flare, no chrome, no glossy skin. Framing: three-quarter view, from mid-thigh up, camera slightly below eye level like a film poster. The head and shoulders sit in the upper-middle of the frame, the face takes about one fifth of the image height, the character holds exactly one object at chest height. Behind the character, a simplified background of three or four large flat shapes and the sky, in a subtropical coastal city with pastel art deco buildings; palm trees and distant buildings are flat silhouettes in a darker shade of the sky colour, never black. The lower quarter of the image falls into calm plum shadow with no detail. Mood: self-assured and slightly ironic, a crime comedy, not a film noir. An original character that resembles no real person and no existing fictional character. No text, no letters, no numbers, no logos, no brands, no weapons, no money, no jewellery chains, no tattoos, no frame, no border. Aspect ratio 2:3, portrait.
```

### LUMIÈRE

```
A. Pink hour: sky graded from lavender (#ccc2f5) at the top through hazy pink (#e8a3c6) to pale peach (#ffd9c2) at the horizon. Silhouettes in plum (#7a4f6e), shadows in deep plum (#4b2f54). Soft pink light on the face.
```

```
B. Golden hour: sky graded from pink (#ec8fa0) at the top through peach (#fcbf96) to warm yellow-peach (#ffc27a) at the horizon, a low sun as a plain flat disc with no rays. Warm raking orange light on one side of the face, shadows in warm plum (#583660).
```

```
C. Blue hour: sky graded from indigo (#4b4fb8) at the top to deep navy (#243152), with a thin coral band (#ff6a3d) along the horizon. City lights are small amber dots (#ffc36b). The face is lit by one warm amber source, shadows in dark navy (#1f1f38), never pure black.
```

```
D. Dawn: sky graded from light lilac (#e5ddff) at the top through peach (#ffd4a8) to pale lemon (#effa9e) at the horizon. Fresh clear light on the face, cool lilac shadows (#9a8fc9).
```

### PERSONNAGES

**1. `arsonist`** (B)
```
Character: a woman of about thirty with light brown skin and short bleached-blonde hair, wearing a pale mint short-sleeved shirt over a white t-shirt, a laptop tucked under her left arm. She calmly lifts a plain paper coffee cup to her lips with her right hand and looks straight at the viewer with a relaxed half-smile, completely unbothered. Behind her, the open door of a small server room at the back of a pastel office building pours thick smoke into the sunset sky, the smoke turning pink and peach; a red fire extinguisher stands untouched by the door. No flames, only smoke.
```

**2. `forger`** (B)
```
Character: a man of about forty-five with olive skin, neatly combed dark hair greying at the temples and a trimmed moustache, wearing a cream linen suit with a pale pink shirt and no tie, reading glasses low on his nose. He holds up a blank diploma certificate with a red ribbon and a round wax seal between two fingers of his right hand, offering it to the viewer with a charming, knowing smile, eyes looking over his glasses. Behind him, a desk by a large window with a row of wooden rubber stamps and a stack of blank certificates, golden light through window blinds laying striped shadows. All papers are completely blank.
```

**3. `kingpin`** (A)
```
Character: a woman of about fifty-five with dark brown skin and short natural silver-grey hair, wearing a wide-shouldered pastel lilac trouser suit with a peach blouse. She stands with her arms crossed, chin slightly raised, looking down at the viewer with a calm, amused authority. She holds nothing. Behind her, the terrace of a penthouse with one empty lounge armchair and the edge of an infinity pool; far below, the whole city spreads out to the sea as layered flat silhouettes fading into haze.
```

**4. `mastermind`** (C)
```
Character: a man of about thirty-five with pale skin, tousled red-brown hair and a short beard, wearing a dusty-blue short-sleeved shirt, a pencil tucked behind his ear. He carries a bundle of rolled blueprints under his right arm and looks off to the side, eyes narrowed in thought, a faint smile, as if already planning the next move. A warm amber desk lamp lights one side of his face. Behind him, a garage wall covered with pinned diagrams made only of boxes, lines and arrows, connected by taut red strings; the roll-up door is half open onto the blue-hour sky and city lights. The diagrams contain no words and no numbers.
```

**5. `night_owl`** (C)
```
Character: an androgynous person of about twenty-five with East Asian features, chin-length black hair with a blunt fringe, wearing an oversized pale lavender hoodie with the hood up and large headphones resting around the neck. They hold an open laptop against their chest with one arm, the plain blank screen casting a soft cool-blue light upward on the face, mixed with a warm amber light from one side. Tired, delighted eyes, a small grin, looking straight at the viewer. Behind them, the dark facade of an art deco apartment building with a single lit window, a large pale full moon in the indigo sky, one palm silhouette. The laptop screen shows no text.
```

**6. `fresh_blood`** (D)
```
Character: a woman of about twenty-two with warm tan skin and a mass of dark curly hair, wearing a pale yellow polo shirt under a light denim jacket, a backpack on both shoulders. Her right hand rests on the raised handle of a small suitcase standing beside her. She looks up and off to the side toward the city, wide-eyed, with an eager, determined smile. Behind her, an empty bus shelter at sunrise and a straight road leading to the pale city skyline in the morning haze, a few young palm trees. The suitcase has no tags and no stickers.
```

## 8. Réglages par outil

- **ChatGPT (génération d'images)** : demander « 1024 × 1536, portrait ». Téléverser **notre** décor `design/profiles/arsonist.png` avec la phrase « Use this image only as the style reference: same painting technique, same palette treatment, same level of detail ». Rester dans la même conversation pour les six et commencer chaque demande suivante par « Same style and same rendering of faces as the first character ».
- **Midjourney** : ajouter `--ar 2:3 --style raw --no text, letters, logo, neon, weapon, tattoo`. Référence de style : `--sref <adresse de notre décor arsonist>`. Une fois le premier portrait validé, ajouter aussi son adresse en `--sref`. **Ne pas utiliser `--cref`** entre les portraits : il donnerait le même visage aux six. Agrandir ×2.
- **Gemini et autres** : demander le ratio 2:3 et la plus grande taille. Si un filigrane apparaît dans un coin, régénérer plutôt que recadrer.
- **Dans tous les outils** : quatre variantes par personnage, on garde celle dont le visage se lit le mieux en petit.

## 9. Ordre de travail

1. **Générer d'abord `arsonist` seule**, en quatre variantes. Elle fait la paire avec le décor le plus parlant et fixe le rendu des visages.
2. La déposer dans `design/characters/arsonist.png`. Claude la pose dans une case de la couverture à côté de son décor, vérifie à 120 px et à 240 px, et valide ou corrige le bloc STYLE.
3. **Générer les cinq autres** avec ce premier portrait et notre décor comme références de style.
4. Tout déposer dans `design/characters/`.

## 10. Grille pour garder ou jeter un portrait

On jette si l'une de ces lignes est vraie :

- le personnage rappelle un personnage du jeu, une célébrité ou une personne réelle ;
- il y a du texte, des lettres ou des chiffres, même illisibles (écran, gobelet, vêtement, diplôme) ;
- une main a un nombre de doigts faux, ou deux objets sont tenus ;
- une ombre est noire ou grise, sur la peau ou ailleurs ;
- la peau brille, il y a une lueur de néon ou un reflet chromé ;
- l'image a l'air d'une photo, d'un rendu 3D, d'un manga ou d'un dessin animé ;
- le visage fait moins d'un sixième de la hauteur, ou la tête touche le bord haut ;
- la tête, les épaules et l'objet ne tiennent pas dans le carré du haut ;
- réduit à 120 px de large, on ne lit plus le visage ni l'objet ;
- posé à côté du décor du même profil, il n'a pas l'air de la même série ;
- deux portraits de la série ont le même visage.
