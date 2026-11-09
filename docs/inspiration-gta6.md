# Inspiration : le design du jeu de Rockstar sorti le 19 novembre 2026

*Écrit le 9 novembre 2026 pour Testyourskills. Document de travail, à relire par Jacques avant d'en reporter quoi que ce soit dans `SPEC.md`.*

**Ce qu'on a regardé.** Le site officiel, vu dans Chrome le 9 novembre 2026 : l'accueil, la page des personnages et des lieux, la page médias. Le trailer 1, le trailer 2 et « An Extended Look » (27 août 2026), image par image. Plus des analyses écrites (liste à la fin). **Le jeu sort dans dix jours** : rien de ce qui suit ne vient du jeu fini. Les cartons de fin de mission, le menu du téléphone et les écrans de chargement n'ont jamais été montrés officiellement.

**Précision des couleurs.** Quand une valeur est marquée *CSS*, elle a été lue dans les styles calculés du site officiel : elle est exacte. Quand elle est marquée *œil*, c'est une estimation faite sur une capture : elle est approximative.

**Règle juridique (§17.2), rappelée une fois pour toutes.** On reprend un style et un univers. On ne reprend jamais une marque ni un fichier. Aucun nom du jeu, de l'éditeur, de la ville ou de l'État, aucun chiffre romain, aucun logo, aucun personnage, aucune capture, aucune police propriétaire. Tout ce qui est proposé ici se refait chez nous avec des couleurs, des mises en page, un rythme, des polices libres et des motifs.

---

## 1. Ce qui fait le style du jeu

### 1.1 La palette

Sur le site comme dans les trailers, il y a **deux régimes de couleur**. On les reconnaît tout de suite.

**A. L'interface (le site) : une nuit d'encre et des pastels mats.** Le néon n'y est pas.

| Rôle | Valeur | Source |
|---|---|---|
| Fond de page | `#0c0d1b` | CSS |
| Dégradé de fond (189°) | `#1f1f38` → `#18182d` → `#111222` → `#0c0d1b` | CSS |
| Fonds de cartes, au choix selon la section | prune `#4b2f54`, marine `#243152`, indigo `#2c3868`, ardoise `#252644`, vert nuit `#162623` | CSS |
| Titres (capitales étroites) | crème `#fff9cb` | CSS |
| Texte courant sur fond sombre | lilas `#e5ddff`, `#d9d1f6`, `#ccc2f5` | CSS |
| Bouton principal | rose poudré `#ffb2c6`, texte `#0c0d1b` | CSS |
| Variantes du bouton | `#ffbdcf` / `#fecad9`, texte prune `#423152` / `#563754` | CSS |
| Texte prune sur bandeau clair | `#583660` | CSS |
| Titre pêche | `#ffd4a8` | CSS |
| Bouton secondaire pêche | environ `#ffd3a5` | œil |
| Bouton secondaire citron | environ `#effa9e` | œil |
| Paragraphe en dégradé (accueil) | `linear-gradient(0deg, #99c7fe 30%, #d263e9 110%)` en `background-clip: text` | CSS |
| Paragraphe en dégradé (page des lieux) | corail environ `#ff5f6d` vers pêche-jaune environ `#ffc27a` | œil |
| Bandeau du haut | pêche environ `#fcbf96` au centre, rose environ `#ec8fa0` aux bords, palmiers prune environ `#7a4f6e` | œil |

On mélange ainsi : un fond quasi noir légèrement bleu, **une seule** couleur chaude et poudrée par élément actif (rose, pêche ou citron), du crème pour les titres et du lilas pour le texte. Les cartes changent de teinte de fond d'une section à l'autre (prune, puis marine, puis vert nuit), et les illustrations apportent la couleur. L'interface ne brille jamais : pas de lueur, pas de contour lumineux, pas d'ombre colorée.

**B. L'image (trailers, captures, illustrations) : saturée, chaude, l'heure dorée.**

- **Le dégradé du logo**, à l'œil : bleu pervenche en haut à gauche (environ `#5b6be0`), violet (environ `#9b4fd6`), magenta (environ `#f0479a`), orange (environ `#ff9a4a`), puis pêche-jaune en bas à droite (environ `#ffc36b`). Contour prune profond (environ `#3a1450`), avec un liseré clair à l'intérieur. Le dégradé part du froid en haut pour aller au chaud en bas, à peu près en vertical. Ce n'est pas notre diagonale qui va du jaune au violet.
- **Les illustrations officielles** : ciels lavande et rose, ombres violettes, aucune ombre noire. Les palmiers sont des silhouettes **de la même teinte que le ciel, en plus foncé** : prune sur pêche, lavande sur rose. Jamais du noir.
- **Le jour** : bleu de Floride, turquoise d'eau, verts francs, coraux. Saturation poussée un peu au-delà du réel, sans effet de dessin animé.
- **La nuit** : magenta et violet des enseignes, ambre sodium des lampadaires, noir bleuté. C'est le seul endroit où l'on voit du néon, et il vient des enseignes du décor, pas de l'interface.
- **Les couleurs d'alerte du HUD** : blanc pur pour les étoiles, rouge (environ `#b3202c`, œil) pour les pastilles d'indices et la mini-carte quand on est recherché.

### 1.2 La lumière et l'étalonnage

