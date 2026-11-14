// L'image de partage d'une bande (SPEC §18.38), 1200 × 630, dans la langue des
// aperçus de fiche (compositions.tsx) : l'encre plate ; à gauche ce qu'on lit en
// miniature : la ligue, le nom de la bande en grand, son score en étoiles, son
// rang (ou ce qui lui manque pour entrer au tableau), puis l'adresse. À droite,
// le lieu du crime par défaut à son format (sans recadrage ni aplat vide), et
// dessous les places de la bande : les vingt dossiers qui comptent, pleins ou
// libres, ou les trois qu'il faut pour entrer au tableau. Aucun dégradé ajouté,
// aucune lueur. Jamais le rang d'école du barème, jamais un membre.
import { BAND_MIN_MEMBERS, BAND_TOP_MEMBERS, type BandStanding } from "../../../shared/bands";
import { fontAttrs } from "../../../shared/card/fonts";
import { fit, fitLines, upper, wrap } from "../../../shared/card/text";
import { PALETTE } from "../../../shared/card/themes";
import type { Lang } from "../../../shared/types";
import { CtaLine, Ink, SceneFrame } from "./compositions";
import { sceneFor } from "./scenes";

/** L'étoile du HUD (WeekBoard), dans une boîte de 24. */
const STAR = "M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z";

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

/** Ce que disent les places sous le décor. */
const SLOTS: Record<Lang, { top: string; forming: string }> = {
  fr: { top: `Les ${BAND_TOP_MEMBERS} meilleurs dossiers comptent`, forming: `${BAND_MIN_MEMBERS} dossiers pour entrer au tableau` },
  en: { top: `The best ${BAND_TOP_MEMBERS} files count`, forming: `${BAND_MIN_MEMBERS} files to make the board` },
};

/**
 * Les places de la bande, sous le décor : un dossier plein porte son étoile, une
 * place libre est un cadre en pointillé. Au tableau, les vingt qui comptent ; en
 * formation, les trois qu'il faut.
 */
function Slots({ band, lang, x, y, w, bottom }: { band: BandStanding; lang: Lang; x: number; y: number; w: number; bottom: number }) {
  const forming = !band.rank;
  const n = forming ? BAND_MIN_MEMBERS : BAND_TOP_MEMBERS;
  const cols = forming ? n : 5;
  const rows = Math.ceil(n / cols);
  const gap = forming ? 14 : 10;
  const captionY = bottom;
  const tileW = (w - gap * (cols - 1)) / cols;
  const tileH = forming ? 120 : (captionY - 40 - y - gap * (rows - 1)) / rows;
  const top = forming ? y + Math.round((captionY - 40 - y - tileH) / 2) : y;
  const filled = Math.min(band.members, n);
  const star = Math.min(tileH, tileW) * (forming ? 0.42 : 0.5);
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const tx = x + (i % cols) * (tileW + gap);
        const ty = top + Math.floor(i / cols) * (tileH + gap);
        if (i >= filled) {
          return <rect key={i} x={tx + 1} y={ty + 1} width={tileW - 2} height={tileH - 2} rx={8} fill="none" stroke={PALETTE.lilac} strokeOpacity={0.35} strokeWidth={2} strokeDasharray="6 6" />;
        }
        return (
          <g key={i}>
            <rect x={tx} y={ty} width={tileW} height={tileH} rx={8} fill={PALETTE.navy} />
            <g transform={`translate(${tx + (tileW - star) / 2} ${ty + (tileH - star) / 2}) scale(${star / 24})`}>
              <path d={STAR} fill={PALETTE.star} />
            </g>
          </g>
        );
      })}
      <text x={x} y={captionY} {...fontAttrs("sans-500")} fontSize={24} fill={PALETTE.lilac} fillOpacity={0.8}>
        {forming ? SLOTS[lang].forming : SLOTS[lang].top}
      </text>
    </g>
  );
}

