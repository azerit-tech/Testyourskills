// La page d'une fiche, chargée à la demande (App.tsx). Le formulaire la charge
// d'avance, pendant la demande de la fiche (EntryForm.tsx) : déjà là, elle se
// rend tout de suite, sans passer par la page vide d'attente du chargement.
type CardPageModule = typeof import("./CardPage");

let loaded: CardPageModule | null = null;

export function loadCardPage(): Promise<CardPageModule> {
  return import("./CardPage").then((m) => (loaded = m));
}

/** Le module, s'il est déjà chargé ; sinon null. */
export function loadedCardPage(): CardPageModule | null {
  return loaded;
}
