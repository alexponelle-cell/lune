import { ChannelType, type Client, EmbedBuilder, type Guild, type Role, type TextChannel } from 'discord.js';
import { log } from '../log.js';
import type { FanService } from '../services/fans.js';
import { bare, ensureTierRoles, LEVELUP_CHANNEL, RANKING_CHANNEL, ROLE_ALERTS, ROLE_CLIPPER, ROLE_PENDING, ROLE_TOP, VIDEOS_CHANNEL } from './fanServer.js';

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
