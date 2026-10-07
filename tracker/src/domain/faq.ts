/**
 * FAQ automatique du salon ❓│aide (gratuit, sans IA payante) : on reconnaît la question par mots-clés
 * et on répond avec les infos du programme (taux, récompense, #tag) et, pour « pourquoi j'ai 0 coins »,
 * avec le diagnostic du compte du fan. Si on ne reconnaît rien, on laisse le staff répondre.
 */
export type FaqIntent = 'coins' | 'link' | 'tag' | 'when' | 'rate' | 'reward' | 'site' | 'connect' | 'followers' | 'editing' | 'repost' | 'grow';

export interface FaqInfo {
  creatorName: string;
  /** Mot-clé à mettre dans la légende (ex. « #squiduu »). */
  tag: string;
  pointsPer1000: number;
  reward: { name: string; price: number } | null;
  siteUrl: string;
  /** Plateformes à connecter officiellement sur le site (TikTok / Instagram), si activé. */
  officialLogin: string[];
}

/** Minuscules, sans accents ni ponctuation (sauf #). */
export const normalize = (s: string) =>
  ` ${s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9#?+\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;

const has = (t: string, ...words: string[]) => words.some((w) => t.includes(w));

/** Ordre = priorité : le premier qui correspond gagne. */
const RULES: Array<{ intent: FaqIntent; test: (t: string) => boolean }> = [
  { intent: 'connect', test: (t) => has(t, 'connect', 'co mon', 'connecter') && has(t, 'tiktok', 'tik tok', 'insta') },
  { intent: 'coins', test: (t) => has(t, 'coin', 'piece', 'point') && has(t, ' 0 ', ' zero', 'pas de', 'aucun', 'rien', 'pourquoi', 'pk ', 'pq ', 'bug', 'compte pas', 'comptent pas', 'marche pas', 'bouge pas') },
  { intent: 'coins', test: (t) => has(t, 'vues') && has(t, 'compte pas', 'comptent pas', 'pas compte', 'pas pris', 'apparai', 'affiche pas', 'bouge pas', 'detecte') },
  { intent: 'tag', test: (t) => has(t, '#', 'hashtag', 'hastag', 'mot cle', 'mot-cle', 'legende', 'description') },
  { intent: 'link', test: (t) => has(t, 'relier', 'relie', 'lier', 'ajouter', 'ajoute', 'changer', 'modifier', 'enregistr', 'inscri') && has(t, 'compte', 'tiktok', 'insta', 'youtube', 'chaine') },
  { intent: 'when', test: (t) => has(t, 'quand', 'combien de temps', 'a quelle heure', 'actualis', 'mise a jour', 'maj ', 'refresh') && has(t, 'vue', 'coin', 'actualis', 'mise a jour', 'maj', 'refresh', 'classement') },
  { intent: 'reward', test: (t) => has(t, 'echang', 'boutique', 'recompense', 'acheter', 'achat', 'recevoir', 'recu', 'livr') },
  { intent: 'rate', test: (t) => has(t, 'combien') && has(t, 'coin', 'vue', 'gagne', 'rapporte') },
  { intent: 'followers', test: (t) => has(t, 'abonne', 'abo ', 'followers') && has(t, 'minimum', 'combien', 'faut', 'besoin', 'petit') },
  { intent: 'site', test: (t) => has(t, 'site', 'lien', 'connexion', 'me connecter', 'se connecter', 'login') },
  { intent: 'grow', test: (t) => has(t, 'plus de vue', '+ de vue', 'plus de vues', 'faire des vues', 'faire + de', 'percer', 'viral', 'buzz', 'algo', 'conseil', 'astuce', 'tips', 'marche pas mes clips', 'flop') },
  { intent: 'editing', test: (t) => has(t, 'monter', 'montage', 'capcut', 'logiciel', 'edit', 'sous titre', 'sous-titre', 'faire un clip', 'faire des clips') },
  { intent: 'repost', test: (t) => has(t, 'meme clip', 'plusieurs compte', 'plusieurs plateforme', 'repost', 'reposter', 'poster partout') },
];

/** Le message ressemble-t-il à une question (et pas à une discussion) ? */
const isQuestion = (raw: string, t: string) =>
  raw.includes('?') || /^ (comment|pourquoi|pk|pq|quand|combien|est ce|c est quoi|ou |on peut|je peux|j peux|jpeux|faut il|il faut|svp|aide|help)/.test(t) || has(t, ' svp ', ' stp ', ' pk ', ' pq ', 'quelqu un sait', 'qqn sait', 'comment ', 'pourquoi ', ' c normal ', ' normal que ');

export function matchFaq(raw: string): FaqIntent | null {
  const t = normalize(raw);
  if (t.length < 8 || t.length > 400 || !isQuestion(raw, t)) return null;
  return RULES.find((r) => r.test(t))?.intent ?? null;
}

const fmt = (n: number) => n.toLocaleString('fr-FR');

/** Réponse à une question reconnue. `diagnosis` : lignes propres au fan (question sur ses coins). */
export function faqAnswer(intent: FaqIntent, info: FaqInfo, diagnosis: string[] = []): string {
  const rate = `**1 000 vues = ${fmt(info.pointsPer1000)} coins** 🪙, tous comptes confondus`;
  const reward = info.reward ? `**${info.reward.name}** (${fmt(info.reward.price)} coins)` : 'les récompenses de la boutique';
  const official = info.officialLogin.length
    ? `\n📱 Pense aussi à **connecter ${info.officialLogin.map((p) => (p === 'tiktok' ? 'ton TikTok' : 'ton Instagram')).join(' et ')}** sur le site (onglet Clipper) : c'est ce qui compte tes vues.`
    : '';
  switch (intent) {
    case 'coins':
      return diagnosis.length
        ? `🔎 J'ai regardé ton compte :\n${diagnosis.map((l) => `• ${l}`).join('\n')}`
        : `Pour qu'un clip rapporte des coins 🪙 :\n• il est posté sur un compte **relié** (et vérifié)\n• il est publié **après** que tu as relié le compte\n• sa légende contient **${info.tag}**\nLes vues sont relevées **chaque nuit**, donc les coins arrivent le lendemain.`;
    case 'tag':
      return `Mets **${info.tag}** dans la légende de **chaque clip** ✍️ Sans ça, le clip ne rapporte aucun coin (c'est comme ça qu'on sait qu'il parle de ${info.creatorName}).\nTu peux modifier la légende d'un clip déjà posté : il sera repris au prochain relevé.`;
    case 'link':
      return `Pour relier tes comptes TikTok / Insta / YouTube : va dans **📝│inscription** et clique sur **S'inscrire** 🔗\nSeules les vues des clips postés **après** l'inscription comptent.${official}`;
    case 'connect':
      return `Va sur le site 👉 ${info.siteUrl} → onglet **Clipper** → **Connecter mon TikTok / Instagram** (1 clic, on ne publie rien).\nPour Insta, ton compte doit être en **compte créateur** (Paramètres → Type de compte → Passer à un compte professionnel → Créateur, gratuit).`;
    case 'when':
      return `Les vues sont relevées **chaque nuit** 🌙 : tes coins et le classement sont mis à jour le lendemain matin. Pas besoin de faire quoi que ce soit.`;
    case 'rate':
      return `${rate}. Tu échanges ensuite tes coins contre ${reward} 🎁`;
    case 'reward':
      return `Tes coins s'échangent sur le site 👉 ${info.siteUrl} → onglet **Récompenses** 🎁\nUn membre du staff valide l'échange, puis tu reçois un message privé quand c'est livré.`;
    case 'site':
      return `Fais **/site** ici sur le serveur : le bot t'envoie ton lien de connexion perso 🔗 (ou connecte-toi avec Discord sur ${info.siteUrl}).`;
    case 'followers':
      return `**Aucun minimum d'abonnés** 🙌 Un compte qui démarre peut gagner des coins dès son premier clip.`;
    case 'editing':
      return `Tout est expliqué dans **🎓│tutos** (formation Neptune Academy) 🎬 CapCut (gratuit) suffit largement : un moment fort, une accroche dans les 2 premières secondes, des sous-titres.`;
    case 'grow':
      return `Les clips qui font des vues 🚀 :\n• **Accroche dans les 2 premières secondes** (le moment le plus fort en premier, pas d'intro)\n• **Court** : 15 à 40 secondes, coupe tous les blancs\n• **Sous-titres** gros et lisibles + un titre qui donne envie\n• **Régularité** : 1 à 3 clips par jour, sur TikTok, Insta **et** Shorts\n• Choisis les moments **drôles, choquants ou impressionnants** de ${info.creatorName}\nTout est détaillé dans **🎓│tutos** 🎬`;
    case 'repost':
      return `Oui ✅ Tu peux poster le même clip sur TikTok, Insta **et** YouTube Shorts : chaque plateforme compte, tant que le compte est relié et que la légende contient **${info.tag}**.`;
  }
}

