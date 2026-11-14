// « Tu roules pour qui ? » (§18.38), dans l'après-fiche entre la dénonciation
// et le dossier : l'école et la boîte de la personne fichée, un toucher pour
// y entrer (pastille proposée, recherche d'école, nom de boîte), puis la ligne
// « Tu rapportes ★★★★ à … 3e des écoles, à 6 étoiles de la 2e. » et son
// partage. Rien ne s'affiche si la fiche n'y a pas droit (dénoncée, pas à elle).
import { useEffect, useId, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { BandRef, BandStanding, BandType, MyBands } from "../../../shared/bands";
import { BAND_TYPES, bandPath, COMPANY_INPUT_MAX, searchSchools } from "../../../shared/bands";
import { pick, useT } from "../i18n";
import { api } from "../lib/api";
import { bandHint, bandsApi, bandUrl, filledStars, suggestedPills } from "../lib/bands";
import { onLinkClick } from "../lib/router";
import { hasNativeShare } from "../lib/sharing";
import { copyText, isTouch } from "../lib/util";
import { IconLinkedIn, IconShare } from "./Icons";
import "./bands.css";

type Toast = (m: string) => void;

/**
 * Le partage d'une bande : la feuille du téléphone, sinon LinkedIn avec le texte au
 * presse-papier (comme After.tsx). Une boîte au nom libre en formation n'a pas
 * encore de page publique : le lien mène à l'accueil, le texte dit quoi taper.
 */
export function useBandShare(toast: Toast) {
  const { t } = useT();
  const native = hasNativeShare() && isTouch();
  const share = async (b: Pick<BandRef, "type" | "id"> & { hasPage?: boolean }, text: string, cardId: string | null) => {
    const url = b.hasPage === false ? `${window.location.origin}/` : bandUrl(b);
    const meta = { type: b.type, id: b.id };
    if (native) {
      try {
        await navigator.share({ title: "Testyourskills", text, url });
        api.track("band_share", cardId, { ...meta, channel: "native" });
      } catch {
        /* partage annulé */
      }
      return;
    }
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, "_blank", "noopener");
    // LinkedIn n'accepte pas de texte prérempli : il part dans le presse-papier.
    if (await copyText(`${text} ${url}`)) toast(t.bands.pick.linkedinHint);
    api.track("band_share", cardId, { ...meta, channel: "linkedin" });
  };
  return { share, native };
}

