// L'image de partage d'une bande (SPEC §18.38), 1200 × 630, dans la langue des
// aperçus de fiche (compositions.tsx) : l'encre plate ; à gauche ce qu'on lit à
// 360 px de large, dans l'ordre : la ligue, le nom de la bande en grand, puis
// l'accroche au premier rang, en pêche (son rang, ou « Bande en formation »),
// ce qui la sépare de la bande de devant (ou ce qui lui manque), une phrase qui
// dit à qui voit l'image ce qu'il y gagne, et l'appel « Rejoins la bande ». À
// droite, le haut du lieu du crime par défaut (son bas plat et sombre reste
// hors du panneau), et dessous les deux nombres de la bande, chacun avec son
// mot (étoiles, fiches) ; en formation, les trois places qu'il faut pour entrer
// au tableau, pleines ou libres, jamais un « 0 ». Aucun dégradé ajouté, aucune
// lueur. Jamais le rang d'école du barème, jamais un membre.
import { BAND_MIN_MEMBERS, BAND_TOP_MEMBERS, type BandStanding } from "../../../shared/bands";
import { fontAttrs } from "../../../shared/card/fonts";
import { fit, fitLines, upper, wrap } from "../../../shared/card/text";
import { PALETTE } from "../../../shared/card/themes";
import type { Lang } from "../../../shared/types";
import { CtaPill, IMAGE_WORDS, Ink, SceneFrame, SKYLINE_FOCUS, STAR_PATH } from "./compositions";
import { sceneFor } from "./scenes";

const LEAGUE: Record<Lang, Record<BandStanding["type"], { kicker: string; of: string }>> = {
  fr: { ecole: { kicker: "Bande d’école", of: "des écoles" }, boite: { kicker: "Bande de boîte", of: "des boîtes" } },
  en: { ecole: { kicker: "School crew", of: "among schools" }, boite: { kicker: "Company crew", of: "among companies" } },
};

/** « 3e des écoles, à 6 étoiles de la 2e », « n° 1 des écoles », ou ce qui manque à une bande en formation. */
export function bandRankLine(b: BandStanding, lang: Lang): string {
  const l = LEAGUE[lang][b.type];
  if (lang === "en") {
    if (!b.rank) return `Crew forming: ${b.missing} more ${b.missing > 1 ? "accomplices" : "accomplice"} needed`;
    const ord = `#${b.rank} ${l.of}`;
    if (!b.ahead || b.gap === null) return ord;
    return b.gap > 0 ? `${ord}, ${b.gap} ${b.gap > 1 ? "stars" : "star"} behind #${b.ahead.rank}` : `${ord}, level with #${b.ahead.rank}`;
  }
  if (!b.rank) return `Bande en formation : il manque ${b.missing} ${b.missing > 1 ? "complices" : "complice"}`;
  const ord = `${b.rank === 1 ? "n° 1" : `${b.rank}e`} ${l.of}`;
  if (!b.ahead || b.gap === null) return ord;
  const ahead = b.ahead.rank === 1 ? "la tête" : `la ${b.ahead.rank}e`;
  return b.gap > 0 ? `${ord}, à ${b.gap} ${b.gap > 1 ? "étoiles" : "étoile"} de ${ahead}` : `${ord}, à égalité avec ${ahead}`;
}

/**
 * L'accroche de l'image, en deux temps : le rang (« N° 1 des écoles », « 3e des
 * écoles »), puis ce qui sépare la bande de celle de devant ; en formation,
 * « Bande en formation » puis ce qui lui manque. Mêmes mots que bandRankLine.
 */
