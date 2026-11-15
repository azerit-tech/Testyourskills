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
// v6 (12 novembre 2026) : le profil « Sous couverture » (forger) perd le décor de l'atelier de faux
// diplômes et prend `default` (shared/scenes.ts) : ses images se redessinent, ciel de l'heure bleue.
// v7 (15 novembre 2026) : la revue du site (§18.48). Chaque image se lit à 360 px de large : sur
// l'aperçu d'une fiche, le titre d'affiche, la rangée d'étoiles et le niveau, le décor en bandeau ;
// l'appel en pilule sur toutes, et sur le portrait avec ce que c'est en une ligne ; sous trois
// étoiles, la phrase du profil à la place du chef d'accusation ; la bande, la prime et l'accueil refaits.
// v8 (15 novembre 2026) : la signature en pied de fiche passe de 8 à 10, plus claire, et dit
// « Fiche lue par Azerit » (“Sheet read by Azerit”) ; au dos, “weighted average”.
// v9 (15 novembre 2026) : la fiche se lit à 334 px (aucun texte sous 12 unités), matricule à
// six chiffres sur la plaque, note crème à tous les niveaux ; l'aperçu d'une fiche écrit
// « 79/100 » ; la marque signe les images de bande et de prime, la prime a son décor doré et
// dit « Terminée » ; le titre de l'accueil en lilas puis crème ; le portrait pose « Avis de
// recherche » sur sa plaque, comme la story.

export const IMAGE_DESIGN = 9;

/** Dossier du cache disque, sous og/. */
export const IMAGE_DESIGN_DIR = `v${IMAGE_DESIGN}`;

/** À ajouter à l'adresse d'une image : `?v=2`. */
export const IMAGE_QUERY = `v=${IMAGE_DESIGN}`;
