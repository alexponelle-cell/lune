/** Slack « Incoming Webhook » : gratuit, aucune clé à stocker à part l'URL (dans Railway). */
export type Notify = (text: string) => Promise<void>;

export function slackNotifier(webhookUrl: string | undefined, fetchImpl: typeof fetch = fetch): Notify {
  if (!webhookUrl) return async () => {};
  return async (text) => {
    try {
      await fetchImpl(webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    } catch (err) {
      console.error('[slack]', err instanceof Error ? err.message : err);
    }
  };
}
