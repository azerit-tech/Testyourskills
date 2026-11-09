// Le HUD de la révélation (SPEC §17.4, §18.18), en DOM par-dessus le canvas,
// au style mat : les étoiles de recherche en haut à droite (allumées blanches
// et calées à droite, éteintes pleines et sombres), les quatre lignes du
// dossier (spécialité, arme, dossier, affiliation) et le carton de fin de
// mission : le niveau en --dusk, la note, « Profil identifié : {profil} », puis « Voir ma fiche ».
// Piloté image par image par la scène (walkout.ts) ; ne redessine que ce qui change. Styles :
// hud.css. La mini-carte est en option (map) : l'ascenseur ne s'en sert pas.
import { STAR_THRESHOLDS, type HudTexts } from "./hudTexts";

export interface HudState {
  /** Temps de la séquence (s), négatif avant le départ. */
  t: number;
  /** Étoiles allumées, 0 à STAR_THRESHOLDS.length. */
  stars: number;
  /** Lignes du dossier déjà révélées (0 à 4). */
  lines: number;
  /** Carton de fin : 0 (absent) à 1 (plein), puis vers 0. */
  mission: number;
  /** Distance au dev (m) et altitude (m), pour la mini-carte. */
  distance: number;
  altitude: number;
  /** Tout le HUD s'efface (passation). */
  opacity: number;
}

export interface HudLines {
  specialty: string;
  weapon: string;
  file: string;
  affiliation: string;
}

export interface Hud {
  update(s: HudState): void;
  dispose(): void;
}

const STAR = "M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z";

