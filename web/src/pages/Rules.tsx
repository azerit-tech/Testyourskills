// /reglement : le règlement de la saison, servi par /api/rules seulement quand
// data/season.json le publie. Le texte français fait foi ; en anglais, une
// courte note le dit au-dessus du texte français. Rendu d'un Markdown réduit :
// titres, paragraphes, listes sur deux niveaux, gras. Rien d'autre n'est interprété.
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useT } from "../i18n";
import { isMock } from "../lib/api";
import { parseRules, type Block } from "../lib/rulesMd";
import "../components/primes.css";

/** Le gras (**…**), seul style du texte. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

function RulesBlock({ b }: { b: Block }) {
  if (b.kind === "h") {
    const H = b.level === 1 ? "h1" : b.level === 2 ? "h2" : "h3";
    return <H>{inline(b.text)}</H>;
  }
  if (b.kind === "p") return <p>{inline(b.text)}</p>;
  const L = b.kind;
  return (
    <L>
      {b.items.map((x, j) => (
        <li key={j}>
          {inline(x.text)}
          {x.sub.length > 0 && (
            <ul>
              {x.sub.map((s, k) => (
                <li key={k}>{inline(s)}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </L>
  );
}

export function Rules() {
  const { t, lang } = useT();
  const tr = t.primes.rules;
  const [text, setText] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    document.title = tr.title;
  }, [tr.title]);

  useEffect(() => {
    if (isMock()) {
      setText(null);
      return;
    }
    let alive = true;
    fetch("/api/rules", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<{ text: string }>) : null))
      .then((b) => alive && setText(b?.text ?? null))
      .catch(() => alive && setText(null));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="page page-rules" id="main" aria-busy={text === undefined}>
      <article className="rules" lang="fr">
        {lang === "en" && (
          <p className="rules-en" lang="en">
            {tr.enNote}
          </p>
        )}
        {text === null && <p className="primes-empty">{tr.error}</p>}
        {text && parseRules(text).map((b, i) => <RulesBlock key={i} b={b} />)}
      </article>
    </main>
  );
}
