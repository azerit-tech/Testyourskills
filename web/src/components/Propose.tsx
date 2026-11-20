// « C'est ton GitHub ? » (§18.100) : sous sa fiche LinkedIn seule, le compte que le
// serveur a trouvé pendant la lecture, à confirmer d'un toucher. En miroir, « C'est
// ton LinkedIn ? » sous une fiche GitHub seule. « Oui » relance la fiche comme
// « Ajoute ton GitHub » (ProveGithub.tsx), avec ce compte, sans rien taper ; « Non »
// la retire, et « Ajoute ton GitHub » revient à sa place.
import { useId, useState } from "react";
import type { CardData, Proposal } from "../../../shared/types";
import { githubHref, linkedinHref } from "../../../shared/profileLinks";
import { pick, useT } from "../i18n";
import { api, tokens } from "../lib/api";
import { unlockAudio } from "../lib/audio";
import { errorFact } from "../lib/errors";
import { proposalRequest, rememberNo } from "../lib/propose";
import { navigate } from "../lib/router";
import { markFresh, rememberInput } from "../lib/session";
import { useAvatar } from "../card/avatar";
import { BusyDots } from "./Busy";
import { IconGithub, IconLinkedIn } from "./Icons";

interface Props {
  proposal: Proposal;
  card: Pick<CardData, "id" | "login" | "linkedinUrl">;
  /** « Non » : la ligne part, la source à ajouter revient. */
  onNo: () => void;
}

function Face({ proposal }: { proposal: Proposal }) {
  const url = proposal.kind === "github" ? proposal.avatarUrl : (proposal.photoUrl ?? null);
  const state = useAvatar(url);
  return (
    <span className={`propose-face is-${proposal.kind}`}>
      {state === "photo" && url ? <img src={url} alt="" width={44} height={44} /> : proposal.kind === "github" ? <IconGithub /> : <IconLinkedIn />}
    </span>
  );
}

export function Propose({ proposal, card, onNo }: Props) {
  const { t, lang } = useT();
  const p = t.result.propose;
  const uid = useId().replace(/:/g, "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yes = async () => {
    const input = proposalRequest(proposal, card, lang);
    if (busy || !input) return;
    unlockAudio();
    setBusy(true);
    setError(null);
    try {
      const res = await api.createCard(input);
      if (res.deleteToken) tokens.set(res.id, res.deleteToken);
      rememberInput({ login: input.login, file: null });
      markFresh(res.id, input.login);
      navigate(`/c/${res.id}`);
    } catch (err) {
      setBusy(false);
      const msg = errorFact(err, t.errors.closed, t.home.errNetwork);
      setError(typeof msg === "string" ? msg : pick(msg, lang));
    }
  };

  const no = () => {
    rememberNo(card.id);
    void api.declineProposal(card.id);
    onNo();
  };

  const who = proposal.kind === "github" ? `@${proposal.login}` : proposal.name;
  const sub = proposal.kind === "github" ? proposal.name : proposal.headline;
  const href = proposal.kind === "github" ? githubHref(proposal.login) : linkedinHref(proposal.url);
  return (
    <section className="after-block propose" aria-labelledby={`${uid}-q`}>
      <div className="propose-who">
        <Face proposal={proposal} />
        <p className="propose-text">
          {/* Le compte proposé s'ouvre dans un nouvel onglet (§18.108) : on vérifie que c'est le sien avant « Oui ». */}
          {href ? (
            <a className="propose-name" href={href} target="_blank" rel="noopener noreferrer">
              {who}
            </a>
          ) : (
            <span className="propose-name">{who}</span>
          )}
          {sub && <span className="propose-sub">{sub}</span>}
          <strong id={`${uid}-q`} className="propose-q">
            {proposal.kind === "github" ? p.github : p.linkedin}
          </strong>
        </p>
      </div>
      <div className="propose-acts">
        <button type="button" className={`pill pill-big propose-yes${busy ? " is-busy" : ""}`} onClick={() => void yes()} aria-busy={busy}>
          {p.yes}
          {busy && <BusyDots />}
        </button>
        <button type="button" className="link-quiet propose-no" onClick={no} disabled={busy}>
          {p.no}
        </button>
      </div>
      {error && (
        <p className="entry-error is-on" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
