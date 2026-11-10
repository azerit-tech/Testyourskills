// La photo d'identité de l'attente (§18.27, le début de l'interrogatoire du
// §18.13) : le cadre de la fiche (shared/card/Card.tsx : même toise, même
// plaque, mêmes couleurs, même développement de la photo), avec l'avatar du
// pseudo dès qu'il est chargé et un flash blanc à l'apparition. Sans pseudo
// (LinkedIn, CV) ou sans image : une silhouette neutre.
// En case de couverture (§18.31, `fill`) : ni flash ni cadre, la toise déborde
// du dessin pour remplir une case de n'importe quelle forme ; la photo et la
// plaque restent entières, posées en bas et centrées.
import { useEffect, useId, useState } from "react";
import { fontAttrs } from "../../../shared/card/fonts";
import { t as cardT } from "../../../shared/card/i18n";
import { fit, upper } from "../../../shared/card/text";
import { useT } from "../i18n";
import { useReducedMotion } from "../lib/util";

/** Les cotes de la photo de la fiche, ramenées à l'origine. */
const W = 164;
const H = 192;
const PLACARD = { w: 136, h: 44, bottom: 10 };

/** Les lignes de la toise, tous les 26,5 ; prolongées vers le haut en case de couverture. */
const lines = (fill: boolean) => Array.from({ length: fill ? 31 : Math.floor((H - 25) / 26.5) + 1 }, (_, i) => 25 + (i - (fill ? 24 : 0)) * 26.5);
/** Les graduations : 190, 180, 170, 160 sur la fiche ; jusqu'à 300 en case de couverture. */
const ticks = (fill: boolean) => Array.from({ length: fill ? 15 : 4 }, (_, i) => i - (fill ? 11 : 0));

/** L'avatar public d'un pseudo GitHub, sans appel à l'API. */
export const githubAvatar = (login: string) => `https://github.com/${encodeURIComponent(login)}.png?size=280`;

