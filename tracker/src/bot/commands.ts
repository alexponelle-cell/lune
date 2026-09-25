import {
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { Repo } from '../db/repo.js';
import { parseAccountUrl } from '../domain/links.js';
import { computeRewardCents, formatEuros } from '../domain/rewards.js';
import { type Comparison, isWindowKey, WINDOWS, type WindowKey } from '../domain/stats.js';
import type { Analytics } from '../services/analytics.js';

const WINDOW_LABELS: Record<WindowKey, string> = { '24h': '24 h', '7d': '7 jours', '30d': '30 jours' };
const WINDOW_CHOICES = (Object.keys(WINDOWS) as WindowKey[]).map((w) => ({ name: WINDOW_LABELS[w], value: w }));

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Tes vues (ou celles d’un membre) sur 24 h / 7 j / 30 j')
    .addUserOption((o) => o.setName('membre').setDescription('Membre à consulter')),

  new SlashCommandBuilder()
    .setName('classement')
    .setDescription('Classement des clippers par vues gagnées')
    .addStringOption((o) => o.setName('client').setDescription('Slug du client (ex. loann)'))
    .addStringOption((o) => o.setName('periode').setDescription('Période').addChoices(...WINDOW_CHOICES)),

  new SlashCommandBuilder()
    .setName('client')
    .setDescription('Créer / modifier un client et ses règles de rémunération')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName('nom').setDescription('Nom du client (ex. Loann)').setRequired(true))
    .addNumberOption((o) =>
      o.setName('tarif').setDescription('€ versés pour 1 000 vues').setRequired(true).setMinValue(0),
    )
    .addChannelOption((o) =>
      o.setName('salon').setDescription('Salon COMPTES de ce client').addChannelTypes(ChannelType.GuildText),
    )
    .addIntegerOption((o) => o.setName('min_vues').setDescription('Vues minimum pour être payé').setMinValue(0))
    .addNumberOption((o) => o.setName('plafond').setDescription('Plafond en € par période').setMinValue(0)),

  new SlashCommandBuilder()
    .setName('retirer-compte')
    .setDescription('Arrêter le suivi d’un de tes comptes')
    .addStringOption((o) => o.setName('lien').setDescription('Lien du profil').setRequired(true)),
].map((c) => c.toJSON());

const fmt = (n: number) => n.toLocaleString('fr-FR');

function trendLine(c: Comparison): string {
  const arrow = c.trend === 'up' ? '📈' : c.trend === 'down' ? '📉' : '➖';
  const pct = c.deltaPercent === null ? '' : ` (${c.deltaPercent > 0 ? '+' : ''}${Math.round(c.deltaPercent)} %)`;
  const partial = c.complete ? '' : ' · _historique partiel_';
  return `${arrow} **${fmt(c.current)}** vues · avant : ${fmt(c.previous)}${pct}${partial}`;
}

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  deps: { repo: Repo; analytics: Analytics; dashboardUrl: string },
): Promise<void> {
  const { repo, analytics } = deps;

  switch (interaction.commandName) {
    case 'stats': {
      const user = interaction.options.getUser('membre') ?? interaction.user;
      const clipper = repo.getClipperByDiscordId(user.id);
      const detail = clipper && analytics.clipperDetail(clipper.id);
      if (!detail || detail.accounts.length === 0) {
        await interaction.reply({ content: `Aucun compte suivi pour ${user}.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle(`Stats de ${user.displayName}`)
        .setColor(0x7c5cff)
        .addFields(
          { name: '24 h vs 24 h d’avant', value: trendLine(detail.windows['24h']) },
          { name: '7 jours vs semaine d’avant', value: trendLine(detail.windows['7d']) },
          { name: '30 jours vs mois d’avant', value: trendLine(detail.windows['30d']) },
          {
            name: 'Comptes suivis',
            value: detail.accounts
              .map((a) => `• ${a.account.platform} [@${a.account.handle}](${a.account.url}) : ${fmt(a.windows['7d'].current)} vues / 7 j`)
              .join('\n'),
          },
        )
        .setFooter({ text: `Dashboard : ${deps.dashboardUrl}` });
      await interaction.reply({ embeds: [embed] });
      return;
    }

    case 'classement': {
      const slug = interaction.options.getString('client') ?? repo.getClientByChannel(interaction.channelId)?.slug;
      const client = slug ? repo.getClientBySlug(slug) : undefined;
      if (slug && !client) {
        await interaction.reply({ content: `Client « ${slug} » inconnu.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const periode = interaction.options.getString('periode');
      const window: WindowKey = isWindowKey(periode) ? periode : '7d';
      const rows = analytics.leaderboard(window, { client }).slice(0, 15);
      const medals = ['🥇', '🥈', '🥉'];
      const lines = rows.map((r, i) => {
        const reward = r.rewardCents !== null ? ` · ${formatEuros(r.rewardCents)}` : '';
        return `${medals[i] ?? `**${i + 1}.**`} <@${r.clipper.discordId}> — ${fmt(r.stats.current)} vues${reward}`;
      });
      const embed = new EmbedBuilder()
        .setTitle(`Classement ${client ? client.name : 'global'} · ${WINDOW_LABELS[window]}`)
        .setColor(0xffb020)
        .setDescription(lines.join('\n') || 'Pas encore de données.');
      await interaction.reply({ embeds: [embed], allowedMentions: { users: [] } });
      return;
    }

    case 'client': {
      const name = interaction.options.getString('nom', true);
      const plafond = interaction.options.getNumber('plafond');
      const client = repo.upsertClient({
        name,
        discordChannelId: interaction.options.getChannel('salon')?.id ?? null,
        rule: {
          ratePer1kCents: Math.round(interaction.options.getNumber('tarif', true) * 100),
          minViews: interaction.options.getInteger('min_vues') ?? 0,
          capCents: plafond === null ? null : Math.round(plafond * 100),
        },
      });
      const example = computeRewardCents(100_000, client.rule);
      await interaction.reply({
        content:
          `✅ Client **${client.name}** (\`${client.slug}\`) enregistré.\n` +
          `Salon COMPTES : ${client.discordChannelId ? `<#${client.discordChannelId}>` : '_aucun_'}\n` +
          `Exemple : 100 000 vues → ${formatEuros(example)}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    case 'retirer-compte': {
      const link = parseAccountUrl(interaction.options.getString('lien', true));
      const account = link && repo.getAccountByHandle(link.platform, link.handle);
      const clipper = repo.getClipperByDiscordId(interaction.user.id);
      if (!account || !clipper || account.clipperId !== clipper.id) {
        await interaction.reply({ content: 'Ce compte n’est pas suivi à ton nom.', flags: MessageFlags.Ephemeral });
        return;
      }
      repo.deactivateAccount(account.id);
      await interaction.reply({ content: `Suivi arrêté pour ${account.platform} @${account.handle}.`, flags: MessageFlags.Ephemeral });
      return;
    }
  }
}
