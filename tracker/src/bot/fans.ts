import {
  ActionRowBuilder,
  ActivityType,
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
import type { FanService } from '../services/fans.js';
import { status } from '../status.js';

/** Commandes du programme fans : sur le bot Neptune (serveur du créateur), ou sur le bot principal s'il n'y a pas de Neptune. */
export const fanCommandDefinitions = [
  new SlashCommandBuilder().setName('site').setDescription('Reçois ton lien de connexion à ton espace (vues, coins, boutique)').toJSON(),
  new SlashCommandBuilder().setName('coins').setDescription('Tes vues et tes coins').toJSON(),
];
export const FAN_COMMANDS = new Set(fanCommandDefinitions.map((c) => c.name));

const fmt = (n: number) => n.toLocaleString('fr-FR');

export function attachFanCommands(discord: DiscordClient, fans: FanService): void {
  discord.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || !FAN_COMMANDS.has(interaction.commandName)) return;
    try {
      const name = interaction.inCachedGuild() ? interaction.member.displayName : interaction.user.username;
      const fan = fans.ensureFan(interaction.user.id, name);
      if (interaction.commandName === 'site') {
        const url = fans.loginUrl(fan.id);
        await interaction.reply({
          content: `🔐 **Ton lien de connexion perso** (valable 10 min, ne le partage pas) :\n${url}\n\nTu y suis tes clips, tes vues et tes coins, et tu les échanges dans la boutique.\n📱 Pas encore de compte relié ? Colle le lien de ton profil TikTok / Insta / YouTube dans **#mes-comptes**.`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        const b = fans.balance(fan.id);
        const s = fans.settings();
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xffd83d)
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

const PF: Record<string, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' };

/** Salon #mes-comptes : le fan y colle ses liens TikTok / Insta / YouTube, ils sont reliés automatiquement. */
export function attachAccountsChannel(discord: DiscordClient, fans: FanService): void {
  discord.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.inGuild()) return;
    const channel = message.channel;
    if (!('name' in channel) || !/mes[-_ ]?comptes/i.test(channel.name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) return;
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
export async function startFansBot(opts: { token: string; clientId?: string; guildIds: string[]; fans: FanService; siteUrl: string }): Promise<() => Promise<void>> {
  if (opts.clientId) {
    const rest = new REST().setToken(opts.token);
    const routes = opts.guildIds.length
      ? opts.guildIds.map((g) => Routes.applicationGuildCommands(opts.clientId!, g))
      : [Routes.applicationCommands(opts.clientId)];
    for (const route of routes) {
      await rest.put(route, { body: fanCommandDefinitions }).catch((err) => log.error('bot fans : enregistrement des commandes', err));
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
  function onReady(c: DiscordClient<true>) {
    status.neptune = {
      state: 'ready',
      tag: c.user.tag,
      guilds: c.guilds.cache.size,
      error: readsMessages ? undefined : 'Active « Message Content Intent » (portail Discord > Bot) pour le salon #mes-comptes',
    };
    c.user.setActivity('🪙 /site pour la boutique', { type: ActivityType.Custom });
    log.info(`bot fans connecté en tant que ${c.user.tag}`);
    timer = setInterval(() => void sendNotifications().catch((err) => log.error('messages privés fans', err)), 2 * 60_000);
    void sendNotifications().catch(() => {});
  }
  const wire = (d: DiscordClient) => {
    d.once(Events.ClientReady, onReady);
    d.on(Events.Error, (err) => log.error('bot fans', err));
    attachFanCommands(d, opts.fans);
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
            embeds: [new EmbedBuilder().setColor(0xffd83d).setDescription(n.text).setFooter({ text: 'BeOne Rewards · 🪙 Fais des vues, gagne des coins' })],
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
    await discord.destroy();
  };
}
