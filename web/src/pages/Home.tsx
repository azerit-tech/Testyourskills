// Entrée (§6.1, §18.5, maquette web/gta-accueil.html) : la promesse, le champ, la fiche de Jacques. Rien d'autre.
// L'exemple est la vraie fiche de Jacques (fondateur d'Azerit) : la maquette
// s'affiche d'abord, la fiche calculée par le serveur la remplace dès qu'elle existe.
// Le seul dégradé de l'écran est le ciel de cette fiche.
import { useEffect, useRef, useState } from "react";
import type { CardData } from "../../../shared/types";
import { LEVEL_LABELS, starsFor } from "../../../shared/types";
import { FIXTURES } from "../../../shared/fixtures";
import { CardView } from "../card/CardView";
import { EntryForm } from "../components/EntryForm";
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

  return (
    <main className="page page-home" id="main">
      <section className="hero">
        <div className="hero-copy">
          <h1 className="hero-title">{h.titleA}</h1>
          <p className="hero-hook">{h.titleB}</p>
          <EntryForm inputRef={inputRef} />
        </div>
        <ExampleCard />
      </section>
    </main>
  );
}
