// Entrée (§6.1) : la promesse, le champ, une carte d'exemple. Rien d'autre.
// L'exemple est la vraie carte de Jacques (fondateur d'Azerit) : la maquette
// s'affiche d'abord, la carte calculée par le serveur la remplace dès qu'elle existe.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { CardData } from "../../../shared/types";
import { LEVEL_LABELS, starsFor } from "../../../shared/types";
import { FIXTURES } from "../../../shared/fixtures";
import { CardView } from "../card/CardView";
import { EntryForm } from "../components/EntryForm";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { onLinkClick } from "../lib/router";
import { accentOf } from "../lib/util";

/** La carte de Jacques : flotte, se balance, s'incline sous le pointeur. */
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

  const accent = accentOf(card);
  const href = real ? `/c/${card.id}` : `/${card.login ?? "jmougeot"}`;
  return (
    <div className="example" style={{ "--ca": accent.a, "--cb": accent.b } as CSSProperties}>
      <div className="example-halo" aria-hidden />
      <div className="example-floor" aria-hidden />
      <figure className="example-float" aria-label={`${t.home.exampleLabel} · ${t.tierCard(LEVEL_LABELS[starsFor(card.overall)][lang])}`}>
        <CardView card={card} lang={lang} interactive idPrefix="hero" />
      </figure>
      <p className="example-caption">
        <a href={href} onClick={(e) => onLinkClick(e, href)}>
          {t.home.exampleCaption}
          {" →"}
        </a>
      </p>
    </div>
  );
}

/** Un palmier en ombre chinoise (§17.6), posé dans un coin de l'accueil. */
function Palm({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 100 140" aria-hidden focusable="false">
      <path d="M46 140c2-34 5-62 12-86l4 1c-8 24-11 52-12 85z" />
      <path d="M60 54C40 38 20 38 4 50c18-4 36 0 56 7z" />
      <path d="M60 54C36 56 18 68 10 88c14-14 30-22 50-30z" />
      <path d="M60 54c18-22 40-28 60-20-20 0-40 8-60 24z" />
      <path d="M60 54c26-2 44 10 54 30-14-14-32-22-54-26z" />
      <path d="M60 54c-6-22-2-40 8-52-2 16 0 32-4 50z" />
      <path d="M60 54c10-20 26-32 44-34-16 8-30 20-42 36z" />
      <path d="M60 54c-14-14-18-30-14-48 4 16 10 30 16 46z" />
    </svg>
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
      <Palm className="hero-palm hero-palm-l" />
      <Palm className="hero-palm hero-palm-r" />
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">
            <span className="kicker-dot" aria-hidden />
            {h.kicker}
          </p>
          <h1 className="hero-title">
            <span className="hero-a">{h.titleA}</span>
            <span className="hero-b">{h.titleB}</span>
          </h1>
          <EntryForm inputRef={inputRef} />
        </div>
        <div className="hero-card">
          <ExampleCard />
        </div>
      </section>
    </main>
  );
}
