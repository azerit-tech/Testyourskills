// Vie privée (§11), FR et EN : un résumé en tête, puis des sections courtes,
// paragraphes et listes (textes : pagesText.ts, sous `t.pages.privacy`).
// L'adresse de contact est un lien.
import { useEffect } from "react";
import { CONTACT_EMAIL, useT } from "../i18n";
import { onLinkClick } from "../lib/router";

export function Privacy() {
  const { t } = useT();
  const p = t.pages.privacy;
  const title = t.privacy.title;
  useEffect(() => {
    document.title = t.meta.titlePage(title);
  }, [t, title]);
  return (
    <main className="page page-prose" id="main">
      <article className="prose">
        <a className="link-back" href="/" onClick={(e) => onLinkClick(e, "/")}>
          ← {t.common.back}
        </a>
        <h1>{title}</h1>
        <section className="block block-info prose-summary" aria-labelledby="privacy-summary-title">
          <h2 className="label" id="privacy-summary-title">
            {p.summaryTitle}
          </h2>
          <ul>
            {p.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        {p.sections(CONTACT_EMAIL).map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.blocks.map((b, i) =>
              typeof b === "string" ? (
                <p key={i}>{b}</p>
              ) : (
                <ul key={i}>
                  {b.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ),
            )}
          </section>
        ))}
        <p className="prose-contact">
          {p.contact}{" "}
          <a className="link-alt" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </article>
    </main>
  );
}
