import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type Guild,
  type GuildMember,
  type Interaction,
  MessageFlags,
  type OverwriteResolvable,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type TextChannel,
} from 'discord.js';
import { log } from '../log.js';
import type { FanService } from '../services/fans.js';

/**
 * Serveur Discord d'un programme fans, monté par le bot du créateur avec /setup (admins).
 * Tout vient de la config du créateur (nom, couleur, étapes). Relancer /setup ne crée jamais de doublons.
 */
export const setupCommand = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Construit ou répare le serveur des clippeurs (salons, rôles, messages)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .toJSON();

export const ROLE_CREATOR = '👑 Créateur';
export const ROLE_STAFF = '🛡️ Staff';
export const ROLE_CLIPPER = '🎬 Clippeur';
export const ROLE_TOP = '🏆 Top 3 de la semaine';
export const ROLE_ALERTS = '🔔 Alerte vidéos';
export const LOG_CHANNEL = '🧾│inscriptions-log';
export const VIDEOS_CHANNEL = '📰│nouvelles-vidéos';
export const RANKING_CHANNEL = '🏆│classement';
export const LEVELUP_CHANNEL = '🎉│level-up';
/** Bouton « 🔔 Alerte vidéos » (ajoute / retire le rôle). */
export const ALERTS_BUTTON = 'fans:alerts';
/** Nom du rôle d'un niveau (ex. « 🔥 Pro »). */
export const levelRoleName = (l: { emoji: string; name: string }) => `${l.emoji} ${l.name}`;

type Access = 'public' | 'readonly' | 'staff';
interface ChannelPlan {
  name: string;
  access: Access;
  topic?: string;
}
/** Plan du serveur : catégorie → salons. */
export const SERVER_PLAN: Array<{ category: string; access: Access; channels: ChannelPlan[] }> = [
  {
    category: '📌 BIENVENUE',
    access: 'readonly',
    channels: [
      { name: '👋│bienvenue', access: 'readonly', topic: 'Comment ça marche' },
      { name: '📜│règles', access: 'readonly' },
      { name: '📣│annonces', access: 'readonly' },
    ],
  },
  {
    category: '🎬 CLIPPER',
    access: 'public',
    channels: [
      { name: '📝│inscription', access: 'readonly', topic: 'Clique sur « S’inscrire » pour relier tes comptes' },
      { name: '💬│général', access: 'public' },
      { name: '🎥│mes-clips', access: 'public', topic: 'Partage tes meilleurs clips' },
      { name: '❓│aide', access: 'public', topic: 'Une question ? Le staff te répond ici' },
    ],
  },
  {
    category: '📈 ACTIVITÉ',
    access: 'readonly',
    channels: [
      { name: VIDEOS_CHANNEL, access: 'readonly', topic: 'Chaque nouvelle vidéo, dès sa sortie : clippe-la en premier' },
      { name: RANKING_CHANNEL, access: 'readonly', topic: 'Le top 10 de la semaine, chaque lundi' },
      { name: LEVELUP_CHANNEL, access: 'readonly', topic: 'Les passages de niveau' },
    ],
  },
  {
    category: '🛡️ STAFF',
    access: 'staff',
    channels: [
      { name: LOG_CHANNEL, access: 'staff', topic: 'Chaque inscription est notée ici' },
      { name: '💬│staff', access: 'staff' },
    ],
  },
];

const color = (fans: FanService) => parseInt(fans.creator.colors.accent.slice(1), 16);

function overwrites(guild: Guild, access: Access, staffRoleId: string): OverwriteResolvable[] {
  const me = guild.members.me!.id;
  const bot = { id: me, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages] };
  const staff = { id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] };
  if (access === 'staff') return [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, staff, bot];
  if (access === 'readonly') return [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads] }, staff, bot];
  return [{ id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }, bot];
}

export const bare = (name: string) => name.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}-]/gu, '').toLowerCase();