- **L'heure dorée et l'heure rose avant tout.** Le trailer 1 s'ouvre sur un ciel mauve-rose plein de brume (environ `#e8a3c6`, œil), avec un soleil qui bave en halo (environ `#ffd9c2`). La ville entière est noyée dans cette brume. Les bureaux et les intérieurs prennent une lumière rasante orangée.
- **L'heure bleue sur la baie**, en un seul plan du site : un ciel indigo (environ `#4b4fb8`) qui descend vers une bande orange-corail à l'horizon (environ `#ff6a3d`), et la ville en points d'or. C'est le plan d'ambiance du site.
- **Peu de grain, beaucoup de halo** : on voit de la diffusion, de la brume, des reflets et une légère aberration sur les images de téléphone. Le contraste est moyen et les noirs bouchés sont rares. Les vidéos de réseau social ont l'air abîmé d'un téléphone : gouttes d'eau sur l'objectif, flou de bougé, compression.
- **Caméra-piéton** : image désaturée, gris-bleu (environ `#5d6a72`, œil), en grand angle déformé, avec un contraste faible et des hautes lumières qui brûlent.
- **Trailer 2** : bandes noires de cinémascope (environ 2,39:1), étalonnage chaud et doux, plans longs.

### 1.3 La typographie

Ce qu'on a lu sur le site :

