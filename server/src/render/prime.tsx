// L'image de partage d'une prime (§18.4), 1200 × 630, dans la langue des aperçus
// de bande (band.tsx) : l'encre plate, le lieu du crime par défaut en panneau à
// droite, et à gauche la ligue, l'entreprise (son logo s'il existe, sinon son nom
// en grand), les postes, les entretiens à la clé, le lieu et le temps qui reste.
// Aucun dégradé ajouté, aucune lueur. Jamais un pseudo, jamais un rang.
import type { ReactNode } from "react";
import type { PrimeView } from "../../../shared/primes";
import type { Contract } from "../../../shared/season";
import { fontAttrs } from "../../../shared/card/fonts";
import { STRINGS } from "../../../shared/card/i18n";
import { fit, fitLines, upper, wrap } from "../../../shared/card/text";
import { PALETTE } from "../../../shared/card/themes";
import type { Lang } from "../../../shared/types";
import { CtaLine, Ink, SceneFrame } from "./compositions";
import { sceneFor } from "./scenes";

const WORDS: Record<Lang, { kicker: Record<Contract, string>; interviews: (k: number) => string; remote: string; onSite: (p: string) => string; closed: string; last: string; left: (k: number) => string; opens: (d: string) => string }> = {
  fr: {
    kicker: { stage: "Prime, stage", alternance: "Prime, alternance", cdi: "Prime, CDI" },
    interviews: (k) => `${k} ${k > 1 ? "entretiens" : "entretien"} à la clé`,
    remote: "Télétravail possible",
    onSite: (p) => `À ${p}`,
    closed: "Close",
    last: "Dernier jour",
    left: (k) => `J-${k}`,
    opens: (d) => `Ouvre le ${d}`,
  },
  en: {
    kicker: { stage: "Bounty, internship", alternance: "Bounty, work-study", cdi: "Bounty, full-time" },
    interviews: (k) => `${k} ${k > 1 ? "interviews" : "interview"} up for grabs`,
    remote: "Remote possible",
    onSite: (p) => `In ${p}`,
    closed: "Closed",
    last: "Last day",
    left: (k) => `${k} days left`,
    opens: (d) => `Opens ${d}`,
  },
};

/** « 1er décembre », « 2 December ». */
function dayOf(day: string, lang: Lang): string {
  const d = new Date(`${day}T00:00:00Z`);
  const month = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { month: "long", timeZone: "UTC" }).format(d);
  const n = d.getUTCDate();
  return `${lang === "fr" && n === 1 ? "1er" : n} ${month}`;
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

export function PrimeOg({ prime, logo, lang }: { prime: PrimeView; logo: PrimeLogo | null; lang: Lang }) {
  const W = 1200;
  const H = 630;
  const panel = { x: 760, y: 32, w: 408, h: 566 };
  const x = 64;
  const maxW = panel.x - x - 48;
  const w = WORDS[lang];

  const kicker = upper(w.kicker[prime.contract], lang);
  const ls = 22 * 0.3;

  // L'entreprise : son logo, tenu dans 480 × 120, ou son nom en grand sur une ou deux lignes.
  let top = 130;
  let head: ReactNode;
  if (logo) {
    const k = Math.min(480 / logo.width, 120 / logo.height);
    const lw = Math.round(logo.width * k);
    const lh = Math.round(logo.height * k);
    head = <image href={logo.href} x={x} y={top} width={lw} height={lh} preserveAspectRatio="xMinYMid meet" />;
    top += lh;
  } else {
    const name = upper(prime.company, lang);
    const one = fit(name, { font: "display-700", size: 104, minSize: 64, maxWidth: maxW, letterSpacing: 0.5 });
    const lines = one.text === name ? { lines: [one.text], size: one.size } : fitLines(name, { font: "display-700", size: 76, minSize: 48, maxWidth: maxW, letterSpacing: 0.5 });
    const step = Math.round(lines.size * 0.96);
    const y0 = top + Math.round(lines.size * 0.74);
    head = (
      <>
        {lines.lines.map((l, i) => (
          <text key={i} x={x - 2} y={y0 + i * step} {...fontAttrs("display-700")} fontSize={lines.size} letterSpacing={0.5} fill={PALETTE.cream}>
            {l}
          </text>
        ))}
      </>
    );
    top = y0 + (lines.lines.length - 1) * step;
  }

  const jobs = wrap(primeJobs(prime, lang), "sans-600", 40, maxW, 2);
  const jobsY = top + 74;
  const interviewsY = jobsY + (jobs.length - 1) * 48 + 58;
  // « À Ville Démo, télétravail possible » : la seconde moitié sans majuscule.
  const where = prime.place ? `${w.onSite(prime.place)}${prime.remote ? `, ${w.remote.charAt(0).toLowerCase()}${w.remote.slice(1)}` : ""}` : prime.remote ? w.remote : "";
  const whereY = interviewsY + 46;

  // Le temps qui reste, en pastille pêche (grise une fois close).
  const when = primeWhen(prime, lang);
  const whenSize = 28;
  const whenW = fit(when, { font: "sans-600", size: whenSize, minSize: whenSize, maxWidth: 4000 }).width;
  const pill = { x, y: 500, h: 48, w: Math.round(whenW + 40) };
  const open = prime.phase === "open";

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Ink w={W} h={H} />
      <SceneFrame scene={sceneFor(undefined, "small")} id="prime" x={panel.x} y={panel.y} w={panel.w} h={panel.h} align="xMidYMid" r={8} />
      <text x={x} y={96} {...fontAttrs("sans-600")} fontSize={22} letterSpacing={ls} fill={PALETTE.cream} fillOpacity={0.6}>
        {kicker}
      </text>
      {head}
      {jobs.map((l, i) => (
        <text key={i} x={x} y={jobsY + i * 48} {...fontAttrs("sans-600")} fontSize={40} fill={PALETTE.cream}>
          {l}
        </text>
      ))}
      <text x={x} y={interviewsY} {...fontAttrs("sans-600")} fontSize={34} fill={PALETTE.blush}>
        {w.interviews(prime.interviews)}
      </text>
      {where && (
        <text x={x} y={whereY} {...fontAttrs("sans-500")} fontSize={28} fill={PALETTE.lilac} fillOpacity={0.8}>
          {where}
        </text>
      )}
      <rect x={pill.x} y={pill.y} width={pill.w} height={pill.h} rx={pill.h / 2} fill={open ? PALETTE.peach : "none"} stroke={open ? "none" : PALETTE.lilac} strokeOpacity={0.4} strokeWidth={2} />
      <text x={pill.x + 20} y={pill.y + 34} {...fontAttrs("sans-600")} fontSize={whenSize} fill={open ? PALETTE.ink0 : PALETTE.lilac}>
        {when}
      </text>
      <CtaLine x={x} y={598} lang={lang} />
    </svg>
  );
}
