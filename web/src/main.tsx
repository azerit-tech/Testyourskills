import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { api } from "./lib/api";
import { initFilmTrace } from "./film/trace";
import { watchGestures } from "./lib/audio";
import { captureRef } from "./lib/session";
// Les feuilles des pages chargées à la demande restent dans le paquet de départ, dans
// l'ordre d'avant le découpage : styles.css passe toujours après elles.
import "./components/bands.css";
import "./components/denounce.css";
import "./components/primes.css";
import "./card/fonts.css";
import "./card/card.css";
import "./styles.css";

// La trace du film (`?filmtrace=1`), lue avant que la navigation ne change l'adresse : sans elle, rien.
initFilmTrace();

// Arrivée par un lien partagé (?r=) : on garde l'origine et on nettoie l'adresse
// avant le premier rendu, pour que la fiche créée ensuite la porte (§18.0).
const visitRef = captureRef();
if (visitRef) api.track("shared_visit", visitRef, { ref: visitRef });

// Le son de la révélation se débloque au premier geste (§18.27).
watchGestures();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