export async function scaffoldFanServer(guild: Guild, fans: FanService, siteUrl: string) {
  const c = fans.creator;
  const created: string[] = [];
  const role = async (name: string, colour: number, hoist: boolean) => {
    const found = guild.roles.cache.find((r) => r.name === name);
    if (found) return found;
    created.push(`rôle ${name}`);
    return guild.roles.create({ name, colors: { primaryColor: colour }, hoist, reason: 'Serveur clippeurs' });
  };
  // Créés du plus haut au plus bas (Discord place chaque nouveau rôle en bas de la liste)
  await role(ROLE_CREATOR, color(fans), true);
  const staff = await role(ROLE_STAFF, 0xf5f5f7, true);
  await role(ROLE_TOP, 0xffd24a, true);
  const LEVEL_COLORS = [0x9b9aa3, 0x22c55e, 0xf97316, color(fans)];
  for (let i = c.levels.length - 1; i >= 0; i--) await role(levelRoleName(c.levels[i]!), LEVEL_COLORS[i] ?? color(fans), i > 0);
  await role(ROLE_CLIPPER, color(fans), false);
  await role(ROLE_ALERTS, 0x5ab0e0, false);

  await guild.channels.fetch();
  const channels = new Map<string, TextChannel>();
  for (const group of SERVER_PLAN) {
    let cat = guild.channels.cache.find((ch) => ch.type === ChannelType.GuildCategory && ch.name === group.category);
    if (!cat) {
      cat = await guild.channels.create({ name: group.category, type: ChannelType.GuildCategory, permissionOverwrites: overwrites(guild, group.access, staff.id) });
      created.push(`catégorie ${group.category}`);
    }
    for (const plan of group.channels) {
      // Retrouvé même si l'emoji du nom a changé (ex. « bienvenue »)
      let ch = guild.channels.cache.find((x) => x.type === ChannelType.GuildText && (x.name === plan.name || bare(x.name) === bare(plan.name))) as TextChannel | undefined;
      if (!ch) {
        ch = await guild.channels.create({ name: plan.name, type: ChannelType.GuildText, parent: cat.id, topic: plan.topic, permissionOverwrites: overwrites(guild, plan.access, staff.id) });
        created.push(`#${plan.name}`);
      }
      channels.set(bare(plan.name), ch);
    }
  }

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('fans:signup').setStyle(ButtonStyle.Primary).setLabel('S’inscrire').setEmoji('📝'),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Ouvrir le site').setURL(siteUrl),
  );
  const rate = fans.settings().pointsPer1000;
  const steps = c.texts.steps.map((s, i) => `**${String(i + 1).padStart(2, '0')} · ${s.title}**\n${s.text}`).join('\n\n');
  const posts: Array<[string, () => { embeds: EmbedBuilder[]; components?: ActionRowBuilder<ButtonBuilder>[] }]> = [
    [
      'bienvenue',
      () => ({
        embeds: [
          new EmbedBuilder()
            .setColor(color(fans))
            .setTitle(`Bienvenue sur le serveur clipping de ${c.creatorName}`)
            .setDescription(`${c.texts.heroText.replace(/\*\*/g, '')}\n\n${steps}\n\n🪙 **${rate} coins pour 1 000 vues**, tous comptes confondus. Les vues sont comptées une fois par jour.`)
            .setThumbnail(`${siteUrl.replace(/\/fan$/, '')}/fan/assets/creator.png`),
        ],
        components: [buttons],
      }),
    ],
    [
      'règles',
      () => ({
        embeds: [
          new EmbedBuilder()
            .setColor(color(fans))
            .setTitle('Règles')
            .setDescription(
              [
                `1. Tes clips doivent venir des contenus de ${c.creatorName}.`,
                '2. Un compte TikTok, YouTube ou Instagram ne peut être relié qu’à une seule personne.',
                '3. Pas de faux comptes ni de vues achetées : les coins gagnés ainsi sont retirés.',
                '4. Respect de tout le monde, dans les salons comme en message privé.',
                '5. Le staff peut retirer un compte ou des coins en cas d’abus.',
              ].join('\n'),
            ),
        ],
      }),
    ],
    [
      'inscription',
      () => ({
        embeds: [
          new EmbedBuilder()
            .setColor(color(fans))
            .setTitle('Inscris-toi')
            .setDescription(
              `Clique sur **S’inscrire** et renseigne tes comptes TikTok, YouTube, Instagram et ton ${c.rewardAccount.label.charAt(0).toLowerCase()}${c.rewardAccount.label.slice(1)}.\n\nTu peux recliquer à tout moment pour modifier tes comptes. Seules les vues faites après ton inscription comptent.`,
            ),
        ],
        components: [buttons],
      }),
    ],
  ];
  posts.push([
    bare(VIDEOS_CHANNEL),
    () => ({
      embeds: [
        new EmbedBuilder()
          .setColor(color(fans))
          .setTitle('Nouvelles vidéos')
          .setDescription(`Chaque nouvelle vidéo de ${c.creatorName} est postée ici dès sa sortie. Les premiers clips sont ceux qui font le plus de vues.\n\nClique sur **🔔 Alerte vidéos** pour être mentionné à chaque sortie.`),
      ],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(ALERTS_BUTTON).setStyle(ButtonStyle.Secondary).setLabel('Alerte vidéos').setEmoji('🔔'))],
    }),
  ]);
  const me = guild.members.me!.id;
  for (const [key, build] of posts) {
    const ch = channels.get(key);
    if (!ch) continue;
    const recent = await ch.messages.fetch({ limit: 20 }).catch(() => null);
    if (recent?.some((m) => m.author.id === me)) continue; // déjà posté
    await ch.send(build());
    created.push(`message #${key}`);
  }
  return created;
}

