import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { log } from '../log.js';

/**
 * IA anti-triche : regarde chaque nouveau clip d'un fan (miniature + titre) et le compare au créateur
 * (sa photo et les miniatures de ses dernières vidéos). Seuls les clips reconnus comme venant du créateur
 * rapportent des coins. Un compte volé (la chaîne d'un autre YouTubeur) est ainsi refusé automatiquement.
 */
export interface CreatorReference {
  name: string;
  /** Photo de la chaîne + miniatures récentes du créateur. */
  images: string[];
  /** Titres de ses dernières vidéos (contexte). */
  titles: string[];
}

export interface ClipToCheck {
  platform: string;
  title: string | null;
  thumbnail: string | null;
  url: string | null;
}

export type ClipVerdict = { ok: boolean; reason: string };

const Verdict = z.object({
  is_creator_clip: z.boolean(),
  reason: z.string(),
});

const MODEL = 'claude-opus-5-5';

export class ClipChecker {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /** null = pas de décision possible (pas de miniature, refus, erreur) : on réessaiera plus tard. */
  async check(creator: CreatorReference, clip: ClipToCheck): Promise<ClipVerdict | null> {
    if (!clip.thumbnail) return null;
    const content: Anthropic.ContentBlockParam[] = [
      { type: 'text', text: `Images de référence de ${creator.name} (photo de sa chaîne et miniatures de ses vraies vidéos) :` },
      ...creator.images.slice(0, 4).map((url) => ({ type: 'image' as const, source: { type: 'url' as const, url } })),
      { type: 'text', text: `Titres récents de ${creator.name} : ${creator.titles.slice(0, 5).map((t) => `« ${t} »`).join(', ') || '(aucun)'}` },
      { type: 'text', text: `Clip publié par un fan sur ${clip.platform}. Titre / légende : « ${clip.title ?? '(vide)'} ». Miniature :` },
      { type: 'image', source: { type: 'url', url: clip.thumbnail } },
      {
        type: 'text',
        text: `Ce clip est-il un extrait (clip, montage, short) d'une vidéo ou d'un live de ${creator.name} ? Réponds oui si on reconnaît ${creator.name} ou son contenu (personne, décor, jeu, style de miniature), non si c'est le contenu d'un autre créateur ou sans rapport. En cas de vrai doute, réponds oui. Raison en une phrase courte, en français.`,
      },
    ];
    try {
      const res = await this.client.messages.parse({
        model: MODEL,
        max_tokens: 1024,
        output_config: { effort: 'low', format: zodOutputFormat(Verdict) },
        system: 'Tu vérifies les clips d’un programme de clipping : un fan ne gagne des récompenses que s’il clippe le bon créateur.',
        messages: [{ role: 'user', content }],
      });
      if (res.stop_reason === 'refusal' || !res.parsed_output) return null;
      return { ok: res.parsed_output.is_creator_clip, reason: res.parsed_output.reason.slice(0, 200) };
    } catch (err) {
      if (err instanceof Anthropic.BadRequestError) {
        // Miniature illisible (lien expiré, format) : on ne bloque pas le fan pour ça
        log.warn(`vérif clip IA : requête refusée (${err.message})`);
        return null;
      }
      if (err instanceof Anthropic.APIError) {
        log.warn(`vérif clip IA : API ${err.status} (${err.message})`);
        return null;
      }
      throw err;
    }
  }
}
