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
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { Repo } from '../db/repo.js';
import { parseAccountInput, PLATFORMS } from '../domain/links.js';
import { log } from '../log.js';
import type { RecruitmentService } from '../services/recruitment.js';

export const RECRUITMENT_COMMANDS = new Set(['inscription', 'avis']);

export const recruitmentCommandDefinitions = [
  new SlashCommandBuilder().setName('inscription').setDescription('Enregistre tes comptes TikTok / Insta / YouTube et ton Drive'),
  new SlashCommandBuilder()
    .setName('avis')
    .setDescription('Demande un retour du staff sur une de tes vidéos')
    .addStringOption((o) => o.setName('lien').setDescription('Lien de la vidéo').setRequired(true))
    .addStringOption((o) => o.setName('question').setDescription('Ce que tu veux savoir (optionnel)')),
].map((c) => c.toJSON());

const TEST_BUTTON_ID = 'lune:test:open';
const INSCRIPTION_MODAL_ID = 'lune:inscription';
const URL_RE = /https?:\/\/[^\s<>]+/i;
const PLATFORM_LABEL = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' } as const;

export interface RecruitmentBridge {
  validateTest(clipperId: number): Promise<string[]>;
  reviewTest(clipperId: number, note: string, final: boolean): Promise<string[]>;
  publishTestMessage(channelId: string): Promise<void>;
  channels(): Promise<Array<{ id: string; name: string; type: 'text' | 'voice' | 'category' }>>;
  ticketUrl(channelId: string): string | null;
}

