import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type Client as DiscordClient,
  EmbedBuilder,
  Events,
  type Guild,
  type GuildMember,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { Repo } from '../db/repo.js';
import { log } from '../log.js';
import type { AgencyService } from '../services/agency.js';
import type { RecruitmentService } from '../services/recruitment.js';

/**
 * Accueil, candidatures (ticket + formulaire + relances), départs et compteurs "Objectifs".
 * Repris du bot Python « Lune Builder » pour n'avoir plus qu'un seul bot, hébergé sur Railway.
 */

const OPEN_ID = 'lune:cand:open';
const FORM_ID = 'lune:cand:form';
const MODAL_ID = 'lune:cand:modal';
const DECIDE_PREFIX = 'lune:cand:'; // lune:cand:accept:<id> / lune:cand:refuse:<id>
const DEPART_ID = 'lune:depart';
const EMBED_COLOR = 0xf2f2f2;

const QUESTIONS = [
  { id: 'prenom', label: 'Prénom et âge', placeholder: 'Lucas, 19 ans', long: false },
  { id: 'niveau', label: 'Ton niveau en montage', placeholder: 'Débutant / intermédiaire / confirmé + expérience', long: false },
  { id: 'logiciel', label: 'Logiciel utilisé', placeholder: 'CapCut PC, CapCut mobile, Premiere…', long: false },
  { id: 'dispo', label: 'Tes disponibilités', placeholder: "Combien d'heures par jour ? Quels jours ?", long: false },
  { id: 'liens', label: 'Liens (comptes, montages déjà faits)', placeholder: 'https://www.tiktok.com/@…', long: true },
] as const;
export const QUESTION_LABELS: Record<string, string> = Object.fromEntries(QUESTIONS.map((q) => [q.id, q.label]));

const DEPART_REASONS = [
  { label: 'Pas le temps en ce moment', emoji: '⏰' },
  { label: 'Trop compliqué / pas compris le fonctionnement', emoji: '🤯' },
  { label: 'La rémunération ne me convient pas', emoji: '💸' },
  { label: 'Pas trouvé ce que je cherchais', emoji: '🔍' },
  { label: 'Autre raison', emoji: '💬' },
];

export interface CommunityBridge {
  publishStartMessage(channelId: string): Promise<void>;
  publishCandidatureMessage(channelId: string): Promise<void>;
  decideCandidature(id: number, accept: boolean, by: string): Promise<string[]>;
}

