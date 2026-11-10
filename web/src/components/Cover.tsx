// La couverture de l'accueil (SPEC §18.31) : une mosaïque encadrée de cases
// séparées par des joints d'encre, qui remplace le ciel en fondu du §18.29.
// Des lieux du crime (§18.28), et des visages : les suspects peints quand ils
// existent, le top de la semaine devant la toise, la fiche de Jacques, et
// toujours, en dernier, la place libre qui ramène au champ.
// Les grilles et le choix des décors sont dans lib/cover.ts ; la feuille
// (styles.css, « la couverture ») lit les grilles par variables.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { CardData, WeekTop } from "../../../shared/types";
import { useT } from "../i18n";
import { DESKTOP, PHONE, SLOTS, areasCss, bigAvatar, colsCss, coverPanels, firstRow, slotsIn, widthShare } from "../lib/cover";
import type { Panel, Slot } from "../lib/cover";
import { onLinkClick } from "../lib/router";
import { SUSPECTS, suspectSrc } from "../lib/suspects";
import { upper } from "../../../shared/card/text";

export interface CoverProps {
  /** La place libre : retour au champ, prêt à taper. */
  onPlay: () => void;
  /** Le top de la semaine ; `undefined` tant qu'il n'a pas répondu. */
  top: WeekTop | null | undefined;
  /** La fiche de Jacques et son lien, comme l'exemple de l'accueil. */
  founder: { card: CardData; href: string };
  /** Les portraits peints ; par défaut ceux de lib/suspects.ts. */
  suspects?: string[];
}

const ON_PHONE = slotsIn(PHONE);
/** Premier rang, sur téléphone ou sur ordinateur : chargé tout de suite. Une case
 * cachée sur téléphone reste paresseuse : cachée, elle ne se charge pas. */
const EAGER = new Set([...firstRow(PHONE), ...firstRow(DESKTOP)].filter((id) => ON_PHONE.has(id)));
/** La plus grande case du premier rang : en priorité haute. */
const HERO = "s1";
/** Largeur intérieure de la couverture sur ordinateur, au plus. */
const WIDE_INNER = 1060;

/** La largeur affichée d'une case, pour choisir entre -s.jpg et le grand fichier. */
function sizes(id: string): string {
  const wide = Math.ceil(widthShare(DESKTOP, id) * WIDE_INNER);
  const phone = widthShare(PHONE, id);
  return `(min-width: 900px) ${wide}px, ${Math.ceil((phone || widthShare(DESKTOP, id)) * 92)}vw`;
}

function Picture({ slot, small, large, w, h }: { slot: Slot; small: string; large: string; w: number; h: number }) {
  const eager = EAGER.has(slot.id);
  return (
    <img
      src={small}
      srcSet={`${small} ${w / 2}w, ${large} ${w}w`}
      sizes={sizes(slot.id)}
      alt=""
      width={w}
      height={h}
      loading={eager ? undefined : "lazy"}
      decoding="async"
      fetchPriority={slot.id === HERO ? "high" : undefined}
    />
  );
}

/** Les murs des visages : lilas, pêche, rose, bleu pâle (les ciels des décors). */
const TINTS = ["#ccc2f5", "#ffd9c2", "#f3b6cf", "#c9d4ff"];

/**
 * Un visage de la couverture : la photo en pleine case, en deux tons (prune
 * dans les ombres, la teinte du mur dans les lumières), les traits de la toise
 * par-dessus, la plaque en bas. Sans photo, ou si elle ne charge pas : une
 * silhouette prune devant le mur.
 */
