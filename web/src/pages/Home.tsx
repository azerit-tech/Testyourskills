// Entrée (§6.1, §18.5, maquette web/gta-accueil.html) : le ciel (§18.29), la promesse, le champ,
// la fiche de Jacques, puis le mur des 13 profils (§18.28) et le top de la semaine (§18.22). Rien d'autre.
// L'exemple est la vraie fiche de Jacques (fondateur d'Azerit) : la maquette
// s'affiche d'abord, la fiche calculée par le serveur la remplace dès qu'elle existe.
// Le ciel se fond dans l'encre par le bas : c'est le seul dégradé de la page, avec celui de la fiche.
import { useEffect, useRef, useState } from "react";
import type { CardData } from "../../../shared/types";
import { LEVEL_LABELS, starsFor } from "../../../shared/types";
import { FIXTURES } from "../../../shared/fixtures";
import { CardView } from "../card/CardView";
import { EntryForm } from "../components/EntryForm";
import { HomeSky } from "../components/HomeSky";
import { ProfileWall } from "../components/ProfileWall";
import { WeekBoard } from "../components/WeekBoard";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { onLinkClick } from "../lib/router";

/** La fiche de Jacques : s'incline sous le pointeur, mène à sa page. */
function ExampleCard() {
  const { t, lang } = useT();
  const [card, setCard] = useState<CardData>(FIXTURES.jmougeot);
  const [real, setReal] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getShowcase()
      .then((c) => {
        if (!alive || !c) return;
        setCard(c);
        setReal(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const href = real ? `/c/${card.id}` : `/${card.login ?? "jmougeot"}`;
  return (
    <figure className="showcase" aria-label={`${t.home.exampleLabel} · ${t.tierCard(LEVEL_LABELS[starsFor(card.overall)][lang])}`}>
      <CardView card={card} lang={lang} interactive idPrefix="hero" />
      <figcaption>
        <a href={href} onClick={(e) => onLinkClick(e, href)}>
          {t.home.exampleCaption}
        </a>
      </figcaption>
    </figure>
  );
}

export function Home() {
  const { t } = useT();
  const h = t.home;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = t.meta.title;
  }, [t]);

  /** Une place libre du top, « Découvre le tien » : retour au champ du pseudo,
   * prêt à taper. Le focus se donne dans le geste, sinon l'iPhone n'ouvre pas le clavier. */
  const play = () => {
    const behavior: ScrollBehavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const input = inputRef.current;
    if (!input) {
      window.scrollTo({ top: 0, behavior });
      return;
    }
    input.scrollIntoView({ block: "center", behavior });
    input.focus({ preventScroll: true });
  };

  return (
    <main className="page page-home" id="main">
      <div className="home-top">
        <HomeSky />
        <section className="hero">
          <div className="hero-copy">
            <h1 className="hero-title">{h.titleA}</h1>
            <p className="hero-hook">{h.titleB}</p>
            <EntryForm inputRef={inputRef} />
          </div>
          <ExampleCard />
        </section>
      </div>
      <ProfileWall onPlay={play} />
      <WeekBoard onPlay={play} />
    </main>
  );
}
