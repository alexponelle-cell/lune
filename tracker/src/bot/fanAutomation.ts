import { ChannelType, type Client, EmbedBuilder, type Guild, type Role, type TextChannel } from 'discord.js';
import { log } from '../log.js';
import type { FanService } from '../services/fans.js';
import { bare, ensureTierRoles, LEVELUP_CHANNEL, levelRoleName, ROLE_READER, ROLE_RULES, ROLE_TRAINED, LOG_CHANNEL, RANKING_CHANNEL, ROLE_ALERTS, ROLE_CLIPPER, ROLE_PENDING, ROLE_TOP, VIDEOS_CHANNEL } from './fanServer.js';

/**
 * Automatisations des serveurs montés par /setup (sans effet ailleurs : rôles et salons introuvables).
 *  - rôles de palier (= objets de la boutique) selon les coins gagnés, avec annonce dans #level-up
 *  - chaque lundi 10 h (Paris) : top 10 dans #classement + rôle Top 3
 *  - chaque nouvelle vidéo YouTube du créateur postée dans #nouvelles-vidéos
 */
const nf = (n: number) => n.toLocaleString('fr-FR').replace(/ | /g, ' ');
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.0', '').replace('.', ',')} M` : n >= 1e4 ? `${Math.round(n / 1e3)} k` : nf(n));
const accent = (fans: FanService) => parseInt(fans.creator.colors.accent.slice(1), 16);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function channel(guild: Guild, name: string): TextChannel | undefined {
  return guild.channels.cache.find((c) => c.type === ChannelType.GuildText && bare(c.name) === bare(name)) as TextChannel | undefined;
}
const roleNamed = (guild: Guild, name: string): Role | undefined => guild.roles.cache.find((r) => r.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"));
/** Serveurs montés par /setup (jamais les autres serveurs où le bot est présent). */
const setupGuilds = (client: Client<true>, fans: FanService) => {
  const ids = new Set(fans.botState<string[]>('setup-guilds', []));
  return [...client.guilds.cache.values()].filter((g) => ids.has(g.id));
};

/** Nouveaux comptes à vérifier : signalés une fois au staff dans le log. */
export async function reportAccountsToReview(client: Client<true>, fans: FanService): Promise<number> {
  const told = new Set(fans.botState<number[]>('accounts-announced', []));
  const fresh = fans.accountsToReview().filter((a) => !told.has(a.id));
  if (!fresh.length) return 0;
  for (const guild of setupGuilds(client, fans)) {
    const log = channel(guild, LOG_CHANNEL);
    if (!log) continue;
    const lines = fresh.slice(0, 15).map((a) => `• <@${a.discordId}> · ${a.platform} ${a.url}`);
    await log
      .send({ content: `🔎 **${fresh.length} gros compte(s) à vérifier** (contenu de ${fans.creator.creatorName} ?) :\n${lines.join('\n')}${fresh.length > 15 ? '\n…' : ''}\nValide-les dans Mars (Boutique fans → Comptes à vérifier).`, allowedMentions: { parse: [] } })
      .catch(() => {});
  }
  fans.setBotState('accounts-announced', [...told, ...fresh.map((a) => a.id)].slice(-2000));
  return fresh.length;
}

/** Achats à valider : signalés une fois au staff dans le log (validation dans Mars). */
export async function reportOrdersToApprove(client: Client<true>, fans: FanService): Promise<number> {
  const told = new Set(fans.botState<number[]>('orders-announced', []));
  const fresh = fans.fans.toApprove().filter((o) => !told.has(o.id));
  if (!fresh.length) return 0;
  for (const guild of setupGuilds(client, fans)) {
    const log = channel(guild, LOG_CHANNEL);
    if (!log) continue;
    for (const o of fresh) {
      const who = fans.fans.discordIdOf(o.clipperId);
      await log
        .send({ content: `🛒 **Achat à valider** : ${who ? `<@${who}>` : 'un fan'} · ${o.itemName} (${nf(o.price)} coins)\nRegarde ses clips dans Mars (Boutique fans → Commandes), puis ✅ Valider ou Refuser.`, allowedMentions: { parse: [] } })
        .catch(() => {});
    }
  }
  fans.setBotState('orders-announced', [...told, ...fresh.map((o) => o.id)].slice(-500));
  return fresh.length;
}

/** Fans suspects (gros compte, clip qui explose d'emblée) : mis « à vérifier » et signalés au staff dans le log. */
export async function reportSuspicious(client: Client<true>, fans: FanService): Promise<number> {
  const found = fans.flagSuspicious();
  if (!found.length) return 0;
  for (const guild of setupGuilds(client, fans)) {
    const log = channel(guild, LOG_CHANNEL);
    if (!log) continue;
    for (const f of found) {
      const c = f;
      if (c.discordId.startsWith('manual:') || !c.discordId) continue;
      await log
        .send({ content: `⚠️ **À vérifier** : <@${c.discordId}> (${c.username}) · ${f.reason}\nSes achats sont bloqués. Vérifie que le compte est bien à lui, puis valide-le dans Mars (Boutique fans → Fans) ou supprime-le.`, allowedMentions: { parse: [] } })
        .catch(() => {});
    }
  }
  return found.length;
}

/**
 * 1er clip détecté → la communauté se débloque : rôle 🎬 Clippeur à la place de « 1er clip à poster »,
 * message dans son salon privé. Chaque fan n'est traité qu'une fois. Renvoie le nombre de débloqués.
 */
export async function unlockFirstClips(client: Client<true>, fans: FanService): Promise<number> {
  const done = fans.firstClipDone();
  const handled = new Set(fans.botState<string[]>('first-clip-unlocked', []));
  const todo = [...done].filter((id) => !handled.has(id) && !id.startsWith('manual:'));
  if (!todo.length) return 0;
  let unlocked = 0;
  for (const guild of setupGuilds(client, fans)) {
    const clipper = roleNamed(guild, ROLE_CLIPPER);
    const pending = roleNamed(guild, ROLE_PENDING);
    if (!clipper || !pending) continue;
    for (const id of todo) {
      const member = guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));
      if (!member) continue;
      handled.add(id);
      if (!member.roles.cache.has(pending.id)) continue; // ancien clippeur (déjà dans la communauté)
      try {
        await member.roles.add(clipper.id, '1er clip détecté');
        await member.roles.remove(pending.id, '1er clip détecté');
        unlocked++;
        const priv = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && (c as TextChannel).topic?.includes(`[${id}]`)) as TextChannel | undefined;
        await priv?.send({ content: `🎉 ${member} **ton 1er clip est détecté !** Toute la communauté est débloquée : annonces, #général, classement. Continue comme ça 🔥` }).catch(() => {});
      } catch (err) {
        handled.delete(id);
        log.warn(`1er clip (${guild.name}) : ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  fans.setBotState('first-clip-unlocked', [...handled]);
  return unlocked;
}

/**
 * Rôles de palier = objets de la boutique : chaque fan a le rôle du plus gros objet que ses coins gagnés
 * lui ont débloqué, annoncé dans #level-up. Renvoie le nombre de changements.
 */
export async function syncTierRoles(client: Client<true>, fans: FanService): Promise<number> {
  const tiers = fans.shopTiers();
  const people = fans.fanTiers();
  let changes = 0;
  for (const guild of setupGuilds(client, fans)) {
    const roles = await ensureTierRoles(guild, fans).catch((err) => {
      log.warn(`rôles de palier (${guild.name}) : ${err instanceof Error ? err.message : String(err)}`);
      return null;
    });
    if (!roles) continue;
    const levelUp = channel(guild, LEVELUP_CHANNEL);
    for (const f of people) {
      const member = await guild.members.fetch(f.discordId).catch(() => null);
      if (!member) continue;
      const current = roles.reduce((acc, r, i) => (member.roles.cache.has(r.id) ? i : acc), -1);
      const extra = roles.filter((r, i) => i !== f.tier && member.roles.cache.has(r.id));
      if (current === f.tier && extra.length === 0) continue;
      try {
        if (extra.length) await member.roles.remove(extra.map((r) => r.id));
        if (f.tier >= 0 && !member.roles.cache.has(roles[f.tier]!.id)) await member.roles.add(roles[f.tier]!.id);
        changes++;
        // Annoncé une seule fois par fan et par palier, même si le rôle a été retiré puis rendu
        const key = f.tier >= 0 ? `tier:${guild.id}:${tiers[f.tier]!.itemId}` : '';
        if (f.tier > current && levelUp && key && !fans.fans.wasNotified(f.clipperId, key)) {
          fans.fans.markNotified(f.clipperId, key);
          const t = tiers[f.tier]!;
          await levelUp.send({
            content: `${member}`,
            embeds: [
              new EmbedBuilder()
                .setColor(accent(fans))
                .setDescription(`🎉 ${member} a débloqué **${t.name}** en atteignant **${nf(t.price)} coins** !\n👉 [Échange-le sur le site](${fans.publicSiteUrl()})`),
            ],
            allowedMentions: { users: [member.id] },
          });
        }
      } catch (err) {
        log.warn(`rôles de palier (${guild.name}) : ${err instanceof Error ? err.message : String(err)}`);
      }
      await pause(300);
    }
  }
  return changes;
}

/**
 * Grades du mois glissant (créateur avec `gradeWindowDays`) : Débutant / Confirmé / Pro / Élite selon les vues des 30 derniers jours.
 * Le rôle monte dès que le seuil est atteint et redescend quand le mois glissant repasse sous le seuil.
 * Une montée est annoncée dans #level-up (une fois par grade et par mois).
 */
export async function syncGradeRoles(client: Client<true>, fans: FanService, now = Date.now()): Promise<number> {
  const days = fans.creator.gradeWindowDays;
  if (!days) return 0;
  const levels = fans.creator.levels;
  const people = fans.fanLevels(now, days);
  const month = new Date(now).toISOString().slice(0, 7);
  let changes = 0;
  for (const guild of setupGuilds(client, fans)) {
    // Rôles des grades, du plus haut au plus bas (Discord place chaque nouveau rôle en bas)
    const roles: Role[] = [];
    try {
      for (let i = levels.length - 1; i >= 0; i--) {
        const name = levelRoleName(levels[i]!);
        roles[i] = guild.roles.cache.find((r) => bare(r.name) === bare(name)) ?? (await guild.roles.create({ name, colors: { primaryColor: accent(fans) }, hoist: true, reason: 'Grade du mois' }));
      }
    } catch (err) {
      log.warn(`grades (${guild.name}) : ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const levelUp = channel(guild, LEVELUP_CHANNEL);
    for (const f of people) {
      const member = await guild.members.fetch(f.discordId).catch(() => null);
      if (!member) continue;
      const current = roles.reduce((acc, r, i) => (member.roles.cache.has(r.id) ? i : acc), -1);
      const extra = roles.filter((r, i) => i !== f.level && member.roles.cache.has(r.id));
      if (current === f.level && extra.length === 0) continue;
      try {
        if (extra.length) await member.roles.remove(extra.map((r) => r.id));
        if (!member.roles.cache.has(roles[f.level]!.id)) await member.roles.add(roles[f.level]!.id);
        changes++;
        const key = `grade:${guild.id}:${f.level}:${month}`;
        if (f.level > current && current >= 0 && f.level > 0 && levelUp && !fans.fans.wasNotified(f.clipperId, key)) {
          fans.fans.markNotified(f.clipperId, key);
          const l = levels[f.level]!;
          await levelUp.send({
            content: `${member}`,
            embeds: [new EmbedBuilder().setColor(accent(fans)).setDescription(`${l.emoji} ${member} passe **${l.name}** avec **${nf(f.views)} vues** sur les ${days} derniers jours ! 🔥`)],
            allowedMentions: { users: [member.id] },
          });
        }
      } catch (err) {
        log.warn(`grades (${guild.name}) : ${err instanceof Error ? err.message : String(err)}`);
      }
      await pause(300);
    }
  }
  return changes;
}

/**
 * Funnel d'onboarding (Mars) : combien de membres du serveur ont franchi chaque étape Discord
 * (lu la bienvenue → règles acceptées → formation validée). Mis à jour au plus 1 fois par heure.
 * Compte exact si « Server Members Intent » est activé (liste de tous les membres), sinon estimation.
 */
export async function snapshotOnboarding(client: Client<true>, fans: FanService, now = Date.now()): Promise<void> {
  const last = fans.botState<{ at?: number }>('onboarding', {}).at ?? 0;
  if (now - last < 60 * 60_000) return;
  const guild = setupGuilds(client, fans)[0];
  if (!guild) return;
  let exact = true;
  const members = await guild.members.fetch().catch(() => {
    exact = false;
    return guild.members.cache;
  });
  const has = (m: { roles: { cache: { some: (f: (r: Role) => boolean) => boolean } } }, names: string[]) =>
    m.roles.cache.some((r) => names.some((n) => bare(n) === bare(r.name)));
  const humans = [...members.values()].filter((m) => !m.user.bot);
  const after = [ROLE_RULES, ROLE_TRAINED, ROLE_PENDING, ROLE_CLIPPER];
  fans.setBotState('onboarding', {
    at: now,
    exact,
    members: exact ? humans.length : guild.memberCount,
    reader: humans.filter((m) => has(m, [ROLE_READER, ...after])).length,
    rules: humans.filter((m) => has(m, after)).length,
    trained: humans.filter((m) => has(m, [ROLE_TRAINED, ROLE_PENDING, ROLE_CLIPPER])).length,
  });
}

/** Heure de Paris : jour de la semaine (1 = lundi), heure, et date du jour (AAAA-MM-JJ). */
export function parisClock(now: number) {
  const d = new Date(now);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(d.toLocaleString('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }));
  const hour = Number(d.toLocaleString('en-US', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }));
  return { weekday, hour, day: d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }) };
}

