// « Ajoute ton GitHub pour prouver » (§18.24) : sous une fiche LinkedIn seule,
// un pseudo GitHub relance la fiche en comparaison LinkedIn contre GitHub. Le
// profil LinkedIn est déjà en cache côté serveur : seul GitHub est lu en plus.
// Rien à coller (§18.80) : le champ part du nom de la fiche, les comptes GitHub
// à ce nom sortent dessous, on touche le sien.
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { resolveDoor } from "../../../shared/entry";
import { pick, useT } from "../i18n";
import { api, tokens } from "../lib/api";
import { errorFact } from "../lib/errors";
import { navigate } from "../lib/router";
import { unlockAudio } from "../lib/audio";
import { markFresh, rememberInput } from "../lib/session";
import { parseLogin } from "../lib/util";
import { useSuggestBox, useSuggestions } from "./Suggest";

interface Props {
  linkedinUrl: string;
  /** Sous trois étoiles, ajouter la source est le remède (§18.52) : le bouton passe en rose, le partage en contour. */
  strong?: boolean;
  /** Le nom de la fiche : le champ en part, les comptes à ce nom sont proposés d'emblée. */
  name?: string;
  /** La fiche que le GitHub complète : ses bandes suivent le dossier (§18.82). */
  cardId?: string;
}

export function ProveGithub({ linkedinUrl, strong = false, name = "", cardId }: Props) {
  const { t, lang } = useT();
  const p = t.result.prove;
  const uid = useId().replace(/:/g, "");
  const [login, setLogin] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Le champ a été touché : avant, le nom posé d'avance ne cherche rien. */
  const [touched, setTouched] = useState(false);

  const go = async (gh: string) => {
    if (busy) return;
    unlockAudio();
    setBusy(true);
    setError(null);
    try {
      const res = await api.createCard({ login: gh, linkedin: linkedinUrl, lang, from: cardId });
      if (res.deleteToken) tokens.set(res.id, res.deleteToken);
      rememberInput({ login: gh, file: null });
      markFresh(res.id, gh);
      navigate(`/c/${res.id}`);
    } catch (err) {
      setBusy(false);
      const msg = errorFact(err, t.errors.closed, t.home.errNetwork);
      setError(typeof msg === "string" ? msg : pick(msg, lang));
    }
  };

  const suggestions = useSuggestions(login, { github: true }, busy || !touched);
  const box = useSuggestBox({
    id: `${uid}-sg`,
    items: suggestions,
    label: p.label,
    onPick: (item) => {
      if (item.kind !== "github") return;
      setLogin(item.login);
      void go(item.login);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const gh = parseLogin(login);
    if (gh) return void go(gh);
    // Un nom : une seule personne proposée, c'est elle ; plusieurs, la liste ; aucune, l'erreur.
    if (resolveDoor("github", login).kind === "name") {
      setTouched(true);
      if (suggestions.length === 1 && suggestions[0]!.kind === "github") return void go(suggestions[0]!.login);
      if (suggestions.length) return box.show();
      if (touched) setError(t.home.errPick);
      return;
    }
    setError(login.trim() ? t.home.errLogin : t.home.errEmptyLogin);
  };

  return (
    <section className="after-block add-source" aria-labelledby={`${uid}-t`}>
      <h2 id={`${uid}-t`}>{p.title}</h2>
      <form className="entry" onSubmit={submit} noValidate>
        <div className="field field-who">
          <label htmlFor={`${uid}-gh`} className="sr-only">
            {p.label}
          </label>
          <input
            id={`${uid}-gh`}
            className="field-input"
            type="text"
            inputMode="text"
            enterKeyHint="go"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore=""
            data-lpignore="true"
            placeholder={t.home.loginPlaceholder}
            value={login}
            onChange={(e) => {
              setLogin(e.target.value);
              setTouched(true);
              if (error) setError(null);
            }}
            onFocus={() => {
              setTouched(true);
              box.show();
            }}
            onBlur={box.close}
            onKeyDown={(e) => void box.onKeyDown(e)}
            aria-invalid={!!error}
            aria-describedby={`${uid}-err`}
            {...box.inputProps}
          />
          {box.list}
        </div>
        {/* Secondaire : le rose de la page reste au partage (§18.48) ; sous trois étoiles, c'est lui le rose (§18.52). */}
        <button type="submit" className={`pill ${strong ? "pill-big" : "pill-ghost"} entry-submit`} disabled={busy}>
          {busy ? t.home.submitting : p.btn}
        </button>
        <p id={`${uid}-err`} className={`entry-error${error ? " is-on" : ""}`} role="alert">
          {error}
        </p>
      </form>
    </section>
  );
}
