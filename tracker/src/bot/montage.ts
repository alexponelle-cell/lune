import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type CategoryChannel,
  ChannelType,
  type Client,
  EmbedBuilder,
  Events,
  type Guild,
  type GuildMember,
  type Interaction,
  MessageFlags,
  type OverwriteResolvable,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type TextChannel,
} from 'discord.js';
import { log } from '../log.js';

/**
 * Serveur des monteurs (/setup-montage, bot de l'agence) :
 *  - à l'arrivée, on choisit « Monteur » ou « Head of Content » ;
 *  - un monteur choisit ses créateurs (plusieurs possibles) → leurs sections + son salon privé ;
 *  - le Head of Content voit toutes les sections et tous les salons privés.
 * Accès direct (pas de validation). Relancer /setup-montage ne crée jamais de doublons.
 */
export const MONTAGE_CREATORS = ['Elie', 'Science', 'Sabrina', 'Adrien'] as const;

export const ROLE_EDITOR = '🎬 Monteur';
export const ROLE_HOC = '🧠 Head of Content';
export const ROLE_STAFF = '🛡️ Staff';
export const creatorRole = (name: string) => `✂️ Team ${name}`;
const WELCOME = '👋│bienvenue';
const LOGS = '🧾│logs';
const PRIVATE_CATEGORY = '🔒 SALONS PRIVÉS';
/** Salons de chaque section créateur (annonces : lecture seule pour les monteurs). */
export const CREATOR_CHANNELS = [
  { name: '📣│annonces', write: false, topic: 'Les annonces de l’équipe' },
  { name: '💬│général', write: true, topic: 'Discussion de l’équipe' },
  { name: '📝│feedback', write: true, topic: 'Retours sur les montages' },
  { name: '🚀│à-publier', write: true, topic: 'Montages terminés, prêts à être publiés' },
];

const BTN_EDITOR = 'montage:editor';
const BTN_HOC = 'montage:hoc';
const SELECT_CREATORS = 'montage:creators';

export const setupMontageCommand = new SlashCommandBuilder()
  .setName('setup-montage')
  .setDescription('Monte le serveur des monteurs (rôles, sections par créateur, salons privés)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addBooleanOption((o) => o.setName('nettoyer').setDescription('⚠️ Supprime TOUS les autres salons et catégories du serveur (garde seulement ceux du bot)'))
  .toJSON();

const V = PermissionFlagsBits;
const sameName = (a: string, b: string) => a.toLocaleLowerCase('fr') === b.toLocaleLowerCase('fr');
const roleNamed = (guild: Guild, name: string) => guild.roles.cache.find((r) => sameName(r.name, name));
const bare = (name: string) => name.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}-]/gu, '').toLowerCase();

/** Serveur des monteurs (monté par /setup-montage) : l'accueil et le recrutement de l'agence l'ignorent. */
export const isMontageGuild = (guild: Guild) => !!roleNamed(guild, ROLE_EDITOR);

/** Catégorie de la section d'un créateur. */
const categoryName = (creator: string) => `🎬 ${creator.toUpperCase()}`;

async function ensureRole(guild: Guild, name: string, color: number, hoist: boolean) {
  return roleNamed(guild, name) ?? guild.roles.create({ name, colors: { primaryColor: color }, hoist, reason: 'Serveur monteurs' });
}

/** Droits : monteurs de la team (lecture/écriture selon le salon), Head of Content et staff partout. */
function sectionOverwrites(guild: Guild, team: string, write: boolean): OverwriteResolvable[] {
  const id = (n: string) => roleNamed(guild, n)?.id;
  const lead = [id(ROLE_HOC), id(ROLE_STAFF)].filter((x): x is string => !!x);
  return [
    { id: guild.roles.everyone.id, deny: [V.ViewChannel, V.MentionEveryone] },
    ...(id(team) ? [{ id: id(team)!, allow: write ? [V.ViewChannel, V.SendMessages, V.AttachFiles, V.EmbedLinks] : [V.ViewChannel], deny: write ? [] : [V.SendMessages] }] : []),
    ...lead.map((r) => ({ id: r, allow: [V.ViewChannel, V.SendMessages, V.AttachFiles, V.EmbedLinks, V.ManageMessages, V.MentionEveryone] })),
    { id: guild.members.me!.id, allow: [V.ViewChannel, V.SendMessages, V.EmbedLinks, V.ManageChannels] },
  ];
}