export function BandOg({ band, lang }: { band: BandStanding; lang: Lang }) {
  const W = 1200;
  const H = 630;
  // Le décor « small » fait 576 × 384 : le panneau garde ce format, rien n'est recadré.
  const panel = { x: 760, y: 32, w: 408, h: 272 };
  const x = 64;
  const maxW = panel.x - x - 48;

  const kicker = upper(LEAGUE[lang][band.type].kicker, lang);
  const ls = 22 * 0.3;

  // Le nom sur une ligne jusqu'en 64, sinon sur deux.
  const name = upper(band.label, lang);
  const one = fit(name, { font: "display-700", size: 104, minSize: 64, maxWidth: maxW, letterSpacing: 0.5 });
  const lines = one.text === name ? { lines: [one.text], size: one.size } : fitLines(name, { font: "display-700", size: 76, minSize: 48, maxWidth: maxW, letterSpacing: 0.5 });
  const nameTop = 150;
  const step = Math.round(lines.size * 0.96);
  const nameY = nameTop + Math.round(lines.size * 0.74);
  const nameBottom = nameY + (lines.lines.length - 1) * step;

  // Le score : une étoile dessinée, le nombre en grand, puis les dossiers.
  const scoreSize = 112;
  const scoreY = nameBottom + 40 + Math.round(scoreSize * 0.74);
  const starSize = 78;
  const scoreText = String(band.score);
  const scoreW = fit(scoreText, { font: "display-800", size: scoreSize, minSize: scoreSize, maxWidth: 4000 }).width;
  const dossiers = lang === "fr" ? `${band.members} ${band.members > 1 ? "dossiers" : "dossier"}` : `${band.members} ${band.members === 1 ? "file" : "files"}`;

  // En formation, deux lignes voulues : « Bande en formation », puis « Il manque 1 complice ».
  const rankText = bandRankLine(band, lang);
  const cut = band.rank ? -1 : rankText.indexOf(":");
  const rank =
    cut > 0
      ? [rankText.slice(0, cut).trimEnd(), rankText.slice(cut + 1).trim().replace(/^./, (c) => c.toLocaleUpperCase(lang))]
      : wrap(rankText, "sans-600", 34, maxW, 2);
  const rankY = scoreY + 64;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Ink w={W} h={H} />
      <SceneFrame scene={sceneFor(undefined, "small")} id="band" x={panel.x} y={panel.y} w={panel.w} h={panel.h} align="xMidYMid" r={8} />
      <text x={x} y={96} {...fontAttrs("sans-600")} fontSize={22} letterSpacing={ls} fill={PALETTE.cream} fillOpacity={0.6}>
        {kicker}
      </text>
      {lines.lines.map((l, i) => (
        <text key={i} x={x - 2} y={nameY + i * step} {...fontAttrs("display-700")} fontSize={lines.size} letterSpacing={0.5} fill={PALETTE.cream}>
          {l}
        </text>
      ))}
      <g transform={`translate(${x} ${scoreY - starSize * 0.86}) scale(${starSize / 24})`}>
        <path d={STAR} fill={PALETTE.star} />
      </g>
      <text x={x + starSize + 14} y={scoreY} {...fontAttrs("display-800")} fontSize={scoreSize} fill={PALETTE.star}>
        {scoreText}
      </text>
      <text x={x + starSize + 14 + scoreW + 22} y={scoreY} {...fontAttrs("sans-600")} fontSize={34} fill={PALETTE.lilac} fillOpacity={0.8}>
        {dossiers}
      </text>
      {rank.map((l, i) => (
        <text key={i} x={x} y={rankY + i * 42} {...fontAttrs("sans-600")} fontSize={34} fill={PALETTE.blush}>
          {l}
        </text>
      ))}
      <Slots band={band} lang={lang} x={panel.x} y={panel.y + panel.h + 28} w={panel.w} bottom={598} />
      <CtaLine x={x} y={598} lang={lang} />
    </svg>
  );
}
