// « Voir tout le classement (27) » sous un tableau de l'accueil (§18.126) : le top de la
// semaine et chaque ligue de bandes. Le bouton n'est là que si le classement compte plus
// de lignes que le tableau n'en montre. Touché, le classement s'ouvre sur place, sans
// changer de page : les lignes suivantes, lues par pages de 50, la suivante quand on
// approche du bas ou sur « Voir plus » ; « Réduire » le referme et ramène au bouton.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { BusyDots } from "./Busy";

/** Lignes lues par appel. */
export const SEE_ALL_PAGE = 50;

/** Une page : les lignes, et le nombre de lignes du classement entier. */
export type SeeAllPage<T> = { total: number; rows: T[] } | null;

export interface SeeAllState<T> {
  open: boolean;
  /** Les lignes lues, après celles du tableau. */
  rows: T[];
  busy: boolean;
  /** Tout est lu. */
  done: boolean;
  total: number;
  toggle: () => void;
  more: () => void;
}

/**
 * L'état du classement ouvert. `head` : les lignes que le tableau montre déjà ; `total` :
 * celles du classement ; `load(offset, limit)` : la page qui suit les `offset` premières.
 * `initial` : déjà ouvert sur ces lignes (les tests, rendus en chaîne).
 */
export function useSeeAll<T>(
  head: number,
  total: number,
  load: (offset: number, limit: number) => Promise<SeeAllPage<T>>,
  initial?: { open: boolean; rows: T[] },
): SeeAllState<T> {
  const [open, setOpen] = useState(initial?.open ?? false);
  const [rows, setRows] = useState<T[]>(initial?.rows ?? []);
  const [busy, setBusy] = useState(false);
  const [known, setKnown] = useState(total);
  // Une page à la fois ; l'appel lit l'état du moment, pas celui de son rendu.
  const flight = useRef(false);
  const read = useRef({ rows, known, open });
  read.current = { rows, known, open };

  const more = useCallback(() => {
    const { rows: got, known: all } = read.current;
    const offset = head + got.length;
    if (flight.current || offset >= all) return;
    flight.current = true;
    setBusy(true);
    load(offset, SEE_ALL_PAGE)
      .catch(() => null)
      .then((p) => {
        if (!p) return;
        // Une page vide clôt la liste : le classement a raccourci entre deux lectures.
        setKnown(p.rows.length ? p.total : offset);
        setRows((cur) => (head + cur.length === offset ? [...cur, ...p.rows] : cur));
      })
      .finally(() => {
        flight.current = false;
        setBusy(false);
      });
  }, [head, load]);

  const toggle = useCallback(() => {
    const opening = !read.current.open;
    setOpen(opening);
    if (opening && read.current.rows.length === 0) more();
  }, [more]);

  return { open, rows, busy, done: head + rows.length >= known, total: known, toggle, more };
}

/**
 * Le bouton, et ouvert : les lignes (`children`), « Voir plus » tant qu'il en reste, « Réduire ».
 * Sans état à soi : `useSeeAll` le tient (les tests le rendent ouvert, en chaîne).
 */
export function SeeAllView({ state, children }: { state: Omit<SeeAllState<unknown>, "rows">; children?: ReactNode }) {
  const { t } = useT();
  const ts = t.home.seeAll;
  const { open, busy, done, total, toggle, more } = state;
  const opener = useRef<HTMLButtonElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);

  // Refermé : on revient au bouton, qui est remonté sous le tableau.
  useEffect(() => {
    if (wasOpen.current && !open) {
      opener.current?.focus({ preventScroll: true });
      opener.current?.scrollIntoView?.({ block: "nearest" });
    }
    wasOpen.current = open;
  }, [open]);

  // La page suivante quand le bas de la liste approche.
  useEffect(() => {
    const el = sentinel.current;
    if (!open || done || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((seen) => seen.some((s) => s.isIntersecting) && more(), { rootMargin: "0px 0px 600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [open, done, more]);

  if (!open) {
    return (
      <button ref={opener} type="button" className="pill board-all" onClick={toggle} aria-expanded={false}>
        {ts.open(total)}
      </button>
    );
  }
  return (
    <>
      {children}
      {!done && (
        <>
          <div ref={sentinel} aria-hidden />
          <button type="button" className="pill board-all" onClick={more} disabled={busy} aria-busy={busy || undefined}>
            {ts.more}
            {busy && <BusyDots />}
          </button>
        </>
      )}
      <button type="button" className="link-quiet board-less" onClick={toggle} aria-expanded>
        {ts.close}
      </button>
    </>
  );
}
