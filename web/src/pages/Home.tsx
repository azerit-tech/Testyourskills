// Entrée (§6.1, §18.31, §18.48). Le premier écran dit ce qu'on obtient : la
// couverture, le titre, la promesse dessous, puis les portes, le champ et le
// bouton. Ensuite, dans l'ordre de l'envie : la fiche de Jacques (le produit),
// le top de la semaine (§18.22), les primes si elles sont ouvertes (§18.4), les
// bandes (§18.38), le mur des 13 profils (§18.28), et un dernier formulaire
// avant le pied de page. Rien d'autre.
// L'accueil se souvient : la fiche déjà faite (ou le dossier encore en cours) tient
// en une ligne au-dessus du formulaire, à la place de la promesse, et prend la case
// « Ta place » de la couverture.
// L'exemple est la vraie fiche de Jacques (fondateur d'Azerit) : la maquette
// s'affiche d'abord, la fiche calculée par le serveur la remplace dès qu'elle existe.
// Aucun dégradé dans la page : seuls ceux de la fiche et des illustrations.
import { useEffect, useRef, useState } from "react";
import type { CardData, WeekTop } from "../../../shared/types";
import { LEVEL_LABELS, starsFor } from "../../../shared/types";
import { fileOf, pieceLabel } from "../../../shared/caseFile";
import { FIXTURES } from "../../../shared/fixtures";
import { CardView } from "../card/CardView";
import { Cover } from "../components/Cover";
import { EntryForm } from "../components/EntryForm";
import { ProfileWall } from "../components/ProfileWall";
import { WeekBoard } from "../components/WeekBoard";
import { BandsTop } from "../components/BandsTop";
import { PrimesStrip } from "../components/Primes";
import { Stars } from "../components/Stars";
import { useT } from "../i18n";
import { ApiError, api, type Showcase } from "../lib/api";
import { onLinkClick } from "../lib/router";
import { homeHook, useAppConfig } from "../lib/season";
import { clearPending, myCard, pendingFile, type MyCard } from "../lib/session";

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

/** Ce que l'accueil sait déjà du visiteur (§18.48). */
interface Memory {
  /** La fiche faite dans ce navigateur. */
  mine: MyCard | null;
  /** Cette fiche entière, dès que le serveur l'a rendue : la vignette de la couverture. */
  card: CardData | null;
  /** Le dossier demandé dans cet onglet, pas encore sorti. */
  pending: string | null;
}

/**
 * La mémoire de l'accueil : lue d'emblée (la ligne a sa place au premier rendu), puis
 * vérifiée auprès du serveur. Un dossier sorti entre-temps devient « Ta fiche », un
 * dossier échoué ou une fiche retirée disparaît.
 */
