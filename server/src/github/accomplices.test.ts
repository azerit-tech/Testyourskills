import { describe, expect, it } from "vitest";
import { pickAccomplices } from "./accomplices";

const user = (login: string, contributions: number, extra: Record<string, unknown> = {}) => ({
  login,
  type: "User",
  avatar_url: `https://avatars.githubusercontent.com/u/${login.length}`,
  contributions,
  ...extra,
});

describe("complices suggérés (§18.6)", () => {
  it("écarte le joueur lui-même, sans tenir compte de la casse", () => {
    const got = pickAccomplices([[user("LeaMD", 300), user("nour-rs", 12)]], "leamd");
    expect(got.map((a) => a.login)).toEqual(["nour-rs"]);
  });

  it("écarte les bots : type Bot ou login en [bot]", () => {
    const got = pickAccomplices(
      [[user("dependabot[bot]", 90), user("renovate", 80, { type: "Bot" }), user("github-actions[bot]", 70, { type: "User" }), user("camroux", 3)]],
      "leamd",
    );
    expect(got.map((a) => a.login)).toEqual(["camroux"]);
  });

  it("additionne les commits d'un même complice sur plusieurs repos, et trie", () => {
    const got = pickAccomplices(
      [
        [user("alice", 5), user("bob", 20)],
        [user("Alice", 30), user("carol", 1)],
      ],
      "me",
    );
    expect(got.map((a) => a.login)).toEqual(["alice", "bob", "carol"]);
  });

  it("garde au plus six complices, et ignore les listes absentes ou les lignes invalides", () => {
    const many = Array.from({ length: 10 }, (_, i) => user(`dev${i}`, 100 - i));
    const got = pickAccomplices([null, undefined, [{ login: 42 }, { login: "bad name" }, ...many]], "me");
    expect(got).toHaveLength(6);
    expect(got[0]).toEqual({ login: "dev0", avatarUrl: "https://avatars.githubusercontent.com/u/4", commits: 100 });
  });

  it("n'accepte qu'un avatar en https, sinon celui de github.com", () => {
    const got = pickAccomplices([[user("eve", 1, { avatar_url: "javascript:alert(1)" })]], "me");
    expect(got[0]!.avatarUrl).toBe("https://github.com/eve.png");
  });
});
