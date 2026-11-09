// Vue locale : même scène et même rendu que la révélation, caméra libre.
// Entrée HTML séparée, absente du build de production.
import "./card/fonts.css";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { PerspectiveCamera } from "three";
import { siGithub, siTypescript } from "simple-icons";
import { FIXTURES } from "../../shared/fixtures";
import { levelAccent } from "./components/Reveal";
import { preloadWalkoutAssets } from "./three/assets";
import { loadCardTexture } from "./three/cardTexture";
import { loadSceneFonts } from "./three/textures";
import { createWalkout } from "./three/walkout";

interface Inspection {
  camera: PerspectiveCamera;
  freeCamera: boolean;
  hold(time: number): void;
}

const status = document.querySelector<HTMLElement>("#status")!;
async function start() {
  if (!import.meta.env.DEV) throw new Error("Cette vue est disponible avec le serveur local de développement.");
  const [assets] = await Promise.all([preloadWalkoutAssets(), loadSceneFonts()]);
  const card = FIXTURES.gold;
  const scene = createWalkout({
    lang: "fr", double: false, accent: levelAccent(card), assets,
    login: card.login ?? card.name, overall: card.overall, langKey: card.mainLanguage,
    logoPath: siTypescript.path, leaguePath: siGithub.path,
    cardTexture: loadCardTexture(card, "fr"), muted: true,
    anchor: () => null, onHandoff: () => undefined, onDone: () => undefined,
    texts: {
      langName: "TypeScript", langLabel: "Arme", leagueName: "GitHub", leagueLabel: "Dossier",
      position: card.position, positionName: "Full-stack", positionLabel: "Spécialité",
      club: card.club ?? "", clubLabel: "Affiliation", statusLabel: "Statut", statuses: [{ min: 0, label: "Confirmé" }],
      idleTitle: "DEV PACK", idleSubtitle: "", graphLabel: "Contributions", levelLabel: "Dangereux",
      hud: { specialty: "Spécialité", weapon: "Arme", file: "Dossier", affiliation: "Affiliation", dispatch: "Central", score: "Note", suspect: "Suspect identifié :" },
    },
  });
  document.body.append(scene.canvas);
  const debug = (window as unknown as { __tys3d: Inspection }).__tys3d;
  debug.hold(10.9);
  await scene.ready;
  debug.freeCamera = true;
  const controls = new OrbitControls(debug.camera, scene.canvas);
  controls.minDistance = 0.15;
  controls.maxDistance = 5;
  controls.enableDamping = false;
  const setView = (view: string) => {
    const camera = debug.camera;
    camera.fov = window.innerWidth < 600 ? 76 : 60;
    if (view === "panel") {
      camera.position.set(0.9, 1.5, 1);
      controls.target.set(0.9, 1.5, 0);
    } else if (view === "sill") {
      camera.position.set(0.1, 0.65, 1.05);
      controls.target.set(0, 0.03, -0.05);
    } else if (view === "floor") {
      camera.position.set(0, 1.25, 2.65);
      controls.target.set(0, 0.02, 1);
    } else if (view === "photo") {
      camera.position.set(-0.55, 1.57, 0.55);
      controls.target.set(-1.254, 1.57, 0.55);
    } else if (view === "notice") {
      camera.position.set(0.65, 1.53, 0.55);
      controls.target.set(1.254, 1.53, 0.55);
    } else {
      camera.position.set(0, 1.5, 2.8);
      controls.target.set(window.innerWidth < 600 ? 0.32 : 0.12, 1.5, 0);
    }
    camera.updateProjectionMatrix();
    controls.update();
  };
  setView("cabin");
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    button.disabled = false;
    button.addEventListener("click", () => setView(button.dataset.view!));
  }
  const doors = document.querySelector<HTMLButtonElement>("#doors")!;
  let open = false;
  doors.disabled = false;
  doors.addEventListener("click", () => {
    open = !open;
    debug.hold(open ? 12.6 : 10.9);
    doors.textContent = open ? "Fermer les portes" : "Ouvrir les portes";
  });
  status.textContent = "Prêt · scène figée, son coupé";
  window.addEventListener("pagehide", () => { controls.dispose(); scene.dispose(); }, { once: true });
}
void start().catch((error: unknown) => {
  status.textContent = `Impossible de charger la scène : ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
});
