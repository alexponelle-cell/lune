# -*- coding: utf-8 -*-
"""
Bot « constructeur » du serveur Discord de clipping.

Au démarrage (et quand on l'invite sur un serveur), il monte TOUT le serveur :
rôles, catégories, salons, permissions, icône et messages. Il est 100 % idempotent :
le relancer ne crée jamais de doublon (les noms sont comparés par leur « noyau de lettres »).

Il reste ensuite en ligne pour :
  - l'accueil des nouveaux membres (rôle auto + DM de bienvenue),
  - les candidatures (ticket privé → formulaire → salon staff → accepter / refuser),
  - les relances automatiques des candidats qui n'ont pas rempli le formulaire,
  - le sondage de départ (DM best-effort + log fiable dans #départs).

Lancement : start-bot.bat (lit le token dans token.txt).
Le test de clip et le suivi des vues sont gérés par l'autre bot (Lune Tracker).
"""

from __future__ import annotations

import asyncio
import os
import re
import sys
import time
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import discord
from discord import app_commands
from discord.ext import commands, tasks

# =============================================================================
# CHARTE : tout ce qui est personnalisable est ici
# =============================================================================

SERVER_NAME = "LUNE CLIPPING"
ICON_FILE = Path(__file__).with_name("icon.png")  # optionnel : mets une image icon.png à côté

# Noir & blanc, comme le dashboard. Les rôles vont du blanc (haut) au gris (bas).
WHITE = 0xFFFFFF
BLACK = 0x111318
EMBED_COLOR = 0xF2F2F2

# Relances des candidats qui n'ont pas rempli le formulaire (minutes après l'ouverture du ticket)
RELANCES_MIN = [30, 24 * 60]

# Motifs proposés dans le sondage de départ
DEPART_RAISONS = [
    ("Pas le temps en ce moment", "⏰"),
    ("Trop compliqué / pas compris le fonctionnement", "🤯"),
    ("La rémunération ne me convient pas", "💸"),
    ("Pas trouvé ce que je cherchais", "🔍"),
    ("Autre raison", "💬"),
]


@dataclass
class RoleSpec:
    key: str
    name: str
    color: int
    hoist: bool = True
    admin: bool = False
    staff: bool = False  # peut gérer tickets / messages / membres


# Du plus haut au plus bas (même hiérarchie que le serveur de référence)
ROLES = [
    RoleSpec("ceo", "👑 | CEO", 0xFFFFFF, admin=True),
    RoleSpec("admin", "🛠️ | Admin", 0xE6E6E6, admin=True),
    RoleSpec("head", "⚙️ | head of clipping", 0xCCCCCC, staff=True),
    RoleSpec("apprentis", "🟡 | Apprentis", 0xB3B3B3),
    RoleSpec("nouveau", "🆕 | Nouveau", 0x999999),
    RoleSpec("test", "👥 | Test", 0x808080),
    RoleSpec("arrivant", "👋 | Arrivant", 0x666666, hoist=False),
]
STAFF_KEYS = ["ceo", "admin", "head"]

# Niveaux d'accès (qui voit quoi). Les rôles staff voient tout.
ACCESS = {
    "public": None,  # @everyone
    "test": ["test", "nouveau", "apprentis"],  # candidature acceptée et au-dessus
    "clippers": ["nouveau", "apprentis"],  # test validé et au-dessus
    "staff": [],  # staff uniquement
}


@dataclass
class ChannelSpec:
    key: str
    name: str
    kind: str = "text"  # text | voice | forum
    access: str = "public"
    readonly: bool = False  # personne ne peut écrire (sauf staff)
    locked_voice: bool = False  # vocal visible mais impossible à rejoindre (compteur)
    topic: str = ""
    tags: list[str] = field(default_factory=list)  # tags de forum


@dataclass
class CategorySpec:
    key: str
    name: str
    access: str
    channels: list[ChannelSpec]
    dynamic: bool = False  # contient des salons créés à la volée (tickets) : pas de dédoublonnage


