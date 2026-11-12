// Version du dessin des images de partage (/og/…). À monter à chaque refonte de
// leurs compositions (server/src/render/compositions.tsx) :
//   - le serveur range son cache disque dans og/v{n}/ et efface les anciens
//     (index.ts, pruneStaleImages) : aucune image de l'ancien dessin n'est resservie ;
//   - les adresses des images portent `?v={n}` (balises OG, front) : elles partent
//     avec un cache d'un an, `immutable`, que navigateurs et réseaux respectent.
// v2 (10 novembre 2026) : les lieux du crime (§18.28) dans l'aperçu de lien et le portrait, et la story.
// v3 (11 novembre 2026) : l'angle du recruteur. Pied « Dossier lu par Azerit », « CTO », titre de
// l'accueil, comparaison menée par la note du dossier, côtés « parcours » et « code ».
// v4 (12 novembre 2026) : « Faussaire » devient « Sous couverture » (data/profiles.json), relu au
// catalogue pour les fiches déjà stockées (shared/profileCatalog.ts) : leurs images se redessinent.
// v5 (12 novembre 2026) : un dossier, une fiche, une note (§18.36). Un dossier à deux pièces prend
// les compositions d'une fiche seule, celle du dossier (shared/caseFile.ts) ; les fiches seules ne changent pas.

export const IMAGE_DESIGN = 5;

/** Dossier du cache disque, sous og/. */
export const IMAGE_DESIGN_DIR = `v${IMAGE_DESIGN}`;

/** À ajouter à l'adresse d'une image : `?v=2`. */
export const IMAGE_QUERY = `v=${IMAGE_DESIGN}`;
