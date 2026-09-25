import { Client as DiscordClient, Events, GatewayIntentBits, Partials } from 'discord.js';
import type { Clipper, Repo } from '../db/repo.js';
import type { RelanceReason } from '../domain/relance.js';
import type { Notifier } from '../jobs/relance.js';
import { log } from '../log.js';
import type { Analytics } from '../services/analytics.js';
import { handleCommand } from './commands.js';
import { formatComptesReply, registerAccountsFromMessage } from './comptes.js';

export interface Bot {
  notifier: Notifier;
  stop: () => Promise<void>;
}

export async function startBot(deps: {
  token: string;
  repo: Repo;
  analytics: Analytics;
  dashboardUrl: string;
}): Promise<Bot> {
  const { repo } = deps;
  const discord = new DiscordClient({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      // Intent privilégié : à activer dans le Developer Portal (Bot > Message Content Intent).
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });

  discord.once(Events.ClientReady, (c) => log.info(`bot connecté en tant que ${c.user.tag}`));

  // Salon COMPTES : enregistrement des comptes postés par les clippers.
  discord.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.inGuild()) return;
    const client = repo.getClientByChannel(message.channelId);
    if (!client) return;
    try {
      const result = registerAccountsFromMessage(
        repo,
        client,
        { discordId: message.author.id, username: message.member?.displayName ?? message.author.username },
        message.content,
      );
      if (!result) return;
      await message.react(result.conflicts.length ? '⚠️' : '✅');
      await message.reply({ content: formatComptesReply(result), allowedMentions: { repliedUser: false } });
    } catch (err) {
      log.error('enregistrement de comptes', err);
    }
  });

  discord.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    log.info(`commande /${interaction.commandName} par ${interaction.user.username} (salon ${interaction.channelId})`);
    try {
      await handleCommand(interaction, deps);
    } catch (err) {
      log.error(`commande /${interaction.commandName}`, err);
      const reply = { content: 'Oups, une erreur est survenue.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
      else await interaction.reply(reply).catch(() => {});
    }
  });

  discord.on(Events.Error, (err) => log.error('discord', err));
  discord.on(Events.Warn, (msg) => log.warn(`discord: ${msg}`));
  discord.on(Events.ShardDisconnect, (e) => log.warn(`discord déconnecté (code ${e.code})`));

  await discord.login(deps.token);

  const notifier: Notifier = {
    async relance(clipper: Clipper, _reason: RelanceReason, text: string) {
      // On ping dans le salon COMPTES du client du clipper ; à défaut, en DM.
      const channelId = repo
        .listAccountsForClipper(clipper.id)
        .map((a) => (a.clientId ? repo.getClient(a.clientId)?.discordChannelId : null))
        .find((id): id is string => !!id);
      if (channelId) {
        const channel = await discord.channels.fetch(channelId);
        if (channel?.isSendable()) {
          await channel.send(`<@${clipper.discordId}> ${text}`);
          return;
        }
      }
      const user = await discord.users.fetch(clipper.discordId);
      await user.send(`Salut ${clipper.username}, ${text}`);
    },
  };

  return { notifier, stop: () => discord.destroy() };
}
