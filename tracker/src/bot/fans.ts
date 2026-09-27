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
          content: `🔐 **Ton lien de connexion perso** (valable 10 min, ne le partage pas) :\n${url}\n\nTu y suis tes clips, tes vues et tes coins, et tu les échanges dans la boutique.`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        const b = fans.balance(fan.id);
        const s = fans.settings();
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xf2f2f2)
              .setTitle(`⭐ ${name}`)
              .addFields(
                { name: 'Vues', value: fmt(b.views), inline: true },
                { name: 'Coins', value: fmt(b.balance), inline: true },
                { name: 'Dépensés', value: fmt(b.spent), inline: true },
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
  const discord = new DiscordClient({ intents: [GatewayIntentBits.Guilds] });
  let timer: NodeJS.Timeout | undefined;
  discord.once(Events.ClientReady, (c) => {
    status.neptune = { state: 'ready', tag: c.user.tag, guilds: c.guilds.cache.size };
    c.user.setActivity('🪙 /site pour la boutique', { type: ActivityType.Custom });
    log.info(`bot fans connecté en tant que ${c.user.tag}`);
    timer = setInterval(() => void sendNotifications().catch((err) => log.error('messages privés fans', err)), 2 * 60_000);
    void sendNotifications().catch(() => {});
  });
  discord.on(Events.Error, (err) => log.error('bot fans', err));
  attachFanCommands(discord, opts.fans);

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

  await discord.login(opts.token);
  return async () => {
    if (timer) clearInterval(timer);
    await discord.destroy();
  };
}