async function ensureCategory(guild: Guild, name: string, overwrites: OverwriteResolvable[]): Promise<CategoryChannel> {
  const found = guild.channels.cache.find((c): c is CategoryChannel => c.type === ChannelType.GuildCategory && c.name === name);
  if (found) {
    await found.permissionOverwrites.set(overwrites).catch(() => {});
    return found;
  }
  return guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites });
}

async function ensureText(guild: Guild, parent: CategoryChannel, name: string, overwrites: OverwriteResolvable[], topic?: string): Promise<TextChannel> {
  let ch = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.parentId === parent.id && bare(c.name) === bare(name)) as TextChannel | undefined;
  if (!ch) ch = await guild.channels.create({ name, type: ChannelType.GuildText, parent: parent.id, topic, permissionOverwrites: overwrites });
  else await ch.permissionOverwrites.set(overwrites).catch(() => {});
  return ch;
}

const welcomeMessage = () => ({
  embeds: [
    new EmbedBuilder()
      .setColor(0x7b4dff)
      .setTitle('👋 Bienvenue chez les monteurs Neptune')
      .setDescription(
        [
          'Choisis ton rôle pour accéder à ton espace :',
          '',
          '🎬 **Monteur** : tu choisis le ou les créateurs pour qui tu montes. Tu accèdes à leurs sections (annonces, général, feedback, à publier) et à ton salon privé.',
          '🧠 **Head of Content** : tu supervises toutes les sections et tous les salons privés.',
          '',
          '-# Tu peux recliquer à tout moment pour changer tes créateurs.',
        ].join('\n'),
      ),
  ],
  components: [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(BTN_EDITOR).setStyle(ButtonStyle.Primary).setLabel('Je suis monteur').setEmoji('🎬'),
      new ButtonBuilder().setCustomId(BTN_HOC).setStyle(ButtonStyle.Secondary).setLabel('Je suis Head of Content').setEmoji('🧠'),
    ),
  ],
});

