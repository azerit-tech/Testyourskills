// « Tu roules pour qui ? » (§18.38, §18.82), dans l'après-fiche entre la
// dénonciation et le dossier : l'école et la boîte de la personne fichée. La
// fiche y entre d'office (le serveur, dès qu'elle est posée) : le bloc arrive
// déjà rempli, « Tu rapportes ★★★★ à … 3e des écoles, à 6 étoiles de la 2e. »
// et son partage, avec « Changer » et « Sortir ». Le sélecteur (pastille
// proposée, recherche d'école, nom de boîte) ne sert plus qu'à changer, ou quand
// rien n'a été lu sur le profil. Rien ne s'affiche si la fiche n'y a pas droit
// (dénoncée, pas à elle). Le nom de la bande et son partage mènent au classement de
// l'accueil (§18.101) : la page d'une bande n'existe plus.
import { useEffect, useId, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { BandRef, BandStanding, BandType, MyBands } from "../../../shared/bands";
import { BAND_TYPES, COMPANY_INPUT_MAX, searchSchools } from "../../../shared/bands";
import { pick, useT } from "../i18n";
import { api } from "../lib/api";
import { bandsApi, rankingShareUrl, starLine, suggestedPills } from "../lib/bands";
import { goRanking, RANKING_HREF } from "../lib/router";
import { hasNativeShare } from "../lib/sharing";
import { copyText, isTouch } from "../lib/util";
import { IconLinkedIn, IconShare } from "./Icons";
import { Stars } from "./Stars";
import "./bands.css";

type Toast = (m: string) => void;

/**
 * Le partage d'une bande : la feuille du téléphone, sinon LinkedIn avec le texte au
 * presse-papier (comme After.tsx). Le lien mène au classement de l'accueil ; une boîte
 * au nom libre pas encore classée : le texte dit quoi taper.
 */
export function useBandShare(toast: Toast) {
  const { t, lang } = useT();
  const native = hasNativeShare() && isTouch();
  const share = async (b: Pick<BandRef, "type" | "id">, text: string, cardId: string | null) => {
    // Partagé depuis le site en anglais, le lien le dit : son aperçu sort en anglais.
    const url = rankingShareUrl(lang);
    const meta = { type: b.type, id: b.id };
    if (native) {
      try {
        await navigator.share({ title: "Azerit", text, url });
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
  // undefined : on lit encore ; null : pas de bandes pour cette fiche.
  const [mb, setMb] = useState<MyBands | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void bandsApi.mine(cardId).then((mine) => alive && setMb(mine));
    return () => {
      alive = false;
    };
  }, [cardId]);

  // En lecture : une marque, sans hauteur ; l'après-fiche attend qu'elle parte pour entrer (CLS).
  if (mb === undefined) return <section className="after-block bands-pick is-loading" aria-hidden />;
  if (!mb) return null;

  return (
    <section className="after-block bands-pick" aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`}>{p.title}</h2>
      {/* Déjà dedans (l'entrée d'office, §18.82) : la ligne le dit, et qu'on peut changer. */}
      <p>{mb.ecole || mb.boite ? p.introIn : p.intro}</p>
      {BAND_TYPES.map((type) => (
        <League key={type} type={type} cardId={cardId} mb={mb} onChange={setMb} toast={toast} />
      ))}
    </section>
  );
}

interface LeagueProps {
  type: BandType;
  cardId: string;
  mb: MyBands;
  onChange: (mb: MyBands) => void;
  toast: Toast;
}

function League({ type, cardId, mb, onChange, toast }: LeagueProps) {
  const { t, lang } = useT();
  const p = t.bands.pick;
  const uid = useId().replace(/:/g, "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState("");
  // « Changer » : le sélecteur s'ouvre sous la bande tenue, qui reste la sienne tant qu'une autre n'est pas choisie.
  const [changing, setChanging] = useState(false);
  const joined = mb[type];
  const { share, native } = useBandShare(toast);

  const run = async (go: () => Promise<MyBands>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await go());
      setValue("");
      setChanging(false);
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
  // La bande tenue n'est pas proposée à elle-même.
  const pills = suggestedPills(type, mb).filter((r) => r.id !== joined?.id);
  const head = type === "ecole" ? p.school : p.company;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (type === "boite" && value.trim()) void join({ name: value.trim() });
    else if (results[0]) void join({ id: results[0].id });
  };

  const fail = error && (
    <p className="bp-error" id={`${uid}-err`} role="alert">
      {error}
    </p>
  );

  const toggle = () => {
    setChanging((on) => !on);
    setValue("");
    setError(null);
  };

  // La vue par défaut (§18.82) : la bande tenue, son rang, son partage ; le sélecteur seulement sur « Changer ».
  if (joined && !changing) {
    return (
      <div className="bp-league is-in" aria-busy={busy}>
        <p className="surtitre">{head}</p>
        <Joined b={joined} stars={mb.stars} busy={busy} native={native} changing={false} onChange={toggle} onLeave={leave} onShare={(text) => share(joined, text, cardId)} />
        {fail}
      </div>
    );
  }

  return (
    <div className={`bp-league${joined ? " is-in" : ""}`} aria-busy={busy}>
      <p className="surtitre">{head}</p>
      {joined && <Joined b={joined} stars={mb.stars} busy={busy} native={native} changing onChange={toggle} onLeave={leave} onShare={(text) => share(joined, text, cardId)} />}
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
            placeholder={type === "ecole" ? p.schoolLabel : p.companyLabel}
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
        {/* le bouton ne vient qu'avec un nom tapé : une pastille proposée se touche directement */}
        {type === "boite" && value.trim() && (
          <button type="submit" className="pill" disabled={busy}>
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
      {fail}
    </div>
  );
}

interface JoinedProps {
  b: BandStanding;
  stars: number;
  busy: boolean;
  native: boolean;
  /** Le sélecteur est ouvert dessous : « Changer » devient « Annuler ». */
  changing: boolean;
  onChange: () => void;
  onLeave: () => void;
  onShare: (text: string) => void;
}

function Joined({ b, stars, busy, native, changing, onChange, onLeave, onShare }: JoinedProps) {
  const { t } = useT();
  const p = t.bands.pick;
  // Pas encore au classement public (boîte au nom libre, moins de trois dossiers) : ni lien, et le partage dit quoi taper.
  const ranked = b.hasPage;
  const glyphs = starLine(stars);
  const rank = t.bands.rank(b);
  const text = b.hasPage ? p.shareText(glyphs, b.label, rank) : p.shareTextNoPage(glyphs, b.label, rank);
  return (
    <>
      <p className="bp-line">
        {/* Une seule espace dans le texte : l'écart après les étoiles est une marge (un copier-coller ne double plus l'espace). */}
        {p.line[0]} <Stars n={stars} total={stars} size={14} label={t.bands.score(stars)} />
        {p.line[1]}{" "}
        {ranked ? (
          <a href={RANKING_HREF} onClick={goRanking}>
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
        {/* secondaire : le seul bouton principal de l'écran reste le partage de la fiche */}
        <button type="button" className="pill" onClick={() => onShare(text)} aria-label={p.shareLabel(b.label)}>
          {native ? <IconShare /> : <IconLinkedIn />}
          {p.share}
        </button>
        {/* discrets, à droite : changer de bande, ou en sortir */}
        <span className="bp-quiet">
          <button type="button" className="link-quiet bp-change" disabled={busy} onClick={onChange} aria-expanded={changing} aria-label={changing ? undefined : p.changeLabel(b.label)}>
            {changing ? p.cancel : p.change}
          </button>
          <button type="button" className="link-quiet bp-leave" disabled={busy} onClick={onLeave} aria-label={p.leaveLabel(b.label)}>
            {p.leave}
          </button>
        </span>
      </div>
    </>
  );
}
