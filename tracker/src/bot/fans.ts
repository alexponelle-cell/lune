import {
  ActionRowBuilder,
  ActivityType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  Client as DiscordClient,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';
import { log } from '../log.js';
import { onFanRegistered, setupCommand, handleSetup, handleAlertsButton, handleStepButtons, handleTraining, onTrainingCompleted, VERIFY_BUTTON, verifyRow } from './fanServer.js';
import { announceNewVideos, reportAccountsToReview, reportOrdersToApprove, reportSuspicious, syncTierRoles, unlockFirstClips, weeklyRanking } from './fanAutomation.js';
import type { FanService } from '../services/fans.js';
import { status } from '../status.js';

/** Commandes du programme fans : sur le bot Neptune (serveur du créateur), ou sur le bot principal s'il n'y a pas de Neptune. */
export const fanCommandDefinitions = [
  new SlashCommandBuilder().setName('site').setDescription('Reçois ton lien de connexion à ton espace (vues, coins, boutique)').toJSON(),
  new SlashCommandBuilder().setName('coins').setDescription('Tes vues et tes coins').toJSON(),
];
export const FAN_COMMANDS = new Set(fanCommandDefinitions.map((c) => c.name));
/** /inscription n'existe que sur le bot des fans (le bot de l'agence a déjà son /inscription). */
const inscriptionCommand = (fans: FanService) =>
  new SlashCommandBuilder()
    .setName('inscription')
    .setDescription(`Relie tes comptes TikTok, YouTube, Instagram (et ton ${fans.creator.rewardAccount.kind === 'email' ? 'e-mail' : 'pseudo Roblox'})`)
    .toJSON();
const INSCRIPTION_MODAL = 'fans:inscription';
/** Bouton « S'inscrire » posté par /setup (ouvre le même formulaire que /inscription). */
export const SIGNUP_BUTTON = 'fans:signup';

const fmt = (n: number) => n.toLocaleString('fr-FR');
const PF: Record<string, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' };

const PLATFORM_FIELDS = [
  { id: 'tiktok', label: 'TikTok', placeholder: '@tonpseudo ou lien du profil' },
  { id: 'youtube', label: 'YouTube', placeholder: '@tachaine ou lien de la chaîne' },
  { id: 'instagram', label: 'Instagram', placeholder: '@tonpseudo ou lien du profil' },
] as const;

/**
 * /inscription seulement dans les tickets (Ticket Tool : « ticket-0001 », catégorie « Tickets »…).
 * Salon invisible pour le bot (ticket privé) : autorisé ; salon visible sans « ticket » dans le nom : refusé.
 */
export function isTicketChannel(channel: { name?: string | null; parent?: { name?: string | null } | null } | null | undefined): boolean {
  if (!channel || !channel.name) return true;
  return /ticket/i.test(channel.name) || /ticket/i.test(channel.parent?.name ?? '');
}

/** /inscription : formulaire avec un champ par réseau + compte de livraison (pseudo Roblox ou e-mail). */
export function attachInscription(discord: DiscordClient, fans: FanService): void {
  discord.on(Events.InteractionCreate, async (interaction) => {
    try {
      const signupButton = interaction.isButton() && interaction.customId === SIGNUP_BUTTON;
      if ((interaction.isChatInputCommand() && interaction.commandName === 'inscription') || signupButton) {
        if (!interaction.isChatInputCommand() && !interaction.isButton()) return;
        const ch = interaction.channel as { name?: string | null; parent?: { name?: string | null } | null } | null;
        // Serveur monté par /setup : salon #inscription ; serveur avec Ticket Tool : dans un ticket
        if (!signupButton && interaction.inGuild() && !isTicketChannel(ch) && !/inscription/i.test(ch?.name ?? '')) {
          await interaction.reply({
            content: '🎫 Ouvre d’abord un **ticket** (bouton **Create ticket**), puis fais **/inscription** dedans.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const name = interaction.inCachedGuild() ? interaction.member.displayName : interaction.user.username;
        const fan = fans.ensureFan(interaction.user.id, name);
        const accounts = fans.accountsOf(fan.id);
        const current = (p: string) => {
          const a = accounts.find((x) => x.platform === p);
          return a ? `@${a.handle}` : '';
        };
        const modal = new ModalBuilder().setCustomId(INSCRIPTION_MODAL).setTitle(`Inscription ${fans.settings().programName}`.slice(0, 45));
        for (const f of PLATFORM_FIELDS) {
          const input = new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setPlaceholder(f.placeholder).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200);
          const v = current(f.id);
          if (v) input.setValue(v);
          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        }
        const ra = fans.creator.rewardAccount;
        const rbx = new TextInputBuilder().setCustomId('roblox').setLabel(ra.label.slice(0, 45)).setPlaceholder(ra.placeholder).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(ra.kind === 'email' ? 254 : 20);
        const r = fans.rewardAccount(fan.id).value;
        if (r) rbx.setValue(r);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(rbx));
        await interaction.showModal(modal);
        return;
      }
      if (interaction.isModalSubmit() && interaction.customId === INSCRIPTION_MODAL) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const name = interaction.inCachedGuild() ? interaction.member.displayName : interaction.user.username;
        const fan = fans.ensureFan(interaction.user.id, name);
        const get = (id: string) => interaction.fields.getTextInputValue(id) ?? '';
        const res = fans.setAccounts(fan, { tiktok: get('tiktok'), youtube: get('youtube'), instagram: get('instagram') });
        const lines: string[] = [];
        if (res.linked.length) lines.push(`✅ Comptes suivis : ${res.linked.map((a) => `**${PF[a.platform]}** @${a.handle}`).join(', ')}`);
        if (res.removed.length) lines.push(`🗑️ Retiré : ${res.removed.map((p) => PF[p]).join(', ')}`);
        if (res.conflicts.length) lines.push(`⛔ Déjà relié à quelqu'un d'autre : ${res.conflicts.map((a) => `@${a.handle}`).join(', ')}. Si c'est ton compte, préviens le staff.`);
        if (res.invalid.length) lines.push(`🤔 Pas compris : ${res.invalid.map((p) => PF[p]).join(', ')}. Mets ton @pseudo ou le lien de ton profil.`);
        const roblox = get('roblox').trim();
        if (fans.creator.rewardAccount.kind === 'email') {
          if (roblox && roblox.toLowerCase() !== (fans.fans.email(fan.id) ?? '')) {
            try {
              lines.push(`📧 E-mail enregistré : **${fans.linkEmail(fan, roblox)}**`);
            } catch (err) {
              lines.push(`📧 E-mail : ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        } else if (roblox && roblox.toLowerCase() !== (fans.fans.roblox(fan.id).username ?? '').toLowerCase()) {
          try {
            const r = await fans.linkRoblox(fan, roblox);
            lines.push(`🎮 Roblox relié : **${r.username}**`);
          } catch (err) {
            lines.push(`🎮 Roblox : ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        // Compte de livraison toujours rappelé (même inchangé), pour que le clippeur voie ce qui est enregistré
        if (!lines.some((l) => l.startsWith('📧') || l.startsWith('🎮'))) {
          const current = fans.rewardAccount(fan.id).value;
          if (current) lines.push(`${fans.creator.rewardAccount.kind === 'email' ? '📧 E-mail' : '🎮 Roblox'} : **${current}**`);
        }
        if (!lines.length) lines.push('Rien à changer 👍');
        // Les 3 réseaux sont obligatoires pour entrer (TikTok, YouTube, Instagram)
        const missing = PLATFORM_FIELDS.filter((f) => !fans.accountsOf(fan.id).some((a) => a.platform === f.id)).map((f) => f.label);
        if (missing.length) lines.push(`\n⚠️ **Il manque : ${missing.join(', ')}.** Les 3 comptes sont obligatoires : reclique sur **S’inscrire** pour compléter.`);
        if (res.linked.length && !missing.length && interaction.inCachedGuild()) {
          await onFanRegistered(interaction.guild, interaction.member, res.linked.map((a) => `${PF[a.platform]} @${a.handle}`), fans.publicSiteUrl(), [
            ...(fans.unverifiedAccounts(fan.id).length ? ['🔎 Tes comptes sont vérifiés par le staff sous 24 h : tes vues comptent dès la validation, rien n’est perdu.'] : []),
            ...(fans.settings().clipRule ? [`🏷️ **Mets #${fans.clipKeywords()[0] ?? 'createur'} dans la légende de chaque clip**, sinon il ne compte pas.`] : []),
          ]);
        }
        if (res.linked.length && !missing.length) lines.push('\n🎬 **Dernière étape : poste ton 1er clip.** Dès qu’il est détecté (1 relevé par jour), toute la communauté se débloque · `/site` pour la boutique');
        if (fans.unverifiedAccounts(fan.id).length) lines.push('\n🔎 **Tes nouveaux comptes vont être vérifiés par le staff** (sous 24 h) : tes vues compteront dès la validation, rien n’est perdu.');
        await interaction.editReply({ content: lines.join('\n').slice(0, 2000), components: [] });
      }
      if (interaction.isButton() && interaction.customId === VERIFY_BUTTON) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const name = interaction.inCachedGuild() ? interaction.member.displayName : interaction.user.username;
        const fan = fans.ensureFan(interaction.user.id, name);
        if (!fans.unverifiedAccounts(fan.id).length) return void (await interaction.editReply('✅ Tous tes comptes sont vérifiés : tes vues comptent. Tu peux retirer le code de ta bio.'));
        let results;
        try {
          results = await fans.verifyAccounts(fan);
        } catch (err) {
          return void (await interaction.editReply(`⏳ ${err instanceof Error ? err.message : String(err)}`));
        }
        const left = results.filter((r) => !r.ok);
        await interaction.editReply({
          content: [
            ...results.map((r) => (r.ok ? `✅ **${PF[r.platform as keyof typeof PF]}** @${r.handle} : vérifié` : `❌ **${PF[r.platform as keyof typeof PF]}** @${r.handle} : ${r.error}`)),
            '',
            left.length
              ? `Mets **${fans.verifyCode(fan.id)}** dans la bio des comptes en ❌ (ça peut prendre 1 à 2 min à apparaître), puis reclique.`
              : '🎉 Tous tes comptes sont vérifiés : tes vues comptent. Tu peux retirer le code de ta bio.',
          ].join('\n'),
          components: left.length ? [verifyRow()] : [],
        });
      }
    } catch (err) {
      log.error('/inscription (fans)', err);
      const msg = { content: `Oups : ${String(err)}`.slice(0, 300), flags: MessageFlags.Ephemeral } as const;
      if (interaction.isRepliable()) await (interaction.deferred ? interaction.editReply(msg.content) : interaction.replied ? Promise.resolve() : interaction.reply(msg)).catch(() => {});
    }
  });
}

export function attachFanCommands(discord: DiscordClient, fans: FanService): void {
  discord.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || !FAN_COMMANDS.has(interaction.commandName)) return;
    try {
      const name = interaction.inCachedGuild() ? interaction.member.displayName : interaction.user.username;
      const fan = fans.ensureFan(interaction.user.id, name);
      if (interaction.commandName === 'site') {
        const url = fans.loginUrl(fan.id);
        await interaction.reply({
          content: `🔐 **Ton lien de connexion perso** (valable 10 min, ne le partage pas) :\n${url}\n\nTu y suis tes clips, tes vues et tes coins, et tu les échanges dans la boutique.\n📱 Pas encore de compte relié ? Fais **/inscription**.`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        const b = fans.balance(fan.id);
        const s = fans.settings();
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(parseInt(fans.creator.colors.accent.slice(1), 16))
              .setTitle(`🪙 ${name}`)
              .addFields(
                { name: '🪙 Coins', value: `**${fmt(b.balance)}**`, inline: true },
                { name: '👀 Vues', value: fmt(b.views), inline: true },
                { name: '🛒 Dépensés', value: fmt(b.spent), inline: true },
              )
              .setFooter({ text: `${s.pointsPer1000} coins pour 1 000 vues · /site pour la boutique` }),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (err) {
      log.error(`commande /${interaction.commandName} (fans)`, err);
      if (!interaction.replied) await interaction.reply({ content: `Oups : ${String(err)}`.slice(0, 300), flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });
}

/** « 👤│comptes », « mes-comptes »… mais pas « tuto-comptes ». */
export function isAccountsChannel(name: string): boolean {
  const n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z-]/g, '').replace(/^-+|-+$/g, '');
  return n === 'comptes' || n === 'mes-comptes' || n === 'mescomptes';
}

/** Salon #mes-comptes : le fan y colle ses liens TikTok / Insta / YouTube, ils sont reliés automatiquement. */
export function attachAccountsChannel(discord: DiscordClient, fans: FanService): void {
  discord.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.inGuild()) return;
    const channel = message.channel;
    if (!('name' in channel) || !isAccountsChannel(channel.name)) return;
    try {
      const fan = fans.ensureFan(message.author.id, message.member?.displayName ?? message.author.username);
      let result;
      try {
        result = fans.addAccounts(fan, message.content);
      } catch {
        const help = '🤔 Je ne trouve pas de lien de compte. Colle le lien de ton **profil**, par exemple `https://www.tiktok.com/@tonpseudo`';
        await message
          .reply({ content: help, allowedMentions: { repliedUser: false } })
          .catch(() => message.channel.send({ content: `<@${message.author.id}> ${help}`, allowedMentions: { users: [message.author.id] } }));
        return;
      }
      const lines: string[] = [];
      if (result.added.length) lines.push(`✅ C'est relié : ${result.added.map((a) => `**${PF[a.platform]}** @${a.handle}`).join(', ')}\nTes prochaines vues te rapportent des coins 🪙 (mise à jour 1 fois par jour)`);
      if (result.conflicts.length) lines.push(`⛔ Déjà relié à quelqu'un d'autre : ${result.conflicts.map((a) => `@${a.handle}`).join(', ')}. Si c'est ton compte, préviens le staff.`);
      await message.react(result.conflicts.length && !result.added.length ? '⛔' : '✅').catch(() => {});
      // Répondre au message demande « Lire l'historique » : sinon simple message qui mentionne le fan
      await message
        .reply({ content: lines.join('\n'), allowedMentions: { repliedUser: false } })
        .catch(() => message.channel.send({ content: `<@${message.author.id}> ${lines.join('\n')}`, allowedMentions: { users: [message.author.id] } }));
    } catch (err) {
      log.error('salon mes-comptes', err);
    }
  });
}

/**
 * Bot des fans (ex. « BeOne Rewards ») : bot séparé, installé sur le serveur du créateur.
 * /site, /coins, et envoi des messages privés préparés par le tracker (coins, niveau, livraison…).
 */
export async function startFansBot(opts: { token: string; clientId?: string; guildIds: string[]; fans: FanService; siteUrl: string; youtubeApiKey?: string }): Promise<() => Promise<void>> {
  if (opts.clientId) {
    const rest = new REST().setToken(opts.token);
    const routes = opts.guildIds.length
      ? opts.guildIds.map((g) => Routes.applicationGuildCommands(opts.clientId!, g))
      : [Routes.applicationCommands(opts.clientId)];
    for (const route of routes) {
      await rest.put(route, { body: [...fanCommandDefinitions, inscriptionCommand(opts.fans), setupCommand] }).catch((err) => log.error('bot fans : enregistrement des commandes', err));
    }
  }
  // Lire le salon #mes-comptes demande « Message Content Intent » (portail Discord, onglet Bot).
  const make = (withMessages: boolean) =>
    new DiscordClient({
      intents: [GatewayIntentBits.Guilds, ...(withMessages ? [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] : [])],
    });
  let discord = make(true);
  let readsMessages = true;
  let timer: NodeJS.Timeout | undefined;
  let autoTimer: NodeJS.Timeout | undefined;
  // Commandes enregistrées sur chaque serveur où est le bot (au démarrage et dès qu'on l'invite)
  const commandBody = () => [...fanCommandDefinitions, inscriptionCommand(opts.fans), setupCommand];
  const registerIn = (appId: string, guildId: string) =>
    new REST()
      .setToken(opts.token)
      .put(Routes.applicationGuildCommands(appId, guildId), { body: commandBody() })
      .catch((err) => log.error(`bot fans : commandes sur le serveur ${guildId}`, err));
  function onReady(c: DiscordClient<true>) {
    for (const g of c.guilds.cache.values()) void registerIn(c.application.id, g.id);
    status.neptune = {
      state: 'ready',
      tag: c.user.tag,
      guilds: c.guilds.cache.size,
      error: readsMessages ? undefined : 'Active « Message Content Intent » (portail Discord > Bot) pour le salon #mes-comptes',
    };
    c.user.setActivity('🪙 /site pour la boutique', { type: ActivityType.Custom });
    log.info(`bot fans connecté en tant que ${c.user.tag}`);
    opts.fans.onTrainingDone = (discordId) => onTrainingCompleted(c, opts.fans, discordId);
    timer = setInterval(() => void sendNotifications().catch((err) => log.error('messages privés fans', err)), 2 * 60_000);
    void sendNotifications().catch(() => {});
    // Serveur monté par /setup (toutes les 15 min) : rôles de palier, classement du lundi, nouvelles vidéos
    const automations = async () => {
      await reportSuspicious(c, opts.fans).catch((err) => log.error('fans à vérifier', err));
      await reportOrdersToApprove(c, opts.fans).catch((err) => log.error('achats à valider', err));
      await reportAccountsToReview(c, opts.fans).catch((err) => log.error('comptes à vérifier', err));
      await unlockFirstClips(c, opts.fans).catch((err) => log.error('1er clip', err));
      await syncTierRoles(c, opts.fans).catch((err) => log.error('rôles de palier', err));
      await weeklyRanking(c, opts.fans).catch((err) => log.error('classement de la semaine', err));
      if (opts.youtubeApiKey) await announceNewVideos(c, opts.fans, opts.youtubeApiKey).catch((err) => log.error('nouvelles vidéos', err));
    };
    autoTimer = setInterval(() => void automations(), 15 * 60_000);
    setTimeout(() => void automations(), 60_000);
  }
  const wire = (d: DiscordClient) => {
    d.once(Events.ClientReady, onReady);
    d.on(Events.Error, (err) => log.error('bot fans', err));
    attachFanCommands(d, opts.fans);
    attachInscription(d, opts.fans);
    d.on(Events.GuildCreate, (g) => {
      log.info(`bot fans invité sur ${g.name}`);
      if (d.application) void registerIn(d.application.id, g.id);
    });
    d.on(Events.InteractionCreate, (i) => void handleSetup(i, opts.fans, opts.siteUrl));
    d.on(Events.InteractionCreate, (i) => void handleAlertsButton(i));
    d.on(Events.InteractionCreate, (i) => void handleStepButtons(i));
    d.on(Events.InteractionCreate, (i) => void handleTraining(i, opts.fans));
    if (readsMessages) attachAccountsChannel(d, opts.fans);
  };

  const shopButton = () =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Voir la boutique').setEmoji('🪙').setURL(opts.siteUrl),
    );
  let sending = false;
  async function sendNotifications() {
    if (sending) return;
    sending = true;
    try {
      for (const n of opts.fans.fans.pendingNotifications()) {
        try {
          const user = await discord.users.fetch(n.discordId);
          await user.send({
            embeds: [new EmbedBuilder().setColor(parseInt(opts.fans.creator.colors.accent.slice(1), 16)).setDescription(n.text).setFooter({ text: opts.fans.creator.texts.dmFooter })],
            components: [shopButton()],
          });
          opts.fans.fans.ackNotification(n.id, null);
        } catch (err) {
          const code = (err as { code?: number }).code;
          opts.fans.fans.ackNotification(n.id, code === 50007 ? 'DM fermés' : String(err).slice(0, 200));
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    } finally {
      sending = false;
    }
  }

  wire(discord);
  try {
    await discord.login(opts.token);
  } catch (err) {
    if (!(err instanceof Error && /disallowed intents/i.test(err.message))) throw err;
    log.warn('bot fans : « Message Content Intent » non activé, le salon #mes-comptes ne marche pas');
    await discord.destroy();
    readsMessages = false;
    discord = make(false);
    wire(discord);
    await discord.login(opts.token);
  }
  return async () => {
    if (timer) clearInterval(timer);
    if (autoTimer) clearInterval(autoTimer);
    await discord.destroy();
  };
}
