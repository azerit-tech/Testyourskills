// « Voici comment un recruteur d'Azerit te lit » (docs/bareme-recrutement.md §6,
// version (a) ; SPEC §18.37) : sous la fiche, les huit critères du barème, chacun
// une note sur 10 en dix segments, son coefficient, sa pièce et sa source ; un
// appui déplie la table des niveaux, le niveau atteint surligné, et ce qui
// manque pour le suivant. Puis la note sur 100, moyenne pondérée, et la règle
// qui a joué. Avec les deux sources : trois colonnes (LinkedIn · GitHub ·
// retenu), les recoupements en tête, et la note du dossier.
// Hors de la révélation : le bloc se pose avec l'après-fiche, sans animation.
// Fiche sans grille (d'avant 0.4.0) : rien.
import { useId, useState } from "react";
import { dec, usableGrid } from "../../../shared/gridText";
import type { DeclaredSource, Grid, GridCriterion } from "../../../shared/types";
import { CRITERION_CODES, declaredOf } from "../../../shared/types";
import { pick, useT, type Dict } from "../i18n";
import { crossChecks, finalLines, GRID_WEIGHTS, hasColumns, keptFrom, levelTable, reachedRow, rowText, stateTags } from "../lib/grid";
import type { Shareable } from "./After";

type G = Dict["grid"];

const Chevron = () => (
  <svg className="rg-chevron" viewBox="0 0 24 24" aria-hidden>
    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Dix segments : allumés jusqu'à la note ; au-delà de 6, fermés pour un critère déclaré (« la sixième se prouve »). Lue « 7 sur 10 ». */
function Gauge({ c, g }: { c: GridCriterion; g: G }) {
  const n = c.score ?? 0;
  const cap = c.state === "declared" ? 6 : 10;
  return (
    <span className={`rg-gauge is-${c.score === null ? "none" : c.state}`} role="img" aria-label={c.score === null ? g.gaugeNone : g.gauge(c.score)}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < n ? "on" : i >= cap ? "locked" : undefined} />
      ))}
    </span>
  );
}

interface RowProps {
  c: GridCriterion;
  grid: Grid;
  declared: DeclaredSource;
  shared: boolean;
  columns: boolean;
  /** Comparaison : les chefs d'accusation de la stack sont déjà dans les recoupements. */
  skipFlags: boolean;
}