/** Lundi à partir de 10 h (Paris), une seule fois par semaine : top 10 + rôle Top 3. */
export async function weeklyRanking(client: Client<true>, fans: FanService, now = Date.now()): Promise<boolean> {
  const { weekday, hour, day } = parisClock(now);
  if (weekday !== 1 || hour < 10 || fans.botState<string>('ranking-week', '') === day) return false;
  fans.setBotState('ranking-week', day);
  const top = fans.weeklyTop(now, 10);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.map((r, i) => `${medals[i] ?? `**${i + 1}.**`} ${r.discordId ? `<@${r.discordId}>` : r.name} · ${compact(r.views)} vues · +${nf(r.coins)} coins`);
  const podium = top.slice(0, 3).map((r) => r.discordId).filter((x): x is string => !!x);
  for (const guild of setupGuilds(client, fans)) {
    const ch = channel(guild, RANKING_CHANNEL);
    if (!ch) continue;
    try {
      await ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor(accent(fans))
            .setTitle('🏆 Classement de la semaine')
            .setDescription(lines.length ? lines.join('\n') : 'Pas encore de vues cette semaine. Le premier clip peut prendre la tête.')
            .setFooter({ text: 'Les 7 derniers jours · prochain classement lundi prochain' }),
        ],
        allowedMentions: { users: podium },
      });
      const role = roleNamed(guild, ROLE_TOP);
      if (!role) continue;
      const previous = fans.botState<string[]>(`top3:${guild.id}`, []);
      for (const id of previous.filter((x) => !podium.includes(x))) {
        const m = await guild.members.fetch(id).catch(() => null);
        await m?.roles.remove(role).catch(() => {});
      }
      for (const id of podium) {
        const m = await guild.members.fetch(id).catch(() => null);
        await m?.roles.add(role).catch(() => {});
      }
      fans.setBotState(`top3:${guild.id}`, podium);
    } catch (err) {
      log.warn(`classement de la semaine (${guild.name}) : ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return true;
}

/** Le 1er du mois à partir de 10 h (Paris) : top N du mois écoulé récompensé (ex. Loann : 1 mois de MS), annoncé dans #classement. */
export async function monthlyPodium(client: Client<true>, fans: FanService, now = Date.now()): Promise<boolean> {
  const { hour, day } = parisClock(now);
  if (!day.endsWith('-01') || hour < 10) return false;
  const r = fans.awardMonthlyPrize(now);
  if (!r) return false;
  const medals = ['🥇', '🥈', '🥉'];
  const lines = r.winners.map((w, i) => `${medals[i] ?? `**${i + 1}.**`} <@${w.discordId}> · ${compact(w.views)} vues`);
  for (const guild of setupGuilds(client, fans)) {
    const ch = channel(guild, RANKING_CHANNEL);
    if (!ch) continue;
    await ch
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(accent(fans))
            .setTitle(`🏆 Podium de ${r.month}`)
            .setDescription(
              r.winners.length
                ? `${lines.join('\n')}\n\n🎁 Le top ${r.winners.length} gagne **${r.reward}**, offert ! Il est envoyé sur l’e-mail de votre inscription.\nNouveau mois, compteurs à zéro : à vous de jouer 🔥`
                : 'Personne n’a fait de vues ce mois-ci. Le podium du mois prochain est grand ouvert 🔥',
            ),
        ],
        allowedMentions: { users: r.winners.map((w) => w.discordId) },
      })
      .catch((err) => log.warn(`podium du mois (${guild.name}) : ${err instanceof Error ? err.message : String(err)}`));
  }
  return true;
}

/** Nouvelles vidéos du créateur → #nouvelles-vidéos (1er passage : mémorise l'existant sans rien poster). */
export async function announceNewVideos(client: Client<true>, fans: FanService, youtubeApiKey: string): Promise<number> {
  const videos = await fans.latestVideos(youtubeApiKey, 5);
  const seen = fans.botState<string[] | null>('yt-seen', null);
  if (seen === null) {
    fans.setBotState('yt-seen', videos.map((v) => v.id));
    return 0;
  }
  const fresh = videos.filter((v) => !seen.includes(v.id)).reverse();
  if (!fresh.length) return 0;
  fans.setBotState('yt-seen', [...fresh.map((v) => v.id), ...seen].slice(0, 100));
  for (const guild of setupGuilds(client, fans)) {
    const ch = channel(guild, VIDEOS_CHANNEL);
    if (!ch) continue;
    const role = roleNamed(guild, ROLE_ALERTS);
    for (const v of fresh) {
      await ch
        .send({
          content: `${role ? `${role} ` : ''}Nouvelle vidéo de **${fans.creator.creatorName}** : clippe-la en premier !`,
          embeds: [new EmbedBuilder().setColor(accent(fans)).setTitle(v.title.slice(0, 250)).setURL(v.url).setImage(v.thumbnail)],
          allowedMentions: { roles: role ? [role.id] : [] },
        })
        .catch((err) => log.warn(`nouvelle vidéo (${guild.name}) : ${err instanceof Error ? err.message : String(err)}`));
    }
  }
  return fresh.length;
}
