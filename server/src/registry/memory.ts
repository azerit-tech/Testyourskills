// Une base de l'App en mémoire, pour les tests : mêmes tables et mêmes règles
// d'écriture que pg.ts (ajout seul, rien si la ligne existe, rien vers une ligne
// marquée). Les noms des fixtures sont inventés.

import type { AccountRef, RegistryDb } from "./index";
import type { LinkRow } from "./rules";

export interface MemAccount {
  id: number;
  platform: string;
  key: string;
  handle: string;
  deleted?: boolean;
}

export interface MemLink {
  a: number;
  b: number;
  source: string;
  strength: number;
  rejected: boolean;
  step: string | null;
  observedAt: string;
  deleted?: boolean;
}

export class MemoryRegistryDb implements RegistryDb {
  accounts: MemAccount[] = [];
  links_: MemLink[] = [];
  cvs: { account: number; data: Uint8Array; sha256: string; fetchedAt: string; deleted?: boolean }[] = [];
  photos: { account: number; data: Uint8Array; contentType: string }[] = [];
  /** Chaque appel, pour vérifier ce qui part vers la base. */
  calls: string[] = [];
  /** Lève ou traîne à la demande. */
  failWith: Error | null = null;
  delayMs = 0;

  private async gate(name: string) {
    this.calls.push(name);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failWith) throw this.failWith;
  }

  account(platform: string, key: string): MemAccount | undefined {
    return this.accounts.find((a) => a.platform === platform && a.key === key);
  }

  /** Un compte, créé au besoin (fixtures). */
  ensure(platform: string, key: string, handle = key): MemAccount {
    let a = this.account(platform, key);
    if (!a) this.accounts.push((a = { id: this.accounts.length + 1, platform, key, handle }));
    return a;
  }

  /** Un lien GitHub ↔ LinkedIn des fixtures, comme l'App l'aurait écrit. */
  seedLink(login: string, slug: string, strength: number, o: { source?: string; rejected?: boolean; observedAt?: string } = {}) {
    const g = this.ensure("github", login.toLowerCase(), login);
    const l = this.ensure("linkedin", slug.toLowerCase(), slug);
    this.links_.push({ a: g.id, b: l.id, source: o.source ?? "github_social", strength, rejected: !!o.rejected, step: null, observedAt: o.observedAt ?? "2026-10-01T10:00:00" });
  }

  async links(from: { platform: AccountRef["platform"]; key: string }, otherPlatform: AccountRef["platform"]) {
    await this.gate("links");
    const me = this.account(from.platform, from.key);
    if (!me || me.deleted) return [];
    const out: (LinkRow & { handle: string })[] = [];
    for (const l of this.links_) {
      if (l.deleted || (l.a !== me.id && l.b !== me.id)) continue;
      const o = this.accounts.find((a) => a.id === (l.a === me.id ? l.b : l.a));
      if (!o || o.deleted || o.platform !== otherPlatform) continue;
      out.push({ other: o.key, handle: o.handle, source: l.source, strength: l.strength, rejected: l.rejected, observedAt: l.observedAt });
    }
    return out;
  }

  async cv(key: string) {
    await this.gate("cv");
    const a = this.account("linkedin", key);
    const c = a && !a.deleted ? this.cvs.find((x) => x.account === a.id && !x.deleted) : undefined;
    return c ? { data: c.data, fetchedAt: c.fetchedAt } : null;
  }

  async photo(key: string) {
    await this.gate("photo");
    const a = this.account("linkedin", key);
    const p = a && !a.deleted ? this.photos.find((x) => x.account === a.id) : undefined;
    return p ? { data: p.data, contentType: p.contentType } : null;
  }

  async addAccounts(accounts: AccountRef[]) {
    await this.gate("addAccounts");
    let n = 0;
    for (const a of accounts) {
      if (this.account(a.platform, a.key)) continue;
      this.ensure(a.platform, a.key, a.handle);
      n++;
    }
    return n;
  }

  async addLink(l: { github: AccountRef; linkedin: AccountRef; strength: number; step: string; at: string }) {
    await this.gate("addLink");
    const g = this.account("github", l.github.key);
    const li = this.account("linkedin", l.linkedin.key);
    if (!g || !li || g.deleted || li.deleted) return false;
    if (this.links_.some((x) => x.a === g.id && x.b === li.id && x.source === "testyourskills" && !x.rejected && x.strength >= l.strength)) return false;
    this.links_.push({ a: g.id, b: li.id, source: "testyourskills", strength: l.strength, rejected: false, step: l.step, observedAt: l.at });
    return true;
  }

  async addCv(linkedin: AccountRef, cv: { data: Buffer; sha256: string; fetchedAt: string }) {
    await this.gate("addCv");
    const a = this.account("linkedin", linkedin.key);
    if (!a || a.deleted || this.cvs.some((c) => c.account === a.id)) return false;
    this.cvs.push({ account: a.id, data: cv.data, sha256: cv.sha256, fetchedAt: cv.fetchedAt });
    return true;
  }

  /** Les liens écrits par le jeu, lisibles. */
  written(): { login: string; slug: string; strength: number; step: string | null }[] {
    const by = (id: number) => this.accounts.find((a) => a.id === id)!;
    return this.links_.filter((l) => l.source === "testyourskills").map((l) => ({ login: by(l.a).key, slug: by(l.b).key, strength: l.strength, step: l.step }));
  }

  async close() {}
}
