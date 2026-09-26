/**
 * État du service exposé sur /healthz et affiché sur le dashboard,
 * pour diagnostiquer le bot sans accès aux logs de l'hébergeur.
 */
export interface ServiceStatus {
  startedAt: number;
  bot: {
    state: 'disabled' | 'connecting' | 'ready' | 'error';
    tag?: string;
    /** false si le Message Content Intent n'est pas activé : le salon COMPTES ne marche pas. */
    messageContent?: boolean;
    /** false si le Server Members Intent n'est pas activé : pas de suivi des invitations. */
    membersIntent?: boolean;
    guilds?: number;
    lastCommand?: { name: string; at: number; ok: boolean; error?: string };
    commandsRegistered?: string;
    error?: string;
  };
  /** Bot Neptune (programme fans), s'il est configuré. */
  neptune: { state: 'disabled' | 'ready' | 'error'; tag?: string; guilds?: number; error?: string };
  lastErrors: Array<{ at: number; message: string }>;
}

export const status: ServiceStatus = {
  startedAt: Date.now(),
  bot: { state: 'disabled' },
  neptune: { state: 'disabled' },
  lastErrors: [],
};

export function recordError(context: string, err: unknown): void {
  const message = `${context} : ${err instanceof Error ? err.message : String(err)}`;
  status.lastErrors.unshift({ at: Date.now(), message: message.slice(0, 500) });
  status.lastErrors.length = Math.min(status.lastErrors.length, 10);
}