/** Numéro et date du dossier, comme sur la plaque de la fiche. */
function caseLine(cardId: string, no: string): string {
  const id = cardId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6) || "0000";
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${no} ${id} · ${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${String(d.getUTCFullYear()).slice(2)}`;
}

interface MugshotProps {
  cardId: string;
  /** Pseudo GitHub tapé, ou celui de la fiche ; absent pour une entrée LinkedIn ou CV. */
  login?: string | null;
  /** Photo déjà connue (la fiche est prête) ; sinon l'avatar public du pseudo. */
  src?: string | null;
  /** Faux : sans `src`, pas d'avatar deviné depuis le pseudo (ce serait un identicon) : la silhouette. */
  guess?: boolean;
  /** Case de couverture : la toise remplit la case, ni flash ni cadre. */
  fill?: boolean;
  /** Le nom de la plaque, à la place de « @login ». */
  name?: string;
  /** La ligne mono de la plaque, à la place du numéro et de la date. */
  sub?: string;
  /** Un signe crème sur la silhouette (le « ? » de la place libre). */
  mark?: string;
}

export function Mugshot({ cardId, login, src, guess = true, fill = false, name: plateName, sub, mark }: MugshotProps) {
  const { lang } = useT();
  const reduced = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const url = src || (login && guess ? githubAvatar(login) : null);
  // « loading » : la silhouette tient la pose ; le flash part quand la photo est là, ou qu'on y renonce.
  const [shot, setShot] = useState<{ url: string | null; ok: boolean } | null>(url ? null : { url: null, ok: false });

  useEffect(() => {
    if (!url) {
      setShot((s) => s ?? { url: null, ok: false });
      return;
    }
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setShot({ url, ok: true });
    img.onerror = () => alive && setShot((s) => s ?? { url, ok: false });
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);

  const photo = shot?.ok ? shot.url : null;
  const plX = (W - PLACARD.w) / 2;
  const plY = H - PLACARD.bottom - PLACARD.h;
  const label = plateName ?? (login ? `@${login}` : null);
  const name = label ? fit(upper(label, lang), { font: "display-700", size: 20, minSize: 12, maxWidth: PLACARD.w - 16, letterSpacing: 1.6, minLetterSpacing: 0.3 }) : null;
  // Sans pseudo, le numéro du dossier tient seul la plaque, un peu plus grand.
  const file = fit(sub ?? caseLine(cardId, cardT(lang).caseNo), { font: "mono-400", size: name ? 8.5 : 10, minSize: 7, maxWidth: PLACARD.w - 12, letterSpacing: 0.85, minLetterSpacing: 0.2 });
  // En case de couverture, la toise déborde de tous côtés : c'est la case qui la rogne.
  const bg = fill ? { x: -600, y: -1200, width: W + 1200, height: H + 1200 } : { x: 0, y: 0, width: W, height: H };

  // Dans une case de couverture, la photo vit dans un lien ou un bouton : un élément de phrase.
  const Root = fill ? "span" : "div";

  return (
    <Root className={fill ? "cover-mug" : "load-mug"} aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio={fill ? "xMidYMax meet" : undefined} overflow={fill ? "visible" : undefined}>
        <defs>
          <clipPath id={`${uid}-mug`}>
            <rect width={W} height={H} rx={6} />
          </clipPath>
          <filter id={`${uid}-photo`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="1.08" />
            <feComponentTransfer>
              <feFuncR type="table" tableValues="0.19 0.56 1" />
              <feFuncG type="table" tableValues="0.12 0.48 0.98" />
              <feFuncB type="table" tableValues="0.31 0.6 0.98" />
            </feComponentTransfer>
          </filter>
        </defs>
        <g clipPath={fill ? undefined : `url(#${uid}-mug)`}>
          {/* la toise */}
          <rect {...bg} fill="#b4bfcb" />
          {lines(fill).map((y) => (
            <rect key={y} x={bg.x} y={y} width={bg.width} height={1.5} fill="#141c28" fillOpacity={0.32} />
          ))}
          {ticks(fill).map((i) => (
            <text key={i} x={6} y={21 + i * 53} {...fontAttrs("mono-700")} fontSize={8} fill="#141c28" fillOpacity={0.6}>
              {190 - i * 10}
            </text>
          ))}
          {photo ? (
            <image key={photo} className="load-mug-photo" href={photo} x={12} y={H - 168} width={140} height={168} preserveAspectRatio="xMidYMin slice" filter={`url(#${uid}-photo)`} />
          ) : (
            // silhouette neutre : une tête, des épaules
            <g fill="#2b3442" fillOpacity={0.85}>
              <circle cx={W / 2} cy={82} r={29} />
              <path d={`M${W / 2 - 62} ${H}c0-42 27-68 62-68s62 26 62 68z`} />
            </g>
          )}
          {mark && !photo && (
            <text x={W / 2} y={102} {...fontAttrs("display-700")} fontSize={56} textAnchor="middle" fill="#fff9cb">
              {mark}
            </text>
          )}
          {/* la plaque */}
          <g transform={`rotate(-1.2 ${plX + PLACARD.w / 2} ${plY + PLACARD.h / 2})`}>
            <rect x={plX} y={plY} width={PLACARD.w} height={PLACARD.h} rx={3} fill="#111111" />
            {name && (
              <text x={W / 2 + name.letterSpacing / 2} y={plY + 22} {...fontAttrs("display-700")} fontSize={name.size} letterSpacing={+name.letterSpacing.toFixed(2)} textAnchor="middle" fill="#f4f1ea">
                {name.text}
              </text>
            )}
            <text x={W / 2} y={plY + (name ? 35 : 27)} {...fontAttrs("mono-400")} fontSize={file.size} letterSpacing={+file.letterSpacing.toFixed(2)} textAnchor="middle" fill={name ? "#bdb8ad" : "#f4f1ea"}>
              {file.text}
            </text>
          </g>
        </g>
        {!fill && <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={6} fill="none" stroke="#fff" strokeOpacity={0.14} />}
      </svg>
      {/* le flash : une fois, quand la photo (ou la silhouette) est prise ; jamais en mouvement réduit ni en couverture */}
      {shot && !reduced && !fill && <span className="load-flash" key={shot.ok ? "photo" : "none"} />}
    </Root>
  );
}
