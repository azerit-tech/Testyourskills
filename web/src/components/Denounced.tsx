// La fiche d'une personne dénoncée (§18.6, §18.48, §18.52), vue par tout visiteur sauf qui
// l'a dénoncée : « C'est toi ? », qui vaut pour la personne visée comme pour un tiers, puis
// les sorties. « C'est moi » d'abord : par GitHub, la personne reprend cette fiche ; par un
// lien LinkedIn (rien à prouver), elle la refait elle-même et la nouvelle est la sienne.
// Puis « Ce n'est pas moi : faire la mienne », en lien (le formulaire est dans « À ton tour »).
// Sans pseudo GitHub, la demande de retrait est dans le bloc. Qui a déjà sa propre fiche
// voit tout en contour : le rose va au duel.
import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { pick, useT } from "../i18n";
import { api, tokens } from "../lib/api";
import { unlockAudio } from "../lib/audio";
import { errorFact } from "../lib/errors";
import { revealScene } from "../lib/revealScene";
import { navigate } from "../lib/router";
import { markFresh, rememberInput } from "../lib/session";
import { useReducedMotion } from "../lib/util";
import { unlockFilm } from "../film/unlock";
import { toYourTurn } from "./MakeYours";

/**
 * « C'est moi : faire ma fiche moi-même » : la fiche part de ce lien LinkedIn, comme
 * depuis la porte LinkedIn de l'accueil (attente, pari, poursuite), et le jeton de la
 * nouvelle fiche reste dans ce navigateur : elle devient « Ma fiche ». null sans lien.
 */
export interface Remake {
  go: () => void;
  /** La demande est partie : le bouton le dit. */
  busy: boolean;
}

export function useRemake(linkedinUrl: string | null, toast: (m: string) => void): Remake | null {
  const { t, lang } = useT();
  const busy = useRef(false);
  const [going, setGoing] = useState(false);
  const run = useCallback(async () => {
    if (!linkedinUrl || busy.current) return;
    busy.current = true;
    setGoing(true);
    // Avant tout await : le geste débloque le son et le film de la révélation.
    unlockAudio();
    if (revealScene() === "film") unlockFilm();
    try {
      const res = await api.createCard({ linkedin: linkedinUrl, lang });
      if (res.deleteToken) tokens.set(res.id, res.deleteToken);
      rememberInput({ login: linkedinUrl, file: null });
      markFresh(res.id, undefined, linkedinUrl);
      navigate(`/c/${res.id}`);
    } catch (err) {
      busy.current = false;
      setGoing(false);
      const msg = errorFact(err, t.errors.closed, t.home.errNetwork);
      toast(typeof msg === "string" ? msg : pick(msg, lang));
    }
  }, [linkedinUrl, lang, t, toast]);
  return linkedinUrl ? { go: () => void run(), busy: going } : null;
}

interface Props {
  /** La personne fichée : « @pseudo », sinon son nom. */
  who: string;
  /** Qui a dénoncé, nommé s'il ou elle a repris sa fiche ; sinon « Quelqu'un ». */
  by: string | null;
  /** La reprise par GitHub ; null sans pseudo GitHub ou si elle est éteinte. */
  onLawyer: (() => void) | null;
  /** Sans GitHub, dénoncée par son LinkedIn : la refaire soi-même depuis ce lien. */
  onRemake: Remake | null;
  /** Le visiteur n'a pas encore sa fiche : « Ce n'est pas moi : faire la mienne ». */
  notMe: boolean;
  /** Le visiteur a sa propre fiche : rien en rose ici, le duel le prend. */
  quiet?: boolean;
  /** La demande de retrait d'une fiche sans pseudo GitHub. */
  children?: ReactNode;
}

export function Denounced({ who, by, onLawyer, onRemake, notMe, quiet = false, children }: Props) {
  const { t } = useT();
  const d = t.denounce;
  const reduced = useReducedMotion();
  const mine = onLawyer ?? onRemake?.go ?? null;
  const going = !onLawyer && !!onRemake?.busy;
  // Un seul rose : « C'est moi » s'il existe, sinon « Ce n'est pas moi » ; aucun pour qui a sa fiche.
  const strong = (first: boolean) => (!quiet && first ? "pill pill-big" : "pill");
  // Un bouton par intention (§18.52) : avec « C'est moi », « Ce n'est pas moi » n'est qu'un lien, « À ton tour » a le formulaire.
  return (
    <section className="denounced" aria-labelledby="denounced-title">
      {/* Qui a dénoncé : dit une fois. Sur téléphone, la phrase au-dessus de la fiche le dit (ce rappel s'y masque) ; au bureau, ici. */}
      <p className="denounced-by">{t.result.leadDenounced(who, by)}</p>
      <h2 className="denounced-title" id="denounced-title">
        {d.isYou}
      </h2>
      {mine && (
        <>
          <button
            type="button"
            className={strong(true)}
            aria-busy={going || undefined}
            onClick={mine}
          >
            {going ? t.home.submitting : onLawyer ? d.lawyer : d.lawyerLinkedin}
          </button>
          <p className="denounced-hint">{onLawyer ? d.lawyerHint : d.lawyerLinkedinHint}</p>
        </>
      )}
      {notMe && (
        <button type="button" className={mine ? "link-alt denounced-notme" : strong(true)} onClick={() => toYourTurn(reduced)}>
          {d.notMe}
        </button>
      )}
      {children}
    </section>
  );
}
