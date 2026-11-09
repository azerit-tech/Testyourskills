// Confidentialité (§11), courte, FR et EN.
import { useEffect } from "react";
import { useT } from "../i18n";
import { onLinkClick } from "../lib/router";

export function Privacy() {
  const { t } = useT();
  const p = t.privacy;
  useEffect(() => {
    document.title = `${p.title} · Testyourskills`;
  }, [p.title]);
  return (
    <main className="page page-prose" id="main">
      <article className="prose">
        <a className="link-back" href="/" onClick={(e) => onLinkClick(e, "/")}>
          ← {t.common.back}
        </a>
        <h1>{p.title}</h1>
        <p className="prose-intro">{p.intro}</p>
        {p.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            <p>{s.p}</p>
          </section>
        ))}
        <p className="prose-contact">{p.contact}</p>
      </article>
    </main>
  );
}

export function NotFound() {
  const { t } = useT();
  return (
    <main className="page page-card" id="main">
      <div className="panel-center error-panel">
        <h1>{t.notFound.title}</h1>
        <p>{t.notFound.text}</p>
        <a className="btn-primary" href="/" onClick={(e) => onLinkClick(e, "/")}>
          {t.notFound.home}
        </a>
      </div>
    </main>
  );
}