CATEGORIES = [
    CategorySpec("objectifs", "——— | Objectifs 2026 | ———", "public", [
        ChannelSpec("vues", "📈 | vues 0M → 100M", "voice", locked_voice=True),
        ChannelSpec("clics", "🔗 | clics 0k → 100k", "voice", locked_voice=True),
        ChannelSpec("clippers", "👤 | clippers 0 → 60", "voice", locked_voice=True),
    ]),
    CategorySpec("welcome", "——— | Welcome | ———", "public", [
        ChannelSpec("start", "✅│start-here", readonly=True, topic="Lis tout avant de commencer 👇"),
        ChannelSpec("candidature", "📝│candidature", readonly=True, topic="Clique sur Postuler pour rejoindre l'équipe"),
    ]),
    CategorySpec("clipping", f"——— | {SERVER_NAME.title()} | ———", "test", [
        ChannelSpec("remuneration", "💳│rémunération", access="test", readonly=True),
    ]),
    CategorySpec("formation", "——— | Formation | ———", "test", [
        ChannelSpec("fairetest", "🧪│faire-test", access="test", readonly=True,
                    topic="Le bouton « Envoyer mon test » est publié ici depuis le dashboard"),
        ChannelSpec("tutos", "👨‍🏫│tutos", "forum", access="test", readonly=True,
                    tags=["CapCut PC", "CapCut Mobile", "Transitions", "Sous-titres", "Exemple tuto vidéo", "Astuces"]),
        ChannelSpec("coaching", "📈 | coaching", "voice", access="test"),
    ]),
    CategorySpec("clippersCat", "——— | Clippers | ———", "clippers", [
        ChannelSpec("general", "💬│général", access="clippers"),
        ChannelSpec("comptes", "📊│comptes", access="clippers",
                    topic="Poste ici tes liens TikTok / Insta / YouTube : le bot suit tes vues"),
        ChannelSpec("call", "🎙️ | call", "voice", access="clippers"),
    ]),
    # Salons de test créés par le bot tracker (un par candidat)
    CategorySpec("test", "——— | test | ———", "staff", [], dynamic=True),
    # Tickets de candidature créés par ce bot
    CategorySpec("tickets", "——— | Tickets | ———", "staff", [], dynamic=True),
    CategorySpec("staff", "——— | Staff | ———", "staff", [
        ChannelSpec("candstaff", "📥│candidatures-staff", access="staff"),
        ChannelSpec("departs", "🚪│départs", access="staff"),
        ChannelSpec("logs", "🧾│logs", access="staff"),
    ]),
]


def embeds_for(key: str, ch: dict[str, discord.abc.GuildChannel]) -> list[discord.Embed]:
    """Contenu posté dans chaque salon. `ch` donne les salons par clé (pour les mentions)."""

    def m(k: str) -> str:
        return ch[k].mention if k in ch else f"#{k}"

    def e(title: str, desc: str) -> discord.Embed:
        return discord.Embed(title=title, description=desc, color=EMBED_COLOR)

    if key == "start":
        return [
            e(f"👋 Bienvenue sur {SERVER_NAME}",
              "Ici on transforme des talks en clips qui cartonnent sur **TikTok, Instagram et YouTube**.\n\n"
              "**Le parcours pour rejoindre l'équipe :**\n"
              f"1. Lis les règles ci-dessous\n"
              f"2. Va dans {m('candidature')} et clique sur **Postuler**\n"
              "3. Remplis le formulaire dans ton ticket (2 minutes)\n"
              f"4. Profil retenu → tu passes **Test** et tu réalises ton clip dans {m('fairetest')}\n"
              "5. Test validé → tu deviens **Nouveau** clipper 🎬\n\n"
              "Ensuite tout se joue sur la régularité : **Nouveau → Apprenti** au fil de tes résultats."),
            e("📜 Les règles",
              "• Respect de tout le monde, staff comme clippers\n"
              "• Pas de spam, pas de pub pour d'autres serveurs\n"
              "• On a une DA précise : **uniquement des talks illustrés**, pas de citations ni de repost brut\n"
              "• Tes comptes et tes vues sont suivis automatiquement : pas de triche, pas d'achat de vues\n"
              "• Un souci ? Passe par ton ticket, jamais en DM au staff"),
        ]
    if key == "candidature":
        return [e("📝 Rejoindre l'équipe",
                  "Tu veux clipper avec nous ? Clique sur **Postuler** juste en dessous.\n\n"
                  "Un salon privé s'ouvre, tu remplis un court formulaire et le staff te répond directement dedans.\n\n"
                  "⚡ Les places sont limitées : ceux qui passent à l'action vite passent en premier.")]
    if key == "remuneration":
        return [e("💳 Comment tu es rémunéré",
                  "Tes vues sont suivies automatiquement sur tes comptes TikTok, Instagram et YouTube.\n\n"
                  "**Ce qui compte :**\n"
                  "• Les **vues générées** sur la période\n"
                  "• Ta **régularité** : objectif **2 vidéos par jour**\n"
                  "• Ta **discipline** : présence aux calls, respect de la DA\n\n"
                  "Le barème exact (par vue, primes, paliers) t'est communiqué dans ton ticket une fois validé.\n\n"
                  "🏆 À toi d'aller chercher ta place.")]
    if key == "tutos":
        return [e("📌 Comment utiliser ce salon",
                  "Chaque post est un tuto. Filtre par tag en haut : **CapCut PC**, **CapCut Mobile**, **Transitions**, "
                  "**Sous-titres**, **Astuces**…\n\nCommence par les tutos de base avant ton test.")]
    return []