/** Diagnostic « pourquoi j'ai 0 coins » à partir de l'état du fan. */
export interface CoinsState {
  accounts: Array<{ platform: string; handle: string; verified: boolean; checked: boolean; error: string | null }>;
  clips: number;
  counted: number;
  refusedTag: number;
  balance: number;
  views: number;
  tag: string;
  pointsPer1000: number;
}

export function coinsDiagnosis(s: CoinsState): string[] {
  const out: string[] = [];
  if (!s.accounts.length) return ['Tu n’as **aucun compte relié** : va dans **📝│inscription** et clique sur **S’inscrire**.'];
  const never = s.accounts.filter((a) => !a.checked);
  if (never.length) out.push(`${never.map((a) => `@${a.handle}`).join(', ')} : **pas encore relevé**, ce sera fait cette nuit 🌙`);
  for (const a of s.accounts.filter((x) => x.error)) out.push(`@${a.handle} : ${a.error}`);
  const unverified = s.accounts.filter((a) => !a.verified && a.checked);
  if (unverified.length) out.push(`${unverified.map((a) => `@${a.handle}`).join(', ')} : **en vérification par le staff** (gros compte), ses vues compteront une fois validé.`);
  if (!s.clips && !never.length) out.push('**Aucun clip détecté** sur tes comptes reliés. Poste depuis ces comptes-là (pas un autre) 🎬');
  if (s.refusedTag) out.push(`**${s.refusedTag} clip(s) sans ${s.tag}** dans la légende : ils ne rapportent rien. Ajoute ${s.tag} (même après coup) ✍️`);
  if (s.clips && !s.counted && !s.refusedTag) out.push('Tes clips détectés ont été **publiés avant ton inscription** : seuls les nouveaux clips rapportent.');
  if (s.counted && s.balance === 0) out.push(`Tes clips comptent ✅ mais il faut **1 000 vues pour ${s.pointsPer1000} coins** : continue, ça arrive !`);
  if (!out.length) out.push(`Tout est bon ✅ Tu as **${s.balance.toLocaleString('fr-FR')} coins** pour ${s.views.toLocaleString('fr-FR')} vues qui comptent.`);
  return out;
}

/** Erreur de relevé d'un compte, expliquée au fan. */
export function fanAccountError(err: string): string {
  if (/apify|quota|hard limit/i.test(err)) return 'relevé en pause de notre côté, il reprend tout seul (rien à faire) ⏳';
  if (/pas connecté/i.test(err)) return '**connecte ce compte sur le site** (onglet Clipper) pour que ses vues comptent';
  if (/introuvable|not found|404/i.test(err)) return '**compte introuvable** : pseudo faux, compte privé ou supprimé. Vérifie-le (il doit être public)';
  if (/expirée/i.test(err)) return '**connexion expirée** : reconnecte ce compte sur le site (onglet Clipper)';
  return 'problème de relevé, le staff va regarder 👀';
}