| Usage | Police du site | Traitement |
|---|---|---|
| Titres de carte (« LA GALERIE DE LANCEMENT », noms des personnages) | grotesque étroite grasse, embarquée dans la page | **CAPITALES**, interligne 1,0, chasse normale, **crème plat `#fff9cb`**, sans dégradé ni ombre |
| Surtitres (« REGARDER », « CAPTURES D'ÉCRAN ») | même étroite, petite | capitales, lilas ou cyan pâle, au-dessus du titre |
| Grands titres de section (« BANDE-ANNONCE DE LANCEMENT ») | `ArtDecoBold`, une géométrique art déco | capitales, **chasse très large** (6 px à 40 px, soit 0,15 em), blanc ou lilas translucide |
| Accroches et paragraphes vedettes | `ArtDecoBold` ou `ArtDecoMedium` | **casse normale**, gros corps (40 à 66 px), chasse un peu serrée (−0,02 em), interligne 1,1 à 1,3, **rempli d'un dégradé** |
| Texte courant, boutons | `ArtDecoMedium` 500 | casse normale, blanc ou lilas |
| Génériques des trailers (« … PRESENTS », la date de sortie) | géométrique art déco | capitales, chasse très large, centré, blanc ou mauve sourd (environ `#6b5470`) sur noir |
| Logo | lettrage gras arrondi en bas de casse, dérivé de Pricedown, sur un « VI » géant | **intouchable** |

Le principe : **trois voix**, et chacune a son rôle.

1. L'étroite grasse en capitales crème pour **nommer** (un nom, un titre).
2. La géométrique en casse normale, grosse et en dégradé, pour **raconter** (une phrase).
3. La géométrique en capitales très espacées pour **annoncer** (un surtitre, un générique, une date).

**Équivalents libres** (Google Fonts, licence OFL) :

| Voix | Proposé | Pourquoi | Par rapport à ce qu'on a |
|---|---|---|---|
| Nommer | **Barlow Condensed 700** (déjà chargée) | Très proche de l'étroite du site : fûts droits, O rectangulaires arrondis | On l'utilise en 800 avec un dégradé. Le site l'utiliserait en 700, **crème plat**. Garder le 800 pour la note seulement. Autre piste : Big Shoulders Display 700, plus art déco. |
| Raconter | **Outfit** 500 à 700 | Géométrique ronde, à grand œil, la plus proche d'`ArtDeco` en bas de casse | Remplace Inter, trop « outil de dev » pour ce rôle. Inter peut rester dans les formulaires. Autre piste : Lexend. |
| Annoncer | **Outfit 600** en capitales, `letter-spacing: 0.15em` ; pour plus de saveur art déco, **Josefin Sans 600** | Le site n'utilise pas une police large : il espace une géométrique normale | Aujourd'hui on fait ce rôle en JetBrains Mono, qui sonne terminal. On garde le mono pour la voix de la police et de la caméra-piéton (§1.6). |
| Chiffres du HUD | **Barlow Semi Condensed 700**, chiffres tabulaires, blanc avec un contour sombre de 1 px | Les compteurs du jeu (« 22 250 », « 00:07.00 ») sont des grotesques grasses, blanches, ombrées | Nouveau |

Pricedown : non, même avec une licence web. Le lettrage du logo est **le** marqueur de la marque. Un pastiche en bas de casse gras avec contour se lirait comme une contrefaçon du logo (§4).

### 1.4 La composition

- **La jaquette en collage.** Neuf à dix vignettes peintes de tailles inégales, séparées par des gouttières prune foncé (environ `#2a1530`). Le logo occupe le centre. Chaque vignette est un cliché : hélicoptère, bateau, flamant, alligator, voiture jaune, moto, personnages en buste. On lit « un monde entier » en une seule image. C'est le format signature de la série depuis vingt ans (risque, §4).
- **Les illustrations seules** (« prêts à tirer », vidéo de lancement) : deux personnages en pied, au tiers central. Un soleil disque derrière, des palmiers et des immeubles en aplats de la teinte du ciel, une perspective atmosphérique qui vire au violet. Le titre est en haut, très espacé et translucide, posé **par-dessus** le ciel.
- **Les pages personnages.** Une photo du jeu en fond plein écran, assombrie. Puis, dans l'ordre :
  1. le **NOM** en grandes capitales étroites crème ;
  2. **une phrase d'accroche** en rose poudré, en casse normale, sur 4 ou 5 lignes courtes ;
  3. une biographie de trois phrases en blanc ;
  4. une **réplique entre guillemets, ironique** ;
  5. une mosaïque décalée de captures sans cadre, qui déborde à droite, chaque image avec un petit bouton rond d'agrandissement.
- **Les cartes du site.** Coins arrondis de 25,6 px pour les grandes, 12,8 px pour les vignettes (CSS). Le fond est l'illustration, avec un voile de la teinte de la carte, et le texte est en bas ou à droite : surtitre, titre crème en capitales, deux lignes, bouton pilule. Des palmiers ton sur ton dans les coins.
- **L'en-tête collant** : « VI » en blanc à gauche, puis un filet et le nom de la page. Le bouton pilule rose et un menu en deux barres épaisses à droite.

### 1.5 Le rythme du montage

- **Trailer 1** (90 s) : une ouverture lente (ciel rose, générique très espacé), puis une scène parlée (Lucia en combinaison orange marquée « INMATE » en pochoir noir face à une conseillère). Ensuite, **une rafale de plans d'environ 1 à 2 s calés sur la musique**, où alternent des plans de cinéma (avenue néon, autoroute, ponts des Keys, lettres géantes à contre-jour) et des **images trouvées** : vidéos verticales de réseau social, live, caméra-piéton, vidéos de soirées et de clubs. Fin sur noir : la silhouette du logo **éclairée par l'arrière** (contour rose vers orange qui irradie), puis le logo plein et la date en capitales très espacées.
- **Trailer 2** (2 min 47) : en cinémascope, plus lent, construit sur les personnages. Les plans durent 3 à 5 s, et le générique arrive **au milieu** sur noir. Un plan est filmé dans l'appareil photo du téléphone : grille des tiers et déclencheur rond.
- **Ce qu'on en retient** : le contraste entre l'image soignée et l'image « vraie », sale et verticale, fait croire au monde. Le noir sert de respiration avant chaque carton.

### 1.6 Les motifs d'interface montrés

**Le HUD** (« An Extended Look », août 2026). Il est discret, aux quatre coins, et s'efface quand rien ne se passe.

- **Étoiles de recherche, en haut à droite : six emplacements, pas cinq.** Les étoiles allumées sont **blanc pur, pleines, sans lueur**. Les emplacements éteints sont des étoiles **pleines gris très foncé translucide**, pas des contours. Les allumées sont **calées à droite**, les éteintes restent à gauche. D'après les analyses écrites, il y a quatre états : creuses (crime signalé, suspect inconnu), blanches (vu, poursuivi), blanches clignotantes (contact perdu), rouges (on a échappé à la poursuite, mais la zone reste chaude).
- **Sous les étoiles**, une rangée de **pastilles rondes rouges à pictogramme blanc** qui disent *ce que la police sait* : arme, signalement, tenue, duo, caméra de surveillance, véhicule. Une analyse parle d'une liste de contrôle de la police en direct.
- **Munitions** : « 22 250 », chiffres gras blancs ombrés ; la réserve est en gris.
- **La mini-carte**, en bas à gauche : un **rectangle aux coins arrondis** (fini le rond), translucide. Elle est teintée de rouge bordeaux (environ `#8c3444` à 70 %, œil) pendant une poursuite, et bleu-gris foncé avec la route en rose pendant une course. Flèche blanche du joueur, « N » dans une pastille noire.
- **Compteurs d'activité**, en bas à droite : étiquette en petites capitales blanches (« PROGRESS 8% », « TARGETS REMAINING 7/12 »), puis la valeur dans une petite boîte sombre avec un filet rose vertical. Dessous, un **chrono en gros chiffres** (« 00:07.00 », « 00:34:42 »).
- **Invites contextuelles** : un mot en capitales près de l'objet (« KNOCK », « SLIM JIM »).

**Les réseaux sociaux du jeu** (trailer 1) :

- Vidéo **verticale au centre** d'un cadre 16:9. Sur les côtés, **la même vidéo agrandie et floutée** remplit le vide.
- En bas à gauche : avatar rond (souvent un émoji), le pseudo en gras blanc, puis une **pilule « Follow » au contour doré** (environ `#d9b24a`, œil). Dessous, la légende en blanc, en casse normale, en argot, avec un émoji et un mot-dièse.
- En haut à droite : deux icônes (commentaire, cœur) dans des cercles translucides.
- En direct : un badge **« LIVE » rouge** (environ `#e0263a`, œil) collé au pseudo.
- Des vidéos de soirées et de clubs avec le logo du compte en filigrane, en script brillant : la vidéo « magazine ».

**La caméra-piéton** (trailer 1) : en haut à droite, en mono blanc, « 08-04 23:58:46 -0500 » et dessous « BODY 3 X6070511N ». À côté, une icône ronde jaune en forme de diaphragme : c'est **le logo d'un vrai fabricant de caméras-piétons**, à ne pas reprendre (§4). Image grand angle, désaturée, sombre.

**Le téléphone** : d'après les analyses, c'est un objet du monde (la caméra zoome sur les mains), avec des fils de messages à avatars émoji et un écran d'appel. On ne l'a pas vu nous-mêmes en détail.

**Les cartons de mission** : rien de montré. Le seul carton officiel qu'on connaisse est le générique sur noir (capitales très espacées) et la silhouette du logo éclairée par l'arrière.

### 1.7 Le ton des textes

- **Court, sec, ironique, en casse normale.** Sur le site : une accroche du type « rêve d'une vie facile, mais… », puis une réplique pince-sans-rire du genre « un jour de plus au paradis, pas vrai ? ». On fait de l'understatement, pas de l'emphase.
- **Une phrase-promesse en dégradé**, qui oppose gain et perte et finit sur la perte.
- **Les capitales sont réservées** aux noms, aux titres de carte et aux surtitres. Les phrases ne crient jamais.
- **Sur les réseaux du jeu**, au contraire, tout est en argot et en minuscules, avec des fautes assumées, un émoji et un mot-dièse. Le jeu oppose deux registres : la marque soignée et la foule qui commente.

---

## 2. Notre état actuel, comparé

Sources : `web/gta.html`, les couleurs du §17.2, et `web/src/three/hud.css`, qui reprend les mêmes variables.

### Ce qui est juste

- **Le fond de nuit** `#0a0a1f` est à deux pas du `#0c0d1b` du site. On garde, et on ajoute le dégradé vertical vers `#1f1f38` en haut.
- **Barlow Condensed** est la bonne famille pour les noms et les titres.
- **La photo d'identité judiciaire** (mur gradué, écriteau noir), le numéro de dossier et la date : c'est notre motif à nous, il colle au trailer 1 (combinaison, interrogatoire, caméra-piéton). À garder tel quel.
- **Les barres segmentées**, la ligne de pied en mono façon procès-verbal (« Interrogé par une IA pendant 9 s »), le ton taquin des chefs d'accusation : c'est le registre pince-sans-rire du site.
- **Les étoiles en haut à droite du HUD** et le carton de fin plein écran.

### Ce qui sonne faux ou daté

| Chez nous | Pourquoi ça date | Époque que ça évoque |
|---|---|---|
| Rose néon `#ff3fa4` + cyan `#3fd8ff` saturés, en `text-shadow` et `drop-shadow` lumineux partout (niveau, puces, barres, étoiles) | Le jeu n'éclaire jamais son interface. Le duo magenta-cyan lumineux, c'est la synthwave des années 2010 et le jeu de 2002 | Vice City 2002, outrun |
| Halos radiaux rose et cyan dans le fond de la fiche | Le site met des fonds plats teintés, et c'est l'illustration qui porte la couleur | Synthwave |
| Dégradé diagonal jaune → orange → rose → violet sur la note **et** le titre **et** le carton | Le site n'a qu'**un** élément en dégradé par écran, et son dégradé va du froid en haut au chaud en bas | Affiche rétro générique |
| Palmier **noir** `#05050f` en ombre chinoise | Le jeu fait des palmiers ton sur ton (prune sur pêche, lavande sur rose) | Outrun, t-shirt « Miami » |
| Balayage holographique du niveau 5 | Vestige de FIFA, rien de tel dans le jeu | FIFA Ultimate Team |
| Étoiles éteintes en contour fin, allumées avec une lueur rose | Dans le jeu, les éteintes sont pleines et sombres, les allumées blanches et mates, calées à droite | Le jeu de 2013 |
| Vert d'argent `#8ce06b` | C'est le vert du compteur du jeu de 2013. Le compteur de 2026 existe mais on ne l'a pas vu de près | Le jeu de 2013 |
| Texte en JetBrains Mono pour les étiquettes de la fiche (Spécialité, Arme…) | Sonne terminal de dev plutôt que dossier de police. Le site espace une géométrique | Neutre, mais hors univers |
| Inter pour le texte | Propre mais sans caractère. La voix « raconter » du site est une géométrique ronde | Neutre |
| Posterisation de la photo | Les illustrations officielles sont **peintes** (aplats doux, ombres violettes, trait discret). Une posterisation à 8 niveaux se lit comme un filtre Photoshop | Filtre « poster » des années 2000 |
| Badge de carte spéciale jaune incliné de −2° avec une ombre jaune | Effet autocollant, absent du site, qui utilise des pilules plates | Carte à collectionner |

En résumé, on a fait **la version néon nocturne**, alors que le jeu se présente surtout en **pastel au crépuscule sur fond d'encre**, avec une interface **mate**. Il faut retirer les lueurs, ne garder qu'un dégradé par écran et passer les titres en crème plat.

### Une palette corrigée à proposer pour le §17.2

À faire valider avant toute modification du code. Les valeurs *CSS* sont celles du site. On ne reprend aucun fichier, on prend des valeurs proches, et une couleur ne se protège pas.

```
--ink-0:   #0c0d1b   nuit d'encre (fond)
--ink-1:   #1f1f38   haut du dégradé de fond
--plum:    #4b2f54   fond de carte chaude
--navy:    #243152   fond de carte froide
--moss:    #162623   fond de carte « preuves »
--cream:   #fff9cb   titres, noms, note
--lilac:   #e5ddff   texte courant
--blush:   #ffb2c6   action principale
--peach:   #ffd3a5   action secondaire
--lime:    #effa9e   action « concourir »
--siren:   #c8283a   pastilles d'indices, alerte (remplace --neg)
--star:    #ffffff   étoile allumée (mate)
--star-off:rgba(20,20,30,.55) étoile éteinte (pleine)
--dusk:    linear-gradient(180deg, #6f7cf0 0%, #b05ad8 35%, #f0589a 65%, #ffb366 100%)   un seul usage par écran
--story:   linear-gradient(180deg, #ff6f8e 0%, #ffc480 100%)   phrase en dégradé
```

Les couleurs de niveau (§17.3) deviennent la **teinte du fond de la fiche**, et non plus un halo : ★ ardoise, ★★ marine, ★★★ prune, ★★★★ prune avec le dégradé `--dusk` sur la note, ★★★★★ fond illustré au crépuscule.

---

## 3. Propositions, écran par écran, téléphone d'abord (390 px)

Pour chaque écran : **ce qu'on emprunte**, **comment on le refait**, puis **pourquoi ça aide le partage**.

### 3.1 L'accueil

- **On emprunte** le bandeau du haut du site, la phrase-promesse en dégradé, les cartes pilules et l'en-tête collant.
- **On refait** :
  - Un bandeau fin de 44 px en dégradé pêche → rose (`#fcbf96` au centre, `#ec8fa0` aux bords), avec deux feuilles de palmier **prune** `#7a4f6e` qui débordent des coins. Le texte est en Outfit 600 capitales, `letter-spacing: .15em`, prune `#583660` : « SAISON 1 · PRIMES OUVERTES · J-42 ».
  - L'en-tête : le losange Azerit à gauche et une pilule `--blush` « Ma fiche » à droite.
  - La promesse du §18.5 en **Outfit 700, 34 px, casse normale, interligne 1,1**, remplie de `--story` du haut vers le bas : « Ton GitHub remplace ton CV. Les plus recherchés passent un entretien. » Rien d'autre en dégradé sur l'écran.
  - Le champ, et un bouton pilule `--blush` pleine largeur, texte `#0c0d1b` en Outfit 600.
  - La fiche de Jacques dessous, puis les primes en cartes de 25 px d'arrondi, défilables à l'horizontale.
  - Les deux palmiers du §17.6 restent, mais ton sur ton (`#2c2546` sur `#0c0d1b`) et non plus noirs.
- **Pourquoi** : la capture d'écran de l'accueil, la première chose qu'un curieux poste, se lit au premier coup d'œil comme « l'univers du jeu du moment » grâce au bandeau pêche et à la phrase en dégradé, sans un seul élément de marque.

### 3.2 L'attente : l'interrogatoire (§18.13)

- **On emprunte** l'ouverture du trailer 1 (l'interrogatoire, la combinaison orange en pochoir) et la caméra-piéton.
- **On refait**, en plein écran sur téléphone, en trois temps.
  1. **La caméra-piéton** pendant les 2 à 3 premières secondes. Fond désaturé gris-bleu (`filter: saturate(.35) contrast(.85) brightness(.8)` sur la scène 2D). Vignettage fort en `radial-gradient`, et un léger bombé via un `feDisplacementMap` SVG, ou rien si c'est trop cher. En haut à droite, en JetBrains Mono 11 px blanc : `11-09 23:58:46 +0100` et dessous `AZR 3 · X{ID}`. À côté, **notre propre pictogramme** (le losange Azerit dans un rond rouge, jamais un diaphragme jaune). La phrase d'ouverture, en sous-titre blanc centré, en Outfit 500 : « Tu sais pourquoi tu es là ? ». La tournure est banale en français ; elle évoque l'ouverture du trailer sans la citer.
  2. **La toise et le flash** (§18.13, inchangé), puis l'avatar qui passe en photo d'identité.
  3. **Les scellés** : les trois repos qui tombent dans des sachets, et la radio qui lit le pire commit.
  - **La barre jaune** devient le compteur d'activité du jeu, en bas à droite : « PREUVES 3/6 » en petites capitales blanches, la valeur dans une boîte `rgba(12,13,27,.7)` avec un filet `--blush` de 3 px à gauche, et dessous un chrono **« 00:07.42 »** en Barlow Semi Condensed 700 de 28 px, chiffres tabulaires. Le chrono monte en vrai : le « 9 s » du pied de fiche devient visible. Le rang en file (« 3 suspects avant toi au commissariat ») prend la même boîte.
