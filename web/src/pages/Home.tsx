// Entrée (§6.1, §18.48, §18.81). Le premier écran dit ce qu'on obtient : le
// titre, la promesse dessous, les portes, le champ et le bouton, et la fiche de
// Jacques (le produit) debout sur son crépuscule : à droite au bureau, juste
// sous le formulaire sur téléphone, où son haut dépasse du premier écran.
// Ensuite, dans l'ordre de l'envie : la berline (§18.79), le top de la semaine
// (§18.22), les primes si elles sont ouvertes (§18.4), les bandes (§18.38), le
// mur des 13 profils (§18.28), et un dernier formulaire avant le pied de page.
// Rien d'autre. La couverture en mosaïque du §18.31 a disparu (§18.81).
// L'accueil se souvient : la fiche déjà faite (ou le dossier encore en cours) tient
// en une ligne au-dessus du formulaire, à la place de la promesse.
// L'exemple est la vraie fiche de Jacques (fondateur d'Azerit) : la maquette
// s'affiche d'abord, la fiche calculée par le serveur la remplace dès qu'elle existe.
// Aucun dégradé dans la page : seul celui de la fiche.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { LEVEL_LABELS, starsFor } from "../../../shared/types";
import { fileOf, pieceLabel } from "../../../shared/caseFile";
import { FIXTURES } from "../../../shared/fixtures";
import { CardView } from "../card/CardView";
import { EntryForm } from "../components/EntryForm";
import { ProfileWall } from "../components/ProfileWall";
import { Spin } from "../components/Spin";
import { Sunset } from "../components/Sunset";
import { WEEK_ANCHOR, WeekBoard } from "../components/WeekBoard";
import { BandsTop } from "../components/BandsTop";
import { PrimesStrip } from "../components/Primes";
import { Stars } from "../components/Stars";
import { useT } from "../i18n";
import { ApiError, api, type Showcase } from "../lib/api";
import { onLinkClick } from "../lib/router";
import { homeHook, useAppConfig } from "../lib/season";
import { returnPending } from "../lib/entryApi";
import { MINE_EVENT, clearPending, dropPrefill, filmOwed, myCard, peekPrefill, pendingFile, type MyCard } from "../lib/session";
import { ReturnCall } from "../components/ReturnCall";

export { ReturnCall };

/** Dénoncer depuis l'accueil (/<pseudo> d'un autre) : le bloc de la fiche, chargé seulement ce jour-là. */
const Denounce = lazy(() => import("../components/Denounce").then((m) => ({ default: m.Denounce })));

/** Au-delà, le top est tenu pour absent : l'ancre « /#semaine » n'attend pas plus. */
const TOP_WAIT_MS = 3000;

/** La maquette, tant que le serveur n'a pas jugé la vitrine. Avec ses deux pièces, comme la
 * vraie (§18.35) : la légende a ses deux lignes dès le premier rendu, rien ne saute dessous. */
const SHOWCASE_MOCKUP: Showcase = { card: FIXTURES.jmougeot, href: `/${FIXTURES.jmougeot.login ?? "jmougeot"}`, pieces: ["linkedin", "github"] };

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

/** Le top de la semaine a-t-il répondu ? La requête est celle du tableau (lib/api.ts) ; elle sert à l'ancre « /#semaine ». */
function useTopKnown(): boolean {
  const [known, setKnown] = useState(false);
  useEffect(() => {
    let alive = true;
    const done = () => alive && setKnown(true);
    const late = window.setTimeout(done, TOP_WAIT_MS);
    api.getTop().then(done, done);
    return () => {
      alive = false;
      window.clearTimeout(late);
    };
  }, []);
  return known;
}

/** Ce que l'accueil sait déjà du visiteur (§18.48). */
interface Memory {
  /** La fiche faite dans ce navigateur. */
  mine: MyCard | null;
  /** Le dossier demandé dans cet onglet, pas encore sorti. */
  pending: string | null;
}

/**
 * La mémoire de l'accueil : lue d'emblée (la ligne a sa place au premier rendu), puis
 * vérifiée auprès du serveur. Un dossier sorti entre-temps devient « Ta fiche », un
 * dossier échoué ou une fiche retirée disparaît.
 */
function useMemory(): Memory {
  const [mem, setMem] = useState<Memory>(() => ({ mine: myCard(), pending: pendingFile() }));

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
            if (alive) setMem({ mine, pending: null });
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
        setMem((m) => ({ ...m, mine: { id, login: main.login ?? null, overall: main.overall } }));
      } catch (e) {
        if (alive && gone(e)) setMem((m) => ({ ...m, mine: null }));
      }
    };
    void check();
    // La fiche de qui s'est connecté ici, rendue par le serveur après le premier rendu (§18.89).
    const on = () => setMem((m) => ({ ...m, mine: myCard() }));
    window.addEventListener(MINE_EVENT, on);
    return () => {
      alive = false;
      window.removeEventListener(MINE_EVENT, on);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return mem;
}

