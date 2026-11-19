// Les suggestions sous un champ (SPEC §18.80) : on tape un nom (ou un pseudo), des
// personnes sortent dessous avec leur photo, on en touche une et la fiche part.
// Profils LinkedIn, comptes GitHub, ou les deux mêlés (dénoncer un complice).
// La liste se pose dans le `.field` du champ, qui la porte sous lui.
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { SUGGEST_DEBOUNCE_MS, SUGGEST_MIN_CHARS } from "../../../shared/entry";
import type { GithubSuggestion, LinkedinSuggestion } from "../../../shared/entry";
import { searchGithub, searchLinkedin } from "../lib/entryApi";

export type Suggestion =
  | { kind: "linkedin"; key: string; title: string; sub: string; photo?: string; url: string }
  | { kind: "github"; key: string; title: string; sub: string; photo?: string; login: string };

export const fromLinkedin = (p: LinkedinSuggestion): Suggestion => ({ kind: "linkedin", key: `li:${p.url}`, title: p.name, sub: p.headline, photo: p.photo, url: p.url });
export const fromGithub = (a: GithubSuggestion): Suggestion => ({ kind: "github", key: `gh:${a.login}`, title: a.name ?? a.login, sub: `@${a.login}`, photo: a.avatarUrl || undefined, login: a.login });

/** Ce qui se cherche : pas une adresse (elle se lit telle quelle), et assez de frappes. */
function searchable(raw: string): string | null {
  const q = raw.trim().replace(/\s+/g, " ");
  if (q.length < SUGGEST_MIN_CHARS || q.length > 60 || /[/:]|\.com\b/i.test(q)) return null;
  return q;
}
/** Un prénom et un nom : la recherche LinkedIn est payée à l'appel, elle attend les deux. */
const fullName = (q: string) => /^\S{2,}\s+\S{2,}/.test(q) && !q.startsWith("@");

/** Lignes montrées : cinq d'une source ; mêlées, trois de chaque, GitHub d'abord. */
const MAX_ONE = 5;
const MAX_EACH = 3;

export interface SuggestSources {
  linkedin?: boolean;
  github?: boolean;
}

/**
 * Les suggestions du champ, 400 ms après la dernière frappe. `pause` : rien ne se
 * cherche (formulaire occupé). La réponse d'une frappe dépassée est jetée.
 */
export function useSuggestions(value: string, sources: SuggestSources, pause = false): Suggestion[] {
  const [items, setItems] = useState<Suggestion[]>([]);
  /** La recherche LinkedIn s'est dite éteinte (plafond, panne) : on ne la redemande plus sur cette page. */
  const liOff = useRef(false);
  const q = pause ? null : searchable(value);
  const li = !!sources.linkedin;
  const gh = !!sources.github;
  useEffect(() => {
    // Rien à chercher : la liste part. Sinon les lignes d'avant restent jusqu'aux suivantes, sans clignoter.
    if (!q) {
      setItems((prev) => (prev.length ? [] : prev));
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      const wantLi = li && !liOff.current && fullName(q);
      void Promise.all([
        gh ? searchGithub(q, ctrl.signal) : Promise.resolve([]),
        wantLi ? searchLinkedin(q, ctrl.signal) : Promise.resolve({ results: [], off: false }),
      ]).then(([accounts, people]) => {
        if (ctrl.signal.aborted) return;
        if (people.off) liOff.current = true;
        const both = li && gh;
        setItems([...accounts.slice(0, both ? MAX_EACH : MAX_ONE).map(fromGithub), ...people.results.slice(0, both ? MAX_EACH : MAX_ONE).map(fromLinkedin)]);
      });
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, li, gh]);
  return items;
}

/** La photo d'une ligne, sinon son initiale sur un rond d'encre (photo absente, refusée ou expirée). */
export function Face({ src, name }: { src?: string; name: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (src && !broken) return <img className="suggest-face" src={src} alt="" width={36} height={36} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  return (
    <i className="suggest-face" aria-hidden>
      {[...name.replace(/[^\p{L}\p{N}]/gu, "")][0]?.toUpperCase() ?? "?"}
    </i>
  );
}

/** Une ligne : photo, nom, puis le titre du profil ou le pseudo. `tag` : d'où elle vient, dans une liste mêlée. */
export function SuggestRow({ item, tag }: { item: Suggestion; tag?: boolean }) {
  return (
    <>
      <Face src={item.photo} name={item.title} />
      <span className="suggest-text">
        <b>{item.title}</b>
        {item.sub && <span>{item.sub}</span>}
      </span>
      {tag && <span className="suggest-src">{item.kind === "linkedin" ? "LinkedIn" : "GitHub"}</span>}
    </>
  );
}

interface BoxOptions {
  id: string;
  items: Suggestion[];
  onPick: (item: Suggestion) => void;
  /** Liste mêlée : chaque ligne dit sa source. */
  mixed?: boolean;
  label: string;
}

/**
 * La liste et le clavier d'un champ à suggestions (combobox ARIA) : flèches,
 * Entrée sur la ligne choisie, Échap. `inputProps` va sur le champ, `list` dans
 * son `.field`. `onKeyDown` rend true quand la touche a été prise.
 */
export function useSuggestBox({ id, items, onPick, mixed, label }: BoxOptions) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // De nouvelles lignes : la liste s'ouvre, aucune n'est choisie d'avance.
  useEffect(() => {
    setActive(-1);
    setOpen(items.length > 0);
  }, [items]);
  const shown = open && items.length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): boolean => {
    if (!items.length) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const down = e.key === "ArrowDown";
      setActive((a) => (!shown ? 0 : down ? (a + 1) % items.length : a <= 0 ? items.length - 1 : a - 1));
      return true;
    }
    if (e.key === "Enter" && shown && active >= 0) {
      e.preventDefault();
      onPick(items[active]!);
      return true;
    }
    if (e.key === "Escape" && shown) {
      e.preventDefault();
      setOpen(false);
      return true;
    }
    return false;
  };

  const list = shown && (
    // Un appui sur la liste ne retire pas le focus du champ : la ligne touchée reçoit bien son clic.
    <ul id={id} className="suggest" role="listbox" aria-label={label} onMouseDown={(e) => e.preventDefault()}>
      {items.map((item, i) => (
        <li key={item.key} id={`${id}-${i}`} role="option" aria-selected={i === active} className={i === active ? "is-active" : undefined} onClick={() => onPick(item)} onMouseEnter={() => setActive(i)}>
          <SuggestRow item={item} tag={mixed} />
        </li>
      ))}
    </ul>
  );

  return {
    list,
    shown,
    /** Rouvre la liste (l'envoi d'un nom sans ligne choisie). */
    show: () => setOpen(true),
    close: () => setOpen(false),
    onKeyDown,
    inputProps: {
      role: "combobox" as const,
      "aria-autocomplete": "list" as const,
      "aria-expanded": shown,
      "aria-controls": shown ? id : undefined,
      "aria-activedescendant": shown && active >= 0 ? `${id}-${active}` : undefined,
    },
  };
}
