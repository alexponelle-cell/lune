import type { Hub } from './db.js';
import type { Notify } from './integrations/slack.js';
import type { Mailer } from './integrations/mail.js';

const H = 3_600_000;

/**
 * Relances automatiques (toutes les heures) :
 * - vidéo « à valider » depuis 48 h sans réponse → e-mail au client avec son lien (une fois par 48 h) ;
 *   sans e-mail renseigné (ou SMTP absent), Adrien est prévenu sur Slack de le relancer lui-même : on ne prétend pas l'avoir fait ;
 * - montage dont la date de rendu est passée → relance du monteur sur Slack (une fois par jour).
 */
export async function runReminders(hub: Hub, notify: Notify, now = Date.now(), mail: Mailer | null = null, publicUrl = ''): Promise<{ clients: number; monteurs: number }> {
  const clients = new Map(hub.clients().map((c) => [c.id, c]));
  const monteurs = new Map(hub.monteurs().map((m) => [m.id, m]));
  let nc = 0, nm = 0;
  for (const v of hub.videos()) {
    const c = clients.get(v.client_id);
    if (!c) continue;
    if (v.status === 'avalider' && v.sent_at && now - v.sent_at >= 48 * H && (!v.reminded_at || now - v.reminded_at >= 48 * H)) {
      hub.db.prepare('UPDATE videos SET reminded_at = ? WHERE id = ?').run(now, v.id);
      const days = Math.floor((now - v.sent_at) / (24 * H));
      let sent = false;
      if (mail && c.email) {
        try {
          await mail(c.email, `Ta vidéo « ${v.title} » attend ton feu vert`, `Hello !\n\n« ${v.title} » est prête depuis ${days} jours. Un clic pour la valider ou demander une modif :\n${publicUrl}/c/${c.token}\n\nMerci 🙏`);
          sent = true;
        } catch (e) { hub.log('erreur', `E-mail de relance à ${c.name} impossible : ${e instanceof Error ? e.message : e}`, c.name, true, now); }
      }
      if (sent) {
        hub.log('relance-client', `${c.name} : « ${v.title} » attend sa validation depuis ${days} j, relancé par e-mail`, c.name, true, now);
        await notify(`⏰ Relance e-mail envoyée à *${c.name}* : « ${v.title} » attend sa validation.`);
      } else {
        hub.log('a-relancer', `${c.name} : « ${v.title} » attend depuis ${days} j. ${c.email ? 'E-mail non envoyé' : 'Pas d’e-mail renseigné'} : relance à faire`, c.name, true, now);
        await notify(`⏰ *${c.name}* n'a pas validé « ${v.title} » depuis ${days} j. Relance-le (son lien : ${publicUrl}/c/${c.token}).`);
      }
      nc++;
    }
    const m = v.monteur_id ? monteurs.get(v.monteur_id) : undefined;
    if (v.status === 'montage' && v.due_at && v.due_at < now && m && (!v.reminded_at || now - v.reminded_at >= 24 * H)) {
      hub.db.prepare('UPDATE videos SET reminded_at = ? WHERE id = ?').run(now, v.id);
      hub.log('relance-monteur', `« ${v.title} » (${c.name}) en retard, ${m.name} relancé`, m.name, true, now);
      await notify(`✂️ ${m.slack ? `<@${m.slack}>` : m.name}, le montage « ${v.title} » (${c.name}) est en retard : tu peux l'envoyer aujourd'hui ? 🙏`);
      nm++;
    }
  }
  return { clients: nc, monteurs: nm };
}