function Face({ src, name, sub, mark, tint }: { src?: string | null; name: string; sub: string; mark?: string; tint: string }) {
  const { lang } = useT();
  // « wait » : la silhouette tient la pose tant que la photo n'est pas là, et pour de bon si elle ne vient pas.
  const [shot, setShot] = useState<"wait" | "ok" | "broken">("wait");
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // Une photo déjà en cache a pu finir avant que l'écouteur soit posé.
    const el = img.current;
    if (el?.complete) setShot(el.naturalWidth > 0 ? "ok" : "broken");
  }, [src]);
  const photo = src && shot !== "broken" ? src : null;
  const shown = !!photo && shot === "ok";
  return (
    <span className="cover-face" style={{ "--tint": tint } as CSSProperties} aria-hidden>
      {!shown && (
        <svg className="cover-face-shape" viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet">
          <circle cx="50" cy="42" r="19" />
          <path d="M8 100c0-27 18-44 42-44s42 17 42 44z" />
        </svg>
      )}
      {photo && (
        <img
          ref={img}
          className={`cover-face-photo${shown ? " is-on" : ""}`}
          src={photo}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setShot("ok")}
          onError={() => setShot("broken")}
        />
      )}
      {mark && !shown && <span className="cover-face-mark">{mark}</span>}
      <span className="cover-plate">
        <b>{upper(name, lang)}</b>
        <i>{sub}</i>
      </span>
    </span>
  );
}

export function Cover({ onPlay, top, founder, suspects = SUSPECTS }: CoverProps) {
  const { t } = useT();
  const c = t.home.cover;
  const panels = coverPanels({ suspects, top: top === undefined ? undefined : (top?.entries ?? null), founder });
  const style = {
    "--cover-cols-s": colsCss(PHONE),
    "--cover-areas-s": areasCss(PHONE),
    "--cover-cols-l": colsCss(DESKTOP),
    "--cover-areas-l": areasCss(DESKTOP),
  } as CSSProperties;

  let faces = 0;
  const render = (slot: Slot, p: Panel, i: number): ReactNode => {
    const tint = p.kind === "player" || p.kind === "founder" || p.kind === "free" ? TINTS[faces++ % TINTS.length]! : "";
    const cls = `cover-panel cover-${p.kind}${ON_PHONE.has(slot.id) ? "" : " is-wide"}`;
    // Une case qui change de contenu (le top arrive) se remonte et rejoue son entrée.
    const key = `${slot.id}-${p.kind}`;
    const common = { className: cls, style: { gridArea: slot.id, "--i": i } as CSSProperties };
    switch (p.kind) {
      case "scene":
        return (
          <div key={key} {...common} aria-hidden data-scene={p.scene}>
            <Picture slot={slot} small={`/profiles/${p.scene}-s.jpg`} large={`/profiles/${p.scene}.jpg`} w={1152} h={768} />
          </div>
        );
      case "suspect":
        return (
          <div key={key} {...common} aria-hidden data-suspect={p.id}>
            <Picture slot={slot} small={suspectSrc(p.id, true)} large={suspectSrc(p.id)} w={768} h={1152} />
          </div>
        );
      case "player": {
        const e = p.entry;
        const href = `/c/${e.cardId}`;
        return (
          <a key={key} {...common} href={href} onClick={(ev) => onLinkClick(ev, href)} aria-label={c.player(e.login, e.rank)}>
            <Face src={bigAvatar(e.avatarUrl)} name={`@${e.login}`} sub={c.playerPlate(e.rank, top?.week ?? 0)} tint={tint} />
          </a>
        );
      }
      case "founder":
        return (
          <a key={key} {...common} href={p.href} onClick={(ev) => onLinkClick(ev, p.href)} aria-label={t.home.exampleCaption}>
            <Face src={p.card.avatarUrl} name={p.card.login ? `@${p.card.login}` : p.card.name} sub={c.founderPlate} tint={tint} />
          </a>
        );
      case "free":
        return (
          <button key={key} {...common} type="button" onClick={onPlay} aria-label={c.freeLabel}>
            <Face name={c.free} sub={c.freePlate} mark="?" tint="#ffb2c6" />
          </button>
        );
      case "wait":
        return <div key={key} {...common} aria-hidden />;
    }
  };

  return (
    <div className="cover" style={style}>
      {SLOTS.map((slot, i) => render(slot, panels.get(slot.id)!, i))}
    </div>
  );
}