- **Pourquoi** : l'attente devient filmable. La caméra-piéton avec horodatage est le cadre le plus « vrai » du trailer, et c'est exactement le format qu'on enregistre à l'écran pour une story. Le chrono rend concret l'argument « jugé en 9 s ».

### 3.3 La révélation dans l'ascenseur et son HUD

- **On emprunte** les étoiles du jeu (pleines, mates, calées à droite, avec leurs états), les pastilles d'indices rouges, le compteur d'activité et la mini-carte en rectangle arrondi.
- **On refait** (`hud.css`, `hud.ts`) :
  - **Les étoiles** :
    - éteintes : `fill: rgba(20,20,30,.55); stroke: none` ;
    - allumées : `fill: #fff`, **sans `drop-shadow` colorée** ; une ombre portée neutre `drop-shadow(0 1px 1px rgba(0,0,0,.6))` suffit pour la lisibilité ;
    - les allumées se rangent à droite, `flex-direction: row-reverse` ;
    - l'animation « pop » est gardée, mais en blanc.
  - **Les états, qui racontent la montée** :
    - au départ, cinq étoiles **creuses** (contour blanc 1,5 px) : « dossier ouvert, suspect inconnu » ;
    - à chaque palier, une étoile devient blanche ;
    - à **la panne** (§18.13), les étoiles allumées **clignotent** à 2 Hz : c'est « contact perdu » dans le jeu, la bonne métaphore pour une coupure de courant, et ça ne demande aucune secousse de caméra ;
    - à la fin, aucun passage au rouge : le rouge veut dire « tu as échappé », ce qui contredit la révélation.
  - **Les pastilles d'indices** : une rangée de ronds de 18 px `--siren` à pictogramme blanc, sous les étoiles. Chacune s'allume quand le fait correspondant est lu, ce qui remplace en partie les lignes du dossier en haut à gauche, trop bavardes sur téléphone. Pictogrammes dessinés par nous : chevrons de code (= l'arme, le langage), silhouette (= l'avatar trouvé), lune (= commits de nuit), cadenas ouvert (= fichier `.env` ou secret), dossier (= les repos), caméra (= « GitHub a tout filmé »). Un appui long sur une pastille affiche sa ligne en clair.
  - **Le message radio**, en bas : Outfit 500 en casse normale, blanc sur un bandeau `rgba(12,13,27,.7)`. Le JetBrains Mono passe à la seule étiquette « RADIO · CANAL 3 ».
  - **Le compteur d'activité**, en bas à droite, reprend l'afficheur d'étage : « ÉTAGE 4/6 » puis le chrono de la séquence. Une boîte unique réutilisée de l'attente à l'ascenseur : continuité.
  - **Sur téléphone** : les étoiles font 20 px à 12 px du bord, `env(safe-area-inset-*)` gardé. Rien en haut au centre, à cause de l'encoche.
