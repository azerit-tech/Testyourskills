// Le Markdown réduit du règlement (/reglement) : titres, paragraphes, listes sur
// deux niveaux, gras. Rien d'autre n'est interprété, aucun HTML n'est rendu.

export interface Item {
  text: string;
  sub: string[];
}

export type Block = { kind: "h"; level: 1 | 2 | 3; text: string } | { kind: "p"; text: string } | { kind: "ul" | "ol"; items: Item[] };

/** Les blocs d'un Markdown réduit. Un élément indenté devient une sous-liste de l'élément au-dessus. */
export function parseRules(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: Item[] } | null = null;
  const endPara = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  const endList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      endPara();
      endList();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      endPara();
      endList();
      blocks.push({ kind: "h", level: h[1].length as 1 | 2 | 3, text: h[2] });
      continue;
    }
    const item = /^(\s*)(-|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      endPara();
      const kind = item[2] === "-" ? "ul" : "ol";
      if (item[1].length > 0 && list && list.items.length) {
        list.items[list.items.length - 1].sub.push(item[3]);
        continue;
      }
      if (!list || list.kind !== kind) {
        endList();
        list = { kind, items: [] };
      }
      list.items.push({ text: item[3], sub: [] });
      continue;
    }
    if (list && /^\s/.test(raw) && list.items.length) {
      const last = list.items[list.items.length - 1];
      if (last.sub.length) last.sub[last.sub.length - 1] += ` ${line.trim()}`;
      else last.text += ` ${line.trim()}`;
      continue;
    }
    endList();
    para.push(line.trim());
  }
  endPara();
  endList();
  return blocks;
}
