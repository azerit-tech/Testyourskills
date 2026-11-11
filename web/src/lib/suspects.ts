// Les suspects de la couverture (SPEC §18.31) : six portraits peints, un par
// profil, que Jacques génère d'après docs/brief-personnages.md. Servis depuis
// web/public/characters/{id}.jpg (768 × 1152) et {id}-s.jpg (384 × 576).
// Ajouter un id ici dès que ses deux fichiers existent.
//
// L'ordre est l'ordre d'affichage (lib/cover.ts, coverPanels) : le premier tient
// la grande case de gauche (f1), le deuxième s2, le troisième s4, le quatrième la
// case f3 quand le top ne la remplit pas ; les suivants attendent une case.
// Il est choisi pour que deux cases voisines n'aient jamais la même lumière :
// Pyromane (or) à côté de l'Oiseau de nuit (nuit) sur téléphone, la Légende du
// milieu (rose) entre l'Oiseau de nuit et le Faussaire (or) sur ordinateur, ce
// qui laisse aux deux décors restants l'aube et le rose.
export const SUSPECTS: string[] = ["arsonist", "night_owl", "kingpin", "forger", "mastermind", "fresh_blood"];

/** Les deux tailles d'un portrait de suspect. */
export const suspectSrc = (id: string, small = false) => `/characters/${id}${small ? "-s" : ""}.jpg`;