- **Pourquoi** : le HUD est ce que les gens capturent en vidéo. Des étoiles au rendu exact du jeu de l'année se reconnaissent en une image sur un fil LinkedIn, et les pastilles rouges racontent « l'IA a trouvé ça » sans un mot.

### 3.4 La fiche

- **On emprunte** la page personnage (nom, accroche rose, réplique) et les cartes mates du site.
- **On refait** (maquette `web/gta.html` d'abord, §17.7), sur 360 × 520 (et donc 342 px de large sur un téléphone de 390 px) :
  - **Le fond** : la teinte du niveau en aplat (§2, palette corrigée), un dégradé vertical vers `#0c0d1b` en bas, plus le grain existant. On retire les deux halos radiaux.
  - **La note** : Barlow Condensed 800, 118 px. Remplie de `--dusk` (du froid au chaud, verticale) **seulement pour ★★★★ et ★★★★★**, crème plat `#fff9cb` sinon. C'est le seul dégradé de la fiche.
  - **Le niveau** (« RECHERCHÉ ») : Outfit 600 en capitales, `letter-spacing: .15em`, 11 px, lilas `#e5ddff`, sans `text-shadow`.
  - **Le profil (§18.2), placé comme le nom d'une page personnage** : sous l'écriteau, le **profil en Barlow Condensed 700 de 30 px en capitales crème** (« OISEAU DE NUIT »), et dessous **l'accroche en Outfit 500 de 13 px en rose poudré `#ffb2c6`, casse normale** (« Livre plus vite que la police ne lit »). Exactement la pile « JASON DUVAL / phrase rose » du site.
  - **Les étoiles** : celles du HUD (§3.3), mates, calées à droite dans leur rangée, en haut à gauche de la fiche. Ou bien on les déplace en haut à droite comme dans le jeu, et le losange Azerit passe en bas.
  - **Les étiquettes** (Spécialité, Arme, Affiliation) : Outfit 600 en capitales, 8,5 px, `.15em`, lilas à 60 %. Les valeurs en Outfit 600 de 12,5 px en crème.
  - **Les barres** : remplissage plat `--blush` (ou `--peach` pour ★★★★ et plus), sans `box-shadow`. BUZZ en `--siren` plutôt qu'en orange, puisque c'est un indice à charge.
  - **Les chefs d'accusation** : la puce ronde lumineuse devient **la pastille rouge à pictogramme** du HUD (12 px, `--siren`, pictogramme blanc) pour les négatifs, crème pour les positifs, lilas pour les spéciaux. Même langage que l'ascenseur.
  - **Le niveau 5** : on retire le balayage holographique, et on met à la place un **contour éclairé par l'arrière** (§3.5) de 1 px rose vers orange qui irradie de 12 px vers l'extérieur. C'est la seule lumière de la fiche.
  - **Le portrait** : on garde la posterisation à court terme, mais on la teinte vers le violet dans les ombres (`feColorMatrix` qui pousse les basses lumières vers `#3a2a5a`) pour se rapprocher des illustrations peintes. La vraie cible reste la génération d'un portrait peint (§17.10, en attente de crédit).
- **Pourquoi** : la fiche est l'image qui circule. Mate, crème et rose poudré sur encre, elle ressemble au site du jeu dont tout le monde parle, et pas à une affiche synthwave de 2015. Le profil en gros devient l'identité qu'on a envie d'afficher (§18.2).

### 3.5 Le carton de fin de mission

- **On emprunte** la fin du trailer 1 (silhouette éclairée par l'arrière, puis le plein) et le générique en capitales très espacées.
- **On refait** sur fond noir `#000`, en 1,5 s :
  1. 0 à 0,4 s : le mot du niveau (« RECHERCHÉ ») en Barlow Condensed 800 de 22 vw, rempli de `#0c0d1b` presque invisible, avec un contour éclairé par l'arrière : `text-shadow` empilées de `--blush` vers `#ffb366`, de 0 à 18 px. **C'est le seul endroit de l'application où la lumière est permise.**
  2. 0,4 à 0,9 s : le remplissage monte de bas en haut en `--dusk` (masque animé).
  3. 0,9 s : dessous, en Outfit 600 en capitales, `.2em`, crème à 80 % : « SUSPECT IDENTIFIÉ · OISEAU DE NUIT ». Puis la note.
  - Le roulement de batterie reste. Ce carton est unique pour tous les niveaux (décision du §17.10).
- **Pourquoi** : c'est la vignette naturelle d'une vidéo enregistrée à l'écran et la dernière image avant la fiche. Le contour éclairé par l'arrière est reconnu comme « la fin du trailer » sans reprendre ni le logo ni ses lettres.

### 3.6 La page partagée (§18.7)

- **On emprunte** la page personnage, de haut en bas.
- **On refait**, en colonne unique de 390 px :
  1. Le fond en haut : **une capture de la scène de l'ascenseur à l'arrivée** (notre rendu, pas celui du jeu), assombrie à 45 % avec un voile `#0c0d1b` qui descend.
  2. Un surtitre en Outfit 600 capitales `.15em` lilas : « AVIS DE RECHERCHE ».
  3. **« @LOGIN »** en Barlow Condensed 700 de 56 px, crème, interligne 1.
  4. Les étoiles du HUD.
  5. **L'accroche du profil** en Outfit 500 de 22 px, rose `#ffb2c6`, sur 3 ou 4 lignes courtes.
  6. **La peine** en blanc, sur trois lignes.
  7. **Une réplique entre guillemets**, ironique, tirée d'un fait : son pire commit (« "final fix 2" », 3 h 12 du matin). C'est l'équivalent de la réplique du site.
  8. La fiche.
  9. Une **mosaïque décalée de pièces à conviction**, sans cadre, en deux colonnes inégales qui débordent à droite : le graphe de contributions, l'extrait de code cité par l'IA, le terminal « 0 tests found ».
  10. Puis « Et toi ? » avec le champ et le bouton `--blush`.
  - Le bouton « Voir l'arrestation » est une pilule citron `--lime` avec ▶.
- **Pourquoi** : le visiteur venu de LinkedIn arrive sur une page qui a la grammaire exacte des pages personnages du jeu (on le reconnaît en une seconde), avec un ami à la place du héros. C'est flatteur pour la cible et drôle pour le dénonciateur (§18.6), et ça donne envie de répondre.

### 3.7 L'image de partage (1200 × 630 et 1080 × 1350)

- **On emprunte** la composition des illustrations officielles (le personnage au tiers, le titre espacé dans le ciel) et, pour l'hebdomadaire, le **principe** du collage.
- **On refait** :
  - **1200 × 630** (aperçu de lien) :
    - fond : le crépuscule peint par nous (`city.webp` à l'heure bleue, ou une illustration du jeu fixe du §17.5), recadré, voile `#0c0d1b` à 40 % à droite ;
    - à gauche, la fiche (480 px de haut) ;
    - à droite, de haut en bas : surtitre « AVIS DE RECHERCHE · SKILLS.AZERIT.TECH », « @LOGIN EST RECHERCHÉ » en Barlow Condensed 700 de 84 px crème, les étoiles du HUD, l'accroche du profil en Outfit 500 de 30 px rose ;
    - tout le texte tient dans la zone centrale de 1080 × 560, à cause du rognage de LinkedIn et de X.
  - **1080 × 1350** (fil LinkedIn, Instagram) :
    - le ciel en haut, avec « AVIS DE RECHERCHE » très espacé et translucide **par-dessus le ciel**, comme le titre de la vidéo de lancement ;
    - la fiche au centre (60 % de la hauteur) ;
    - dessous, le profil en crème, l'accroche en rose et l'adresse ;
    - deux palmiers ton sur ton qui débordent des coins.
  - **« Les 5 plus recherchés de la semaine »** (1080 × 1350) : un **collage de cinq vignettes de tailles inégales** séparées par des gouttières `#2a1530`, chacune un portrait de fiche avec son pseudo en écriteau. **Au centre, aucun bloc logo** : un bandeau horizontal crème « SEMAINE 47 » et c'est tout (§4).
- **Pourquoi** : sur un fil, l'image doit dire « c'est l'univers du jeu » en un quart de seconde. Le ciel au crépuscule, le titre espacé et le crème sur encre le font. Le collage hebdomadaire est l'image la plus repostable : chaque personne citée la partage.

### 3.8 Le clip vertical (§18.8)

- **On emprunte** les vidéos de réseau social du trailer 1 et son rythme en rafale.
- **On refait** en 1080 × 1920, en 8 s, dans Remotion :

| Temps | Image |
|---|---|
| 0 à 1,2 s | **caméra-piéton** (§3.2) : horodatage, image désaturée, la porte de l'ascenseur qui s'ouvre |
| 1,2 à 4 s | les étoiles qui s'allument une à une, **sur le temps fort**, avec les pastilles rouges |
| 4 à 4,3 s | flash blanc et déclic |
| 4,3 à 5,8 s | carton en contour éclairé (§3.5) |
| 5,8 à 8 s | la fiche, puis l'adresse |

  - Pendant toute la vidéo, **le cadre de réseau social par-dessus** :
    - en bas à gauche, l'avatar rond, **@login** en Outfit 700 blanc, et une pilule « Suivre » au contour doré `#d9b24a` qui devient « Dénoncer » ;
    - dessous, une légende en minuscules et en argot de dev, avec un émoji et un mot-dièse, tirée d'un fait (« 47 commits "fix" et il dort tranquille 👀 #fichededev ») ;
    - en haut à droite, cœur et bulle dans des cercles translucides ;
    - le badge rouge « EN DIRECT » pendant la caméra-piéton.
  - **Version 4:5** : la vidéo verticale au centre, **la même vidéo agrandie et floutée** sur les côtés, comme dans le trailer. **Version 16:9**, pareil.
- **Pourquoi** : la vidéo ressemble déjà à un post natif, donc les plateformes et les gens la traitent comme du contenu et non comme une pub. Et le trailer a appris à tout le monde que ce cadre veut dire « le monde du jeu ».

### 3.9 Le tableau des primes (§18.4, §18.5)

- **On emprunte** le compteur d'activité (« TARGETS REMAINING 7/12 » et un chrono), les cartes du site et, pour la page d'une prime, l'avis de recherche.
- **On refait** :
  - **`/primes`, sur téléphone** : une liste de cartes de 25 px d'arrondi. Chacune a un fond teinté selon le contrat (stage = marine, alternance = vert nuit, CDI = prune), une feuille de palmier ton sur ton en coin et :
    - un surtitre « PRIME · CDI · PARIS OU TÉLÉTRAVAIL » ;
    - le titre « BACKEND CHEZ {ENTREPRISE} » en Barlow Condensed 700 de 30 px crème ;
    - à droite, **le compteur du jeu** : « PLACES 3/5 » dans la boîte à filet rose, et dessous le chrono jusqu'à la clôture **« J-12 04:12:33 »** qui défile à la seconde ;
    - en bas, une pilule `--lime` « Tente ta chance ».
  - **`/primes/:id`, l'avis de recherche de l'entreprise** :
    - en tête, le logo de l'entreprise dans un écriteau noir, comme la photo d'identité ;
    - « RECHERCHE : DEV BACKEND » en crème, les étoiles exigées, la récompense en crème (« 3 entretiens ») ;
    - le classement en rangées : rang en Barlow Semi Condensed 700, avatar rond, @login en Outfit 600, étoiles du HUD, note à droite ;
    - **sa propre ligne** surlignée par un filet `--blush` (« 7e sur 143 ») ;
    - les vingt premiers seulement (§18.4).
  - **« Tu es en course »** (§18.5) : la même boîte de compteur, en tête de l'après-fiche.
  - Un **fil de messages à la manière du téléphone** pour les notifications de rang, avec avatar émoji de l'entreprise (« Tu viens de passer 5e 👀 »), seulement si on veut un jour des notifications.
- **Pourquoi** : le chrono qui défile donne l'urgence d'une mission chronométrée, et c'est ce qui fait revenir. L'image de partage d'une prime, celle que l'entreprise poste, devient un avis de recherche dans l'univers du jeu, plus drôle et plus partagé qu'une offre d'emploi.

---

## 4. Ce qu'il ne faut surtout pas faire

### Juridiquement

- **Aucun élément de marque** : le chiffre romain, le lettrage du logo (même redessiné, même dans une autre police en bas de casse gras avec contour), le « V » et le « I » en dégradé avec des palmiers dedans, le nom du jeu, de l'éditeur, de la ville et de l'État. Rien non plus de la station de télé, du réseau social, des marques de voitures ou des hôtels inventés par le jeu (enseignes vues : « Ocean View Hotel », « Hotel Dixon »), ni des comptes fictifs du trailer.
- **Pas de personnage, de réplique ou de capture du jeu**, même floue en fond ou en vignette. Nos fonds viennent de notre scène (ville OSM précalculée) ou d'illustrations générées et retouchées par nous (§17.5).
- **Le collage de jaquette** est le format le plus risqué, car c'est l'habillage reconnaissable de la série depuis vingt ans. Seul, avec nos images et sans bloc central, c'est un pastiche de mise en page. Avec un bloc logo au centre ou des vignettes clichés (hélicoptère, alligator, flamant, moto en roue arrière), ça devient une imitation de l'habillage. On le réserve au « 5 plus recherchés », avec des portraits de devs seulement.
- **L'icône ronde jaune en diaphragme** des images de caméra-piéton est le logo d'un vrai fabricant : on n'en fait pas d'imitation. Pas de « BODY 3 » non plus : nous, c'est « AZR 3 ».
- **Pas de Pricedown**, ni d'une imitation (Bangers et consorts) pour un « Wasted » ou des cartons : c'est la typographie de la marque.
- **Pas de « présente » en générique sur le modèle exact du trailer** (« AZERIT GAMES PRESENTS »). « Azerit » en surtitre espacé suffit.
- Les couleurs, la mise en page d'une page personnage, des étoiles de recherche, une caméra-piéton et un cadre de réseau social sont des idées communes : libre.

### Esthétiquement

- **Pas de néon sur l'interface** : ni `text-shadow`, ni `drop-shadow` colorée, ni halo derrière les blocs. La lumière n'existe qu'en un seul endroit, le contour éclairé par l'arrière du carton et de la fiche ★★★★★.
- **Un seul dégradé par écran.** Le reste est en aplat.
- **Pas de duo magenta-cyan saturé, de grille outrun, de soleil rayé, de chrome, de VHS**. C'est l'imagerie du jeu de 2002 et de la synthwave, pas celle de 2026, qui joue le pastel et le pêche.
- **Pas de palmiers noirs.** Toujours ton sur ton.
- **Pas d'holographique**, de reflet métallique ni de badge incliné façon carte à collectionner : c'est FIFA.
- **Pas de vert d'argent du jeu de 2013**, ni de « Wasted » gris et rouge : ce sont les marqueurs de l'ancien jeu (et le second vise la personne, §17.8).
- **Pas de capitales partout.** Les phrases en casse normale, les capitales pour nommer et annoncer.
- **Pas de filtre posterisé dur** : il fait photomontage. Mieux vaut un portrait net avec des ombres violettes, ou un vrai portrait peint.
- **Le style « couleurs du jeu » est déjà copié par des marques** (constructeurs, fast-food et clubs de foot, d'après la presse de septembre 2026). Ce qui nous distingue n'est pas le dégradé : c'est la **fiche de police** (photo d'identité, scellés, caméra-piéton, chefs d'accusation tirés de vrais commits). Il faut pousser ce qui est à nous, pas seulement la palette.

---

## 5. Sources

**Officielles (vues le 9 novembre 2026)**

- Site officiel, accueil : https://www.rockstargames.com/VI
- Site officiel, personnages et lieux : https://www.rockstargames.com/VI/only-in-leonida
- Site officiel, médias et illustrations : https://www.rockstargames.com/VI/media
- Trailer 1 (décembre 2023) : https://www.youtube.com/watch?v=QdBZY2fkU-0
- Trailer 2 (mai 2025) : https://www.youtube.com/watch?v=VQRLujxTm3c
- « An Extended Look » (27 août 2026) : https://www.youtube.com/watch?v=tJbzMqJGH4k

**Analyses écrites**

- HUD et mini-carte : https://gtanerd.com/guides/gta-6-hud-and-minimap/
- Étoiles et pastilles d'indices : https://beebom.com/gta-6-wanted-system-explained/
- Repères minutés de l'Extended Look : https://www.gtaboss.gg/gta-6/guides/gta-6-extended-look-breakdown
- Réseaux sociaux du trailer 1, recréations de vidéos virales : https://www.pcgamer.com/gta-6s-first-trailer-has-recreations-of-a-load-of-real-viral-video-moments-in-it-and-it-looks-like-rockstars-version-of-tiktok-will-play-a-big-part
- Trailer 1 plan par plan : https://www.pcgamer.com/gta-6-reveal-trailer-scene-by-scene-breakdown-dogs-dadbods-and-social-agitation/
- Trailer 1, détails : https://www.gamesradar.com/gta-6-trailer-1-breakdown-things-you-missed
- Étalonnage et palette (avis, à prendre avec recul) : https://gtapulse.com/reviews/gta-6-color-palette-art-direction/
- Marques qui copient le style : https://www.gtaboom.com/the-rockstar-effect-has-real-brands-styling-their-ads-in-gta-6-colors-259d
- Logo, analyse : https://www.creativebloq.com/news/gta-6-logo
- Logo, analyse : https://www.designrush.com/best-designs/logo/gta-6-logo-design
- Extended Look, dates et diffusion : https://www.iphoneincanada.ca/2026/08/27/how-to-watch-gta-vis-extended-look-what-to-expect/

**Polices libres citées** (Google Fonts, OFL) : Barlow Condensed, Barlow Semi Condensed, Outfit, Josefin Sans, Big Shoulders Display, Lexend, JetBrains Mono.
