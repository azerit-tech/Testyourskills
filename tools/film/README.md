# Le montage du film

`montage.json` dit, pour chacun des neuf plans, quelle prise prendre et quelle fenêtre en garder. `scripts/film-assemble.ts` en tire `web/public/film/` (§4.1 et §6 T2 de `docs/cinematique-poursuite.md`).

## Déposer une prise

Une prise est un fichier vidéo d'un plan, sorti du rendu 3D du film (`tools/film3d/`, SPEC §18.36). Elle se dépose dans `~/Desktop/Azerit/design/film/plans/`, hors du dépôt, sous le nom `PLAN-prise.mp4` : `OUV-1.mp4`, `P3-2.mp4`, `FIN6-1.mp4`. Une prise absente est remplacée par son carton, sans erreur : le film se monte toujours.

## Choisir sa fenêtre

```
npx tsx scripts/film-contact.ts ~/Desktop/Azerit/design/film/plans/P3-2.mp4
```

donne dans `var/film/contact/` une planche (une image sur quatre, numérotée dans la prise, zones du §7.3 en filet) et une grille vide du §7.10 à remplir. On y lit l'image d'entrée.

## Les champs d'un plan

| Champ | Sens |
|---|---|
| `take` | le fichier de la prise, ou `null` pour le carton |
| `in` | l'image d'entrée, comptée dans la prise à sa propre cadence (0 = la première) |
| `speed` | 1 = vitesse de la prise ; 0,5 = deux fois plus lent ; 2 = deux fois plus vite |
| `crop` | `null` = image entière ; sinon `{ "x", "y", "w", "h" }` en fractions de la source (0 à 1). Le script recadre ensuite toujours au centre en 9:16 |

La longueur de chaque plan (24, 28 ou 40 images, 36 pour FIN, 56 pour FIN6) est fixée par le film, pas par cette liste : le plan prend `longueur × speed` secondes à 24 i/s à partir de `in`. Si la prise est trop courte, la dernière image est tenue et le script le dit.

`grade` est l'étalonnage commun, appliqué aux prises seulement : `eq` de ffmpeg (`contrast`, `brightness`, `saturation`, `gamma`), `colorbalance` (`shadows`, `midtones`, `highlights`, trois nombres r, v, b de -1 à 1), et en option une LUT `.cube` posée dans ce dossier (`lut`). Les clés qui commencent par `//` sont des commentaires.

## Remonter

```
npx tsx scripts/film-assemble.ts            # prises du dossier, cartons sinon
npx tsx scripts/film-assemble.ts --slates   # tout en cartons
npx tsx scripts/film-assemble.ts --plans=autre/dossier
```

Moins de deux minutes. Le script vérifie chaque fichier par ffprobe (images, taille, 24 i/s, images clés, aucune piste son) et les plafonds de poids ; s'il en dépasse un, il baisse la qualité et le dit. `var/film/planche-plans.png` montre les neuf plans côte à côte pour juger la même nuit.
