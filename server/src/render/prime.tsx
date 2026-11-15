// L'image de partage d'une prime (§18.4), 1200 × 630, dans la langue des aperçus
// de bande (band.tsx) : l'encre plate ; à gauche, dans l'ordre où on le lit à
// 360 px de large : le contrat, puis le lot au premier rang (« 3 entretiens à la
// clé », sur deux lignes), l'entreprise (son logo s'il existe, sinon son nom, en
// pêche), les postes, le lieu, et l'appel « Entre dans la course » (« Voir le
// classement » une fois close). À droite, le haut du lieu du crime par défaut,
// et dessous l'échéance en grand dans sa tuile pêche (en contour une fois close).
// Aucun dégradé ajouté, aucune lueur. Jamais un pseudo, jamais un rang.
import type { ReactNode } from "react";
import type { PrimeView } from "../../../shared/primes";
import type { Contract } from "../../../shared/season";
import { fontAttrs } from "../../../shared/card/fonts";
import { STRINGS } from "../../../shared/card/i18n";
import { fit, fitLines, upper, wrap } from "../../../shared/card/text";
import { PALETTE } from "../../../shared/card/themes";
import type { Lang } from "../../../shared/types";
import { CtaPill, IMAGE_WORDS, Ink, SceneFrame, SKYLINE_FOCUS } from "./compositions";
import { sceneFor } from "./scenes";

const WORDS: Record<
  Lang,
  {
    kicker: Record<Contract, string>;
    /** Le lot, en deux lignes : « 3 entretiens », « à la clé » ; une fois la prime close, « étaient en jeu ». */
    interviews: (k: number, over: boolean) => [string, string];
    remote: string;
    onSite: (p: string) => string;
    closed: string;
    last: string;
    left: (k: number) => string;
    opens: (d: string) => string;
    /** L'échéance en grand dans sa tuile, et ce qu'elle compte. */
    tile: { left: (k: number) => string; toEnter: string; over: string; opening: string };
  }
> = {
  fr: {
    kicker: { stage: "Prime, stage", alternance: "Prime, alternance", cdi: "Prime, CDI" },
    interviews: (k, over) => [`${k} ${k > 1 ? "entretiens" : "entretien"}`, over ? (k > 1 ? "étaient en jeu" : "était en jeu") : "à la clé"],
    remote: "Télétravail possible",
    onSite: (p) => `À ${p}`,
    closed: "Close",
    last: "Dernier jour",
    left: (k) => `J-${k}`,
    opens: (d) => `Ouvre le ${d}`,
    tile: { left: (k) => `J-${k}`, toEnter: "pour entrer dans la course", over: "La course est finie", opening: "Ouverture de la course" },
  },
  en: {
    kicker: { stage: "Bounty, internship", alternance: "Bounty, work-study", cdi: "Bounty, full-time" },
    interviews: (k, over) => [`${k} ${k > 1 ? "interviews" : "interview"}`, over ? (k > 1 ? "were at stake" : "was at stake") : "up for grabs"],
    remote: "Remote possible",
    onSite: (p) => `In ${p}`,
    closed: "Closed",
    last: "Last day",
    left: (k) => `${k} ${k > 1 ? "days" : "day"} left`,
    opens: (d) => `Opens ${d}`,
    tile: { left: (k) => `${k} ${k > 1 ? "days" : "day"}`, toEnter: "left to enter the race", over: "The race is over", opening: "The race opens" },
  },
};

/** « 1er décembre », « December 2 ». */
function dayOf(day: string, lang: Lang): string {
  const d = new Date(`${day}T00:00:00Z`);
  const month = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-US", { month: "long", timeZone: "UTC" }).format(d);
  const n = d.getUTCDate();
  return lang === "fr" ? `${n === 1 ? "1er" : n} ${month}` : `${month} ${n}`;
}

