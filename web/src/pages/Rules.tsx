// /reglement : le règlement de la saison, servi par /api/rules seulement quand
// data/season.json le publie. En tête : un retour, le titre, un résumé en trois
// lignes, puis un sommaire d'ancres (les articles) ; le texte tient dans une
// colonne de lecture. Le texte français fait foi ; en anglais, le résumé et une
// note le disent au-dessus du texte français. Rendu d'un Markdown réduit :
// titres, paragraphes, listes sur deux niveaux, gras. Rien d'autre n'est interprété.
// Pas publié : page introuvable ; serveur muet : « le commissariat ne répond pas ».
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { NotFound, Unreachable } from "../components/ErrorPage";
import { useT } from "../i18n";
import { isMock } from "../lib/api";
import { ApiError } from "../lib/errors";
import { useRemote } from "../lib/remote";
import { onLinkClick } from "../lib/router";
import { parseRules, type Block } from "../lib/rulesMd";
import { useAppConfig } from "../lib/season";
import "../components/primes.css";

/** Le gras (**…**), seul style du texte. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

/** Le texte d'un titre sans ses marques de gras, pour le sommaire. */
const plain = (text: string) => text.replace(/\*\*/g, "");

/** L'ancre du n-ième article. */
export const ruleAnchor = (n: number) => `article-${n}`;

export interface RulesDoc {
  /** Le titre du document (son premier titre de niveau 1), s'il en a un. */
  title: string | null;
  /** Les articles (titres de niveau 2), dans l'ordre : le sommaire. */
  toc: { id: string; text: string }[];
  /** Le corps, sans le titre ; chaque article porte son ancre. */
  body: { b: Block; id?: string }[];
}

/** Le règlement découpé pour la page : titre, sommaire, corps ancré. */
export function rulesDoc(md: string): RulesDoc {
  const doc: RulesDoc = { title: null, toc: [], body: [] };
  for (const b of parseRules(md)) {
    if (b.kind === "h" && b.level === 1 && doc.title === null && doc.body.length === 0) {
      doc.title = plain(b.text);
      continue;
    }
    if (b.kind === "h" && b.level === 2) {
      const id = ruleAnchor(doc.toc.length + 1);
      doc.toc.push({ id, text: plain(b.text) });
      doc.body.push({ b, id });
      continue;
    }
    doc.body.push({ b });
  }
  return doc;
}

function RulesBlock({ b, id }: { b: Block; id?: string }) {
  if (b.kind === "h") {
    const H = b.level === 1 ? "h1" : b.level === 2 ? "h2" : "h3";
    return <H id={id}>{inline(b.text)}</H>;
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

/** Le texte du règlement ; null s'il n'est pas publié ; une panne remonte en erreur. */
async function loadRules(): Promise<string | null> {
  if (isMock()) return null;
  let res: Response;
  try {
    res = await fetch("/api/rules", { headers: { Accept: "application/json" } });
  } catch {
    throw new ApiError(0, "network", null);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, "internal", null);
  return ((await res.json()) as { text: string }).text;
}

export function Rules() {
  const { t, lang } = useT();
  const tr = t.primes.rules;
  const rp = t.primes.rulesPage;
  const cfg = useAppConfig();
  const text = useRemote<string>(loadRules, []);
  const doc = useMemo(() => (text.s === "ok" ? rulesDoc(text.data) : null), [text]);

  useEffect(() => {
    document.title = t.meta.titlePage(tr.title);
  }, [t, tr.title]);

  if (text.s === "down") return <Unreachable />;
  if (text.s === "none") return <NotFound />;
  if (!doc) return <main className="page page-rules" id="main" aria-busy />;

  // On vient d'une prime pour vérifier un point : le retour y ramène.
  const back = cfg?.primesListed ? { href: "/primes", label: t.primes.page.all } : { href: "/", label: t.pages.error.down.home };
  const jump = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    // le clavier et le lecteur d'écran suivent le saut
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    window.history.replaceState(window.history.state, "", `#${id}`);
  };

  return (
    <main className="page page-rules" id="main">
      <div className="rules-page">
        <header className="rules-top">
          <a className="link-back" href={back.href} onClick={(e) => onLinkClick(e, back.href)}>
            ← {back.label}
          </a>
          <h1 lang="fr">{doc.title ?? tr.title}</h1>
          <section className="block block-info rules-summary" aria-labelledby="rules-summary-title">
            <h2 className="label" id="rules-summary-title">
              {rp.summaryTitle}
            </h2>
            <ol>
              {rp.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
            {lang === "en" && rp.binding && (
              <p className="rules-binding" lang="en">
                {rp.binding}
              </p>
            )}
          </section>
        </header>
        {doc.toc.length > 1 && (
          <nav className="block block-info rules-toc" aria-labelledby="rules-toc-title">
            <h2 className="label" id="rules-toc-title">
              {rp.toc}
            </h2>
            <ol lang="fr">
              {doc.toc.map((x) => (
                <li key={x.id}>
                  <a href={`#${x.id}`} onClick={jump(x.id)}>
                    {x.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <article className="rules" lang="fr">
          {doc.body.map((x, i) => (
            <RulesBlock key={i} b={x.b} id={x.id} />
          ))}
        </article>
      </div>
    </main>
  );
}
