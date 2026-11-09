import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CARD_MASK_URL } from "../../shared/card/geometry";
import { App } from "./App";
import { api } from "./lib/api";
import { captureRef } from "./lib/session";
import "./styles.css";

// Silhouette de la carte, réutilisée pour le dos, les compteurs et le balayage.
document.documentElement.style.setProperty("--card-mask", CARD_MASK_URL);

// Arrivée par un lien partagé (?r=) : on garde l'origine et on nettoie l'adresse
// avant le premier rendu, pour que la fiche créée ensuite la porte (§18.0).
const visitRef = captureRef();
if (visitRef) api.track("shared_visit", visitRef, { ref: visitRef });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
