import { Client as DiscordClient, Events, GatewayIntentBits, MessageFlags, Partials } from 'discord.js';
import type { Clipper, Repo } from '../db/repo.js';
import type { RelanceReason } from '../domain/relance.js';
import type { Notifier } from '../jobs/relance.js';
import { log } from '../log.js';
import type { AgencyService } from '../services/agency.js';
import type { Analytics } from '../services/analytics.js';
import { status } from '../status.js';
import { handleCommand } from './commands.js';
import { formatComptesReply, registerAccountsFromMessage } from './comptes.js';

export interface Bot {
  notifier: Notifier;
  bridge: BotBridge;
  stop: () => Promise<void>;
}

/** Ce que le dashboard peut demander au bot. */
export interface BotBridge {
  /** Envoie un message au clipper (salon COMPTES de son agence, sinon DM). false si impossible. */
  send(clipper: Clipper, text: string): Promise<boolean>;
  roles(): Promise<Array<{ id: string; name: string }>>;
  membersWithRole(roleId: string): Promise<Array<{ id: string; name: string }>>;
}

interface Deps {
  token: string;
  repo: Repo;
  analytics: Analytics;
  agency: AgencyService;
  dashboardUrl: string;
}

function createClient(deps: Deps, withMessageContent: boolean): DiscordClient {
  const { repo } = deps;
  const discord = new DiscordClient({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      // Intent privilégié : à activer dans le Developer Portal (Bot > Message Content Intent).
      ...(withMessageContent ? [GatewayIntentBits.MessageContent] : []),
    ],
    partials: [Partials.Channel],
  });

  discord.once(Events.ClientReady, (c) => {
    status.bot = { ...status.bot, state: 'ready', tag: c.user.tag, messageContent: withMessageContent, guilds: c.guilds.cache.size, error: undefined };
    log.info(`bot connecté en tant que ${c.user.tag} sur ${c.guilds.cache.size} serveur(s)`);
  });

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
    const name = interaction.commandName;
    log.info(`commande /${name} par ${interaction.user.username} (salon ${interaction.channelId})`);
    try {
      await handleCommand(interaction, deps);
      status.bot.lastCommand = { name, at: Date.now(), ok: true };
    } catch (err) {
      log.error(`commande /${name}`, err);
      const message = err instanceof Error ? err.message : String(err);
      status.bot.lastCommand = { name, at: Date.now(), ok: false, error: message };
      const reply = { content: `Oups, une erreur est survenue : ${message.slice(0, 300)}`, flags: MessageFlags.Ephemeral } as const;
      if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
      else await interaction.reply(reply).catch(() => {});
    }
  });

  discord.on(Events.Error, (err) => log.error('discord', err));
  discord.on(Events.Warn, (msg) => log.warn(`discord: ${msg}`));
  discord.on(Events.ShardDisconnect, (e) => log.warn(`discord déconnecté (code ${e.code})`));
  return discord;
}

const isDisallowedIntents = (err: unknown) =>
  err instanceof Error && (/disallowed intents/i.test(err.message) || (err as { code?: unknown }).code === 'DisallowedIntents');

export async function startBot(deps: Deps & { guildId?: string }): Promise<Bot> {
  const { repo } = deps;
  status.bot = { ...status.bot, state: 'connecting' };

  let discord = createClient(deps, true);
  try {
    await discord.login(deps.token);
  } catch (err) {
    if (!isDisallowedIntents(err)) throw err;
    // Sans le Message Content Intent, les slash commands marchent quand même :
    // on se reconnecte sans, et on le signale sur le dashboard.
    log.error('Message Content Intent non activé dans le Developer Portal : le salon COMPTES ne lira pas les liens', err);
    await discord.destroy();
    discord = createClient(deps, false);
    await discord.login(deps.token);
  }

  const client = discord;

  /** Salon COMPTES de l'agence du clipper, sinon DM. */
  async function deliver(clipper: Clipper, text: string, dmPrefix: string): Promise<void> {
    if (clipper.discordId.startsWith('manual:')) throw new Error(`${clipper.username} n'a pas de compte Discord lié`);
    const clientIds = [clipper.clientId, ...repo.listAccountsForClipper(clipper.id).map((a) => a.clientId)];
    const channelId = clientIds
      .map((id) => (id ? repo.getClient(id)?.discordChannelId : null))
      .find((id): id is string => !!id);
    if (channelId) {
      const channel = await client.channels.fetch(channelId);
      if (channel?.isSendable()) {
        await channel.send(`<@${clipper.discordId}> ${text}`);
        return;
      }
    }
    const user = await client.users.fetch(clipper.discordId);
    await user.send(`${dmPrefix}${text}`);
  }

  const notifier: Notifier = {
    relance: (clipper: Clipper, _reason: RelanceReason, text: string) => deliver(clipper, text, `Salut ${clipper.username}, `),
  };

  const guild = async () => {
    const g = deps.guildId ? await client.guilds.fetch(deps.guildId) : client.guilds.cache.first();
    if (!g) throw new Error("Le bot n'est sur aucun serveur");
    return g;
  };

  const bridge: BotBridge = {
    async send(clipper, text) {
      try {
        await deliver(clipper, text, '');
        return true;
      } catch (err) {
        log.warn(`message à ${clipper.username} non envoyé : ${String(err)}`);
        return false;
      }
    },
    async roles() {
      const g = await guild();
      const roles = await g.roles.fetch();
      return [...roles.values()]
        .filter((r) => r.id !== g.id && !r.managed)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name }));
    },
    async membersWithRole(roleId) {
      const g = await guild();
      // Liste REST des membres : nécessite "Server Members Intent" dans le Developer Portal.
      const members = await g.members.list({ limit: 1000 }).catch((err) => {
        throw new Error(`Active « Server Members Intent » dans le Developer Portal Discord (onglet Bot). (${String(err)})`);
      });
      return [...members.values()]
        .filter((m) => !m.user.bot && m.roles.cache.has(roleId))
        .map((m) => ({ id: m.id, name: m.displayName }));
    },
  };

  return { notifier, bridge, stop: () => client.destroy() };
}