/** « J-12 », « Dernier jour », « Close », « Ouvre le 2 décembre ». */
export function primeWhen(p: Pick<PrimeView, "phase" | "daysLeft" | "from">, lang: Lang): string {
  const w = WORDS[lang];
  if (p.phase === "closed") return w.closed;
  if (p.phase === "soon") return w.opens(dayOf(p.from, lang));
  return p.daysLeft ? w.left(p.daysLeft) : w.last;
}

/** Les postes en clair : « Backend, Full-stack ». */
export function primeJobs(p: Pick<PrimeView, "positions">, lang: Lang): string {
  const names = STRINGS[lang].positions;
  return p.positions.map((x) => names[x] ?? x).join(", ");
}

export interface PrimeLogo {
  /** data:image/…;base64,… */
  href: string;
  width: number;
  height: number;
}

/** L'échéance de la tuile : le grand mot, et la ligne qui dit ce qu'il compte. */
function deadline(p: Pick<PrimeView, "phase" | "daysLeft" | "from">, lang: Lang): { big: string; small: string } {
  const w = WORDS[lang];
  if (p.phase === "closed") return { big: w.closed, small: w.tile.over };
  if (p.phase === "soon") return { big: dayOf(p.from, lang), small: w.tile.opening };
  return { big: p.daysLeft ? w.tile.left(p.daysLeft) : w.last, small: w.tile.toEnter };
}

