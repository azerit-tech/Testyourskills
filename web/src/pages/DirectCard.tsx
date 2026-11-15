// Route /{pseudo} : l'accueil, le champ prérempli avec le pseudo et la porte
// GitHub ouverte (SPEC §18.48). Rien ne part à la simple visite : c'est le
// toucher sur le bouton qui lance la fiche, sur le quota de qui le touche.
import { useEffect, useRef } from "react";
import { isReservedSegment } from "../../../shared/routes";
import { navigate } from "../lib/router";
import { setPrefill } from "../lib/session";

/** Préremplit l'accueil avec ce pseudo (un mot réservé n'en est jamais un), puis y va. */
export function openDirect(login: string) {
  if (!isReservedSegment(login)) setPrefill({ login, mode: "single", tab: "github" });
  navigate("/", { replace: true });
}

export function DirectCard({ login }: { login: string }) {
  const once = useRef(false);

  useEffect(() => {
    // Une seule fois, même quand StrictMode rejoue l'effet en dev.
    if (once.current) return;
    once.current = true;
    openDirect(login);
  }, [login]);

  return null;
}
