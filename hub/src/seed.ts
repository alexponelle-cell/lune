import type { Hub, Status } from './db.js';

/** Données d'exemple (SEED_DEMO=1) : 3 clients, 4 monteurs, 3 mois d'activité, relatifs à aujourd'hui. */
export function seedDemo(hub: Hub, now = Date.now()) {
  if (hub.clients().length) return;
  const day = (n: number, h = 18) => { const d = new Date(now); d.setDate(d.getDate() - n); d.setHours(h, 0, 0, 0); return d.getTime(); };
  let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const C = [hub.addClient('Client Finance', 1500, '#FCCA09'), hub.addClient('Client Fitness', 1200, '#FF8A5C'), hub.addClient('Client Immo', 2000, '#7C8CFF')];
  const M = [hub.addMonteur('Yanis', 25), hub.addMonteur('Inès', 25), hub.addMonteur('Tom', 30), hub.addMonteur('Léa', 20)];
  const T = [
    hub.addTournage({ code: 'T6', client_id: C[0]!.id, date: day(-2, 14), hours: 3, spot_name: null, spot_place: null, spot_price: null }),
    hub.addTournage({ code: 'T3', client_id: C[1]!.id, date: day(-5, 10), hours: 2, spot_name: 'Loft Lumière', spot_place: 'Paris 18e', spot_price: 35 }),
    hub.addTournage({ code: 'T4', client_id: C[2]!.id, date: day(-8, 15), hours: 3, spot_name: 'Bureau Club', spot_place: 'Paris 8e', spot_price: 50 }),
  ];
  const TITLES: Record<number, string[]> = {
    0: ['Combien économiser par mois ?', 'Le cap des 50 000 €', '3 leçons pour investir', 'Enveloppes fiscales : le top', 'Jeune de 30 ans, expert ou pas ?', 'Quiz riche', 'Ce que l’école ne t’apprend pas', 'Métiers qui rendent millionnaire', 'Témoignage Aaron', 'Garder sa voiture combien de temps ?', 'Bête ou intelligent ?', '1k investis à 18 ans'],
    1: ['5 erreurs à la salle', 'Sèche en 30 jours ?', 'Mon repas avant séance', 'Débutant : par où commencer', 'Pompes : la bonne forme', 'Créatine : vrai ou faux', 'Routine du matin', 'Transformation de Léo'],
    2: ['Acheter ou louer à 25 ans', 'Mon 1er appart en LMNP', 'Erreurs de primo-accédant', 'Visite d’un T2 rentable', 'Négocier le prix : 3 astuces', 'Crédit : ce que la banque regarde', 'Colocation : le bon plan ?', 'Témoignage Corentin'],
  };
  C.forEach((c, k) => TITLES[k]!.forEach((title, i) => {
    const fin = k === 0;
    let status: Status = i === 0 || (fin && i === 1) ? 'montage' : i <= 2 ? 'avalider' : i === 3 ? (fin ? 'modif' : 'valide') : i === 4 ? 'planifie' : 'publie';
    let comment: string | null = status === 'modif' ? 'Hook trop long, coupe les 2 premières secondes 🙏' : null;
    if (k === 1 && i === 1) { status = 'modif'; comment = 'La musique est trop forte sur la fin'; }
    const base = fin ? 90000 : k === 1 ? 45000 : 30000;
    const pub = status === 'publie' ? day((i - 5) * 3 + Math.floor(rnd() * 3), [12, 18, 19, 21, 8][Math.floor(rnd() * 5)]) : null;
    hub.addVideo({ client_id: c.id, title, status, comment, tag: i % 3 === 0 ? 'MOFU' : 'TOFU', monteur_id: M[(i + c.name.length) % 4]!.id,
      due_at: day(i === 0 ? 1 : -2), sent_at: status === 'avalider' ? day(i === 2 ? 3 : 1, 9) : null,
      validated_at: ['valide', 'planifie', 'publie'].includes(status) ? (pub ?? day(1)) - 86_400_000 : null,
      planned_at: status === 'planifie' ? day(-2) : null, published_at: pub,
      views: pub ? Math.round(base * (0.2 + rnd() * 2.2) * (i % 3 === 0 ? 2.2 : 1)) : 0 }, now);
  }));
  const PRE: Array<[number, Status, string]> = [[0, 'idee', 'Investir 100 €/mois à 20 ans'], [0, 'idee', 'Le piège du crédit conso'], [0, 'script', 'ETF vs livret A'], [0, 'script', 'Mes 3 erreurs à 25 ans'], [0, 'afilmer', 'Le budget 50/30/20'], [0, 'afilmer', 'Assurance-vie expliquée'], [0, 'afilmer', 'PEA : le guide'], [0, 'filme', 'Réagir à vos portefeuilles'],
    [1, 'idee', 'Prise de masse budget'], [1, 'script', 'Cardio à jeun ?'], [1, 'afilmer', 'Séance jambes 30 min'], [1, 'afilmer', '3 exos dos'], [1, 'filme', 'Routine du soir'],
    [2, 'idee', 'SCI : bonne idée ?'], [2, 'script', 'Le DPE expliqué'], [2, 'afilmer', 'Visite studio Lyon'], [2, 'afilmer', 'Rendement locatif'], [2, 'filme', 'Témoignage Inès']];
  PRE.forEach(([k, status, title], i) => hub.addVideo({ client_id: C[k]!.id, title, status, tag: i % 3 === 0 ? 'MOFU' : 'TOFU', tournage_id: status === 'afilmer' ? T[k]! : null, monteur_id: status === 'filme' ? M[i % 4]!.id : null }, now));
  // Historique : vidéos validées les mois d'avant (servent à la paie des monteurs) + mouvements bancaires
  const counts = [[14, 12, 8, 6], [16, 13, 10, 9], [18, 15, 11, 10]];
  const tx: Array<{ date: string; label: string; amount: number }> = [];
  [2, 1, 0].forEach((back, k) => {
    const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth() - back);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    counts[k]!.forEach((n, mi) => {
      const already = back === 0 ? hub.videos().filter((v) => v.monteur_id === M[mi]!.id && v.validated_at && new Date(v.validated_at).getMonth() === d.getMonth()).length : 0;
      for (let j = already; j < n; j++) hub.addVideo({ client_id: C[(j + mi) % 3]!.id, title: `Reel archivé #${j + 1}`, status: 'publie', monteur_id: M[mi]!.id, validated_at: new Date(d.getFullYear(), d.getMonth(), 2 + (j % 20)).getTime(), published_at: new Date(d.getFullYear(), d.getMonth(), 3 + (j % 20)).getTime(), views: Math.round(8000 + rnd() * 40000), tag: 'TOFU' }, now);
      if (!(back === 0 && mi === 3)) tx.push({ date: `${ym}-2${mi}`, label: `VIR ${['YANIS', 'INES', 'TOM', 'LEA'][mi]} MONTAGE`, amount: -n * M[mi]!.rate });
    });
    C.forEach((c, i) => { if (!(back === 0 && i === 2)) tx.push({ date: `${ym}-0${3 + i}`, label: `VIR SEPA ${c.name.toUpperCase()} FACT ${ym.replace('-', '')}-${i + 1}`, amount: c.fee }); });
    tx.push({ date: `${ym}-01`, label: 'PRLV NOTION LABS', amount: -10 }, { date: `${ym}-02`, label: 'PRLV ADOBE CREATIVE CLOUD', amount: -24 }, { date: `${ym}-05`, label: 'PRLV SLACK TECHNOLOGIES', amount: -8 }, { date: `${ym}-1${k + 2}`, label: 'CB PEERSPACE STUDIO PARIS 11', amount: -45 * (4 - k) });
    if (back === 0) tx.push({ date: `${ym}-17`, label: 'CB AMAZON MKTP', amount: -63 });
  });
  hub.importTx(tx, 'demo');
  hub.log('relance-client', 'Client Finance : 1 vidéo à valider depuis 3 jours, relance envoyée', 'Client Finance', true, day(0, 10));
  hub.log('relance-monteur', '« 5 erreurs à la salle » en retard d’1 jour, Tom relancé', 'Tom', true, day(0, 10));
  hub.log('question', 'Client Fitness : « On peut changer la musique de la vidéo créatine ? » → transmis à Romain', 'Client Fitness', false, day(0, 10));
}