export function attachCommunity(
  discord: DiscordClient,
  deps: { repo: Repo; recruitment: RecruitmentService; agency: AgencyService; guildId?: string },
): CommunityBridge {
  const { repo, recruitment, agency } = deps;
  const rec = recruitment.rec;
  const s = () => recruitment.settings();

  const guild = async (): Promise<Guild> => {
    const g = deps.guildId ? await discord.guilds.fetch(deps.guildId) : discord.guilds.cache.first();
    if (!g) throw new Error("Le bot n'est sur aucun serveur");
    return g;
  };
  const mention = (id: string, fallback: string) => (id ? `<#${id}>` : fallback);
  const isStaff = (member: GuildMember | null) =>
    !!member &&
    ((s().staffRoleId !== '' && member.roles.cache.has(s().staffRoleId)) || member.permissions.has(PermissionFlagsBits.ManageGuild));

  async function send(channelId: string | null, payload: Parameters<import('discord.js').TextChannel['send']>[0]) {
    if (!channelId) return null;
    const channel = await discord.channels.fetch(channelId).catch(() => null);
    return channel?.isSendable() ? channel.send(payload) : null;
  }

  const formButton = () =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(FORM_ID).setLabel('Remplir ma candidature').setEmoji('📝').setStyle(ButtonStyle.Success),
    );

  // --- Accueil -------------------------------------------------------------------------------
  discord.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;
    const settings = s();
    if (settings.arrivantRoleId) {
      await member.roles.add(settings.arrivantRoleId, 'Arrivée sur le serveur').catch((err) => log.warn(`rôle Arrivant non donné : ${String(err)}`));
    }
    await member
      .send(
        [
          `👋 Bienvenue sur **${member.guild.name}** !`,
          '',
          'Pour commencer :',
          `1. Lis ${mention(settings.welcomeChannelId, '#start-here')}`,
          '2. Valide avec ✅ pour débloquer les autres salons',
          '',
          'À très vite 🚀',
        ].join('\n'),
      )
      .catch(() => {}); // DM fermés : pas grave
  });

  // --- start-here : réagir ✅ débloque les salons (rôle Test), comme chez Micka -----------------
  discord.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot || reaction.emoji.name !== '✅') return;
    const settings = s();
    if (!settings.welcomeChannelId || reaction.message.channelId !== settings.welcomeChannelId || !reaction.message.guildId) return;
    try {
      const g = await discord.guilds.fetch(reaction.message.guildId);
      const member = await g.members.fetch(user.id);
      if (settings.testRoleId && !member.roles.cache.has(settings.testRoleId)) await member.roles.add(settings.testRoleId, 'Règles validées (✅ dans start-here)');
      if (settings.arrivantRoleId && member.roles.cache.has(settings.arrivantRoleId)) await member.roles.remove(settings.arrivantRoleId);
      rec.upsertCandidate({ discordId: member.id, username: member.displayName, stage: 'invite', joinedAt: member.joinedTimestamp });
      log.info(`${member.user.username} a validé start-here`);
    } catch (err) {
      log.warn(`rôle start-here non donné à ${user.username} (rôle du bot trop bas ?) : ${String(err)}`);
    }
  });

  // --- Départs : DM best-effort + log fiable --------------------------------------------------
  discord.on(Events.GuildMemberRemove, async (member) => {
    if (member.user.bot) return;
    const roles = member.roles.cache.filter((r) => r.id !== member.guild.id).map((r) => r.name);
    let dmSent = false;
    try {
      // Souvent refusé par Discord : plus de serveur en commun après le départ.
      await member.user.send({
        embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle(`Tu as quitté ${member.guild.name}`).setDescription('Dommage de te voir partir ! Tu peux nous dire pourquoi ? (1 clic)')],
        components: [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(DEPART_ID)
              .setPlaceholder('Pourquoi es-tu parti ?')
              .addOptions(DEPART_REASONS.map((r, i) => ({ label: r.label, emoji: r.emoji, value: String(i) }))),
          ),
        ],
      });
      dmSent = true;
    } catch {
      /* best-effort */
    }
    rec.addDeparture({ discordId: member.id, username: member.user.username, roles, joinedAt: member.joinedTimestamp, dmSent });
    const days = member.joinedTimestamp ? Math.floor((Date.now() - member.joinedTimestamp) / 86_400_000) : null;
    await send(
      s().departuresChannelId,
      `🚪 **${member.user.username}** (${member.id}) est parti${days !== null ? ` · resté ${days} j` : ''}\nGrades : ${roles.join(', ') || 'aucun'}\nSondage DM : ${dmSent ? 'envoyé ✅' : 'impossible ❌'}`,
    ).catch(() => {});
  });

  // --- Interactions : Postuler, formulaire, décision staff, sondage de départ -------------------
  discord.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isButton() && interaction.customId === OPEN_ID) {
        if (!interaction.inCachedGuild()) return;
        const member = interaction.member;
        const settings = s();
        const existing = rec.candidateByDiscordId(member.id);
        if (existing?.stage === 'clipper' || (settings.testRoleId && member.roles.cache.has(settings.testRoleId))) {
          await interaction.reply({ content: 'Tu fais déjà partie du parcours 😉', flags: MessageFlags.Ephemeral });
          return;
        }
        const active = existing && rec.activeCandidature(existing.id);
        if (active?.channelId && interaction.guild.channels.cache.has(active.channelId)) {
          await interaction.reply({ content: `Ton ticket est déjà ouvert : <#${active.channelId}>`, flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const channelId = await openTicket(interaction.guild, member);
        await interaction.editReply(`✅ Ton ticket est ouvert : <#${channelId}>`);
        return;
      }

      if (interaction.isButton() && interaction.customId === FORM_ID) {
        const cand = rec.candidatureByChannel(interaction.channelId);
        const candidate = cand && rec.candidate(cand.clipperId);
        if (!cand || candidate?.discordId !== interaction.user.id) {
          await interaction.reply({ content: 'Ce formulaire est réservé au candidat de ce ticket.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (cand.status !== 'open') {
          await interaction.reply({ content: 'Ta candidature est déjà envoyée ✅', flags: MessageFlags.Ephemeral });
          return;
        }
        const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle('Ta candidature');
        for (const q of QUESTIONS) {
          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(q.id)
                .setLabel(q.label)
                .setPlaceholder(q.placeholder)
                .setStyle(q.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
                .setRequired(!q.long)
                .setMaxLength(q.long ? 800 : 200),
            ),
          );
        }
        await interaction.showModal(modal);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
        const cand = interaction.channelId ? rec.candidatureByChannel(interaction.channelId) : undefined;
        if (!cand) {
          await interaction.reply({ content: 'Ticket introuvable.', flags: MessageFlags.Ephemeral });
          return;
        }
        const answers = Object.fromEntries(QUESTIONS.map((q) => [q.id, interaction.fields.getTextInputValue(q.id).trim()]));
        rec.submitCandidature(cand.id, answers);
        await interaction.reply('✅ Candidature envoyée ! Le staff te répond ici très vite.');
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle(`📥 Candidature de ${interaction.user.displayName}`)
          .setThumbnail(interaction.user.displayAvatarURL())
          .addFields(
            ...QUESTIONS.map((q) => ({ name: q.label, value: answers[q.id] || '—', inline: !q.long && q.id !== 'dispo' })),
            { name: 'Ticket', value: `<#${cand.channelId}>` },
          );
        const msg = await send(s().staffChannelId, { embeds: [embed], components: [decisionRow(cand.id)] });
        if (msg) rec.setCandidatureStaffMessage(cand.id, msg.id);
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith(DECIDE_PREFIX) && /:(accept|refuse):\d+$/.test(interaction.customId)) {
        if (!interaction.inCachedGuild() || !isStaff(interaction.member)) {
          await interaction.reply({ content: 'Réservé au staff.', flags: MessageFlags.Ephemeral });
          return;
        }
        const [, , action, id] = interaction.customId.split(':');
        await interaction.deferUpdate();
        const warnings = await decide(Number(id), action === 'accept', interaction.member.displayName);
        for (const w of warnings) await interaction.followUp({ content: `⚠️ ${w}`, flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.isStringSelectMenu() && interaction.customId === DEPART_ID) {
        const reason = DEPART_REASONS[Number(interaction.values[0])]?.label ?? 'Autre raison';
        rec.setDepartureReason(interaction.user.id, reason);
        await send(s().departuresChannelId, `📝 **${interaction.user.username}** a répondu au sondage : **${reason}**`).catch(() => {});
        await interaction.update({ content: 'Merci pour ta réponse 🙏', embeds: [], components: [] });
      }
    } catch (err) {
      log.error('interaction candidature', err);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: `Oups : ${String(err)}`.slice(0, 300), flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  });

  function decisionRow(id: number, verdict?: string) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    if (verdict) row.addComponents(new ButtonBuilder().setCustomId(`${DECIDE_PREFIX}done:${id}`).setLabel(verdict).setStyle(ButtonStyle.Secondary).setDisabled(true));
    else
      row.addComponents(
        new ButtonBuilder().setCustomId(`${DECIDE_PREFIX}accept:${id}`).setLabel('Accepter').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`${DECIDE_PREFIX}refuse:${id}`).setLabel('Refuser').setEmoji('✖️').setStyle(ButtonStyle.Danger),
      );
    return row;
  }

  async function openTicket(g: Guild, member: GuildMember): Promise<string> {
    const settings = s();
    const slug = member.displayName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'candidat';
    const allow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
    const channel = await g.channels.create({
      name: `ticket-${slug}`,
      type: ChannelType.GuildText,
      parent: settings.ticketCategoryId || undefined,
      permissionOverwrites: [
        { id: g.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow },
        ...(settings.staffRoleId ? [{ id: settings.staffRoleId, allow }] : []),
        { id: discord.user!.id, allow: [...allow, PermissionFlagsBits.ManageChannels] },
      ],
    });
    const candidate = rec.upsertCandidate({ discordId: member.id, username: member.displayName, stage: 'invite', joinedAt: member.joinedTimestamp });
    rec.setPrivateChannel(candidate.id, channel.id);
    rec.openCandidature(candidate.id, channel.id);
    await channel.send({
      content: [
        `👋 Salut <@${member.id}>, bienvenue dans ton ticket de candidature !`,
        '',
        'Clique sur **📝 Remplir ma candidature** juste en dessous : 5 questions, 2 minutes.',
        'Le staff étudie ton profil et te répond ici même.',
      ].join('\n'),
      components: [formButton()],
    });
    rec.logMessage(channel.id, candidate.id, true);
    log.info(`ticket de candidature ouvert pour ${member.user.username}`);
    return channel.id;
  }

  /** Accepter (rôle Test) ou refuser une candidature : depuis Discord ou depuis le dashboard. */
  async function decide(id: number, accept: boolean, by: string): Promise<string[]> {
    const warnings: string[] = [];
    const cand = rec.candidature(id);
    if (!cand) throw new Error('Candidature introuvable');
    const candidate = rec.candidate(cand.clipperId);
    if (!candidate) throw new Error('Candidat introuvable');
    if (cand.status === 'accepted' || cand.status === 'refused') return ['Candidature déjà traitée'];
    rec.decideCandidature(id, accept, by);
    const settings = s();
    if (accept) {
      rec.upsertCandidate({ discordId: candidate.discordId, username: candidate.username, stage: 'test' });
      try {
        const member = await (await guild()).members.fetch(candidate.discordId);
        if (settings.testRoleId) await member.roles.add(settings.testRoleId, `Candidature acceptée par ${by}`);
        else warnings.push('Aucun rôle « Test » configuré dans Paramètres');
        if (settings.arrivantRoleId && member.roles.cache.has(settings.arrivantRoleId)) await member.roles.remove(settings.arrivantRoleId);
      } catch (err) {
        warnings.push(`Rôle non modifié (le candidat a quitté le serveur, ou le rôle du bot est trop bas) : ${String(err)}`);
      }
    }
    const text = accept
      ? [
          `✅ **Candidature acceptée <@${candidate.discordId}> !**`,
          '',
          `Tu as maintenant le rôle **Test** : va dans ${mention(settings.testChannelId, '#faire-test')}, regarde les tutos et envoie ton clip test.`,
          'Si ton test est validé, tu deviens **Nouveau** clipper 🎬',
        ].join('\n')
      : [`Merci pour ta candidature <@${candidate.discordId}> 🙏`, '', "Ton profil n'est pas retenu pour le moment. Continue à t'entraîner, tu pourras repostuler plus tard 💪"].join('\n');
    if (!(await send(cand.channelId, text).catch(() => null))) warnings.push('Message non envoyé dans le ticket (salon supprimé ?)');
    if (cand.channelId) rec.logMessage(cand.channelId, candidate.id, true);
    // Met à jour le message du salon staff (boutons désactivés + verdict)
    if (cand.staffMessageId && settings.staffChannelId) {
      const channel = await discord.channels.fetch(settings.staffChannelId).catch(() => null);
      if (channel?.isTextBased()) {
        const msg = await channel.messages.fetch(cand.staffMessageId).catch(() => null);
        await msg?.edit({ components: [decisionRow(id, `${accept ? '✅ Acceptée' : '❌ Refusée'} par ${by}`)] }).catch(() => {});
      }
    }
    log.info(`candidature ${id} ${accept ? 'acceptée' : 'refusée'} par ${by}`);
    return warnings;
  }

  // --- Relances des candidats qui n'ont pas rempli le formulaire -------------------------------
  const RELANCES = [
    (id: string) => `👀 <@${id}>, t'as oublié ? Ta candidature n'est pas encore remplie.\nClique sur **📝 Remplir ma candidature**, ça prend 2 minutes ⏱️`,
    (id: string) => `⏳ **Dernier rappel** <@${id}> : sans formulaire on ne peut pas étudier ton profil.\nLes places partent vite : remplis-le maintenant et montre-nous ce que tu vaux 🔥`,
  ];
  async function relances() {
    const settings = s();
    const delays = [settings.relance1Min, settings.relance2Min];
    for (const cand of rec.candidaturesByStatus('open')) {
      const due = delays[cand.relances];
      if (due === undefined || Date.now() - cand.openedAt < due * 60_000) continue;
      const candidate = rec.candidate(cand.clipperId);
      if (!candidate) continue;
      rec.addRelance(cand.id);
      const sent = await send(cand.channelId, { content: RELANCES[cand.relances]!(candidate.discordId), components: [formButton()] }).catch(() => null);
      log.info(`relance ${cand.relances + 1} de ${candidate.username} ${sent ? 'envoyée' : 'impossible (ticket supprimé ?)'}`);
    }
  }

  // --- Compteurs "Objectifs" (salons vocaux renommés avec les vrais chiffres) --------------------
  const compact = (n: number) =>
    n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.0', '').replace('.', ',')}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);
  async function counters() {
    const settings = s();
    const update = async (channelId: string, keyword: string, value: string) => {
      if (!channelId) return;
      const channel = await discord.channels.fetch(channelId).catch(() => null);
      if (!channel || !('setName' in channel) || !('name' in channel)) return;
      const re = new RegExp(`(${keyword}\\s+)(.+?)(\\s*→)`, 'i');
      const next = channel.name.replace(re, `$1${value}$3`);
      // Discord limite le renommage d'un salon à 2 fois / 10 min
      if (next !== channel.name) await channel.setName(next).catch((err) => log.warn(`compteur ${keyword} non mis à jour : ${String(err)}`));
    };
    const views = agency.ranked(agency.range({ preset: 'all' })).reduce((a, r) => a + r.views, 0);
    await update(settings.vuesCounterId, 'vues', compact(views));
    await update(settings.clippersCounterId, 'clippers', String(repo.listClippers().length));
  }

  discord.once(Events.ClientReady, () => {
    setInterval(() => void relances().catch((err) => log.error('relances candidatures', err)), 2 * 60_000);
    void counters().catch((err) => log.error('compteurs', err));
    setInterval(() => void counters().catch((err) => log.error('compteurs', err)), 6 * 3_600_000);
  });

  return {
    async publishStartMessage(channelId) {
      const settings = s();
      const g = await guild();
      const msg = await send(channelId, {
        content: [
          `Bienvenue sur **${g.name}** 👋`,
          '',
          'Ce que tu dois retenir :',
          '',
          '1. Valide ce message pour accéder aux autres salons avec ce smiley : ✅',
          `2. Va dans ${mention(settings.testChannelId, '#faire-test')}, regarde les tutos et prépare ta première vidéo`,
          '3. Clique sur **Envoyer mon test** : un salon privé s’ouvre, envoie ton clip dedans',
          '4. Test validé → tu deviens **Nouveau** clipper 🎬',
          '5. On a une DA précise : uniquement des talks illustrés, pas de contenu type citations ou autre',
        ].join('\n'),
        allowedMentions: { parse: [] },
      });
      if (!msg) throw new Error('Salon introuvable ou non accessible au bot');
      await msg.react('✅');
    },
    async publishCandidatureMessage(channelId) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("📝 Rejoindre l'équipe")
        .setDescription(
          [
            'Tu veux clipper avec nous ? Clique sur **Postuler** juste en dessous.',
            '',
            "Un salon privé s'ouvre, tu remplis un court formulaire et le staff te répond directement dedans.",
            '',
            '⚡ Les places sont limitées : ceux qui passent à l’action vite passent en premier.',
          ].join('\n'),
        );
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(OPEN_ID).setLabel('Postuler').setEmoji('📝').setStyle(ButtonStyle.Secondary),
      );
      const msg = await send(channelId, { embeds: [embed], components: [row] });
      if (!msg) throw new Error('Salon introuvable ou non accessible au bot');
    },
    decideCandidature: decide,
  };
}