export function attachRecruitment(
  discord: DiscordClient,
  deps: { repo: Repo; recruitment: RecruitmentService; guildId?: string },
): RecruitmentBridge {
  const { repo, recruitment } = deps;
  const rec = recruitment.rec;
  const inviteUses = new Map<string, Map<string, { uses: number; inviterId?: string; inviterName?: string }>>();

  const guild = async (): Promise<Guild> => {
    const g = deps.guildId ? await discord.guilds.fetch(deps.guildId) : discord.guilds.cache.first();
    if (!g) throw new Error("Le bot n'est sur aucun serveur");
    return g;
  };

  const isStaff = (member: GuildMember | null | undefined) => {
    if (!member) return false;
    const staffRole = recruitment.settings().staffRoleId;
    return (staffRole !== '' && member.roles.cache.has(staffRole)) || member.permissions.has(PermissionFlagsBits.ManageGuild);
  };

  async function snapshotInvites(g: Guild) {
    try {
      const invites = await g.invites.fetch();
      inviteUses.set(
        g.id,
        new Map(invites.map((i) => [i.code, { uses: i.uses ?? 0, inviterId: i.inviter?.id, inviterName: i.inviter?.username }])),
      );
    } catch (err) {
      log.warn(`invitations illisibles (permission « Gérer le serveur » manquante ?) : ${String(err)}`);
    }
  }

  // --- Démarrage : invitations + présents dans le vocal --------------------------------
  discord.once(Events.ClientReady, async () => {
    rec.closeOpenVoiceSessions();
    for (const g of discord.guilds.cache.values()) {
      await snapshotInvites(g);
      const callId = recruitment.settings().callChannelId;
      const voice = callId ? g.channels.cache.get(callId) : undefined;
      if (voice?.isVoiceBased()) for (const m of voice.members.values()) rec.voiceJoin(m.id, voice.id);
    }
  });
  discord.on(Events.InviteCreate, (invite) => {
    if (!invite.guild) return;
    const map = inviteUses.get(invite.guild.id) ?? new Map();
    map.set(invite.code, { uses: invite.uses ?? 0, inviterId: invite.inviter?.id, inviterName: invite.inviter?.username });
    inviteUses.set(invite.guild.id, map);
  });

  // --- Arrivée d'un membre : qui l'a invité ? (nécessite Server Members Intent) -----------
  discord.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;
    try {
      const before = inviteUses.get(member.guild.id) ?? new Map();
      await snapshotInvites(member.guild);
      const after = inviteUses.get(member.guild.id) ?? new Map();
      let recruiterId: number | null = null;
      for (const [code, info] of after) {
        if (info.uses > (before.get(code)?.uses ?? 0) && info.inviterId && info.inviterId !== member.id) {
          recruiterId = rec.upsertRecruiter(info.inviterId, info.inviterName ?? info.inviterId).id;
          break;
        }
      }
      rec.upsertCandidate({ discordId: member.id, username: member.displayName, stage: 'invite', recruiterId, joinedAt: Date.now() });
      log.info(`nouveau membre ${member.user.username}${recruiterId ? ' (invitation suivie)' : ''}`);
    } catch (err) {
      log.error('arrivée membre', err);
    }
  });

  // --- Présence au call ------------------------------------------------------------------------
  discord.on(Events.VoiceStateUpdate, (before, after) => {
    const callId = recruitment.settings().callChannelId;
    if (!callId || before.channelId === after.channelId) return;
    const id = after.id;
    if (after.channelId === callId) rec.voiceJoin(id, callId);
    else if (before.channelId === callId) rec.voiceLeave(id);
  });

  // --- Salons privés : réactivité + dépôt du test -------------------------------------------
  discord.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.inGuild()) return;
    const candidate = rec.candidateByChannel(message.channelId);
    if (!candidate) return;
    try {
      const staff = message.author.id !== candidate.discordId && isStaff(message.member);
      rec.logMessage(message.channelId, candidate.id, staff);
      if (message.author.id !== candidate.discordId) return;
      const test = rec.currentTest(candidate.id);
      const url = URL_RE.exec(message.content)?.[0];
      if (test && url && (test.status === 'open' || test.status === 'changes')) {
        rec.submitTest(test.id, url);
        await message.react('👀');
        await message.reply('📥 **Test reçu !** Le staff regarde ton clip et te répond directement ici.');
      }
    } catch (err) {
      log.error('message salon privé', err);
    }
  });

  // --- Bouton "Envoyer mon test", /inscription, /avis ----------------------------------------
  discord.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isButton() && interaction.customId === TEST_BUTTON_ID) {
        if (!interaction.inCachedGuild()) return;
        const existing = rec.candidateByDiscordId(interaction.user.id);
        if (existing?.stage === 'clipper') {
          await interaction.reply({ content: 'Tu fais déjà partie des clippers 😉', flags: MessageFlags.Ephemeral });
          return;
        }
        if (existing?.privateChannelId && interaction.guild.channels.cache.has(existing.privateChannelId)) {
          await interaction.reply({ content: `Ton salon de test : <#${existing.privateChannelId}>`, flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const channel = await openTestChannel(interaction.guild, interaction.member);
        await interaction.editReply(`✅ Ton salon de test est prêt : <#${channel}>`);
        return;
      }

      if (interaction.isChatInputCommand() && interaction.commandName === 'inscription') {
        const modal = new ModalBuilder().setCustomId(INSCRIPTION_MODAL_ID).setTitle('Inscription clipper');
        const field = (id: string, label: string, placeholder: string) =>
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(placeholder).setStyle(TextInputStyle.Short).setRequired(false),
          );
        modal.addComponents(
          field('tiktok', 'TikTok', 'https://www.tiktok.com/@toncompte'),
          field('instagram', 'Instagram', 'https://www.instagram.com/toncompte'),
          field('youtube', 'YouTube', 'https://www.youtube.com/@toncompte'),
          field('drive', 'Drive (dossier de tes montages)', 'https://drive.google.com/…'),
        );
        await interaction.showModal(modal);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === INSCRIPTION_MODAL_ID) {
        await interaction.reply({ content: await handleInscription(interaction.user.id, interaction.user.username, (k) => interaction.fields.getTextInputValue(k)), flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.isChatInputCommand() && interaction.commandName === 'avis') {
        const candidate = rec.candidateByDiscordId(interaction.user.id);
        if (!candidate || candidate.stage !== 'clipper') {
          await interaction.reply({ content: 'Cette commande est réservée aux clippers.', flags: MessageFlags.Ephemeral });
          return;
        }
        rec.addRequest(candidate.id, 'avis', {
          url: interaction.options.getString('lien', true),
          question: interaction.options.getString('question') ?? undefined,
        });
        await interaction.reply({ content: '📝 Demande d’avis envoyée au staff, tu auras un retour ici ou dans ton salon.', flags: MessageFlags.Ephemeral });
      }
    } catch (err) {
      log.error('interaction recrutement', err);
      const reply = { content: `Oups : ${err instanceof Error ? err.message : String(err)}`.slice(0, 300), flags: MessageFlags.Ephemeral } as const;
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
    }
  });

  async function openTestChannel(g: Guild, member: GuildMember): Promise<string> {
    const s = recruitment.settings();
    const slug = member.displayName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'candidat';
    const allow = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
    ];
    const channel = await g.channels.create({
      name: `test-${slug}`,
      type: ChannelType.GuildText,
      parent: s.testCategoryId || undefined,
      permissionOverwrites: [
        { id: g.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow },
        ...(s.staffRoleId ? [{ id: s.staffRoleId, allow }] : []),
        { id: discord.user!.id, allow: [...allow, PermissionFlagsBits.ManageChannels] },
      ],
    });
    const candidate = rec.upsertCandidate({ discordId: member.id, username: member.displayName, stage: 'test', joinedAt: member.joinedTimestamp });
    rec.setPrivateChannel(candidate.id, channel.id);
    rec.openTest(candidate.id, channel.id);
    await channel.send(
      [
        `👋 Salut <@${member.id}>, bienvenue dans ton salon de test !`,
        '',
        'Voici comment ça se passe :',
        '',
        `**1.** Réalise ton clip en suivant les guidelines${s.guidelinesUrl ? ` du Drive :\n${s.guidelinesUrl}` : '.'}`,
        '**2.** Dépose ici ton **lien Drive** ou **WeTransfer** (pas de fichier lourd directement).',
        '**3.** Le staff regarde ton clip et te répond directement dans ce salon.',
        '',
        '🎯 Si ton test est validé, tu passeras automatiquement au statut **Nouveau clipper**.',
        '',
        "Une question avant d'avoir fini ? Pose-la ici, on te répond 🔥",
      ].join('\n'),
    );
    rec.logMessage(channel.id, candidate.id, true);
    return channel.id;
  }

  async function handleInscription(discordId: string, username: string, get: (key: string) => string): Promise<string> {
    const candidate = rec.candidateByDiscordId(discordId);
    if (!candidate || candidate.stage === 'invite' || candidate.stage === 'test') {
      return "⏳ Ton test doit d'abord être validé par le staff avant de t'inscrire.";
    }
    if (candidate.stage === 'refuse') return "Ton inscription n'est pas ouverte. Contacte le staff.";
    const clipper = repo.getClipper(candidate.id)!;
    const added: string[] = [];
    const errors: string[] = [];
    for (const platform of PLATFORMS) {
      const raw = get(platform);
      if (!raw.trim()) continue;
      const link = parseAccountInput(platform, raw);
      if (!link) {
        errors.push(`${PLATFORM_LABEL[platform]} : lien invalide`);
        continue;
      }
      const r = repo.registerAccount({ clipperId: clipper.id, clientId: clipper.clientId, ...link });
      if (r.conflict) errors.push(`${PLATFORM_LABEL[platform]} @${link.handle} : déjà enregistré par ${r.conflict.username}`);
      else added.push(`${PLATFORM_LABEL[platform]} @${link.handle}`);
    }
    const drive = get('drive').trim();
    if (drive) rec.setDrive(candidate.id, drive);
    rec.addRequest(candidate.id, 'inscription', {
      tiktok: get('tiktok').trim() || undefined,
      instagram: get('instagram').trim() || undefined,
      youtube: get('youtube').trim() || undefined,
      drive: drive || undefined,
    });
    await updateTopic(candidate.id).catch((err) => log.warn(`sujet du salon non mis à jour : ${String(err)}`));
    log.info(`inscription de ${username} : ${added.join(', ') || 'aucun compte'}`);
    return [
      added.length ? `✅ Comptes suivis : ${added.join(', ')}` : 'Aucun nouveau compte.',
      drive ? '📁 Drive enregistré.' : '',
      ...errors.map((e) => `⚠️ ${e}`),
      '',
      'Tes stats apparaîtront sur le dashboard après la prochaine collecte.',
    ]
      .filter((l, i, a) => l || a[i - 1])
      .join('\n');
  }

  /** Sujet du salon privé = fiche du clipper (comptes, drive, checklist), comme dans le modèle. */
  async function updateTopic(clipperId: number) {
    const candidate = rec.candidate(clipperId);
    if (!candidate?.privateChannelId) return;
    const channel = await discord.channels.fetch(candidate.privateChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    const accounts = repo.listAccountsForClipper(clipperId);
    const url = (p: string) => accounts.find((a) => a.platform === p)?.url ?? '';
    const topic = [`insta : ${url('instagram')}`, `tik tok : ${url('tiktok')}`, `youtube : ${url('youtube')}`, `drive : ${candidate.driveUrl ?? ''}`, 'Check liste :'].join('\n');
    await channel.setTopic(topic.slice(0, 1024));
  }

  async function postInChannel(channelId: string | null, content: string) {
    if (!channelId) return false;
    const channel = await discord.channels.fetch(channelId).catch(() => null);
    if (!channel?.isSendable()) return false;
    await channel.send(content);
    return true;
  }

  return {
    async validateTest(clipperId) {
      const warnings: string[] = [];
      const candidate = rec.candidate(clipperId);
      if (!candidate) throw new Error('Candidat introuvable');
      const test = rec.currentTest(clipperId);
      if (test) rec.reviewTest(test.id, 'validated', null);
      rec.setStage(clipperId, 'clipper');
      const sent = await postInChannel(
        candidate.privateChannelId,
        [
          `🎉 **Félicitations <@${candidate.discordId}>, ton test a été validé !**`,
          '',
          "Bienvenue dans l'équipe !",
          '',
          "✅ Crée tes comptes, puis fais `/inscription` pour t'enregistrer dans l'app et m'envoyer tes liens.",
          '',
          "⚡ Attaque dès maintenant : ceux qui ont le plus de résultats, c'est ceux qui passent à l'action rapidement. À très vite ! 🚀",
        ].join('\n'),
      );
      if (!sent) warnings.push('Message de validation non envoyé (salon introuvable)');
      const { newClipperRoleId: roleId, testRoleId } = recruitment.settings();
      if (roleId) {
        try {
          const g = await guild();
          const member = await g.members.fetch(candidate.discordId);
          await member.roles.add(roleId);
          if (testRoleId && member.roles.cache.has(testRoleId)) await member.roles.remove(testRoleId);
        } catch (err) {
          warnings.push(`Rôle non attribué : vérifie que le rôle du bot est au-dessus de « Nouveau clipper » (${String(err)})`);
        }
      } else warnings.push('Aucun rôle « Nouveau clipper » configuré dans Paramètres');
      return warnings;
    },

    async reviewTest(clipperId, note, final) {
      const candidate = rec.candidate(clipperId);
      if (!candidate) throw new Error('Candidat introuvable');
      const test = rec.currentTest(clipperId);
      if (test) rec.reviewTest(test.id, final ? 'refused' : 'changes', note);
      if (final) rec.setStage(clipperId, 'refuse');
      const text = final
        ? `❌ <@${candidate.discordId}>, ton test n'a pas été retenu cette fois.${note ? `\n\n${note}` : ''}`
        : `✏️ <@${candidate.discordId}>, **ton test est à corriger** :\n\n${note}\n\nRenvoie ton nouveau lien Drive / WeTransfer ici quand c'est prêt 💪`;
      const sent = await postInChannel(candidate.privateChannelId, text);
      if (sent && candidate.privateChannelId) rec.logMessage(candidate.privateChannelId, clipperId, true);
      return sent ? [] : ['Message non envoyé (salon introuvable)'];
    },

    async publishTestMessage(channelId) {
      const s = recruitment.settings();
      const channel = await discord.channels.fetch(channelId);
      if (!channel?.isSendable()) throw new Error('Salon introuvable ou non accessible au bot');
      // Forum des tutos (comme chez Micka : lien du salon + des posts à regarder)
      const g = await guild();
      const forum = (await g.channels.fetch()).find((c) => c?.type === ChannelType.GuildForum && /tuto/i.test(c.name));
      let posts: string[] = [];
      if (forum?.type === ChannelType.GuildForum) {
        const [active, archived] = await Promise.all([
          forum.threads.fetchActive().catch(() => null),
          forum.threads.fetchArchived().catch(() => null),
        ]);
        const threads = [...(active?.threads.values() ?? []), ...(archived?.threads.values() ?? [])].filter((t) => t.parentId === forum.id);
        posts = [...new Map(threads.map((t) => [t.id, t])).values()]
          .sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0))
          .slice(0, 6)
          .map((t) => `• <#${t.id}>`);
      }
      const content = [
        '## 🎬 Réalise ton test de clip',
        "Voici les **4 étapes** pour rejoindre l'équipe :",
        '',
        '**1. 📁 Consulte le Drive**',
        ...(s.guidelinesUrl ? [s.guidelinesUrl] : []),
        'Tu y trouveras les exemples et guidelines à respecter.',
        '',
        '**2. 🎓 Regarde les tutos**',
        forum ? `Dans <#${forum.id}>${posts.length ? ', regarde notamment :' : '.'}` : 'Dans le salon tutos.',
        ...posts,
        '',
        '**3. 🎬 Fais ton test**',
        'Clique sur 📨 **Envoyer mon test** et envoie ton montage via **Drive ou WeTransfer** dans ton salon privé.',
        '',
        '**4. ✅ Validation**',
        '**Validé** → Tu rejoins l’équipe.',
        '**À corriger** → Tu reçois un retour pour améliorer ton clip.',
        ...(s.testVideoUrl ? ['', '🎥 **La vidéo ci-dessous t’explique les consignes du test :**', s.testVideoUrl] : []),
        '',
        '**Une question ? Ouvre ton salon de test, on t’aidera.**',
      ].join('\n');
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(TEST_BUTTON_ID).setLabel('Envoyer mon test').setEmoji('📨').setStyle(ButtonStyle.Success),
      );
      await channel.send({ content, components: [row], allowedMentions: { parse: [] } });
    },

    async channels() {
      const g = await guild();
      const all = await g.channels.fetch();
      return [...all.values()]
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type === ChannelType.GuildCategory ? 'category' : c.isVoiceBased() ? 'voice' : c.isTextBased() ? 'text' : null,
        }))
        .filter((c): c is { id: string; name: string; type: 'text' | 'voice' | 'category' } => c.type !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    ticketUrl(channelId) {
      const g = deps.guildId ?? discord.guilds.cache.first()?.id;
      return g ? `https://discord.com/channels/${g}/${channelId}` : null;
    },
  };
}