/**
 * La ligne au-dessus du formulaire : « Ta fiche : ★★★★★☆ 79/100. La revoir », ou le dossier en cours.
 * `owed` : la fiche est sortie mais son film reste à voir (retour arrière en plein film) ; la note
 * ne se lit pas avant la poursuite, la ligne y ramène (« Ta poursuite t'attend. La voir »).
 */
export function BackLine({ mine, pending, owed = false }: Pick<Memory, "mine" | "pending"> & { owed?: boolean }) {
  const { t } = useT();
  const b = t.home.back;
  if (!mine && !pending) return null;
  const href = `/c/${pending ?? mine!.id}`;
  const stars = mine ? starsFor(mine.overall) : 0;
  const waiting = pending || owed;
  return (
    <p className="home-back">
      <a href={href} onClick={(e) => onLinkClick(e, href)}>
        {waiting ? (
          <span>{pending ? b.pending : b.owed}</span>
        ) : (
          <span>
            {b.mine} <Stars n={stars} label={t.plea.count(stars)} /> {mine!.overall}/100.
          </span>
        )}
        <span className="link-alt">{pending ? b.pendingGo : owed ? b.owedGo : b.mineGo}</span>
      </a>
    </p>
  );
}

/** Un message bref en bas de l'écran (la dénonciation copiée), sans emporter l'après-fiche dans l'accueil. */
function useMiniToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = (m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 3200);
  };
  const node = (
    <div className={`toast${msg ? " is-on" : ""}`} role="status" aria-live="polite">
      {msg}
    </div>
  );
  return { show, node };
}

/**
 * La fiche de Jacques, debout dans le premier écran (§18.81) : s'incline sous le pointeur, mène à sa page. Jugée avec son
 * LinkedIn (§18.35) : une note, celle de la fiche, et ses pièces dessous (§18.36).
 */
export function ExampleCard({ card, href, pieces }: Showcase) {
  const { t, lang } = useT();
  return (
    <figure className="showcase" aria-label={`${t.home.exampleLabel}, ${t.tierCard(LEVEL_LABELS[starsFor(card.overall)][lang])}`}>
      <CardView card={card} lang={lang} interactive idPrefix="hero" />
      {/* Une seule ligne : le lien vers sa page, puis, en texte, d'où vient la preuve (« d'après LinkedIn et GitHub »). */}
      <figcaption>
        <a href={href} onClick={(e) => onLinkClick(e, href)}>
          {t.home.exampleCaption}
        </a>
        {pieces && pieces.length > 1 && <>, {t.home.exampleFrom(pieces.map((p) => pieceLabel(p, lang)).reduce((a, b) => t.result.pieces.pair(a, b)))}</>}
      </figcaption>
    </figure>
  );
}

const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Venu par l'ancre du top (« /#semaine », depuis le partage d'une fiche). */
const atWeekAnchor = () => window.location.hash.slice(1).split("?")[0] === WEEK_ANCHOR;

/**
 * L'accueil ouvert sur « /#semaine » : le tableau n'est pas à sa place à la première image (la
 * fiche d'exemple et la berline prennent leur hauteur ensuite). On y descend quand le top a
 * répondu, puis de nouveau quand les polices et la vitrine sont posées, tant que la personne n'a
 * pas défilé elle-même. Le titre du tableau arrive sous la barre du haut (scroll-margin-top).
 */
function useWeekAnchor(topKnown: boolean) {
  useEffect(() => {
    if (!topKnown || !atWeekAnchor()) return;
    let moved = false;
    const mine = () => {
      moved = true;
    };
    const go = () => {
      if (moved || !atWeekAnchor()) return;
      document.getElementById(WEEK_ANCHOR)?.scrollIntoView({ block: "start" });
    };
    const opts = { passive: true, once: true } as const;
    window.addEventListener("wheel", mine, opts);
    window.addEventListener("touchstart", mine, opts);
    window.addEventListener("keydown", mine, opts);
    const timers = [0, 300, 800, 1600].map((ms) => window.setTimeout(go, ms));
    void document.fonts?.ready.then(go);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("wheel", mine);
      window.removeEventListener("touchstart", mine);
      window.removeEventListener("keydown", mine);
    };
  }, [topKnown]);
}

