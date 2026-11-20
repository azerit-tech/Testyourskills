// « J'ai trouvé ton GitHub » / « J'ai trouvé ton LinkedIn » (SPEC §18.113) : l'autre
// source trouvée avant le jugement, dite et non demandée. Le visage, le compte, puis la
// phrase ; une barre fine se remplit en trois secondes et la fiche part d'elle-même.
// « Ce n'est pas moi » l'arrête. Le compte à rebours ne part qu'une fois la ligne à
// l'écran, s'arrête onglet caché ; mouvement réduit : la même attente, la barre fixe.
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useT } from "../i18n";
import { AUTO_CONFIRM_MS, startCountdown } from "../lib/countdown";
import type { LinkedinSuggestion } from "../../../shared/entry";
import { useAvatar } from "../card/avatar";
import { BusyDots } from "./Busy";
import { IconLinkedIn } from "./Icons";

interface Props {
  face: ReactNode;
  /** Le compte : `@pseudo` (un lien vers son profil) ou le nom du profil. */
  who: ReactNode;
  /** Son nom public, ou le titre du profil. */
  sub?: string | null;
  /** Ce que lit un lecteur d'écran à la place du compte (`@camroux, Camille Roux`). */
  spoken: string;
  /** « J'ai trouvé ton GitHub ». */
  statement: string;
  onConfirm: () => void;
  onNotMe: () => void;
  busy: boolean;
}

export function FoundConfirm({ face, who, sub, spoken, statement, onConfirm, onNotMe, busy }: Props) {
  const { t } = useT();
  const f = t.home.found;
  const uid = useId().replace(/:/g, "");
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"wait" | "run" | "paused" | "done">("wait");
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;
  const stopRef = useRef<() => void>(() => {});

  // Sous une fiche, « À ton tour » est plus bas que l'écran : la ligne y vient.
  useEffect(() => ref.current?.scrollIntoView({ block: "center" }), []);
  // À l'écran d'abord (une image peinte), puis les trois secondes.
  useEffect(() => {
    let countdown: { cancel(): void } | null = null;
    const raf = requestAnimationFrame(() => {
      countdown = startCountdown(
        AUTO_CONFIRM_MS,
        () => {
          setState("done");
          confirmRef.current();
        },
        (paused) => setState(paused ? "paused" : "run"),
      );
    });
    stopRef.current = () => {
      cancelAnimationFrame(raf);
      countdown?.cancel();
    };
    return () => stopRef.current();
  }, []);

  return (
    <section ref={ref} className="gh-ask found" aria-labelledby={`${uid}-s`}>
      <div className="propose-who">
        {face}
        <p className="propose-text">
          {who}
          {sub && <span className="propose-sub">{sub}</span>}
        </p>
      </div>
      <h2 id={`${uid}-s`} className="gh-ask-q">
        {statement}
        {busy && <BusyDots />}
      </h2>
      <span className={`found-bar is-${state}`} aria-hidden="true">
        <span className="found-fill" style={{ animationDuration: `${AUTO_CONFIRM_MS}ms` }} />
      </span>
      <p className="sr-only" role="status">
        {state === "wait" ? "" : `${statement} : ${spoken}. ${state === "done" ? "" : f.soon}`}
      </p>
      <button
        type="button"
        className="link-quiet found-no"
        disabled={busy || state === "done"}
        onClick={() => {
          stopRef.current();
          onNotMe();
        }}
      >
        {f.notMe}
      </button>
    </section>
  );
}

/** Au retour de GitHub : son LinkedIn trouvé (§18.113), la photo si la recherche en donne une, le nom et le titre. */
export function LinkedinFound({ found, busy, onConfirm, onNotMe }: { found: LinkedinSuggestion; busy: boolean; onConfirm: () => void; onNotMe: () => void }) {
  const { t } = useT();
  const photo = useAvatar(found.photo ?? null);
  return (
    <FoundConfirm
      face={<span className="propose-face is-linkedin">{photo === "photo" && found.photo ? <img src={found.photo} alt="" width={44} height={44} /> : <IconLinkedIn />}</span>}
      who={
        // Le profil s'ouvre dans un nouvel onglet (§18.108), l'onglet caché met l'attente en pause.
        <a className="propose-name" href={found.url} target="_blank" rel="noopener noreferrer">
          {found.name}
        </a>
      }
      sub={found.headline || null}
      spoken={[found.name, found.headline].filter(Boolean).join(", ")}
      statement={t.home.found.linkedin}
      busy={busy}
      onConfirm={onConfirm}
      onNotMe={onNotMe}
    />
  );
}