export function BandPick({ cardId, toast }: { cardId: string; toast: Toast }) {
  const { t } = useT();
  const p = t.bands.pick;
  const uid = useId().replace(/:/g, "");
  const [mb, setMb] = useState<MyBands | null>(null);
  const [hint] = useState(() => bandHint());

  useEffect(() => {
    let alive = true;
    void bandsApi.mine(cardId).then((v) => alive && setMb(v));
    return () => {
      alive = false;
    };
  }, [cardId]);

  if (!mb) return null;

  return (
    <section className="after-block bands-pick" aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`}>{p.title}</h2>
      <p>{p.intro}</p>
      {BAND_TYPES.map((type) => (
        <League key={type} type={type} cardId={cardId} mb={mb} hint={hint} onChange={setMb} toast={toast} />
      ))}
    </section>
  );
}

interface LeagueProps {
  type: BandType;
  cardId: string;
  mb: MyBands;
  hint: BandRef | null;
  onChange: (mb: MyBands) => void;
  toast: Toast;
}

function League({ type, cardId, mb, hint, onChange, toast }: LeagueProps) {
  const { t, lang } = useT();
  const p = t.bands.pick;
  const uid = useId().replace(/:/g, "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const joined = mb[type];
  const { share, native } = useBandShare(toast);

  const run = async (go: () => Promise<MyBands>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await go());
      setValue("");
    } catch (err) {
      const fact = err && typeof err === "object" && "fact" in err ? (err as { fact: { fr: string; en: string } | null }).fact : null;
      setError(fact ? pick(fact, lang) : p.failed);
    } finally {
      setBusy(false);
    }
  };

  const join = (sel: { id?: string; name?: string }) => run(() => bandsApi.join(cardId, type, sel));
  const leave = () => run(() => bandsApi.leave(cardId, type));

  const results = useMemo(() => (type === "ecole" && value.trim().length >= 2 ? searchSchools(value, 5) : []), [type, value]);
  const pills = suggestedPills(type, mb, hint);
  const head = type === "ecole" ? p.school : p.company;

  if (joined) return <Joined b={joined} stars={mb.stars} head={head} busy={busy} error={error} native={native} onLeave={leave} onShare={(text) => share(joined, text, cardId)} />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (type === "boite" && value.trim()) void join({ name: value.trim() });
    else if (results[0]) void join({ id: results[0].id });
  };

  return (
    <div className="bp-league" aria-busy={busy}>
      <p className="surtitre">{head}</p>
      {pills.length > 0 && (
        <ul className="bp-pills">
          {pills.map((r) => (
            <li key={r.id}>
              <button type="button" className="pill pill-ghost" disabled={busy} onClick={() => void join({ id: r.id, name: r.label })}>
                <span aria-hidden>+</span> {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="bp-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={`${uid}-q`} className="sr-only">
            {type === "ecole" ? p.schoolLabel : p.companyLabel}
          </label>
          <input
            id={`${uid}-q`}
            className="field-input"
            type={type === "ecole" ? "search" : "text"}
            autoComplete={type === "ecole" ? "off" : "organization"}
            maxLength={COMPANY_INPUT_MAX}
            placeholder={type === "ecole" ? p.schoolPlaceholder : p.companyPlaceholder}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={!!error}
            aria-describedby={error ? `${uid}-err` : undefined}
            aria-controls={type === "ecole" ? `${uid}-list` : undefined}
          />
        </div>
        {type === "boite" && (
          <button type="submit" className="pill" disabled={busy || !value.trim()}>
            {p.join}
          </button>
        )}
      </form>
      {type === "ecole" && value.trim().length >= 2 && (
        <ul className="bp-results" id={`${uid}-list`} aria-live="polite">
          {results.length === 0 ? (
            <li className="bp-none">{p.schoolNone}</li>
          ) : (
            results.map((s) => (
              <li key={s.id}>
                <button type="button" className="bp-result" disabled={busy} onClick={() => void join({ id: s.id })}>
                  {s.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {error && (
        <p className="bp-error" id={`${uid}-err`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface JoinedProps {
  b: BandStanding;
  stars: number;
  head: string;
  busy: boolean;
  error: string | null;
  native: boolean;
  onLeave: () => void;
  onShare: (text: string) => void;
}

function Joined({ b, stars, head, busy, error, native, onLeave, onShare }: JoinedProps) {
  const { t } = useT();
  const p = t.bands.pick;
  // Sans page publique (boîte au nom libre, moins de trois dossiers) : ni lien, et le partage dit quoi taper.
  const href = b.hasPage ? bandPath(b) : null;
  const glyphs = filledStars(stars);
  const rank = t.bands.rank(b);
  const text = b.hasPage ? p.shareText(glyphs, b.label, rank) : p.shareTextNoPage(glyphs, b.label, rank);
  return (
    <div className="bp-league is-in" aria-busy={busy}>
      <p className="surtitre">{head}</p>
      <p className="bp-line">
        {p.line[0]}{" "}
        <span className="bp-stars" role="img" aria-label={t.bands.score(stars)}>
          {glyphs}
        </span>{" "}
        {p.line[1]}{" "}
        {href ? (
          <a href={href} onClick={(e) => onLinkClick(e, href)}>
            {b.label}
          </a>
        ) : (
          <strong className="bp-name">{b.label}</strong>
        )}
        .{" "}
        <span className="bp-rank">{rank}</span>
      </p>
      {!b.hasPage && <p className="bp-nopage">{p.noPage}</p>}
      <div className="bp-actions">
        <button type="button" className="pill" onClick={() => onShare(text)} aria-label={p.shareLabel(b.label)}>
          {native ? <IconShare /> : <IconLinkedIn />}
          {p.share}
        </button>
        <button type="button" className="link-alt" disabled={busy} onClick={onLeave} aria-label={p.leaveLabel(b.label)}>
          {p.leave}
        </button>
      </div>
      {error && (
        <p className="bp-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