export function PrimeOg({ prime, logo, lang }: { prime: PrimeView; logo: PrimeLogo | null; lang: Lang }) {
  const W = 1200;
  const H = 630;
  const top = 32;
  const bottom = 598;
  const panel = { x: 760, y: top, w: 408, h: 330 };
  const tile = { x: panel.x, y: panel.y + panel.h + 20, w: panel.w, h: bottom - (panel.y + panel.h + 20) };
  const x = 64;
  const maxW = panel.x - x - 48;
  const w = WORDS[lang];
  const open = prime.phase === "open";

  const kicker = upper(w.kicker[prime.contract], lang);

  // L'entreprise en lettres (sans logo) : son nom sur une ou deux lignes. Les postes : une ou deux lignes.
  const name = upper(prime.company, lang);
  const one = fit(name, { font: "display-700", size: 62, minSize: 44, maxWidth: maxW, letterSpacing: 0.5 });
  const lines = one.text === name ? { lines: [one.text], size: one.size } : fitLines(name, { font: "display-700", size: 48, minSize: 36, maxWidth: maxW, letterSpacing: 0.5 });
  const jobs = wrap(primeJobs(prime, lang), "sans-600", 36, maxW, 2);

  // Le lot, au premier rang : deux lignes à la même taille, celle que la plus longue permet.
  // Un logo ou un nom sur deux lignes, des postes sur deux lignes : le lot leur rend de la hauteur.
  const tall = (logo || lines.lines.length > 1 ? 1 : 0) + (jobs.length > 1 ? 1 : 0);
  const lot = w.interviews(prime.interviews, prime.phase === "closed").map((l) => upper(l, lang));
  const lotSize = Math.min(...lot.map((l) => fit(l, { font: "display-800", size: [118, 100, 84][tall]!, minSize: 72, maxWidth: maxW, letterSpacing: 0.5 }).size));
  const lotStep = Math.round(lotSize * 0.92);
  const lotY = 98 + Math.round(lotSize * 0.72);
  let y = lotY + lotStep;

  // L'entreprise : son logo, tenu dans 420 × 84, ou son nom.
  let head: ReactNode;
  if (logo) {
    const k = Math.min(420 / logo.width, 84 / logo.height);
    const lw = Math.round(logo.width * k);
    const lh = Math.round(logo.height * k);
    head = <image href={logo.href} x={x} y={y + 30} width={lw} height={lh} preserveAspectRatio="xMinYMid meet" />;
    y += 30 + lh;
  } else {
    const step = Math.round(lines.size * 0.98);
    const y0 = y + 32 + Math.round(lines.size * 0.72);
    head = (
      <>
        {lines.lines.map((l, i) => (
          <text key={i} x={x - 1} y={y0 + i * step} {...fontAttrs("display-700")} fontSize={lines.size} letterSpacing={0.5} fill={PALETTE.peach}>
            {l}
          </text>
        ))}
      </>
    );
    y = y0 + (lines.lines.length - 1) * step;
  }

  const jobsY = y + 54;
  // « À Ville Démo, télétravail possible » : la seconde moitié sans majuscule.
  const where = prime.place ? `${w.onSite(prime.place)}${prime.remote ? `, ${w.remote.charAt(0).toLowerCase()}${w.remote.slice(1)}` : ""}` : prime.remote ? w.remote : "";
  const whereFit = where ? fit(where, { font: "sans-500", size: 30, minSize: 24, maxWidth: maxW }) : null;
  const whereY = jobsY + (jobs.length - 1) * 44 + 44;

  // L'échéance, en grand : la tuile pêche de la page d'une prime (en contour une fois close).
  const when = deadline(prime, lang);
  const big = fit(upper(when.big, lang), { font: "display-800", size: 124, minSize: 48, maxWidth: tile.w - 48, letterSpacing: 0.5 });
  const small = fit(when.small, { font: "sans-600", size: 28, minSize: 20, maxWidth: tile.w - 40 });
  const tileInk = open ? PALETTE.ink0 : PALETTE.lilac;
  const cx = tile.x + tile.w / 2;
  // Le grand mot et sa ligne, centrés ensemble dans la tuile.
  const bigCap = big.size * 0.7;
  const blockH = bigCap + 22 + small.size * 0.74;
  const bigY = tile.y + (tile.h - blockH) / 2 + bigCap;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Ink w={W} h={H} />
      <SceneFrame scene={sceneFor(undefined, "large")} id="prime" x={panel.x} y={panel.y} w={panel.w} h={panel.h} align="xMidYMid" r={14} focus={SKYLINE_FOCUS} />
      <text x={x} y={top + 44} {...fontAttrs("sans-600")} fontSize={26} letterSpacing={26 * 0.26} fill={PALETTE.cream} fillOpacity={0.7}>
        {kicker}
      </text>
      {lot.map((l, i) => (
        <text key={i} x={x - 2} y={lotY + i * lotStep} {...fontAttrs("display-800")} fontSize={lotSize} letterSpacing={0.5} fill={PALETTE.cream}>
          {l}
        </text>
      ))}
      {head}
      {jobs.map((l, i) => (
        <text key={i} x={x} y={jobsY + i * 44} {...fontAttrs("sans-600")} fontSize={36} fill={PALETTE.cream}>
          {l}
        </text>
      ))}
      {whereFit && (
        <text x={x} y={whereY} {...fontAttrs("sans-500")} fontSize={whereFit.size} fill={PALETTE.lilac}>
          {whereFit.text}
        </text>
      )}
      <CtaPill x={x} bottom={bottom} label={prime.phase === "closed" ? IMAGE_WORDS[lang].primeClosed : IMAGE_WORDS[lang].prime} lang={lang} size={30} maxW={maxW} />
      {open ? (
        <rect x={tile.x} y={tile.y} width={tile.w} height={tile.h} rx={14} fill={PALETTE.peach} />
      ) : (
        <rect x={tile.x + 1.5} y={tile.y + 1.5} width={tile.w - 3} height={tile.h - 3} rx={14} fill="none" stroke={PALETTE.lilac} strokeOpacity={0.4} strokeWidth={3} />
      )}
      <text x={cx} y={Math.round(bigY)} {...fontAttrs("display-800")} fontSize={big.size} letterSpacing={big.letterSpacing} textAnchor="middle" fill={tileInk}>
        {big.text}
      </text>
      <text x={cx} y={Math.round(bigY + 22 + small.size * 0.74)} {...fontAttrs("sans-600")} fontSize={small.size} textAnchor="middle" fill={tileInk}>
        {small.text}
      </text>
    </svg>
  );
}