/** Monte (ou remet à jour) tout le serveur. Renvoie ce qui a été créé. */
export async function scaffoldMontageServer(guild: Guild): Promise<string[]> {
  const before = new Set(guild.channels.cache.map((c) => c.id));
  const rolesBefore = new Set(guild.roles.cache.map((r) => r.id));
  await ensureRole(guild, ROLE_STAFF, 0xf5f5f7, true);
  await ensureRole(guild, ROLE_HOC, 0xffc21a, true);
  await ensureRole(guild, ROLE_EDITOR, 0x7b4dff, true);
  for (const c of MONTAGE_CREATORS) await ensureRole(guild, creatorRole(c), 0x29e7ff, false);
  // Personne ne peut pinguer @everyone (sauf staff / Head of Content / admins)
  const everyone = guild.roles.everyone;
  if (everyone.permissions.has(V.MentionEveryone)) await everyone.setPermissions(everyone.permissions.remove(V.MentionEveryone)).catch(() => {});

  await guild.channels.fetch();
  const me = guild.members.me!.id;
  const staffIds = [ROLE_HOC, ROLE_STAFF].map((n) => roleNamed(guild, n)?.id).filter((x): x is string => !!x);

  // Accueil : visible par tous, lecture seule
  const welcomeOw: OverwriteResolvable[] = [
    { id: everyone.id, allow: [V.ViewChannel], deny: [V.SendMessages, V.AddReactions, V.CreatePublicThreads] },
    ...staffIds.map((id) => ({ id, allow: [V.ViewChannel, V.SendMessages] })),
    { id: me, allow: [V.ViewChannel, V.SendMessages, V.EmbedLinks] },
  ];
  const home = await ensureCategory(guild, '📌 ACCUEIL', welcomeOw);
  const welcome = await ensureText(guild, home, WELCOME, welcomeOw, 'Choisis ton rôle pour accéder à ton espace');
  const recent = await welcome.messages.fetch({ limit: 20 }).catch(() => null);
  const mine = recent?.filter((m) => m.author.id === me).last();
  if (mine) await mine.edit(welcomeMessage()).catch(() => {});
  else await welcome.send(welcomeMessage());

  // Une section par créateur
  for (const c of MONTAGE_CREATORS) {
    const team = creatorRole(c);
    const cat = await ensureCategory(guild, categoryName(c), sectionOverwrites(guild, team, true));
    for (const [i, ch] of CREATOR_CHANNELS.entries()) {
      const t = await ensureText(guild, cat, ch.name, sectionOverwrites(guild, team, ch.write), ch.topic);
      await t.setPosition(i).catch(() => {});
    }
  }

  // Salons privés (créés à la demande) + logs du staff
  const staffOnly: OverwriteResolvable[] = [
    { id: everyone.id, deny: [V.ViewChannel] },
    ...staffIds.map((id) => ({ id, allow: [V.ViewChannel, V.SendMessages, V.ManageMessages] })),
    { id: me, allow: [V.ViewChannel, V.SendMessages, V.EmbedLinks, V.ManageChannels] },
  ];
  if (!guild.channels.cache.some((c) => c.type === ChannelType.GuildCategory && c.name.startsWith(PRIVATE_CATEGORY))) {
    await guild.channels.create({ name: PRIVATE_CATEGORY, type: ChannelType.GuildCategory, permissionOverwrites: staffOnly });
  }
  // Head of Content : accès à tous les salons privés déjà créés
  const hoc = roleNamed(guild, ROLE_HOC);
  if (hoc) {
    for (const ch of guild.channels.cache.values()) {
      if (ch.type === ChannelType.GuildText && (ch as TextChannel).topic?.match(/\[\d+\]/) && !ch.permissionOverwrites.cache.has(hoc.id)) {
        await ch.permissionOverwrites.edit(hoc.id, { ViewChannel: true, SendMessages: true, ManageMessages: true }).catch(() => {});
      }
    }
  }
  const staffCat = await ensureCategory(guild, '🛡️ STAFF', staffOnly);
  await ensureText(guild, staffCat, LOGS, staffOnly, 'Arrivées et choix de rôle');

  await guild.channels.fetch();
  return [
    ...guild.roles.cache.filter((r) => !rolesBefore.has(r.id)).map((r) => `rôle ${r.name}`),
    ...guild.channels.cache.filter((c) => !before.has(c.id)).map((c) => (c.type === ChannelType.GuildCategory ? `catégorie ${c.name}` : `#${c.name}`)),
  ];
}

/**
 * Nettoyage (option « nettoyer » de /setup-montage) : supprime tous les salons et catégories qui ne font pas
 * partie du serveur monteurs (accueil, sections créateurs, salons privés, staff). Renvoie le nombre supprimé
 * et les salons que Discord refuse de supprimer (ex. salons obligatoires d'un serveur communauté).
 */
export async function cleanMontageServer(guild: Guild): Promise<{ deleted: number; failed: string[] }> {
  await guild.channels.fetch();
  const ours = (name: string) => name === '📌 ACCUEIL' || name === '🛡️ STAFF' || name.startsWith(PRIVATE_CATEGORY) || MONTAGE_CREATORS.some((c) => name === categoryName(c));
  const keptCats = new Set(guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory && ours(c.name)).map((c) => c.id));
  const expected = new Set([WELCOME, LOGS, ...CREATOR_CHANNELS.map((c) => c.name)].map(bare));
  const keep = (c: { id: string; type: ChannelType; name: string; parentId?: string | null; topic?: string | null }) =>
    keptCats.has(c.id) || (c.type === ChannelType.GuildText && !!c.parentId && keptCats.has(c.parentId) && (expected.has(bare(c.name)) || /\[\d+\]/.test(c.topic ?? '')));
  const out = { deleted: 0, failed: [] as string[] };
  // Les salons d'abord, les catégories ensuite (une catégorie se supprime vide)
  const doomed = [...guild.channels.cache.values()]
    .filter((c) => !keep({ id: c.id, type: c.type, name: c.name, parentId: 'parentId' in c ? c.parentId : null, topic: 'topic' in c ? (c.topic as string | null) : null }))
    .sort((a, b) => Number(a.type === ChannelType.GuildCategory) - Number(b.type === ChannelType.GuildCategory));
  for (const c of doomed) {
    try {
      await c.delete('Nettoyage du serveur monteurs (/setup-montage nettoyer)');
      out.deleted++;
    } catch {
      out.failed.push(c.name);
    }
  }
  return out;
}

