// Entrée (§6.1, §18.5, §18.31) : la couverture, puis sous elle le titre, les
// portes, le champ et la promesse ; la fiche de Jacques, le mur des 13 profils
// (§18.28) et le top de la semaine (§18.22). Rien d'autre.
// L'exemple est la vraie fiche de Jacques (fondateur d'Azerit) : la maquette
// s'affiche d'abord, la fiche calculée par le serveur la remplace dès qu'elle existe.
// Aucun dégradé dans la page : seuls ceux de la fiche et des illustrations.
import { useEffect, useRef, useState } from "react";
import type { WeekTop } from "../../../shared/types";
import { LEVEL_LABELS, starsFor } from "../../../shared/types";
import { FIXTURES } from "../../../shared/fixtures";
import { CardView } from "../card/CardView";
import { Cover } from "../components/Cover";
import { EntryForm } from "../components/EntryForm";
import { ProfileWall } from "../components/ProfileWall";
import { WeekBoard } from "../components/WeekBoard";
import { useT } from "../i18n";
import { api, type Showcase } from "../lib/api";
import { onLinkClick } from "../lib/router";

/** Au-delà, le top est tenu pour absent : la couverture ne garde pas ses cases prunes. */
const TOP_WAIT_MS = 3000;

/** La maquette, tant que le serveur n'a pas jugé la vitrine. */
const SHOWCASE_MOCKUP: Showcase = { card: FIXTURES.jmougeot, href: `/${FIXTURES.jmougeot.login ?? "jmougeot"}` };

/** La fiche de Jacques : la maquette d'abord, la vraie dès que le serveur l'a. */
function useShowcase(): Showcase {
  const [showcase, setShowcase] = useState<Showcase>(SHOWCASE_MOCKUP);

  useEffect(() => {
    let alive = true;
    api
      .getShowcase()
      .then((s) => {
        if (alive && s) setShowcase(s);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return showcase;
}

/** Le top de la semaine pour la couverture ; `undefined` tant qu'il n'a pas répondu. */
function useTop(): WeekTop | null | undefined {
  const [top, setTop] = useState<WeekTop | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const late = window.setTimeout(() => alive && setTop((t) => (t === undefined ? null : t)), TOP_WAIT_MS);
    api
      .getTop()
      .then((t) => alive && setTop(t))
      .catch(() => alive && setTop(null));
    return () => {
      alive = false;
      window.clearTimeout(late);
    };
  }, []);
  return top;
}

/**
 * La fiche de Jacques : s'incline sous le pointeur, mène à sa page. Jugée avec son
 * LinkedIn (§18.35) : ses deux notes dessous, vers la comparaison.
 */
export function ExampleCard({ card, href, declared }: Showcase) {
  const { t, lang } = useT();
  return (
    <figure className="showcase" aria-label={`${t.home.exampleLabel} · ${t.tierCard(LEVEL_LABELS[starsFor(card.overall)][lang])}`}>
      <CardView card={card} lang={lang} interactive idPrefix="hero" />
      <figcaption>
        <a href={href} onClick={(e) => onLinkClick(e, href)}>
          {t.home.exampleCaption}
        </a>
        {/* La note du dossier d'abord, puis ses deux pièces (§18.37) : « Dossier 57 · LinkedIn 41 · GitHub 61 ». */}
        {declared && (
          <a className="showcase-scores" href={href} onClick={(e) => onLinkClick(e, href)} aria-label={t.home.exampleScoresLabel(declared.case ?? null, declared.overall, card.overall)}>
            {declared.case !== undefined && (
              <>
                {t.home.exampleCase} <b className="is-case">{declared.case}</b> ·{" "}
              </>
            )}
            LinkedIn <b className="is-linkedin">{declared.overall}</b> · GitHub <b className="is-github">{card.overall}</b>
          </a>
        )}
      </figcaption>
    </figure>
  );
}

const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function Home() {
  const { t } = useT();
  const h = t.home;
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLElement>(null);
  const showcase = useShowcase();
  const top = useTop();

  useEffect(() => {
    document.title = t.meta.title;
  }, [t]);

  /** Une place libre, « Découvre le tien » : retour au champ du pseudo,
   * prêt à taper. Le focus se donne dans le geste, sinon l'iPhone n'ouvre pas le clavier. */
  const play = () => {
    const behavior: ScrollBehavior = reducedMotion() ? "auto" : "smooth";
    const input = inputRef.current;
    if (!input) {
      window.scrollTo({ top: 0, behavior });
      return;
    }
    input.scrollIntoView({ block: "center", behavior });
    input.focus({ preventScroll: true });
  };

  /** La flèche sous le héros : la section suivante. */
  const next = () => nextRef.current?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });

  return (
    <main className="page page-home" id="main">
      <div className="home-top">
        <Cover onPlay={play} top={top} founder={showcase} />
        <section className="hero">
          {/* Deux phrases (shared/promise.ts) : la première en crème, la seconde en rose poudré. */}
          <h1 className="hero-title">
            <span className="hero-title-claim">{h.titleClaim}</span>{" "}
            <span className="hero-title-proof">{h.titleProof}</span>
          </h1>
          {/* La promesse : sous la pilule sur téléphone, en colonne de droite sur ordinateur ;
           * l'une des deux est toujours en display: none, donc lue une seule fois. */}
          <EntryForm inputRef={inputRef} note={<p className="hero-hook hero-hook-s">{h.titleB}</p>} />
          <p className="hero-hook hero-hook-l">{h.titleB}</p>
          <button type="button" className="hero-next" onClick={next} aria-label={h.next}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 9.5l6 6 6-6" />
            </svg>
          </button>
        </section>
      </div>
      <section className="home-example" ref={nextRef}>
        <ExampleCard {...showcase} />
      </section>
      <ProfileWall onPlay={play} />
      <WeekBoard onPlay={play} />
    </main>
  );
}
