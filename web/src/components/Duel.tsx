// Le duel (§18.7, §18.48, §18.104) : qui a déjà sa fiche lit, plus bas sous celle d'une autre
// personne, « 83/100 contre 68/100 : une étoile d'avance », et peut lui envoyer son score avec
// le lien de sa propre fiche, en contour : jamais le rose, jamais dans la barre du pouce.
// Sur une fiche dénoncée (qu'on vient peut-être de recevoir), l'écart seul, rien à envoyer.
// Face à un dossier scellé, la note ne se dit pas : il ne reste que « Ma fiche ». Sur sa
// propre fiche toute neuve, le même duel face à la fiche par laquelle on est arrivé (« Tu viens de… »).
import { useCallback, useState } from "react";
import type { CardData } from "../../../shared/types";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { onLinkClick } from "../lib/router";
import type { MyCard } from "../lib/session";
import { hasNativeShare } from "../lib/sharing";
import { copyText, isTouch, shareUrl } from "../lib/util";
import { verdict } from "../lib/versus";
import { ManualCopy } from "./After";

export interface DuelSend {
  /** Envoie son score à la personne de la fiche regardée ; null face à un dossier scellé. */
  send: (() => Promise<void>) | null;
  /** Presse-papiers refusé : le texte à copier à la main. */
  manual: string | null;
}

/** L'écart dit en mots : étoiles d'avance, points de retard, égalité. */
function said(d: ReturnType<typeof useT>["t"]["denounce"], me: number, them: number) {
  const v = verdict(me, them);
  const text = v.by === "tie" ? d.tie : v.by === "stars" ? (v.ahead ? d.starsAhead(v.n) : d.starsBehind(v.n)) : v.ahead ? d.pointsAhead(v.n) : d.pointsBehind(v.n);
  return { text, rel: v.by === "tie" ? ("tie" as const) : v.ahead ? ("ahead" as const) : ("behind" as const) };
}

/** L'autre fiche : la fiche regardée, ou celle par laquelle on est arrivé. */
export type Rival = Pick<CardData, "name" | "overall"> & { login?: string | null; sealed?: boolean };

export function useDuelSend(mine: MyCard | null, card: Rival, toast: (m: string) => void): DuelSend {
  const { t } = useT();
  const d = t.denounce;
  const [manual, setManual] = useState<string | null>(null);
  const who = card.login ? `@${card.login}` : card.name;
  const send = useCallback(async () => {
    if (!mine) return;
    const { text, rel } = said(d, mine.overall, card.overall);
    const lead = d.duelText(mine.overall, card.overall, text, who, rel);
    const url = shareUrl(mine.id);
    const track = (channel: string) => api.track("card_shared", mine.id, { channel, kind: "duel" });
    if (isTouch() && hasNativeShare()) {
      try {
        await navigator.share({ title: "Azerit", text: lead, url });
        track("native");
      } catch {
        /* partage annulé */
      }
      return;
    }
    const message = `${lead} ${url}`;
    if (await copyText(message)) toast(d.scoreCopied);
    else setManual(message);
    track("copy");
  }, [mine, card.overall, who, d, toast]);
  return { send: mine && !card.sealed ? send : null, manual };
}

interface Props {
  /** La fiche du visiteur, faite ou reprise depuis ce navigateur. */
  mine: MyCard;
  /** La fiche regardée. */
  card: Rival;
  duel: DuelSend;
  /** Fiche dénoncée (§18.104) : l'écart pour information, sans bouton d'envoi. */
  info?: boolean;
  /** Sur sa propre fiche : la fiche par laquelle on est arrivé, sans lien « Ma fiche ». */
  from?: boolean;
}

export function Duel({ mine, card, duel, info = false, from = false }: Props) {
  const { t } = useT();
  const d = t.denounce;
  if (from) {
    if (!duel.send) return null;
    const send = duel.send;
    return (
      <section className="after-block duel duel-from" aria-labelledby="duel-from-title">
        <p className="surtitre">{d.duelFrom(card.login ? `@${card.login}` : card.name)}</p>
        <h2 id="duel-from-title">{d.versus(mine.overall, card.overall, said(d, mine.overall, card.overall).text)}</h2>
        <div className="duel-actions">
          <button type="button" className="pill" onClick={() => void send()}>
            {d.sendScore}
          </button>
        </div>
        {duel.manual && <ManualCopy m={{ kind: "message", value: duel.manual }} />}
      </section>
    );
  }
  const mineLink = (
    <a className="link-alt" href={`/c/${mine.id}`} onClick={(e) => onLinkClick(e, `/c/${mine.id}`)}>
      {d.mine}
    </a>
  );

  if (!duel.send)
    return (
      <section className="you duel" id="you" aria-labelledby="you-title">
        <h2 id="you-title">{d.andYou}</h2>
        <div className="duel-actions">{mineLink}</div>
      </section>
    );

  const send = info ? null : duel.send;
  return (
    <section className="you duel" id="you" aria-labelledby="you-title">
      <h2 id="you-title">{d.versus(mine.overall, card.overall, said(d, mine.overall, card.overall).text)}</h2>
      <div className="duel-actions">
        {send && (
          <button type="button" className="pill" onClick={() => void send()}>
            {d.sendScore}
          </button>
        )}
        {mineLink}
      </div>
      {duel.manual && <ManualCopy m={{ kind: "message", value: duel.manual }} />}
    </section>
  );
}