function useMemory(): Memory {
  const [mem, setMem] = useState<Memory>(() => ({ mine: myCard(), card: null, pending: pendingFile() }));

  useEffect(() => {
    let alive = true;
    const gone = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 410);
    const check = async () => {
      let { mine } = mem;
      const { pending } = mem;
      if (pending) {
        try {
          const job = await api.getJob(pending);
          if (job.state === "pending") return;
          clearPending(pending);
          if (job.state === "done") {
            const main = job.kind === "card" ? job.card : fileOf(job.comparison);
            mine = { id: pending, login: main.login ?? null, overall: main.overall };
            if (alive) setMem({ mine, card: main, pending: null });
            return;
          }
        } catch (e) {
          // Réseau capricieux : on laisse la ligne, la page du dossier saura dire.
          if (!gone(e)) return;
          clearPending(pending);
        }
        if (!alive) return;
        setMem((m) => ({ ...m, pending: null }));
      }
      if (!mine) return;
      const id = mine.id;
      try {
        const job = await api.getJob(id);
        if (!alive || job.state !== "done") return;
        const main = job.kind === "card" ? job.card : fileOf(job.comparison);
        setMem((m) => ({ ...m, mine: { id, login: main.login ?? null, overall: main.overall }, card: main }));
      } catch (e) {
        if (alive && gone(e)) setMem((m) => ({ ...m, mine: null }));
      }
    };
    void check();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return mem;
}

/** La ligne au-dessus du formulaire : « Ta fiche : ★★★★★☆ 79/100. La revoir », ou le dossier en cours. */
export function BackLine({ mine, pending }: Pick<Memory, "mine" | "pending">) {
  const { t } = useT();
  const b = t.home.back;
  if (!mine && !pending) return null;
  const href = `/c/${pending ?? mine!.id}`;
  const stars = mine ? starsFor(mine.overall) : 0;
  return (
    <p className="home-back">
      <a href={href} onClick={(e) => onLinkClick(e, href)}>
        {pending ? (
          <span>{b.pending}</span>
        ) : (
          <span>
            {b.mine} <Stars n={stars} label={t.plea.count(stars)} /> {mine!.overall}/100.
          </span>
        )}
        <span className="link-alt">{pending ? b.pendingGo : b.mineGo}</span>
      </a>
    </p>
  );
}

/**
 * La fiche de Jacques : s'incline sous le pointeur, mène à sa page. Jugée avec son
 * LinkedIn (§18.35) : une note, celle de la fiche, et ses pièces dessous (§18.36).
 */
export function ExampleCard({ card, href, pieces }: Showcase) {
  const { t, lang } = useT();
  return (
    <figure className="showcase" aria-label={`${t.home.exampleLabel} · ${t.tierCard(LEVEL_LABELS[starsFor(card.overall)][lang])}`}>
      <CardView card={card} lang={lang} interactive idPrefix="hero" />
      <figcaption>
        <a href={href} onClick={(e) => onLinkClick(e, href)}>
          {t.home.exampleCaption}
        </a>
        {/* « Pièces au dossier : LinkedIn · GitHub » : d'où vient la preuve, la note est sur la fiche. */}
        {pieces && pieces.length > 1 && (
          <a className="showcase-scores" href={href} onClick={(e) => onLinkClick(e, href)}>
            {t.result.pieces.line(pieces.map(pieceLabel).join(" · "))}
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
  const showcase = useShowcase();
  const top = useTop();
  const mem = useMemory();
  // La ligne sous le titre (lib/season.ts) : l'entretien seulement si une prime est ouverte.
  const hook = homeHook(h, useAppConfig());

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

  return (
    <main className="page page-home" id="main">
      <div className="home-top">
        <Cover onPlay={play} top={top} founder={showcase} mine={mem.mine && { href: `/c/${mem.mine.id}`, overall: mem.mine.overall, card: mem.card }} />
        <section className="hero">
          {/* Deux phrases (shared/promise.ts) : la première en lilas, la question en crème. */}
          <h1 className="hero-title">
            <span className="hero-title-claim">{h.titleClaim}</span>{" "}
            <span className="hero-title-proof">{h.titleProof}</span>
          </h1>
          {/* La promesse, sous le titre : ce qu'on obtient, avant de demander quoi que ce soit. */}
          {/* L'accueil se souvient : qui a déjà sa fiche (ou un dossier en cours) connaît la
              promesse ; la ligne qui y ramène prend sa place, le bouton ne descend pas. */}
          {mem.mine || mem.pending ? <BackLine mine={mem.mine} pending={mem.pending} /> : <p className="hero-hook">{hook}</p>}
          <EntryForm inputRef={inputRef} />
        </section>
      </div>
      {/* Le produit, puis la preuve que d'autres y sont : côte à côte au bureau. */}
      <div className="home-proof">
        <section className="home-example">
          <ExampleCard {...showcase} />
        </section>
        <WeekBoard onPlay={play} />
      </div>
      {/* Les primes ouvertes (§18.4) : rien tant que la saison n'en porte pas. */}
      <PrimesStrip />
      <BandsTop lead={h.bandsLead} />
      <ProfileWall onPlay={play} />
      {/* Qui a tout lu n'a pas à remonter : le même formulaire, dans le bloc d'appel. */}
      <section className="home-last block block-call" aria-labelledby="home-last-title">
        <div className="home-last-head">
          <h2 id="home-last-title" className="t-section">
            {h.lastTitle}
          </h2>
          <p>{hook}</p>
        </div>
        <EntryForm secondary />
      </section>
    </main>
  );
}