/** Bouton « 🔔 Alerte vidéos » : ajoute ou retire le rôle. */
export async function handleAlertsButton(interaction: Interaction) {
  if (!interaction.isButton() || interaction.customId !== ALERTS_BUTTON || !interaction.inCachedGuild()) return;
  try {
    const role = interaction.guild.roles.cache.find((r) => r.name === ROLE_ALERTS);
    if (!role) return void (await interaction.reply({ content: 'Rôle introuvable : un admin doit refaire /setup.', flags: MessageFlags.Ephemeral }));
    const has = interaction.member.roles.cache.has(role.id);
    if (has) await interaction.member.roles.remove(role);
    else await interaction.member.roles.add(role);
    await interaction.reply({ content: has ? '🔕 Alertes vidéos désactivées.' : '🔔 Alertes activées : tu seras mentionné à chaque nouvelle vidéo.', flags: MessageFlags.Ephemeral });
  } catch (err) {
    log.warn(`alerte vidéos : ${err instanceof Error ? err.message : String(err)}`);
    await interaction.reply({ content: 'Impossible de changer ton rôle : le rôle du bot doit être tout en haut (Paramètres → Rôles).', flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

/** /setup : réservé aux admins du serveur. */
export async function handleSetup(interaction: Interaction, fans: FanService, siteUrl: string) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'setup' || !interaction.inCachedGuild()) return;
  try {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Réservé aux admins du serveur.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const created = await scaffoldFanServer(interaction.guild, fans, siteUrl);
    // Les automatisations (niveaux, classement, vidéos) ne tournent que sur les serveurs montés par /setup
    const set = new Set(fans.botState<string[]>('setup-guilds', []));
    set.add(interaction.guild.id);
    fans.setBotState('setup-guilds', [...set]);
    await interaction.editReply(
      created.length
        ? `✅ Serveur prêt. Créé : ${created.join(', ')}.\nPense à mettre le rôle du bot tout en haut (Paramètres → Rôles) pour qu’il puisse donner le rôle Clippeur.`
        : '✅ Tout est déjà en place, rien à créer.',
    );
  } catch (err) {
    log.error('/setup (serveur fans)', err);
    const msg = `Oups : ${err instanceof Error ? err.message : String(err)}. Le bot a-t-il la permission Administrateur ?`.slice(0, 300);
    await (interaction.deferred ? interaction.editReply(msg) : interaction.reply({ content: msg, flags: MessageFlags.Ephemeral })).catch(() => {});
  }
}

/** Après une inscription réussie : rôle Clippeur + trace dans le salon staff (si le serveur a été monté par /setup). */
export async function onFanRegistered(guild: Guild, member: GuildMember, accounts: string[]) {
  try {
    const role = guild.roles.cache.find((r) => r.name === ROLE_CLIPPER);
    if (role && !member.roles.cache.has(role.id)) await member.roles.add(role, 'Inscription clippeur');
    const logCh = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === LOG_CHANNEL) as TextChannel | undefined;
    await logCh?.send({ content: `📝 ${member} s’est inscrit : ${accounts.join(', ')}`, allowedMentions: { parse: [] } });
  } catch (err) {
    log.warn(`inscription : rôle ou log impossible (${err instanceof Error ? err.message : String(err)})`);
  }
}