export function bandHook(b: BandStanding, lang: Lang): { head: string; sub: string | null } {
  const l = LEAGUE[lang][b.type];
  if (lang === "en") {
    if (!b.rank) return { head: "Crew forming", sub: `${b.missing} more ${b.missing > 1 ? "accomplices" : "accomplice"} needed` };
    const head = `#${b.rank} ${l.of}`;
    if (!b.ahead || b.gap === null) return { head, sub: null };
    return { head, sub: b.gap > 0 ? `${b.gap} ${b.gap > 1 ? "stars" : "star"} behind #${b.ahead.rank}` : `Level with #${b.ahead.rank}` };
  }
  if (!b.rank) return { head: "Bande en formation", sub: `Il manque ${b.missing} ${b.missing > 1 ? "complices" : "complice"}` };
  const head = `${b.rank === 1 ? "N° 1" : `${b.rank}e`} ${l.of}`;
  if (!b.ahead || b.gap === null) return { head, sub: null };
  const ahead = b.ahead.rank === 1 ? "la tête" : `la ${b.ahead.rank}e`;
  return { head, sub: b.gap > 0 ? `À ${b.gap} ${b.gap > 1 ? "étoiles" : "étoile"} de ${ahead}` : `À égalité avec ${ahead}` };
}

/** Les mots de l'image : ce que chaque nombre compte, ce que la bande rapporte à qui la rejoint, la légende des places. */
const WORDS: Record<Lang, { stars: (n: number) => string; sheets: (n: number) => string; yours: (label: string) => string; top: string; forming: string }> = {
  fr: {
    stars: (n) => (n > 1 ? "étoiles" : "étoile"),
    sheets: (n) => (n > 1 ? "fiches" : "fiche"),
    yours: (label) => `Tes étoiles comptent pour ${label}.`,
    top: `Les ${BAND_TOP_MEMBERS} meilleures fiches comptent`,
    forming: `${BAND_MIN_MEMBERS} fiches pour entrer au tableau`,
  },
  en: {
    stars: (n) => (n === 1 ? "star" : "stars"),
    sheets: (n) => (n === 1 ? "sheet" : "sheets"),
    yours: (label) => `Your stars count for ${label}.`,
    top: `The best ${BAND_TOP_MEMBERS} sheets count`,
    forming: `${BAND_MIN_MEMBERS} sheets to make the board`,
  },
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Les deux nombres d'une bande au tableau, chacun dans sa tuile et avec son mot :
 * « 88 étoiles », « 23 fiches ». Un nombre seul ne dit rien à 360 px de large.
 */
function Tally({ band, lang, box }: { band: BandStanding; lang: Lang; box: Box }) {
  const gap = 14;
  const w = (box.w - gap) / 2;
  const cells = [
    { n: band.score, word: WORDS[lang].stars(band.score) },
    { n: band.members, word: WORDS[lang].sheets(band.members) },
  ];
  return (
    <g>
      {cells.map((c, i) => {
        const cx = box.x + i * (w + gap) + w / 2;
        const figure = fit(String(c.n), { font: "display-800", size: 108, minSize: 60, maxWidth: w - 28 });
        return (
          <g key={i}>
            <rect x={box.x + i * (w + gap)} y={box.y} width={w} height={box.h} rx={14} fill={PALETTE.navy} />
            <text x={cx} y={box.y + Math.round(box.h * 0.56)} {...fontAttrs("display-800")} fontSize={figure.size} textAnchor="middle" fill={PALETTE.cream}>
              {figure.text}
            </text>
            <text x={cx + 1} y={box.y + Math.round(box.h * 0.56) + 50} {...fontAttrs("display-700")} fontSize={36} letterSpacing={2} textAnchor="middle" fill={PALETTE.lilac}>
              {upper(c.word, lang)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/**
 * Les trois places d'une bande en formation : une fiche présente porte son
 * étoile, une place libre est un cadre en pointillé. Une bande sans fiche montre
 * trois places libres, jamais un « 0 ».
 */
function Slots({ band, box }: { band: BandStanding; box: Box }) {
  const n = BAND_MIN_MEMBERS;
  const gap = 14;
  const w = (box.w - gap * (n - 1)) / n;
  const filled = Math.min(band.members, n);
  const star = 60;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const tx = box.x + i * (w + gap);
        if (i >= filled) {
          return <rect key={i} x={tx + 1.5} y={box.y + 1.5} width={w - 3} height={box.h - 3} rx={14} fill="none" stroke={PALETTE.lilac} strokeOpacity={0.4} strokeWidth={3} strokeDasharray="8 8" />;
        }
        return (
          <g key={i}>
            <rect x={tx} y={box.y} width={w} height={box.h} rx={14} fill={PALETTE.navy} />
            <g transform={`translate(${+(tx + (w - star) / 2).toFixed(1)} ${box.y + (box.h - star) / 2}) scale(${star / 24})`}>
              <path d={STAR_PATH} fill={PALETTE.cream} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

export function BandOg({ band, lang }: { band: BandStanding; lang: Lang }) {
  const W = 1200;
  const H = 630;
  const top = 32;
  const bottom = 598;
  const panel = { x: 760, y: top, w: 408, h: 300 };
  const tiles: Box = { x: panel.x, y: panel.y + panel.h + 20, w: panel.w, h: 200 };
  const x = 64;
  const maxW = panel.x - x - 48;
  const forming = !band.rank;

  const kicker = upper(LEAGUE[lang][band.type].kicker, lang);

  // Le nom sur une ligne jusqu'en 84, sinon sur deux.
  const name = upper(band.label, lang);
  const one = fit(name, { font: "display-700", size: 140, minSize: 84, maxWidth: maxW, letterSpacing: 0.5 });
  const lines = one.text === name ? { lines: [one.text], size: one.size } : fitLines(name, { font: "display-700", size: 84, minSize: 48, maxWidth: maxW, letterSpacing: 0.5 });
  const step = Math.round(lines.size * 0.96);
  const nameY = 100 + Math.round(lines.size * 0.72);
  const nameBottom = nameY + (lines.lines.length - 1) * step;

  // L'accroche, au premier rang après le nom, puis ce qui sépare la bande de celle de devant.
  const said = bandHook(band, lang);
  const hook = fit(upper(said.head, lang), { font: "display-800", size: lines.lines.length > 1 ? 88 : 104, minSize: 52, maxWidth: maxW, letterSpacing: 0.5 });
  const hookY = nameBottom + 36 + Math.round(hook.size * 0.72);
  const sub = said.sub ? fit(said.sub, { font: "sans-600", size: 40, minSize: 28, maxWidth: maxW }) : null;

  // Au-dessus de l'appel : ce que la bande rapporte à qui voit l'image.
  const pillSize = 30;
  const yours = wrap(WORDS[lang].yours(band.label), "sans-500", 30, maxW, 2);
  const yoursLast = bottom - Math.round(pillSize * 1.95) - 34;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Ink w={W} h={H} />
      <SceneFrame scene={sceneFor(undefined, "large")} id="band" x={panel.x} y={panel.y} w={panel.w} h={panel.h} align="xMidYMid" r={14} focus={SKYLINE_FOCUS} />
      <text x={x} y={top + 44} {...fontAttrs("sans-600")} fontSize={26} letterSpacing={26 * 0.26} fill={PALETTE.cream} fillOpacity={0.7}>
        {kicker}
      </text>
      {lines.lines.map((l, i) => (
        <text key={i} x={x - 2} y={nameY + i * step} {...fontAttrs("display-700")} fontSize={lines.size} letterSpacing={0.5} fill={PALETTE.cream}>
          {l}
        </text>
      ))}
      <text x={x - 1} y={hookY} {...fontAttrs("display-800")} fontSize={hook.size} letterSpacing={0.5} fill={PALETTE.peach}>
        {hook.text}
      </text>
      {sub && (
        <text x={x} y={hookY + 54} {...fontAttrs("sans-600")} fontSize={sub.size} fill={PALETTE.cream}>
          {sub.text}
        </text>
      )}
      {yours.map((l, i) => (
        <text key={i} x={x} y={yoursLast - (yours.length - 1 - i) * 40} {...fontAttrs("sans-500")} fontSize={30} fill={PALETTE.lilac}>
          {l}
        </text>
      ))}
      <CtaPill x={x} bottom={bottom} label={IMAGE_WORDS[lang].band} lang={lang} size={pillSize} maxW={maxW} />
      {forming ? <Slots band={band} box={tiles} /> : <Tally band={band} lang={lang} box={tiles} />}
      <text x={panel.x} y={bottom - 2} {...fontAttrs("sans-500")} fontSize={26} fill={PALETTE.lilac} fillOpacity={0.8}>
        {forming ? WORDS[lang].forming : WORDS[lang].top}
      </text>
    </svg>
  );
}