/** Salon privé du membre : lui + Head of Content + staff. Réutilisé s'il existe déjà. */
async function privateChannelFor(guild: Guild, member: GuildMember): Promise<TextChannel> {
  const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && (c as TextChannel).topic?.includes(`[${member.id}]`)) as TextChannel | undefined;
  if (existing) {
    if (!existing.permissionOverwrites.cache.has(member.id)) await existing.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true, AttachFiles: true, ReadMessageHistory: true });
    return existing;
  }
  const staffIds = [ROLE_HOC, ROLE_STAFF].map((n) => roleNamed(guild, n)?.id).filter((x): x is string => !!x);
  // Discord : 50 salons max par catégorie → « 🔒 SALONS PRIVÉS 2 », etc.
  const cats = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory && c.name.startsWith(PRIVATE_CATEGORY)).sort((a, b) => a.name.localeCompare(b.name));
  let cat = cats.find((c) => guild.channels.cache.filter((x) => 'parentId' in x && x.parentId === c.id).size < 50);
  if (!cat) {
    cat = await guild.channels.create({
      name: `${PRIVATE_CATEGORY} ${cats.size + 1}`,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [V.ViewChannel] }, ...staffIds.map((id) => ({ id, allow: [V.ViewChannel] }))],
    });
  }
  const slug = member.displayName.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'membre';
  return guild.channels.create({
    name: `🔒│${slug}`,
    type: ChannelType.GuildText,
    parent: cat.id,
    topic: `Salon privé de ${member.displayName} [${member.id}]`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [V.ViewChannel] },
      { id: member.id, allow: [V.ViewChannel, V.SendMessages, V.AttachFiles, V.EmbedLinks, V.ReadMessageHistory] },
      ...staffIds.map((id) => ({ id, allow: [V.ViewChannel, V.SendMessages, V.AttachFiles, V.ManageMessages] })),
      { id: guild.members.me!.id, allow: [V.ViewChannel, V.SendMessages, V.EmbedLinks, V.ManageChannels] },
    ],
  });
}

async function logStaff(guild: Guild, text: string) {
  const ch = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && bare(c.name) === bare(LOGS)) as TextChannel | undefined;
  await ch?.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
}

const creatorMenu = (member: GuildMember) =>
  new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(SELECT_CREATORS)
      .setPlaceholder('Pour quel(s) créateur(s) tu montes ?')
      .setMinValues(1)
      .setMaxValues(MONTAGE_CREATORS.length)
      .addOptions(
        MONTAGE_CREATORS.map((c) => ({
          label: c,
          value: c,
          emoji: '✂️',
          default: member.roles.cache.some((r) => sameName(r.name, creatorRole(c))),
        })),
      ),
  );

