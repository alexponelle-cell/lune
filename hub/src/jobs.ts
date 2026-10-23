import type { Hub } from './db.js';
import type { Notify } from './integrations/slack.js';

const H = 3_600_000;

/**
 * Relances automatiques (toutes les heures) :
 * - vidéo « à valider » depuis 48 h sans réponse → relance du client (une fois par 48 h) ;
 * - montage dont la date de rendu est passée → relance du monteur sur Slack (une fois par jour).
 */
export async function runReminders(hub: Hub, notify: Notify, now = Date.now()): Promise<{ clients: number; monteurs: number }> {
  const clients = new Map(hub.clients().map((c) => [c.id, c]));
  const monteurs = new Map(hub.monteurs().map((m) => [m.id, m]));
  let nc = 0, nm = 0;
  for (const v of hub.videos()) {
    const c = clients.get(v.client_id);
    if (!c) continue;
    if (v.status === 'avalider' && v.sent_at && now - v.sent_at >= 48 * H && (!v.reminded_at || now - v.reminded_at >= 48 * H)) {
      hub.db.prepare('UPDATE videos SET reminded_at = ? WHERE id = ?').run(now, v.id);
      hub.log('relance-client', `${c.name} : « ${v.title} » attend sa validation depuis ${Math.floor((now - v.sent_at) / (24 * H))} j, relance envoyée`, c.name, true, now);
      await notify(`⏰ Relance envoyée à *${c.name}* : « ${v.title} » attend sa validation.`);
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
