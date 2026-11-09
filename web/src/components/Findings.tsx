// L'enquête en direct (SPEC §18.26) : une trouvaille, son chiffre clé en rose
// poudré ; et, sous la fiche, « Le dossier » : les trois plus fortes, chacune
// cliquable vers sa preuve publique.
import type { CardData, Finding, Lang } from "../../../shared/types";
import { pick, useT } from "../i18n";

/** La phrase, avec le chiffre clé mis en avant s'il s'y lit tel quel. */
export function FindingText({ finding, lang }: { finding: Finding; lang: Lang }) {
  const text = pick(finding.text, lang);
  const key = finding.key ? pick(finding.key, lang) : "";
  const i = key ? text.indexOf(key) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <strong className="finding-key">{key}</strong>
      {text.slice(i + key.length)}
    </>
  );
}

/** Seules les preuves publiques sur GitHub ou LinkedIn deviennent des liens. */
function safeProof(url: string): string | null {
  return /^https:\/\/(github\.com|www\.linkedin\.com)\//.test(url) ? url : null;
}

export function Dossier({ card }: { card: CardData }) {
  const { t, lang } = useT();
  const list = (card.findings ?? []).slice(0, 3);
  if (!list.length) return null;
  const d = t.result.dossier;
  return (
    <section className="after-block dossier" aria-labelledby="dossier-title">
      <h2 id="dossier-title">{d.title}</h2>
      <ol className="dossier-list">
        {list.map((f, i) => {
          const href = safeProof(f.proof);
          const body = (
            <>
              <span className="piece-no">{t.waiting.piece(i + 1)}</span>
              <span className="dossier-text">
                <FindingText finding={f} lang={lang} />
              </span>
              {href && (
                <span className="dossier-proof">
                  {d.proof}
                  <span aria-hidden> ↗</span>
                </span>
              )}
            </>
          );
          return (
            <li key={`${f.source}:${f.kind}`}>
              {href ? (
                <a className="dossier-item" href={href} target="_blank" rel="noopener noreferrer">
                  {body}
                </a>
              ) : (
                <div className="dossier-item">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