TICKET_TEXT = (
    "👋 Salut {mention}, bienvenue dans ton ticket de candidature !\n\n"
    "Clique sur **📝 Remplir ma candidature** juste en dessous : 5 questions, 2 minutes.\n"
    "Le staff étudie ton profil et te répond ici même."
)
RELANCE_TEXTS = [
    "👀 {mention}, t'as oublié ? Ta candidature n'est pas encore remplie.\n"
    "Clique sur **📝 Remplir ma candidature** au-dessus, ça prend 2 minutes ⏱️",
    "⏳ **Dernier rappel** {mention} : sans formulaire on ne peut pas étudier ton profil.\n"
    "Les places partent vite : remplis-le maintenant et montre-nous ce que tu vaux 🔥",
]
ACCEPT_TEXT = (
    "✅ **Candidature acceptée {mention} !**\n\n"
    "Tu as maintenant le rôle **Test** : va dans {fairetest}, regarde les tutos et envoie ton clip test.\n"
    "Si ton test est validé, tu deviens **Nouveau** clipper 🎬"
)
REFUSE_TEXT = (
    "Merci pour ta candidature {mention} 🙏\n\n"
    "Ton profil n'est pas retenu pour le moment. Continue à t'entraîner, tu pourras repostuler plus tard 💪"
)
WELCOME_DM = (
    "👋 Bienvenue sur **{server}** !\n\n"
    "Pour commencer :\n"
    "1. Lis {start}\n"
    "2. Postule dans {candidature}\n\n"
    "À très vite 🚀"
)

# =============================================================================
# Outils : noyau de lettres, recherche idempotente, permissions
# =============================================================================


def core(name: str) -> str:
    """Noyau de lettres d'un nom : sans emojis, chiffres, ponctuation ni accents, en minuscules.

    Discord réécrit les noms de salons (minuscules, tirets…), une comparaison exacte
    échouerait et recréerait des doublons à chaque lancement.
    """
    decomposed = unicodedata.normalize("NFKD", name.lower())
    return "".join(c for c in decomposed if c.isascii() and c.isalpha())


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def find_role(guild: discord.Guild, name: str) -> discord.Role | None:
    return next((r for r in guild.roles if core(r.name) == core(name)), None)


def find_category(guild: discord.Guild, name: str) -> discord.CategoryChannel | None:
    return next((c for c in guild.categories if core(c.name) == core(name)), None)


CHANNEL_TYPES = {
    "text": discord.ChannelType.text,
    "voice": discord.ChannelType.voice,
    "forum": discord.ChannelType.forum,
}


def find_channel(guild: discord.Guild, name: str, kind: str, category: discord.CategoryChannel | None):
    """Cherche d'abord dans la catégorie visée, puis dans tout le serveur (salon déplacé à la main)."""
    wanted = core(name)
    types = {CHANNEL_TYPES[kind]}
    if kind == "forum":
        types.add(discord.ChannelType.text)  # forum refusé → retombé en salon texte
    candidates = [c for c in guild.channels if c.type in types and core(c.name) == wanted]
    candidates.sort(key=lambda c: (c.category_id != (category.id if category else None), c.position))
    return candidates[0] if candidates else None


class Ctx:
    """Rôles et salons résolus du serveur (par clé)."""

    def __init__(self, guild: discord.Guild):
        self.guild = guild
        self.roles: dict[str, discord.Role] = {}
        self.channels: dict[str, discord.abc.GuildChannel] = {}
        self.categories: dict[str, discord.CategoryChannel] = {}

    def staff_roles(self) -> list[discord.Role]:
        return [self.roles[k] for k in STAFF_KEYS if k in self.roles]


def overwrites_for(ctx: Ctx, access: str, readonly: bool = False, locked_voice: bool = False,
                   member: discord.Member | None = None):
    """Permissions d'un salon.

    Posées SUR CHAQUE SALON (pas seulement la catégorie) : un salon qui a ses propres
    overwrites n'hérite plus de ceux de la catégorie.
    Rappels : un deny de rôle bat un allow @everyone ; un overwrite membre bat un overwrite rôle.
    """
    g = ctx.guild
    ow: dict[discord.abc.Snowflake, discord.PermissionOverwrite] = {}
    allowed = ACCESS[access]

    def viewer() -> discord.PermissionOverwrite:
        o = discord.PermissionOverwrite(view_channel=True, read_message_history=True)
        if readonly:
            o.update(send_messages=False, send_messages_in_threads=False, create_public_threads=False,
                     create_private_threads=False, add_reactions=True)
        if locked_voice:
            o.update(connect=False)
        return o

    if allowed is None:
        ow[g.default_role] = viewer()
    else:
        ow[g.default_role] = discord.PermissionOverwrite(view_channel=False)
        for key in allowed:
            if key in ctx.roles:
                ow[ctx.roles[key]] = viewer()
    for role in ctx.staff_roles():
        ow[role] = discord.PermissionOverwrite(
            view_channel=True, send_messages=True, read_message_history=True, manage_messages=True,
            send_messages_in_threads=True, create_public_threads=True, connect=not locked_voice, manage_threads=True,
        )
    if member is not None:
        ow[member] = discord.PermissionOverwrite(
            view_channel=True, send_messages=True, read_message_history=True, attach_files=True, embed_links=True,
        )
    bot_access = dict(
        view_channel=True, send_messages=True, read_message_history=True, manage_channels=True,
        manage_messages=True, embed_links=True, attach_files=True, add_reactions=True, connect=True,
        manage_permissions=True,
    )
    ow[g.me] = discord.PermissionOverwrite(**bot_access)
    # Les autres bots du serveur (ex. Clipping Tracker, qui suit #comptes et crée les salons de test)
    # gardent l'accès à tous les salons, même privés : on autorise leur rôle intégré.
    for role in g.roles:
        if role.is_bot_managed() and role.tags and role.tags.bot_id != g.me.id:
            ow[role] = discord.PermissionOverwrite(**bot_access)
    return ow


