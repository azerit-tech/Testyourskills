// La fiche d'une personne dénoncée (§18.6, §18.48, §18.52, §18.104, §18.118), vue par tout visiteur
// sauf qui l'a dénoncée : le premier bloc sous la fiche. « C'est bien moi », en très grand, seul rose,
// qu'on ait ou non une autre fiche ici : un toucher ouvre la connexion de la fiche, GitHub pour un
// pseudo, LinkedIn pour un profil (un dossier qui porte les deux : GitHub en grand, LinkedIn en lien).
// Au retour, la fiche est la sienne ; une ligne dit ce que ça ouvre (la refaire, la cacher, la partager).
// Connexion LinkedIn éteinte : la refaire depuis son lien, comme avant.
// Puis « Ce n'est pas moi : faire la mienne », en lien (le formulaire est dans « À ton tour »).
// Sans pseudo GitHub, la demande de retrait est dans le bloc.
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
import { IconGithub, IconLinkedIn } from "./Icons";
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

/** Une connexion qui reprend la fiche (§18.118) : GitHub pour un pseudo, LinkedIn pour un profil. */
export interface SignIn {
  via: "github" | "linkedin";
  go: () => void;
}

interface Props {
  /** La personne fichée : « @pseudo », sinon son nom. */
  who: string;
  /** Qui a dénoncé, nommé s'il ou elle a repris sa fiche ; sinon « Quelqu'un ». */
  by: string | null;
  /**
   * « C'est bien moi » (§18.118) : les connexions de la fiche, la première en grand, la seconde (un
   * dossier qui porte les deux) en lien dessous. Vide : rien à reprendre par une connexion.
   */
  signIns: SignIn[];
  /** Connexion LinkedIn éteinte, dénoncée par son LinkedIn : la refaire soi-même depuis ce lien. */
  onRemake: Remake | null;
  /** Le visiteur n'a pas encore sa fiche : « Ce n'est pas moi : faire la mienne ». */
  notMe: boolean;
  /** La demande de retrait d'une fiche sans pseudo GitHub. */
  children?: ReactNode;
}

const ICON = { github: IconGithub, linkedin: IconLinkedIn } as const;
const NAME = { github: "GitHub", linkedin: "LinkedIn" } as const;

export function Denounced({ who, by, signIns, onRemake, notMe, children }: Props) {
  const { t } = useT();
  const d = t.denounce;
  const reduced = useReducedMotion();
  const first = signIns.at(0);
  const second = signIns.at(1);
  const mine = first?.go ?? onRemake?.go ?? null;
  const going = !first && !!onRemake?.busy;
  const Icon = first ? ICON[first.via] : null;
  // Un seul rose : « C'est bien moi », en très grand, sinon « Ce n'est pas moi ».
  // Un bouton par intention (§18.52) : avec « C'est bien moi », « Ce n'est pas moi » n'est qu'un lien, « À ton tour » a le formulaire.
  return (
    <section className={`denounced${mine ? " has-claim" : ""}`} aria-labelledby="denounced-title">
      {/* Qui a dénoncé : dit une fois. Sur téléphone, la phrase au-dessus de la fiche le dit (ce rappel s'y masque) ; au bureau, ici. */}
      <p className="denounced-by">{t.result.leadDenounced(who, by)}</p>
      {/* « C'est toi ? » : la question que le bouton tranche ; lue, pas montrée, quand le bouton est là. */}
      <h2 className={mine ? "sr-only" : "denounced-title"} id="denounced-title">
        {d.isYou}
      </h2>
      {mine && (
        <>
          <button type="button" className="pill denounced-me" aria-busy={going || undefined} aria-describedby="denounced-why" onClick={mine}>
            {Icon && <Icon />}
            <span>{going ? t.home.submitting : d.itsMe}</span>
            {first && <span className="sr-only">{d.itsMeVia(NAME[first.via])}</span>}
          </button>
          <p className="denounced-why" id="denounced-why">
            {d.itsMeWhy}
          </p>
          {second && (
            <button type="button" className="link-alt denounced-also" onClick={second.go}>
              {d.itsMeAlso(NAME[second.via])}
            </button>
          )}
        </>
      )}
      {notMe && (
        <button type="button" className={mine ? "link-alt denounced-notme" : "pill pill-big"} onClick={() => toYourTurn(reduced)}>
          {d.notMe}
        </button>
      )}
      {children}
    </section>
  );
}
