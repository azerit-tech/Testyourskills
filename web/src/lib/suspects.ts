// Les suspects de la couverture (SPEC §18.31) : des portraits peints, un par
// profil, que Jacques génère d'après docs/brief-personnages.md. Servis depuis
// web/public/characters/{id}.jpg (768 × 1152) et {id}-s.jpg (384 × 576).
// Ajouter un id ici dès que ses deux fichiers existent, et sa ligne dans
// SUSPECT_FIT (lib/cover.ts) : les cases où son portrait tient.
//
// L'ordre ne décide plus des cases : à chaque visite, une graine tire la
// distribution dans un cycle qui donne à chacun sa part (lib/cover.ts, rotation).
// Il ne sert qu'à départager deux distributions aussi équilibrées.
// `forger` (« Sous couverture ») est retiré : son portrait tendait un diplôme, le site ne
// suggère pas qu'on truque un CV. Le fichier reste ; le nouveau portrait reviendra ici.
export const SUSPECTS: string[] = ["arsonist", "night_owl", "kingpin", "mastermind", "fresh_blood"];

/** Les deux tailles d'un portrait de suspect. */
export const suspectSrc = (id: string, small = false) => `/characters/${id}${small ? "-s" : ""}.jpg`;