def same_overwrites(current, wanted) -> bool:
    cur = {t.id: o.pair() for t, o in current.items()}
    want = {t.id: o.pair() for t, o in wanted.items()}
    return cur == want


# =============================================================================
# Construction du serveur (idempotente)
# =============================================================================


async def ensure_roles(ctx: Ctx) -> None:
    g = ctx.guild
    for spec in ROLES:
        perms = discord.Permissions(administrator=True) if spec.admin else discord.Permissions.none()
        if spec.staff:
            perms.update(manage_messages=True, manage_threads=True, kick_members=True, moderate_members=True,
                         mute_members=True, move_members=True, view_audit_log=True)
        if not spec.admin:
            # Permissions de base d'un membre (le reste passe par les salons)
            perms.update(view_channel=True, send_messages=True, read_message_history=True, add_reactions=True,
                         connect=True, speak=True, use_application_commands=True, embed_links=True,
                         attach_files=True, change_nickname=True, send_messages_in_threads=True, stream=True)
        role = find_role(g, spec.name)
        if role is None:
            role = await g.create_role(name=spec.name, colour=discord.Colour(spec.color), hoist=spec.hoist,
                                       permissions=perms, mentionable=False, reason="Construction du serveur")
            log(f"rôle créé : {spec.name}")
        elif (role.colour.value, role.hoist, role.permissions.value) != (spec.color, spec.hoist, perms.value):
            if role < g.me.top_role:
                await role.edit(colour=discord.Colour(spec.color), hoist=spec.hoist, permissions=perms)
                log(f"rôle mis à jour : {spec.name}")
        ctx.roles[spec.key] = role

    # Ordre : CEO en haut … Arrivant en bas, sous le rôle du bot
    top = g.me.top_role.position
    wanted = {}
    for i, spec in enumerate(ROLES):
        role = ctx.roles[spec.key]
        if role < g.me.top_role:
            wanted[role] = max(1, top - 1 - i)
    if any(r.position != p for r, p in wanted.items()):
        try:
            await g.edit_role_positions(positions=wanted)
        except discord.HTTPException as err:
            log(f"ordre des rôles non appliqué : {err}")


async def dedupe_category(ctx: Ctx, spec: CategorySpec) -> discord.CategoryChannel | None:
    """Fusionne les catégories en double (même noyau) et supprime les salons en double."""
    g = ctx.guild
    dupes = [c for c in g.categories if core(c.name) == core(spec.name)]
    if not dupes:
        return None
    dupes.sort(key=lambda c: (-len(c.channels), c.position))
    keep, extra = dupes[0], dupes[1:]
    for cat in extra:
        for ch in list(cat.channels):
            await ch.edit(category=keep)
        await cat.delete(reason="Catégorie en double")
        log(f"catégorie en double supprimée : {cat.name}")
    if not spec.dynamic:
        seen: set[tuple[str, str]] = set()
        for ch in sorted(keep.channels, key=lambda c: c.position):
            k = (core(ch.name), str(ch.type))
            if k in seen:
                await ch.delete(reason="Salon en double")
                log(f"salon en double supprimé : {ch.name}")
            seen.add(k)
    return keep


async def ensure_channels(ctx: Ctx) -> None:
    g = ctx.guild
    for position, spec in enumerate(CATEGORIES):
        cat = await dedupe_category(ctx, spec)
        cat_ow = overwrites_for(ctx, spec.access)
        if cat is None:
            cat = await g.create_category(spec.name, overwrites=cat_ow, position=position)
            log(f"catégorie créée : {spec.name}")
        else:
            changes = {}
            if cat.name != spec.name:
                changes["name"] = spec.name
            if not same_overwrites(cat.overwrites, cat_ow):
                changes["overwrites"] = cat_ow
            if changes:
                await cat.edit(**changes)
        if cat.position != position:
            await cat.edit(position=position)
        ctx.categories[spec.key] = cat

        for cs in spec.channels:
            ow = overwrites_for(ctx, cs.access, readonly=cs.readonly, locked_voice=cs.locked_voice)
            ch = find_channel(g, cs.name, cs.kind, cat)
            if ch is None:
                ch = await create_channel(g, cat, cs, ow)
                log(f"salon créé : {cs.name}")
            else:
                changes = {}
                if ch.category_id != cat.id:
                    changes["category"] = cat
                if not same_overwrites(ch.overwrites, ow):
                    changes["overwrites"] = ow
                # Les compteurs (vues, clics…) gardent leur nom mis à jour par /stats
                if not cs.locked_voice and ch.name != cs.name:
                    changes["name"] = cs.name
                if cs.topic and isinstance(ch, discord.TextChannel) and ch.topic != cs.topic:
                    changes["topic"] = cs.topic
                if changes:
                    await ch.edit(**changes)
            ctx.channels[cs.key] = ch
        await order_channels(cat, [ctx.channels[cs.key] for cs in spec.channels])


