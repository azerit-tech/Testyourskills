import { describe, expect, it } from "vitest";
import { onlyOwner, soleOwner, strongest, validLinks, type LinkRow } from "./rules";

const row = (other: string, strength: number, o: Partial<LinkRow> = {}): LinkRow => ({ other, source: "github_social", strength, rejected: false, observedAt: "2026-10-01T10:00:00", ...o });

describe("règles du registre (identity_store de l'App)", () => {
  it("une recherche ne vaut jamais plus que 1, quelle que soit la force écrite", () => {
    expect(validLinks([row("a", 2, { source: "sous-agent-haiku" })]).get("a")!.strength).toBe(1);
    expect(validLinks([row("a", 2, { source: "serper_search" })]).get("a")!.strength).toBe(1);
  });

  it("cv_fetch_declared ne dépasse pas les lignes antérieures du même couple", () => {
    const v = validLinks([row("a", 1, { source: "cv_search" }), row("a", 2, { source: "cv_fetch_declared" })]);
    expect(v.get("a")!.strength).toBe(1);
    expect(validLinks([row("b", 2, { source: "cv_fetch_declared" })]).get("b")!.strength).toBe(2);
  });

  it("un rejet écarte le lien, sauf un lien vérifié, ou déclaré après le rejet", () => {
    const rej = row("a", 0, { rejected: true, observedAt: "2026-10-05T00:00:00" });
    expect(validLinks([row("a", 2), rej]).has("a")).toBe(false);
    expect(validLinks([rej, row("a", 2, { observedAt: "2026-10-06T00:00:00" })]).has("a")).toBe(true);
    expect(validLinks([rej, row("a", 1, { observedAt: "2026-10-06T00:00:00" })]).has("a")).toBe(false);
    expect(validLinks([row("a", 3), rej]).has("a")).toBe(true);
  });

  it("le plus fort gagne, puis le plus récent", () => {
    const v = validLinks([row("a", 2, { observedAt: "2026-01-01T00:00:00" }), row("b", 1, { observedAt: "2026-12-01T00:00:00" }), row("c", 2, { observedAt: "2026-02-01T00:00:00" })]);
    expect(strongest(v)).toEqual({ key: "c", strength: 2 });
    expect(strongest(new Map())).toBeNull();
  });

  it("LinkedIn → GitHub : le seul compte, ou le seul vérifié", () => {
    expect(onlyOwner(validLinks([row("cardent", 2)]))).toEqual({ key: "cardent", strength: 2 });
    expect(onlyOwner(validLinks([row("cardent", 2), row("autre", 1)]))).toBeNull();
    expect(onlyOwner(validLinks([row("cardent", 3), row("autre", 2)]))).toEqual({ key: "cardent", strength: 3 });
  });

  it("GitHub → LinkedIn : rien si un autre GitHub porte le même LinkedIn, sauf lien vérifié", () => {
    expect(soleOwner("cardent", { key: "x", strength: 2 }, [row("cardent", 2)])).toBe(true);
    expect(soleOwner("cardent", { key: "x", strength: 2 }, [row("cardent", 2), row("homonyme", 1)])).toBe(false);
    expect(soleOwner("cardent", { key: "x", strength: 3 }, [row("cardent", 3), row("homonyme", 2)])).toBe(true);
    // Un rejet de l'autre GitHub ne bloque rien.
    expect(soleOwner("cardent", { key: "x", strength: 2 }, [row("cardent", 2), row("homonyme", 0, { rejected: true })])).toBe(true);
  });
});
