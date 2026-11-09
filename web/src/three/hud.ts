// Le HUD de la plongée (SPEC §17.4), en DOM par-dessus le canvas : les cinq
// étoiles de recherche en haut à droite, la mini-carte ronde en bas à gauche
// avec le point du dev (deux pour une comparaison), les messages de la radio,
// les quatre lignes du dossier (spécialité, arme, dossier, affiliation) et le
// carton de fin de mission (le niveau, « Suspect identifié : {profil} », la note). Piloté image par image par la scène (walkout.ts) ;
// ne redessine que ce qui change. Styles : hud.css. La mini-carte est en
// option (map) : l'ascenseur ne s'en sert pas.
import type { HudTexts } from "./hudTexts";

export interface HudState {
  /** Temps de la séquence (s), négatif avant le départ. */
  t: number;
  /** Étoiles allumées, 0 à 5. */
  stars: number;
  /** Message radio en cours, ou vide. */
  radio: string;
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
  o: { texts: HudTexts; lines: HudLines; title: string; overall: number; double: boolean; accent: string; map?: boolean; profile?: string },
): Hud {
  const root = document.createElement("div");
  root.className = "dive-hud";
  root.style.setProperty("--hud-accent", o.accent);
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="dive-hud__stars">${[0, 1, 2, 3, 4].map(() => `<svg viewBox="0 0 24 24"><path d="${STAR}"/></svg>`).join("")}</div>
    <div class="dive-hud__lines">
      ${(["specialty", "weapon", "file", "affiliation"] as const)
        .map((k) => `<div class="dive-hud__line"><span>${esc(o.texts[k])}</span><b>${esc(o.lines[k])}</b></div>`)
        .join("")}
    </div>
    <div class="dive-hud__radio"><i></i><span class="dive-hud__dispatch">${esc(o.texts.dispatch)}</span><span class="dive-hud__msg"></span></div>
    ${o.map === false ? "" : `<div class="dive-hud__map"><canvas width="176" height="176"></canvas><div class="dive-hud__cone"></div></div>`}
    <div class="dive-hud__mission">
      <div class="dive-hud__band">
        <div class="dive-hud__title">${esc(o.title)}</div>
        ${o.profile ? `<div class="dive-hud__suspect"><span>${esc(o.texts.suspect)}</span> <b>${esc(o.profile)}</b></div>` : ""}
        <div class="dive-hud__score"><span>${esc(o.texts.score)}</span><b>${o.overall}</b></div>
      </div>
    </div>`;
  host.appendChild(root);
  const stars = Array.from(root.querySelectorAll<SVGElement>(".dive-hud__stars svg"));
  const lines = Array.from(root.querySelectorAll<HTMLElement>(".dive-hud__line"));
  const radio = root.querySelector<HTMLElement>(".dive-hud__radio")!;
  const msg = root.querySelector<HTMLElement>(".dive-hud__msg")!;
  const mission = root.querySelector<HTMLElement>(".dive-hud__mission")!;
  const canvas = root.querySelector<HTMLCanvasElement>("canvas");
  const g = canvas?.getContext("2d") ?? null;

  let shownStars = -1;
  let shownLines = -1;
  let shownRadio = "";
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
    g.fillStyle = "rgba(10, 10, 31, 0.92)";
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
      g.fillStyle = "rgba(20, 40, 80, 0.8)";
      g.fillRect(0, seaY, S, S - seaY);
    }
    // le point du dev, devant ; deux points pour une comparaison
    const dy = Math.max(c - (c - 18), Math.min(c - 18, c - distance * scale));
    const blip = (x: number, y: number, color: string) => {
      g.fillStyle = color;
      g.shadowColor = color;
      g.shadowBlur = 10;
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
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
      if (s.radio !== shownRadio) {
        shownRadio = s.radio;
        msg.textContent = s.radio;
        radio.classList.toggle("is-in", s.radio !== "");
        if (s.radio) {
          radio.classList.remove("is-glitch");
          void radio.offsetWidth;
          radio.classList.add("is-glitch");
        }
      }
      if (s.mission !== shownMission) {
        shownMission = s.mission;
        mission.style.opacity = String(s.mission);
        mission.classList.toggle("is-in", s.mission > 0);
      }
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
      root.remove();
    },
  };
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