async def order_channels(cat: discord.CategoryChannel, wanted: list) -> None:
    """Remet les salons dans l'ordre voulu, seulement si l'ordre actuel est différent."""

    def group(c) -> str:
        return "voice" if isinstance(c, (discord.VoiceChannel, discord.StageChannel)) else "text"

    for kind in ("text", "voice"):
        want = [c for c in wanted if group(c) == kind]
        current = [c for c in sorted(cat.channels, key=lambda c: c.position) if c.id in {w.id for w in want}]
        if [c.id for c in current] != [c.id for c in want]:
            for c in want:
                await c.move(end=True, category=cat, sync_permissions=False)


async def create_channel(g: discord.Guild, cat: discord.CategoryChannel, cs: ChannelSpec, ow):
    if cs.kind == "voice":
        return await g.create_voice_channel(cs.name, category=cat, overwrites=ow)
    if cs.kind == "forum":
        try:
            return await g.create_forum(cs.name, category=cat, overwrites=ow,
                                        available_tags=[discord.ForumTag(name=t) for t in cs.tags])
        except discord.HTTPException as err:
            log(f"forum impossible ({err}) → salon texte à la place")
    return await g.create_text_channel(cs.name, category=cat, overwrites=ow, topic=cs.topic or None)


async def post_once(channel, key: str, embeds: list[discord.Embed], view: discord.ui.View | None = None) -> None:
    """Poste un message une seule fois ; s'il existe déjà (repéré par son pied de page), il est mis à jour."""
    if not embeds:
        return
    marker = f"{SERVER_NAME} · {key}"
    embeds[-1].set_footer(text=marker)
    if isinstance(channel, discord.ForumChannel):
        threads = list(channel.threads) + [t async for t in channel.archived_threads(limit=50)]
        if any(core(t.name) == core(embeds[0].title or key) for t in threads):
            return
        await channel.create_thread(name=embeds[0].title or key, embeds=embeds)
        return
    async for msg in channel.history(limit=50):
        if msg.author == channel.guild.me and msg.embeds and (msg.embeds[-1].footer.text or "") == marker:
            if [e.to_dict() for e in msg.embeds] != [e.to_dict() for e in embeds] or view is not None:
                await msg.edit(embeds=embeds, view=view)
            return
    await channel.send(embeds=embeds, view=view)


async def ensure_icon(g: discord.Guild) -> None:
    changes = {}
    if g.name != SERVER_NAME:
        changes["name"] = SERVER_NAME
    if ICON_FILE.exists() and (g.icon is None or os.environ.get("FORCE_ICON") == "1"):
        changes["icon"] = ICON_FILE.read_bytes()
    if changes:
        await g.edit(**changes)
        log(f"serveur mis à jour : {', '.join(changes)}")


async def scaffold(guild: discord.Guild) -> Ctx:
    """Construit (ou répare) tout le serveur. Peut être relancé sans risque."""
    log(f"construction de « {guild.name} »…")
    ctx = Ctx(guild)
    await ensure_icon(guild)
    await ensure_roles(ctx)
    await ensure_channels(ctx)
    for key in ("start", "remuneration", "tutos"):
        if key in ctx.channels:
            await post_once(ctx.channels[key], key, embeds_for(key, ctx.channels))
    if "candidature" in ctx.channels:
        await post_once(ctx.channels["candidature"], "candidature", embeds_for("candidature", ctx.channels), CandidatureView())
    CTX[guild.id] = ctx
    await staff_log(ctx, "🧱 Serveur vérifié / construit.")
    log("construction terminée ✅")
    return ctx


CTX: dict[int, Ctx] = {}


async def staff_log(ctx: Ctx, text: str) -> None:
    ch = ctx.channels.get("logs")
    if isinstance(ch, discord.TextChannel):
        try:
            await ch.send(text)
        except discord.HTTPException:
            pass


# =============================================================================
# Candidatures : bouton → ticket → formulaire → staff
# =============================================================================

TICKET_TOPIC_RE = re.compile(r"candidat:(\d+);ouvert:(\d+);form:(\d);relances:(\d)")


def ticket_topic(user_id: int, opened: int, form: int = 0, relances: int = 0) -> str:
    return f"candidat:{user_id};ouvert:{opened};form:{form};relances:{relances}"


def parse_ticket(ch: discord.TextChannel) -> tuple[int, int, int, int] | None:
    m = TICKET_TOPIC_RE.search(ch.topic or "")
    return tuple(int(x) for x in m.groups()) if m else None  # type: ignore[return-value]


