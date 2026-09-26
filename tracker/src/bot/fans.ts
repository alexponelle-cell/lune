import {
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
  new SlashCommandBuilder().setName('site').setDescription('Reçois ton lien de connexion à ton espace (vues, points, boutique)').toJSON(),
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
          content: `🔐 **Ton lien de connexion perso** (valable 10 min, ne le partage pas) :\n${url}\n\nTu y ajoutes tes comptes TikTok / Insta / YouTube et ton pseudo Roblox, tu suis tes coins et tu dépenses dans la boutique.`,
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

/** Bot Neptune : bot séparé, installé sur le serveur du créateur, qui ne fait que le programme fans. */
export async function startNeptune(opts: { token: string; clientId?: string; guildId?: string; fans: FanService }): Promise<() => Promise<void>> {
  if (opts.clientId) {
    try {
      const rest = new REST().setToken(opts.token);
      const route = opts.guildId ? Routes.applicationGuildCommands(opts.clientId, opts.guildId) : Routes.applicationCommands(opts.clientId);
      await rest.put(route, { body: fanCommandDefinitions });
    } catch (err) {
      log.error('Neptune : enregistrement des commandes', err);
    }
  }
  const discord = new DiscordClient({ intents: [GatewayIntentBits.Guilds] });
  discord.once(Events.ClientReady, (c) => {
    status.neptune = { state: 'ready', tag: c.user.tag, guilds: c.guilds.cache.size };
    log.info(`Neptune connecté en tant que ${c.user.tag}`);
  });
  discord.on(Events.Error, (err) => log.error('neptune', err));
  attachFanCommands(discord, opts.fans);
  await discord.login(opts.token);
  return () => discord.destroy();
}
