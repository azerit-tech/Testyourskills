// Les crédits (/credits), FR et EN, à la mise en page de la vie privée : un résumé en tête,
// puis les modèles du film par décor, une ligne par élément, chaque auteur en lien vers
// son modèle (l'adresse ne s'affiche pas). Textes : pagesText.ts, sous `t.pages.credits`.
// Le même contenu reste servi en texte brut (web/public/credits.txt).
import { useEffect } from "react";
import { useT } from "../i18n";
import type { CreditLine } from "../pagesText";
import { onLinkClick } from "../lib/router";

const CC_BY = "https://creativecommons.org/licenses/by/4.0/";

/** Une liste de crédits : ce que c'est, puis ses auteurs. Un même auteur pour deux modèles : « (2) » au second lien. */
function Lines({ lines }: { lines: CreditLine[] }) {
  return (
    <ul className="credits-list">
      {lines.map((l) => (
        <li key={l.what}>
          <span className="credits-what">{l.what}</span>
          <span className="credits-by">
            {l.by.map((b, i) => {
              const nth = l.by.slice(0, i + 1).filter((x) => x.name === b.name).length;
              return (
                <a key={b.href} href={b.href} target="_blank" rel="noopener">
                  {nth > 1 ? `${b.name} (${nth})` : b.name}
                </a>
              );
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Credits() {
  const { t } = useT();
  const c = t.pages.credits;
  useEffect(() => {
    document.title = t.meta.titlePage(c.title);
  }, [t, c.title]);
  return (
    <main className="page page-prose" id="main">
      <article className="prose credits">
        <a className="link-back" href="/" onClick={(e) => onLinkClick(e, "/")}>
          ← {t.common.back}
        </a>
        <h1>{c.title}</h1>
        <section className="block block-info prose-summary" aria-labelledby="credits-summary-title">
          <h2 className="label" id="credits-summary-title">
            {c.summaryTitle}
          </h2>
          <ul>
            {c.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <section>
          <h2>{c.film}</h2>
          <p>{c.filmText}</p>
          <p>
            {c.filmLicense}{" "}
            <a href={CC_BY} target="_blank" rel="noopener">
              CC BY 4.0
            </a>
            .
          </p>
          {c.groups.map((g) => (
            <div key={g.h} className="credits-group">
              <h3 className="label">{g.h}</h3>
              <Lines lines={g.lines} />
            </div>
          ))}
        </section>
        <section>
          <h2>{c.restTitle}</h2>
          <p>{c.restText}</p>
          <Lines lines={c.rest} />
        </section>
        <section>
          <h2>{c.former}</h2>
          <p>
            {c.formerText}{" "}
            <a href="/3d/CREDITS.txt" target="_blank" rel="noopener">
              CREDITS.txt
            </a>
            .
          </p>
        </section>
        <p className="prose-contact">
          {c.raw}{" "}
          <a className="link-alt" href="/credits.txt" target="_blank" rel="noopener">
            credits.txt
          </a>
        </p>
      </article>
    </main>
  );
}
