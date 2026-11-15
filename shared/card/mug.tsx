// La photo d'identité, en pièces communes à la fiche (Card.tsx) et à l'attente
// (web, Mugshot.tsx) : la toise, la silhouette à initiales quand la photo manque,
// et la plaque d'identité. Un seul gabarit de plaque (SPEC §18.48) : « @PSEUDO »
// en capitales, seconde ligne mono « N° · date » ; la couverture et le film le
// reprennent en CSS avec les valeurs de PLATE.
// Uniquement ce que resvg sait rendre : aplats et texte.
import type { Lang } from "../types";
import { fontAttrs } from "./fonts";
import { t } from "./i18n";
import { fit, upper } from "./text";

/** Le cadre de la photo, à l'origine : celui de la fiche. */
export const MUG_SIZE = { w: 164, h: 192, r: 6 } as const;
/** La photo dans le cadre : en retrait de 12, haute de 168, calée en bas. */
export const MUG_PHOTO = { inset: 12, w: 140, h: 168 } as const;
/** La plaque : centrée, à 10 du bas du cadre. */
export const PLACARD = { w: 136, h: 44, bottom: 10 } as const;

/** Le gabarit de la plaque, partout où elle est dessinée (fiche, attente, couverture, film). */
export const PLATE = {
  bg: "#111111",
  ink: "#fff9cb",
  /** Seconde ligne : la même encre, en retrait. */
  subOpacity: 0.7,
  /** Inclinaison, en degrés. */
  tilt: -1.5,
  /** Approche du nom (Barlow Condensed 700, capitales) et de la seconde ligne (mono), en em. */
  nameSpacing: 0.06,
  subSpacing: 0.08,
} as const;

const WALL = "#b4bfcb";
const WALL_GRAY = "#a9b0b6";
const SHAPE = "#2b3442";
const INK = "#141c28";
/** Les graduations : une tous les 53, la première à 21 du haut. */
const TICKS = ["190", "180", "170", "160"];

/** Numéro de dossier : l'id court de la fiche, en majuscules, 4 à 6 signes. */
export function caseNumber(id: string): string {
  const clean = id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return (clean || "0000").slice(0, 6);
}