def ctx_of(guild: discord.Guild) -> Ctx:
    return CTX.get(guild.id) or Ctx(guild)


class CandidatureView(discord.ui.View):
    """Bouton « Postuler » du salon #candidature (persistant)."""

    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Postuler", emoji="📝", style=discord.ButtonStyle.secondary, custom_id="cand:open")
    async def open_ticket(self, interaction: discord.Interaction, _button: discord.ui.Button):
        g = interaction.guild
        ctx = ctx_of(g)
        member = interaction.user
        if any(ctx.roles.get(k) in member.roles for k in ("test", "nouveau", "apprentis")):
            return await interaction.response.send_message("Tu fais déjà partie du parcours 😉", ephemeral=True)
        cat = ctx.categories.get("tickets") or find_category(g, "Tickets")
        # Ticket déjà ouvert ?
        for ch in (cat.text_channels if cat else []):
            info = parse_ticket(ch)
            if info and info[0] == member.id:
                return await interaction.response.send_message(f"Ton ticket est déjà ouvert : {ch.mention}", ephemeral=True)
        await interaction.response.defer(ephemeral=True, thinking=True)
        slug = re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", member.display_name.lower()).encode("ascii", "ignore").decode()).strip("-") or "candidat"
        ow = overwrites_for(ctx, "staff", member=member)
        ch = await g.create_text_channel(f"ticket-{slug}", category=cat, overwrites=ow,
                                         topic=ticket_topic(member.id, int(time.time())))
        await ch.send(TICKET_TEXT.format(mention=member.mention), view=TicketView())
        await interaction.followup.send(f"✅ Ton ticket est ouvert : {ch.mention}", ephemeral=True)
        await staff_log(ctx, f"🎫 Ticket ouvert par {member.mention} : {ch.mention}")


class TicketView(discord.ui.View):
    """Bouton « Remplir ma candidature » dans le ticket (persistant)."""

    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Remplir ma candidature", emoji="📝", style=discord.ButtonStyle.success, custom_id="cand:form")
    async def fill(self, interaction: discord.Interaction, _button: discord.ui.Button):
        info = parse_ticket(interaction.channel) if isinstance(interaction.channel, discord.TextChannel) else None
        if not info or info[0] != interaction.user.id:
            return await interaction.response.send_message("Ce formulaire est réservé au candidat de ce ticket.", ephemeral=True)
        await interaction.response.send_modal(CandidatureModal())


class CandidatureModal(discord.ui.Modal, title="Ta candidature"):
    prenom = discord.ui.TextInput(label="Prénom et âge", placeholder="Lucas, 19 ans", max_length=60)
    niveau = discord.ui.TextInput(label="Ton niveau en montage", placeholder="Débutant / intermédiaire / confirmé + expérience", max_length=200)
    logiciel = discord.ui.TextInput(label="Logiciel utilisé", placeholder="CapCut PC, CapCut mobile, Premiere…", max_length=100)
    dispo = discord.ui.TextInput(label="Tes disponibilités", placeholder="Combien d'heures par jour ? Quels jours ?", max_length=200)
    liens = discord.ui.TextInput(label="Liens (comptes, montages déjà faits)", style=discord.TextStyle.paragraph,
                                 required=False, max_length=800, placeholder="https://www.tiktok.com/@…")

    async def on_submit(self, interaction: discord.Interaction):
        ch = interaction.channel
        g = interaction.guild
        ctx = ctx_of(g)
        info = parse_ticket(ch)
        if info:
            await ch.edit(topic=ticket_topic(info[0], info[1], form=1, relances=info[3]))
        embed = discord.Embed(title=f"📥 Candidature de {interaction.user.display_name}", color=EMBED_COLOR)
        embed.add_field(name="Prénom / âge", value=self.prenom.value, inline=True)
        embed.add_field(name="Niveau", value=self.niveau.value, inline=True)
        embed.add_field(name="Logiciel", value=self.logiciel.value, inline=True)
        embed.add_field(name="Disponibilités", value=self.dispo.value, inline=False)
        embed.add_field(name="Liens", value=self.liens.value or "—", inline=False)
        embed.add_field(name="Ticket", value=ch.mention, inline=False)
        embed.set_thumbnail(url=interaction.user.display_avatar.url)
        embed.set_footer(text=f"candidat:{interaction.user.id};ticket:{ch.id}")
        staff = ctx.channels.get("candstaff")
        if isinstance(staff, discord.TextChannel):
            await staff.send(embed=embed, view=DecisionView())
        await interaction.response.send_message("✅ Candidature envoyée ! Le staff te répond ici très vite.")


def parse_footer(message: discord.Message) -> tuple[int, int] | None:
    text = message.embeds[0].footer.text if message.embeds and message.embeds[0].footer else ""
    m = re.search(r"candidat:(\d+);ticket:(\d+)", text or "")
    return (int(m.group(1)), int(m.group(2))) if m else None