export function createHud(
  host: HTMLElement,
  o: {
    texts: HudTexts;
    lines: HudLines;
    title: string;
    overall: number;
    double: boolean;
    accent: string;
    map?: boolean;
    profile?: string;
    /** « Voir ma fiche » : passe directement à la fiche. */
    onCta?: () => void;
  },
): Hud {
  const root = document.createElement("div");
  root.className = "dive-hud";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="dive-hud__stars">${STAR_THRESHOLDS.map(() => `<svg viewBox="0 0 24 24"><path d="${STAR}"/></svg>`).join("")}</div>
    <div class="dive-hud__lines">
      ${(["specialty", "weapon", "file", "affiliation"] as const)
        .map((k) => `<div class="dive-hud__line"><span>${esc(o.texts[k])}</span><b>${esc(o.lines[k])}</b></div>`)
        .join("")}
    </div>
    ${o.map === false ? "" : `<div class="dive-hud__map"><canvas width="176" height="176"></canvas><div class="dive-hud__cone"></div></div>`}
    <div class="dive-hud__mission">
      <div class="dive-hud__center">
        <div class="dive-hud__title">${wordLines(o.title)
          .map((l) => `<span>${esc(l)}</span>`)
          .join("")}</div>
        <div class="dive-hud__score">${o.overall}</div>
        ${o.profile ? `<p class="dive-hud__suspect">${esc(o.texts.suspect)}<b>${esc(o.profile)}</b></p>` : ""}
      </div>
      <button type="button" class="dive-hud__cta" tabindex="-1">${esc(o.texts.cta)}</button>
    </div>`;
  host.appendChild(root);
  const stars = Array.from(root.querySelectorAll<SVGElement>(".dive-hud__stars svg"));
  const lines = Array.from(root.querySelectorAll<HTMLElement>(".dive-hud__line"));
  const mission = root.querySelector<HTMLElement>(".dive-hud__mission")!;
  const cta = root.querySelector<HTMLButtonElement>(".dive-hud__cta")!;
  // le clic ne doit pas aussi lancer un feu d'artifice sur la scène
  cta.addEventListener("pointerdown", (e) => e.stopPropagation());
  cta.addEventListener("click", (e) => {
    e.stopPropagation();
    o.onCta?.();
  });
  const canvas = root.querySelector<HTMLCanvasElement>("canvas");
  const g = canvas?.getContext("2d") ?? null;

  /** Chaque ligne du mot prend toute la largeur, comme un titre d'affiche
   *  (maquette web/gta-carton.html) ; l'ensemble tient dans 30 % de la hauteur. */
  const fitTitle = () => {
    const titleLines = Array.from(root.querySelectorAll<HTMLElement>(".dive-hud__title span"));
    const pad = Math.max(16, Math.min(40, window.innerWidth * 0.04));
    const W = Math.min(window.innerWidth - pad * 2, 980);
    const maxH = window.innerHeight * 0.3;
    const full = titleLines.map((l) => (W / Math.max(1, measureTitle(l.textContent ?? ""))) * 100);
    // un mot court (« HIGH ») ne doit pas écraser l'autre : 2,3 fois son corps au plus,
    // l'écart de « HAUTE / SURVEILLANCE » dans la maquette
    const sizes = full.map((s) => Math.min(s, Math.min(...full) * 2.3));
    const total = sizes.reduce((a, b) => a + b * TITLE_LINE, 0);
    const k = Math.min(1, maxH / total);
    titleLines.forEach((l, i) => (l.style.fontSize = `${Math.floor(sizes[i]! * k)}px`));
    // les accents (« PRIORITÉ ») dépassent l'interligne serré : sans cette marge, le
    // dégradé, peint dans la boîte du mot, les couperait
    const title = root.querySelector<HTMLElement>(".dive-hud__title");
    if (title) title.style.paddingTop = `${Math.ceil((sizes[0] ?? 0) * k * 0.18)}px`;
  };
  fitTitle();
  // la police est déjà chargée en temps normal (Walkout3D l'attend) ; sinon on remesure
  document.fonts?.load(TITLE_FONT).then(fitTitle, () => undefined);
  window.addEventListener("resize", fitTitle);

  let shownStars = -1;
  let shownLines = -1;
  let shownMission = -1;
  let shownOpacity = -1;
  let visible = false;

  /** La mini-carte : des rues en damier qui se resserrent avec l'altitude, le point du dev devant. */
  const drawMap = (distance: number, altitude: number) => {
    if (!canvas || !g) return;
    const S = canvas.width;
    const c = S / 2;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(c, c, c - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "rgba(12, 13, 27, 0.92)";
    g.fillRect(0, 0, S, S);
    // mètres visibles sur le diamètre : large en altitude, serré en bas
    const span = Math.max(120, Math.min(2400, altitude * 4 + distance * 1.5));
    const scale = S / span;
    const pitch = 52 * scale;
    g.strokeStyle = "rgba(255, 255, 255, 0.11)";
    g.lineWidth = Math.max(1, 12 * scale);
    const off = ((distance * scale) % pitch + pitch) % pitch;
    for (let x = -pitch; x < S + pitch; x += pitch) {
      g.beginPath();
      g.moveTo(x + pitch * 0.3, 0);
      g.lineTo(x + pitch * 0.3, S);
      g.stroke();
    }
    for (let y = -pitch; y < S + pitch; y += pitch) {
      g.beginPath();
      g.moveTo(0, y + off);
      g.lineTo(S, y + off);
      g.stroke();
    }
    // la mer, en bas de la carte (derrière nous)
    const seaY = c + (distance + 140) * scale;
    if (seaY < S) {
      g.fillStyle = "rgba(36, 49, 82, 0.9)";
      g.fillRect(0, seaY, S, S - seaY);
    }
    // le point du dev, devant ; deux points pour une comparaison
    const dy = Math.max(c - (c - 18), Math.min(c - 18, c - distance * scale));
    const blip = (x: number, y: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
    };
    const dyClamped = Math.max(22, Math.min(c - 6, dy));
    if (o.double) {
      blip(c - 7, dyClamped, o.accent);
      blip(c + 7, dyClamped, "#ffffff");
    } else blip(c, dyClamped, o.accent);
    // nous, au centre
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.moveTo(c, c - 7);
    g.lineTo(c + 5, c + 5);
    g.lineTo(c, c + 2);
    g.lineTo(c - 5, c + 5);
    g.closePath();
    g.fill();
    g.restore();
  };

  let lastMap = -1;
  return {
    update(s) {
      const on = s.t >= -0.5 || s.opacity > 0;
      if (on !== visible) {
        visible = on;
        root.classList.toggle("is-on", on);
      }
      if (shownOpacity !== s.opacity) {
        shownOpacity = s.opacity;
        root.style.opacity = String(s.opacity);
      }
      if (s.stars !== shownStars) {
        // le premier emplacement est le plus à droite (row-reverse, comme dans le jeu)
        stars.forEach((el, i) => {
          const lit = i < s.stars;
          if (lit && !el.classList.contains("is-on")) el.classList.add("is-on", "is-pop");
          else if (!lit) el.classList.remove("is-on", "is-pop");
        });
        shownStars = s.stars;
      }
      if (s.lines !== shownLines) {
        lines.forEach((el, i) => el.classList.toggle("is-in", i < s.lines));
        shownLines = s.lines;
      }
      if (s.mission !== shownMission) {
        shownMission = s.mission;
        mission.style.opacity = String(s.mission);
        mission.classList.toggle("is-in", s.mission > 0);
        root.classList.toggle("is-mission", s.mission > 0);
      }
      if (!canvas) return;
      // la mini-carte : une image sur trois suffit
      const key = Math.round(s.distance * 2) + Math.round(s.altitude) * 7;
      if (key !== lastMap && s.t >= 0) {
        lastMap = key;
        drawMap(s.distance, s.altitude);
      } else if (s.t < 0 && lastMap !== -2) {
        lastMap = -2;
        drawMap(s.distance, s.altitude);
      }
    },
    dispose() {
      window.removeEventListener("resize", fitTitle);
      root.remove();
    },
  };
}

/** Le mot du niveau : deux lignes au plus, coupées là où elles s'équilibrent
 *  le mieux (« Haute / surveillance », « Avis de / recherche »). */
function wordLines(label: string): string[] {
  const words = label.trim().split(/\s+/);
  if (words.length < 2) return words;
  let best = 1;
  let bestGap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const gap = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

const TITLE_FONT = '800 100px "Barlow Condensed"';
/** Interligne du mot, en fraction du corps (hud.css, .dive-hud__title). */
const TITLE_LINE = 0.84;
let measureCtx: CanvasRenderingContext2D | null = null;
/** Largeur du texte en capitales, au corps 100, dans la police du carton. */
function measureTitle(text: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 46;
  measureCtx.font = `${TITLE_FONT}, "Arial Narrow", sans-serif`;
  return measureCtx.measureText(text.toLocaleUpperCase()).width;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
