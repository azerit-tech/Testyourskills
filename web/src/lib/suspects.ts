// Les suspects de la couverture (SPEC §18.31) : six portraits peints, un par
// profil, que Jacques génère d'après docs/brief-personnages.md. Servis depuis
// web/public/characters/{id}.jpg (768 × 1152) et {id}-s.jpg (384 × 576).
// Vide tant qu'aucun fichier n'est posé : la couverture se construit sans eux.
// Ajouter un id ici, dans l'ordre d'affichage, dès que ses deux fichiers existent.
export const SUSPECTS: string[] = ["arsonist"];

/** Les deux tailles d'un portrait de suspect. */
export const suspectSrc = (id: string, small = false) => `/characters/${id}${small ? "-s" : ""}.jpg`;