class DecisionView(discord.ui.View):
    """Boutons Accepter / Refuser sous chaque candidature, dans #candidatures-staff (persistants)."""

    def __init__(self, disabled: bool = False, label: str | None = None):
        super().__init__(timeout=None)
        for item in self.children:
            item.disabled = disabled
        if label:
            self.add_item(discord.ui.Button(label=label, disabled=True, style=discord.ButtonStyle.secondary))

    async def _decide(self, interaction: discord.Interaction, accept: bool):
        g = interaction.guild
        ctx = ctx_of(g)
        ids = parse_footer(interaction.message)
        if not ids:
            return await interaction.response.send_message("Candidature illisible.", ephemeral=True)
        user_id, ticket_id = ids
        try:
            member = g.get_member(user_id) or await g.fetch_member(user_id)
        except discord.NotFound:
            return await interaction.response.send_message("Ce candidat a quitté le serveur.", ephemeral=True)
        ticket = g.get_channel(ticket_id)
        if accept:
            if "test" in ctx.roles:
                await member.add_roles(ctx.roles["test"], reason=f"Candidature acceptée par {interaction.user}")
            if "arrivant" in ctx.roles and ctx.roles["arrivant"] in member.roles:
                await member.remove_roles(ctx.roles["arrivant"])
            text = ACCEPT_TEXT.format(mention=member.mention, fairetest=ctx.channels["fairetest"].mention if "fairetest" in ctx.channels else "#faire-test")
        else:
            text = REFUSE_TEXT.format(mention=member.mention)
        if isinstance(ticket, discord.TextChannel):
            await ticket.send(text)
        verdict = f"{'✅ Acceptée' if accept else '❌ Refusée'} par {interaction.user.display_name}"
        await interaction.response.edit_message(view=DecisionView(disabled=True, label=verdict))
        await staff_log(ctx, f"{verdict} : {member.mention}")

    @discord.ui.button(label="Accepter", emoji="✅", style=discord.ButtonStyle.success, custom_id="cand:accept")
    async def accept(self, interaction: discord.Interaction, _b: discord.ui.Button):
        await self._decide(interaction, True)

    @discord.ui.button(label="Refuser", emoji="✖️", style=discord.ButtonStyle.danger, custom_id="cand:refuse")
    async def refuse(self, interaction: discord.Interaction, _b: discord.ui.Button):
        await self._decide(interaction, False)


# =============================================================================
# Départs : DM best-effort + log fiable
# =============================================================================


class DepartView(discord.ui.View):
    """Menu déroulant « pourquoi es-tu parti ? » envoyé en DM (persistant)."""

    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.select(
        custom_id="depart:raison",
        placeholder="Pourquoi es-tu parti ?",
        min_values=1,
        max_values=1,
        options=[discord.SelectOption(label=label, emoji=emoji, value=str(i)) for i, (label, emoji) in enumerate(DEPART_RAISONS)],
    )
    async def raison(self, interaction: discord.Interaction, select: discord.ui.Select):
        label = DEPART_RAISONS[int(select.values[0])][0]
        m = re.search(r"guild:(\d+)", interaction.message.embeds[0].footer.text or "") if interaction.message.embeds else None
        guild = bot.get_guild(int(m.group(1))) if m else None
        if guild:
            ch = ctx_of(guild).channels.get("departs")
            if isinstance(ch, discord.TextChannel):
                await ch.send(f"📝 **{interaction.user}** ({interaction.user.id}) a répondu au sondage : **{label}**")
        await interaction.response.edit_message(content="Merci pour ta réponse 🙏", embed=None, view=None)


# =============================================================================
# Bot
# =============================================================================

MEMBERS = os.environ.get("MEMBERS", "0") == "1"
intents = discord.Intents.default()
intents.members = MEMBERS  # SERVER MEMBERS INTENT (portail développeur) : accueil + départs

bot = commands.Bot(command_prefix="!", intents=intents)
_views_ready = False


@bot.event
async def on_ready():
    global _views_ready
    log(f"connecté en tant que {bot.user} · intent membres : {'oui' if MEMBERS else 'non (MEMBERS=1 pour activer)'}")
    if not _views_ready:
        # Vues persistantes : les boutons des anciens messages refonctionnent après un redémarrage
        for view in (CandidatureView(), TicketView(), DecisionView(), DepartView()):
            bot.add_view(view)
        _views_ready = True
    for guild in bot.guilds:
        await setup_guild(guild)
    if not relances.is_running():
        relances.start()


@bot.event
async def on_guild_join(guild: discord.Guild):
    await setup_guild(guild)


async def setup_guild(guild: discord.Guild) -> None:
    try:
        await scaffold(guild)
    except discord.Forbidden:
        log("❌ Permission refusée : invite le bot avec la permission Administrator")
        return
    except Exception as err:  # noqa: BLE001
        log(f"❌ construction interrompue : {err!r}")
        return
    # Commandes slash visibles tout de suite sur ce serveur (le sync global prend jusqu'à 1 h)
    bot.tree.copy_global_to(guild=guild)
    await bot.tree.sync(guild=guild)


