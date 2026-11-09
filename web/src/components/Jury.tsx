// Le jury de la page partagée (SPEC §18.27) : « Coupable ou relaxe ? ». Un geste
// à un toucher pour le visiteur, avant « Et toi ? ». Le vote porte sur le chef
// d'accusation de la fiche, jamais sur la personne (principe 4) : deux boutons,
// un décompte, aucun autre texte. Le serveur garde un vote par fiche et par IP.
import { useEffect, useRef, useState } from "react";
import type { CardData, Lang } from "../../../shared/types";
import { pick, useT } from "../i18n";
import { api, ApiError, type Jury as Tally, type Verdict } from "../lib/api";
import { useReducedMotion } from "../lib/util";

/** Le temps de lire le décompte avant que la page ne descende vers « Et toi ? ». */
const SCROLL_AFTER_MS = 1100;

/** Le chef d'accusation le plus parlant : un écart ou un négatif d'abord. */
function topCharge(card: CardData, lang: Lang): string | null {
  const order = ["gap", "negative", "special", "positive"];
  const s = [...card.statuses].sort((a, b) => order.indexOf(a.tone) - order.indexOf(b.tone))[0];
  return s ? pick(s.label, lang) : null;
}

// Votes posés depuis ce navigateur : l'IP d'un téléphone change, le décompte reste affiché.
const VOTED_KEY = "tys_votes";
const memVoted = new Map<string, Verdict>();

function votedHere(cardId: string): Verdict | null {
  const mem = memVoted.get(cardId);
  if (mem) return mem;
  try {
    const all = JSON.parse(localStorage.getItem(VOTED_KEY) ?? "{}") as Record<string, unknown> | null;
    const v = all?.[cardId];
    return v === "guilty" || v === "cleared" ? v : null;
  } catch {
    return null;
  }
}

function rememberVote(cardId: string, verdict: Verdict) {
  memVoted.set(cardId, verdict);
  try {
    const raw = JSON.parse(localStorage.getItem(VOTED_KEY) ?? "{}") as Record<string, unknown> | null;
    const entries = Object.entries(raw && typeof raw === "object" ? raw : {}).filter(([id]) => id !== cardId);
    localStorage.setItem(VOTED_KEY, JSON.stringify(Object.fromEntries([...entries.slice(-99), [cardId, verdict]])));
  } catch {
    /* stockage bloqué : la RAM suffit pour cette visite */
  }
}

/** « 73 % coupable · 41 votes », ou null sans aucun vote. */
function useTally(jury: Tally | null): { pct: number; text: string } | null {
  const { t } = useT();
  const total = jury ? jury.guilty + jury.cleared : 0;
  if (!jury || total === 0) return null;
  const pct = Math.round((jury.guilty * 100) / total);
  return { pct, text: t.jury.tally(pct, total) };
}

interface Props {
  cardId: string;
  /** La fiche jugée ; pour une comparaison, sa carte GitHub. */
  card: CardData;
  /** Décompte lu avec /case ; null tant qu'il charge. */
  jury: Tally | null;
  toast: (m: string) => void;
}

export function Jury({ cardId, card, jury, toast }: Props) {
  const { t, lang } = useT();
  const reduced = useReducedMotion();
  const [tally, setTally] = useState<Tally | null>(jury);
  const [busy, setBusy] = useState(false);
  const timer = useRef(0);

  useEffect(() => setTally(jury), [jury]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const charge = topCharge(card, lang);
  const shown = useTally(tally);
  const voted = !!shown && !!(tally?.mine ?? votedHere(cardId));

  const onVote = async (verdict: Verdict) => {
    if (busy || !tally) return;
    const before = tally;
    setBusy(true);
    // Le décompte sort tout de suite ; la réponse du serveur le corrige.
    setTally({ ...before, [verdict]: before[verdict] + 1, mine: verdict });
    try {
      const next = await api.vote(cardId, verdict);
      setTally(next);
      rememberVote(cardId, next.mine ?? verdict);
      timer.current = window.setTimeout(() => {
        document.getElementById("you")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      }, SCROLL_AFTER_MS);
    } catch (e) {
      setTally(before);
      toast(e instanceof ApiError && e.fact ? pick(e.fact, lang) : t.jury.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="jury" aria-labelledby="jury-title">
      <h2 id="jury-title">{charge ? t.jury.titleCharge(charge) : t.jury.title}</h2>
      {voted ? (
        <div className="jury-result" role="status">
          <JuryBar jury={tally!} />
          <p className="jury-tally">{shown.text}</p>
        </div>
      ) : (
        <div className="jury-choices">
          <button type="button" className="pill" disabled={busy || !tally} onClick={() => void onVote("guilty")}>
            {t.jury.guilty}
          </button>
          <button type="button" className="pill pill-ghost" disabled={busy || !tally} onClick={() => void onVote("cleared")}>
            {t.jury.cleared}
          </button>
        </div>
      )}
    </section>
  );
}

/** La barre plate : un aplat par verdict, à sa part des votes. */
function JuryBar({ jury }: { jury: Tally }) {
  return (
    <div className="jury-bar" aria-hidden>
      <span className="is-guilty" style={{ flexGrow: jury.guilty }} />
      <span className="is-cleared" style={{ flexGrow: jury.cleared }} />
    </div>
  );
}

/** Pour qui a fait la fiche : « Le jury : 73 % coupable · 41 votes », à partir d'un vote. */
export function JuryLine({ jury }: { jury: Tally | null }) {
  const { t } = useT();
  const shown = useTally(jury);
  if (!shown) return null;
  return <p className="jury-line">{t.jury.owner(shown.text)}</p>;
}
