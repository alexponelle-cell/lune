/** Logique pure de la compta du hub (testée) : tri des mouvements, import CSV, mois. */

export type Cat = 'client' | 'monteur' | 'outil' | 'tournage' | 'autre' | 'check';
export interface TxInput { date: string; label: string; amount: number }
export interface Classified extends TxInput { cat: Cat; who: string | null }

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Range un mouvement bancaire : client (son nom dans le libellé, montant positif), monteur (son prénom, montant négatif),
 * outil, tournage, sinon « à vérifier ». `learned` = libellés déjà rangés à la main (l'outil s'en souvient).
 */
export function classify(t: TxInput, clients: string[], monteurs: string[], learned: Record<string, Cat> = {}): Classified {
  const lab = norm(t.label).toLowerCase();
  const key = learnKey(t.label);
  if (learned[key]) return { ...t, cat: learned[key]!, who: null };
  const word = (name: string) => norm(name.replace(/^client\s+/i, '')).toLowerCase();
  const c = clients.find((n) => lab.includes(word(n)));
  if (c && t.amount > 0) return { ...t, cat: 'client', who: c };
  const m = monteurs.find((n) => new RegExp(`\\b${word(n)}\\b`).test(lab));
  if (m && t.amount < 0) return { ...t, cat: 'monteur', who: m };
  if (/notion|slack|adobe|capcut|canva|google|frame\.io|openai|apple\.com/.test(lab)) return { ...t, cat: 'outil', who: null };
  if (/studio|podcast|peerspace|location|uber|sncf|spot/.test(lab)) return { ...t, cat: 'tournage', who: null };
  return { ...t, cat: 'check', who: null };
}

/** Clé d'apprentissage d'un libellé : sans chiffres ni dates (« CB AMAZON 12/10 » → « cb amazon »). */
export const learnKey = (label: string) => norm(label).toLowerCase().replace(/[0-9/.\-:]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Import d'un relevé CSV (Qonto, Shine, banque classique, export Google Sheet). */
export function parseCsv(text: string): TxInput[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const head0 = lines[0]!;
  const sep = (head0.match(/;/g) ?? []).length >= (head0.match(/,/g) ?? []).length ? ';' : ',';
  const split = (l: string) => {
    const out: string[] = []; let cur = '', q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out.map((x) => x.trim());
  };
  const head = split(head0).map((h) => norm(h).toLowerCase());
  const idx = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iD = idx(/date/), iL = idx(/libel|label|description|intitul|operation|contrepartie/), iA = idx(/^montant|amount|valeur/), iDeb = idx(/debit/), iCre = idx(/credit/);
  const num = (v: string | undefined) => { const x = parseFloat((v ?? '').replace(/\s| |€/g, '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
  const out: TxInput[] = [];
  for (const l of lines.slice(1)) {
    const c = split(l);
    let d = c[iD] ?? '';
    const fr = d.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (fr) d = `${fr[3]}-${fr[2]}-${fr[1]}`;
    d = d.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const amount = iA >= 0 ? num(c[iA]) : num(c[iCre]) - Math.abs(num(c[iDeb]));
    if (!amount) continue;
    out.push({ date: d, label: (c[iL] ?? '').trim() || '(sans libellé)', amount: Math.round(amount * 100) / 100 });
  }
  return out;
}

export const monthOf = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 7) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