@bot.event
async def on_member_join(member: discord.Member):
    ctx = ctx_of(member.guild)
    if "arrivant" in ctx.roles:
        try:
            await member.add_roles(ctx.roles["arrivant"], reason="Arrivée sur le serveur")
        except discord.HTTPException as err:
            log(f"rôle Arrivant non donné à {member} : {err}")
    try:
        text = WELCOME_DM.format(
            server=SERVER_NAME,
            start=ctx.channels["start"].mention if "start" in ctx.channels else "#start-here",
            candidature=ctx.channels["candidature"].mention if "candidature" in ctx.channels else "#candidature",
        )
        await member.send(text)
    except discord.HTTPException:
        pass  # DM fermés : pas grave


@bot.event
async def on_member_remove(member: discord.Member):
    ctx = ctx_of(member.guild)
    roles = ", ".join(r.name for r in member.roles if r != member.guild.default_role) or "aucun"
    duree = ""
    if member.joined_at:
        jours = (discord.utils.utcnow() - member.joined_at).days
        duree = f" · resté {jours} j"
    # DM best-effort : Discord bloque souvent les DM à quelqu'un qui n'a plus de serveur en commun
    dm_ok = False
    try:
        embed = discord.Embed(title=f"Tu as quitté {SERVER_NAME}",
                              description="Dommage de te voir partir ! Tu peux nous dire pourquoi ? (1 clic)", color=EMBED_COLOR)
        embed.set_footer(text=f"guild:{member.guild.id}")
        await member.send(embed=embed, view=DepartView())
        dm_ok = True
    except discord.HTTPException:
        pass
    ch = ctx.channels.get("departs")
    if isinstance(ch, discord.TextChannel):
        await ch.send(f"🚪 **{member}** ({member.id}) est parti{duree}\nGrades : {roles}\nSondage DM : {'envoyé ✅' if dm_ok else 'impossible ❌'}")


@tasks.loop(minutes=2)
async def relances():
    """Relance les candidats qui n'ont pas rempli le formulaire (état stocké dans le sujet du ticket)."""
    now = int(time.time())
    for guild in bot.guilds:
        cat = ctx_of(guild).categories.get("tickets")
        if not cat:
            continue
        for ch in cat.text_channels:
            info = parse_ticket(ch)
            if not info:
                continue
            user_id, opened, form, done = info
            if form or done >= len(RELANCES_MIN):
                continue
            if now - opened >= RELANCES_MIN[done] * 60:
                try:
                    await ch.send(RELANCE_TEXTS[done].format(mention=f"<@{user_id}>"), view=TicketView())
                    await ch.edit(topic=ticket_topic(user_id, opened, form, done + 1))
                    log(f"relance {done + 1} envoyée dans #{ch.name}")
                except discord.HTTPException as err:
                    log(f"relance impossible dans #{ch.name} : {err}")


@relances.before_loop
async def _wait_ready():
    await bot.wait_until_ready()


# --- Commandes slash (admin) -------------------------------------------------------


@bot.tree.command(name="setup", description="Reconstruit / répare le serveur (sans doublons)")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def setup_cmd(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True, thinking=True)
    await scaffold(interaction.guild)
    await interaction.followup.send("✅ Serveur vérifié.", ephemeral=True)


@bot.tree.command(name="stats", description="Met à jour les compteurs Objectifs 2026")
@app_commands.describe(vues="ex. 5,7M", clics="ex. 12k", clippers="ex. 28")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def stats_cmd(interaction: discord.Interaction, vues: str | None = None, clics: str | None = None, clippers: str | None = None):
    ctx = ctx_of(interaction.guild)
    changes = {"vues": (vues, "📈 | vues {} → 100M"), "clics": (clics, "🔗 | clics {} → 100k"), "clippers": (clippers, "👤 | clippers {} → 60")}
    done = []
    for key, (value, template) in changes.items():
        if value and key in ctx.channels:
            await ctx.channels[key].edit(name=template.format(value))
            done.append(key)
    # Discord limite le renommage d'un salon à 2 fois / 10 min
    await interaction.response.send_message(f"✅ Mis à jour : {', '.join(done) or 'rien'}", ephemeral=True)


def read_token() -> str:
    token = os.environ.get("DISCORD_TOKEN", "").strip()
    if not token:
        path = Path(__file__).with_name("token.txt")
        token = path.read_text(encoding="utf-8").strip() if path.exists() else ""
    if not token:
        print("❌ Token manquant : colle le token du bot dans token.txt (voir README).", flush=True)
        sys.exit(1)
    return token


if __name__ == "__main__":
    try:
        bot.run(read_token(), log_handler=None)
    except discord.PrivilegedIntentsRequired:
        print("❌ SERVER MEMBERS INTENT non activé dans le portail développeur.\n"
              "   Active-le (onglet Bot) ou lance sans : set MEMBERS=0", flush=True)
        sys.exit(1)
    except discord.LoginFailure:
        print("❌ Token invalide : reset-le dans le portail et recolle-le dans token.txt", flush=True)
        sys.exit(1)