function Row({ c, grid, declared, shared, columns, skipFlags }: RowProps) {
  const { t, lang } = useT();
  const g = t.grid;
  const [open, setOpen] = useState(false);
  const panel = useId();
  const text = rowText(c, { g, pick: (f) => pick(f, lang), declared, shared });
  const tags = stateTags(c, grid);
  const table = levelTable(c, g);
  const row = reachedRow(c, table);
  const name = g.names[c.code];
  const coef = g.coef(dec(GRID_WEIGHTS[c.code], lang));
  const col = g.compare.cols;
  const none = g.compare.none;
  const takenD = c.source === "linkedin" || c.source === "both";
  const takenP = c.source === "github" || c.source === "both";
  const flags = skipFlags ? [] : text.flags;
  const cross = c.evidence?.source === "both";

  return (
    <li className={`rg-row is-${c.score === null ? "none" : c.state}${c.counted ? "" : " is-out"}`}>
      <h3 className="rg-head">
        <button type="button" className="rg-toggle" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)}>
          <span className="rg-name">{name}</span>
          {columns ? (
            <span className="rg-cols">
              <span className={`rg-col${takenD ? " is-taken" : ""}`}>
                <span className="rg-col-k">{declared === "cv" ? col.cv : col.linkedin}</span>
                <span className="rg-col-v">{c.declared ?? none}</span>
              </span>
              <span className={`rg-col${takenP ? " is-taken" : ""}`}>
                <span className="rg-col-k">{col.github}</span>
                <span className="rg-col-v">{c.proven ?? none}</span>
              </span>
              <span className="rg-col is-kept">
                <span className="rg-col-k">{col.kept}</span>
                <span className="rg-col-v" aria-hidden>
                  {c.score ?? none}
                  <small>/10</small>
                </span>
              </span>
            </span>
          ) : (
            <span className="rg-score" aria-hidden>
              {c.score ?? none}
              <small>/10</small>
            </span>
          )}
          <Gauge c={c} g={g} />
          <span className="rg-meta">
            <span className="rg-coef">{coef}</span>
            {columns && <span className="rg-kept">{c.score === null ? g.compare.noneLabel : keptFrom(c, g, declared)}</span>}
            {tags.map((tag) => (
              <span key={tag} className={`rg-tag tag-${tag}`}>
                {(shared ? g.tagsThem : g.tags)[tag]}
              </span>
            ))}
          </span>
          <Chevron />
        </button>
      </h3>
      {text.line && (
        <p className="rg-piece">
          {/* Le fichier cité entre accents graves (« sequence-mail, `outreach.test.ts` ») se lit en code. */}
          {text.line.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}
        </p>
      )}
      {/* « recoupé » : la pièce met LinkedIn et GitHub face à face (evidence.source « both »), la démonstration de la méthode. */}
      {text.label &&
        (text.href ? (
          <a className={`rg-src${cross ? " is-both" : ""}`} href={text.href} target="_blank" rel="noopener noreferrer">
            {text.label}
            <span aria-hidden> ↗</span>
            <span className="sr-only"> · {g.proof}</span>
          </a>
        ) : (
          <span className={`rg-src${cross ? " is-both" : ""}`}>{text.label}</span>
        ))}
      {flags.length > 0 && (
        <ul className="rg-flags">
          {flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      <div id={panel} className="rg-levels" hidden={!open}>
        {text.reached && (
          <p className="rg-reached">
            <b>{g.reached}</b> {text.reached}
          </p>
        )}
        <p className="sr-only">{g.levelsTitle(name)}</p>
        <ol className="rg-table">
          {table.map(([n, line], i) => (
            <li key={n} className={i === row ? "is-reached" : undefined} aria-current={i === row ? "true" : undefined}>
              <span className="rg-lvl">{g.levelNo(n)}</span>
              <span>
                {line}
                {i === row && <span className="rg-here">{g.reached}</span>}
              </span>
            </li>
          ))}
        </ol>
        {text.next && (
          <p className="rg-next">
            <b>{g.next}</b> {text.next}
          </p>
        )}
        <p className="rg-note">{g.levelNotes[c.code]}</p>
      </div>
    </li>
  );
}

/** Les recoupements, en tête d'une comparaison : ce que les deux sources disent du même critère, et ce que le recoupement a relevé. */
function CrossChecks({ grid, declared }: { grid: Grid; declared: DeclaredSource }) {
  const { t, lang } = useT();
  const g = t.grid;
  const C = g.compare;
  const checks = crossChecks(grid);
  const flags = grid.criteria.find((c) => c.code === "STK")?.flags.map((f) => pick(f, lang)).filter(Boolean) ?? [];
  if (!checks.length && !flags.length) return null;
  const decl = declared === "cv" ? C.cols.cv : C.cols.linkedin;
  return (
    <div className="rg-cross">
      <h3 className="rg-cross-title">{C.crossTitle}</h3>
      <p className="rg-cross-lead">{C.crossLead}</p>
      {checks.length > 0 && (
        <ul className="rg-cross-list">
          {checks.map((x) => (
            <li key={x.code} className={`is-${x.verdict}`}>
              <span className="rg-cross-name">{g.names[x.code]}</span>
              <span className="rg-cross-pair">{C.pair(decl, String(x.declared), C.cols.github, String(x.proven))}</span>
              <span className="rg-cross-verdict">{C.verdict[x.verdict]}</span>
            </li>
          ))}
        </ul>
      )}
      {flags.length > 0 && (
        <>
          <p className="rg-cross-sub">{C.flagsTitle}</p>
          <ul className="rg-cross-flags">
            {flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * La note sur 100 : la formule, la moyenne, la règle qui a joué, ce qui sort de
 * la moyenne. `unproven` : la note du dossier face à un GitHub « dossier vide »,
 * la dernière ligne dit que le code n'est pas prouvé et ce qui changerait la note.
 */
function Final({ grid, isCase, unproven }: { grid: Grid; isCase: boolean; unproven: { src: string; shared: boolean } | undefined }) {
  const { t, lang } = useT();
  const g = t.grid;
  const F = g.final;
  const f = finalLines(grid, g, lang, unproven);
  const empty = grid.rule === "empty_file";
  return (
    <div className="rg-final">
      <h3 className="rg-final-title">{isCase ? F.caseTitle : F.title}</h3>
      {!empty && <p className="rg-final-how">{F.how}</p>}
      {f.formula && <p className="rg-formula">{f.formula}</p>}
      <p className="rg-overall">
        {f.result && <span className="rg-mean">{f.result}</span>}
        <span className="rg-big">
          <b>{f.overall}</b> {F.outOf}
        </span>
      </p>
      {f.rule && !unproven && <p className={`rg-rule${empty ? " is-empty" : ""}`}>{f.rule}</p>}
      {empty && <p className="rg-out">{F.emptyWhy}</p>}
      {f.out.map((o) => (
        <p key={o} className="rg-out">
          {o}
        </p>
      ))}
      {/* Code non prouvé : la dernière ligne, ce qui changerait la note. */}
      {f.rule && unproven && <p className="rg-rule is-unproven">{f.rule}</p>}
    </div>
  );
}

interface Props {
  item: Shareable;
  /** Vue par quelqu'un d'autre que la personne fichée : troisième personne, ni nom d'école ni d'ancien employeur. */
  shared: boolean;
  /** « @login » pour le titre à la troisième personne. */
  who: string;
}

export function RecruiterGrid({ item, shared, who }: Props) {
  const { t, lang } = useT();
  const grid = item.kind === "card" ? item.card.grid : item.comparison.grid;
  if (!usableGrid(grid)) return null;
  const g = t.grid;
  // Une fiche GitHub seule parle de LinkedIn, la porte par défaut (§18.30) ; une fiche ou une comparaison déclarative, de sa source.
  const declared = item.kind === "card" && item.card.source === "github" ? "linkedin" : declaredOf(item.kind === "card" ? item.card : item.comparison);
  const columns = item.kind === "comparison" && hasColumns(grid);
  const byCode = new Map(grid.criteria.map((c) => [c.code, c]));
  const method = shared ? g.methodThem : g.method;
  // Ce que la fiche a lu : le parcours (LinkedIn ou CV) et le code (GitHub).
  const career = item.kind === "comparison" ? declaredOf(item.comparison) : item.card.source === "github" ? null : declaredOf(item.card);
  const code = item.kind === "comparison" || item.card.source === "github";
  // La note du dossier face à un GitHub « dossier vide » : le code n'est pas prouvé (§18.37).
  const unproven =
    item.kind === "comparison" && item.comparison.github.grid?.rule === "empty_file" ? { src: declared === "cv" ? g.source.cv : g.source.linkedin, shared } : undefined;
  const redacted = shared && grid.criteria.some((c) => rowText(c, { g, pick: (f) => pick(f, lang), declared, shared }).redacted);
  return (
    <section className="after-block rg" id="grille" aria-labelledby="rg-title">
      <h2 id="rg-title">{shared ? g.titleThem(who) : g.title}</h2>
      {/* Les pièces lues : une fiche GitHub seule n'a pas lu de LinkedIn, une fiche LinkedIn seule pas de code. */}
      <ol className="rg-method">
        <li>{career ? method[career] : method.noCareer}</li>
        <li>{code ? method.code : method.noCode}</li>
        <li>{career && code ? method.check : method.piece}</li>
      </ol>
      {columns && <CrossChecks grid={grid} declared={declared} />}
      <ol className={`rg-list${columns ? " has-cols" : ""}`} aria-label={g.criteriaLabel}>
        {CRITERION_CODES.map((code) => {
          const c = byCode.get(code);
          return c ? <Row key={code} c={c} grid={grid} declared={declared} shared={shared} columns={columns} skipFlags={columns && code === "STK"} /> : null;
        })}
      </ol>
      <Final grid={grid} isCase={item.kind === "comparison"} unproven={unproven} />
      {redacted && <p className="rg-hidden">{g.shared.hidden}</p>}
      <p className="rg-foot">{g.foot}</p>
    </section>
  );
}