export function Home() {
  const { t } = useT();
  const h = t.home;
  const inputRef = useRef<HTMLInputElement>(null);
  const showcase = useShowcase();
  const topKnown = useTopKnown();
  const mem = useMemory();
  // La ligne sous le titre (lib/season.ts) : l'entretien seulement si une prime est ouverte.
  const hook = homeHook(h, useAppConfig());
  // Revenu en plein film : la fiche existe, sa note attend la poursuite.
  const owed = !!mem.mine && filmOwed(mem.mine.id);
  useWeekAnchor(topKnown);

  useEffect(() => {
    document.title = t.meta.title;
  }, [t]);

  // Qui a déjà sa fiche (§18.52) : « Voir ma fiche » en rose, le formulaire replié sous « Faire une
  // autre fiche ». Il s'ouvre d'emblée quand un préremplissage l'attend (« Réessayer », pseudo inconnu).
  const [prefill] = useState(peekPrefill);
  const mineLogin = mem.mine?.login?.toLowerCase() ?? null;
  const direct = prefill?.direct && prefill.login ? prefill.login : null;
  const directIsMine = !!direct && direct.toLowerCase() === mineLogin;
  // Une connexion LinkedIn ou GitHub revient sur l'accueil : le formulaire est là pour dire où elle en est.
  const [open, setOpen] = useState(() => (!!prefill && !directIsMine) || returnPending());
  const returning = !!mem.mine && !owed && !mem.pending;
  // /<pseudo> d'un autre, pour qui a sa fiche : c'est une dénonciation (§18.52), avec ses gardes
  // (pas soi-même, la fiche part au nom du dénonciateur, aucun partage public), pas « Faire ma fiche ».
  const denounce = returning && !!direct && !!mineLogin && !directIsMine ? direct : null;
  useEffect(() => {
    // Le formulaire ne s'affiche pas pour ce pseudo-là : son préremplissage ne sert plus.
    if (prefill?.direct && (denounce || directIsMine)) dropPrefill(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toast = useMiniToast();

  /** « Faire une autre fiche » : le formulaire s'ouvre sur place, le champ prend le focus dans le geste. */
  const openForm = () => {
    flushSync(() => setOpen(true));
    inputRef.current?.focus({ preventScroll: true });
  };

  /** Une place libre, « Découvre le tien » : retour au champ du pseudo,
   * prêt à taper. Le focus se donne dans le geste, sinon l'iPhone n'ouvre pas le clavier. */
  const play = () => {
    const behavior: ScrollBehavior = reducedMotion() ? "auto" : "smooth";
    if (returning && !open && !denounce) flushSync(() => setOpen(true));
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
        <section className="hero">
          {/* Deux phrases (shared/promise.ts) : la première en lilas, la question en crème. */}
          <h1 className="hero-title">
            <span className="hero-title-claim">{h.titleClaim}</span>{" "}
            <span className="hero-title-proof">{h.titleProof}</span>
          </h1>
          {/* La promesse, sous le titre : ce qu'on obtient, avant de demander quoi que ce soit. */}
          {/* L'accueil se souvient : qui a déjà sa fiche (ou un dossier en cours) connaît la
              promesse ; la ligne qui y ramène prend sa place, le bouton ne descend pas. */}
          {denounce && mem.mine ? (
            <>
              <BackLine mine={mem.mine} pending={null} />
              <div className="home-denounce">
                <Suspense fallback={null}>
                  <Denounce cardId={mem.mine.id} selfLogin={mem.mine.login ?? undefined} toast={toast.show} initial={denounce} />
                </Suspense>
              </div>
            </>
          ) : returning && !open && mem.mine ? (
            <ReturnCall mine={mem.mine} onAnother={openForm} />
          ) : (
            <>
              {mem.mine || mem.pending ? <BackLine mine={mem.mine} pending={mem.pending} owed={owed} /> : <p className="hero-hook">{hook}</p>}
              <EntryForm inputRef={inputRef} />
            </>
          )}
        </section>
        {/* Le produit, dans le premier écran (§18.81) : la fiche d'exemple debout sur le crépuscule de l'aperçu de lien. */}
        <div className="home-stage">
          <div className="home-stage-in">
            <Sunset />
            <ExampleCard {...showcase} />
          </div>
        </div>
        {toast.node}
      </div>
      {/* La voiture, et la preuve que d'autres y sont : côte à côte au bureau. */}
      <div className="home-proof">
        {/* La caisse de la poursuite (§18.79) : la berline du film, sous la fiche d'exemple sur téléphone, à côté du top de la semaine au bureau ; l'accueil n'a pas de film. */}
        <Spin ready place="home" />
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
