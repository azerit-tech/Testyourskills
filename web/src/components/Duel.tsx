// Le duel (§18.7, §18.48) : qui a déjà sa fiche lit, sous celle d'une autre personne,
// « Toi 83/100, @x 68/100 : une étoile d'avance », et peut lui envoyer le score avec
// le lien de sa propre fiche. Face à un dossier scellé, la note ne se dit pas : il ne
// reste que « Ma fiche ».
import { useState } from "react";
import type { CardData } from "../../../shared/types";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { onLinkClick } from "../lib/router";
import type { MyCard } from "../lib/session";
import { hasNativeShare } from "../lib/sharing";
import { copyText, isTouch, shareUrl } from "../lib/util";
import { verdict } from "../lib/versus";
import { ManualCopy } from "./After";

interface Props {
  /** La fiche du visiteur, faite ou reprise depuis ce navigateur. */
  mine: MyCard;
  /** La fiche regardée. */
  card: CardData;
  toast: (m: string) => void;
}

export function Duel({ mine, card, toast }: Props) {
  const { t } = useT();
  const d = t.denounce;
  // Presse-papiers refusé : le texte s'affiche, sélectionné, pour un appui long.
  const [manual, setManual] = useState<string | null>(null);
  const who = card.login ? `@${card.login}` : card.name;
  const v = verdict(mine.overall, card.overall);
  const said =
    v.by === "tie" ? d.tie : v.by === "stars" ? (v.ahead ? d.starsAhead(v.n) : d.starsBehind(v.n)) : v.ahead ? d.pointsAhead(v.n) : d.pointsBehind(v.n);
  const rel = v.by === "tie" ? "tie" : v.ahead ? "ahead" : "behind";
  const url = shareUrl(mine.id);
  const track = (channel: string) => api.track("card_shared", mine.id, { channel, kind: "duel" });

  const send = async () => {
    const lead = d.duelText(mine.overall, card.overall, said, who, rel);
    if (isTouch() && hasNativeShare()) {
      try {
        await navigator.share({ title: "Azerit", text: lead, url });
        track("native");
      } catch {
        /* partage annulé */
      }
      return;
    }
    const text = `${lead} ${url}`;
    if (await copyText(text)) toast(d.scoreCopied);
    else setManual(text);
    track("copy");
  };

  const mineLink = (
    <a className="link-alt" href={`/c/${mine.id}`} onClick={(e) => onLinkClick(e, `/c/${mine.id}`)}>
      {d.mine}
    </a>
  );

  if (card.sealed)
    return (
      <section className="you duel" id="you" aria-labelledby="you-title">
        <h2 id="you-title">{d.andYou}</h2>
        <div className="duel-actions">{mineLink}</div>
      </section>
    );

  return (
    <section className="you duel" id="you" aria-labelledby="you-title">
      <h2 id="you-title">{d.versus(mine.overall, who, card.overall, said)}</h2>
      <div className="duel-actions">
        <button type="button" className="pill" onClick={() => void send()}>
          {d.sendScore}
        </button>
        {mineLink}
      </div>
      {manual && <ManualCopy m={{ kind: "message", value: manual }} />}
    </section>
  );
}