/** Boutons d'accueil et choix des créateurs. */
export async function handleMontageInteraction(interaction: Interaction) {
  if (!interaction.inCachedGuild()) return;
  const isEditor = interaction.isButton() && interaction.customId === BTN_EDITOR;
  const isHoc = interaction.isButton() && interaction.customId === BTN_HOC;
  const isPick = interaction.isStringSelectMenu() && interaction.customId === SELECT_CREATORS;
  if (!isEditor && !isHoc && !isPick) return;
  const { guild, member } = interaction;
  try {
    if (isEditor) {
      return void (await interaction.reply({ content: '🎬 **Choisis le ou les créateurs pour qui tu montes** (plusieurs possibles) :', components: [creatorMenu(member)], flags: MessageFlags.Ephemeral }));
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (isHoc) {
      const role = roleNamed(guild, ROLE_HOC);
      if (!role) return void (await interaction.editReply('Rôle introuvable : un admin doit refaire /setup-montage.'));
      if (!member.roles.cache.has(role.id)) await member.roles.add(role, 'Choix : Head of Content');
      const priv = await privateChannelFor(guild, member);
      await logStaff(guild, `🧠 <@${member.id}> a choisi **Head of Content**`);
      return void (await interaction.editReply(`🧠 **Bienvenue Head of Content !** Tu vois toutes les sections et tous les salons privés. Ton salon : ${priv}`));
    }
    if (!interaction.isStringSelectMenu()) return;
    const picked = new Set(interaction.values);
    const editor = roleNamed(guild, ROLE_EDITOR);
    const add = [editor, ...MONTAGE_CREATORS.filter((c) => picked.has(c)).map((c) => roleNamed(guild, creatorRole(c)))].filter((r) => r && !member.roles.cache.has(r.id));
    const remove = MONTAGE_CREATORS.filter((c) => !picked.has(c))
      .map((c) => roleNamed(guild, creatorRole(c)))
      .filter((r) => r && member.roles.cache.has(r.id));
    if (add.length) await member.roles.add(add.map((r) => r!.id), 'Choix des créateurs');
    if (remove.length) await member.roles.remove(remove.map((r) => r!.id), 'Choix des créateurs');
    const priv = await privateChannelFor(guild, member);
    const names = MONTAGE_CREATORS.filter((c) => picked.has(c));
    await logStaff(guild, `🎬 <@${member.id}> monte pour : **${names.join(', ')}**`);
    await interaction.editReply(`✅ **C’est ouvert !** Tu as accès aux sections ${names.map((n) => `**${n}**`).join(', ')} (annonces, général, feedback, à publier) et à ton salon privé ${priv}.`);
  } catch (err) {
    log.warn(`serveur monteurs : ${err instanceof Error ? err.message : String(err)}`);
    const msg = 'Impossible pour l’instant : le rôle du bot doit être tout en haut (Paramètres → Rôles). Réessaie dans une minute.';
    await (interaction.deferred || interaction.replied ? interaction.editReply(msg) : interaction.reply({ content: msg, flags: MessageFlags.Ephemeral })).catch(() => {});
  }
}

/** /setup-montage (admins). */
export async function handleSetupMontage(interaction: Interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'setup-montage' || !interaction.inCachedGuild()) return;
  if (!interaction.memberPermissions.has(V.Administrator)) {
    return void (await interaction.reply({ content: 'Réservé aux admins du serveur.', flags: MessageFlags.Ephemeral }));
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const created = await scaffoldMontageServer(interaction.guild);
    const clean = interaction.options.getBoolean('nettoyer') ? await cleanMontageServer(interaction.guild) : null;
    const lines = [
      created.length ? `✅ Serveur prêt. Créé : ${created.join(', ').slice(0, 1200)}.` : '✅ Tout est déjà en place.',
      ...(clean ? [`🧹 ${clean.deleted} ancien(s) salon(s) supprimé(s).${clean.failed.length ? ` Discord refuse de supprimer : ${clean.failed.join(', ').slice(0, 300)} (salons obligatoires du mode Communauté : change-les dans Paramètres → Communauté, puis supprime-les à la main).` : ''}`] : []),
      'Mets le rôle du bot tout en haut (Paramètres → Rôles).',
    ];
    await interaction.editReply(lines.join('\n').slice(0, 2000));
  } catch (err) {
    log.error('/setup-montage', err);
    await interaction.editReply(`Oups : ${err instanceof Error ? err.message : String(err)}. Le bot a-t-il la permission Administrateur ?`.slice(0, 300)).catch(() => {});
  }
}

/**
 * Branche le serveur monteurs sur le bot de l'agence : /setup-montage enregistrée sur chaque serveur
 * autre que celui de l'agence (au démarrage et quand on invite le bot), boutons et menu d'accueil.
 */
export function attachMontage(discord: Client, opts: { token: string; agencyGuildId?: string }) {
  const register = async (appId: string, guildId: string) => {
    if (guildId === opts.agencyGuildId) return;
    await new REST()
      .setToken(opts.token)
      .put(Routes.applicationGuildCommands(appId, guildId), { body: [setupMontageCommand] })
      .catch((err) => log.warn(`/setup-montage sur ${guildId} : ${err instanceof Error ? err.message : String(err)}`));
  };
  discord.once(Events.ClientReady, (c) => {
    for (const g of c.guilds.cache.values()) void register(c.application.id, g.id);
  });
  discord.on(Events.GuildCreate, (g) => {
    if (discord.application) void register(discord.application.id, g.id);
  });
  discord.on(Events.InteractionCreate, (i) => {
    void handleSetupMontage(i);
    void handleMontageInteraction(i);
  });
}