/** « 14.10.26 » : le jour de la fiche (UTC), vide si la date ne se lit pas. */
export function caseDate(iso: string | number | Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${String(d.getUTCFullYear()).slice(2)}`;
}

/** « N° MGOLDB », seul : le coin haut droit de la fiche. */
export function caseLabel(id: string, lang: Lang): string {
  return `${t(lang).caseNo} ${caseNumber(id)}`;
}

/** La seconde ligne de la plaque : « N° MGOLDB · 14.10.26 ». */
export function plateSub(id: string, createdAt: string | number | Date, lang: Lang): string {
  const date = caseDate(createdAt);
  return date ? `${caseLabel(id, lang)} · ${date}` : caseLabel(id, lang);
}

/**
 * La première ligne de la plaque, en capitales : « @PSEUDO » avec un pseudo
 * GitHub ; sinon le nom ; sinon le nom du lien LinkedIn tant que le nom n'est
 * pas connu (« CAMILLE-ARDENT »). Null : la plaque ne porte que son numéro.
 */
export function plateName(who: { login?: string | null; name?: string | null; slug?: string | null }, lang: Lang): string | null {
  const raw = who.login ? `@${who.login}` : who.name?.trim() || who.slug?.trim() || "";
  return raw ? upper(raw, lang) : null;
}

/** Deux initiales tirées d'un pseudo ou d'un nom de lien : « camille-ardent » → « CA », « leamd » → « LE ». */
export function initialsOf(handle: string | null | undefined): string {
  const parts = (handle ?? "").replace(/^@/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
  const first = [...(parts[0] ?? "")];
  const second = parts[1] ? [...parts[1]][0] : first[1];
  return ((first[0] ?? "") + (second ?? "")).toUpperCase();
}

/**
 * La toise : le mur, un trait tous les 26,5, et les graduations. Un nombre
 * entier ou pas de nombre : une graduation ne se dessine que si rien ne la
 * recouvre (`coverTop`, le haut de la photo ou de la plaque).
 */
export function Toise({ x = 0, y = 0, w = MUG_SIZE.w, h = MUG_SIZE.h, gray = false, coverTop }: { x?: number; y?: number; w?: number; h?: number; gray?: boolean; coverTop: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={gray ? WALL_GRAY : WALL} />
      {Array.from({ length: Math.floor((h - 25) / 26.5) + 1 }, (_, i) => (
        <rect key={i} x={x} y={y + 25 + i * 26.5} width={w} height={1.5} fill={INK} fillOpacity={0.32} />
      ))}
      {TICKS.map((tick, i) => {
        const base = 21 + i * 53;
        if (base + 2 > coverTop) return null;
        return (
          <text key={tick} x={x + 6} y={y + base} {...fontAttrs("mono-700")} fontSize={8} fill={INK} fillOpacity={0.6}>
            {tick}
          </text>
        );
      })}
    </g>
  );
}

/** Le haut de ce qui recouvre la colonne des graduations : la photo, sinon la plaque. */
export function toiseCover(h: number, photo: boolean): number {
  return photo ? h - MUG_PHOTO.h : h - PLACARD.bottom - PLACARD.h - 3;
}

/**
 * Sans photo (absente, générique ou en échec) : une silhouette devant la toise,
 * les initiales dans la tête. La même partout : fiche, attente, couverture.
 */
export function Silhouette({ x = 0, y = 0, w = MUG_SIZE.w, h = MUG_SIZE.h, gray = false, initials }: { x?: number; y?: number; w?: number; h?: number; gray?: boolean; initials?: string | null }) {
  const cx = x + w / 2;
  const oy = y + h - MUG_SIZE.h;
  const mark = (initials ?? "").slice(0, 3).toUpperCase();
  const f = mark ? fit(mark, { font: "display-800", size: 36, minSize: 20, maxWidth: 46, letterSpacing: 0.5 }) : null;
  return (
    <g data-silhouette="">
      <g fill={SHAPE} fillOpacity={0.88}>
        <circle cx={cx} cy={oy + 66} r={31} />
        <path d={`M${cx - 70} ${oy + 192}c0-54 32-88 70-88s70 34 70 88z`} />
      </g>
      {f && (
        <text x={cx + f.letterSpacing / 2} y={+(oy + 66 + f.size * 0.36).toFixed(2)} {...fontAttrs("display-800")} fontSize={f.size} letterSpacing={f.letterSpacing} textAnchor="middle" fill={gray ? WALL_GRAY : WALL}>
          {f.text}
        </text>
      )}
    </g>
  );
}

/**
 * La plaque d'identité : le nom en capitales, puis « N° · date » en mono.
 * Sans nom (attente par CV), le numéro tient seul la plaque, un peu plus grand.
 */
export function Plate({ x = 0, y = 0, w = MUG_SIZE.w, h = MUG_SIZE.h, name, sub }: { x?: number; y?: number; w?: number; h?: number; name: string | null; sub: string }) {
  const px = x + (w - PLACARD.w) / 2;
  const py = y + h - PLACARD.bottom - PLACARD.h;
  const cx = px + PLACARD.w / 2;
  const n = name ? fit(name, { font: "display-700", size: 20, minSize: 12, maxWidth: PLACARD.w - 16, letterSpacing: 20 * PLATE.nameSpacing, minLetterSpacing: 0.3 }) : null;
  const subSize = n ? 8.5 : 10;
  const s = fit(sub, { font: "mono-400", size: subSize, minSize: 7, maxWidth: PLACARD.w - 12, letterSpacing: subSize * PLATE.subSpacing, minLetterSpacing: 0.2 });
  return (
    <g data-plate="" transform={`rotate(${PLATE.tilt} ${cx} ${py + PLACARD.h / 2})`}>
      <rect x={px} y={py} width={PLACARD.w} height={PLACARD.h} rx={3} fill={PLATE.bg} />
      {n && (
        <text x={+(cx + n.letterSpacing / 2).toFixed(2)} y={py + 22} {...fontAttrs("display-700")} fontSize={n.size} letterSpacing={+n.letterSpacing.toFixed(2)} textAnchor="middle" fill={PLATE.ink}>
          {n.text}
        </text>
      )}
      <text x={cx} y={py + (n ? 35 : 27)} {...fontAttrs("mono-400")} fontSize={s.size} letterSpacing={+s.letterSpacing.toFixed(2)} textAnchor="middle" fill={PLATE.ink} fillOpacity={n ? PLATE.subOpacity : undefined}>
        {s.text}
      </text>
    </g>
  );
}
