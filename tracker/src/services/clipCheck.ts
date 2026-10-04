import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { log } from '../log.js';

/**
 * IA anti-triche : 1 fois par jour et par compte, regarde les nouveaux clips du fan (miniature + titre) et les compare au créateur
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

const Verdicts = z.object({
  clips: z.array(
    z.object({
      number: z.number().int(),
      is_creator_clip: z.boolean(),
      reason: z.string(),
    }),
  ),
});

const MODEL = 'claude-opus-5-5';

export class ClipChecker {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Un seul appel pour tous les nouveaux clips d'un compte (1 fois par jour, au rythme du relevé des vues).
   * Renvoie un verdict par clip (dans le même ordre) ; null = pas de décision (on réessaiera au prochain passage).
   */
  async checkAccount(creator: CreatorReference, clips: ClipToCheck[]): Promise<Array<ClipVerdict | null>> {
    const withThumb = clips.map((c, i) => ({ c, i })).filter((x) => x.c.thumbnail);
    if (!withThumb.length) return clips.map(() => null);
    const content: Anthropic.ContentBlockParam[] = [
      { type: 'text', text: `Images de référence de ${creator.name} (photo de sa chaîne et miniatures de ses vraies vidéos) :` },
      ...creator.images.slice(0, 4).map((url) => ({ type: 'image' as const, source: { type: 'url' as const, url } })),
      // Référence identique pour tous les comptes du jour : mise en cache (moins cher à partir du 2e compte)
      { type: 'text', text: `Titres récents de ${creator.name} : ${creator.titles.slice(0, 5).map((t) => `« ${t} »`).join(', ') || '(aucun)'}`, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `Voici ${withThumb.length} clip(s) publiés par un même fan :` },
      ...withThumb.flatMap((x, k) => [
        { type: 'text' as const, text: `Clip n°${k + 1} (${x.c.platform}) · titre / légende : « ${(x.c.title ?? '(vide)').slice(0, 300)} »` },
        { type: 'image' as const, source: { type: 'url' as const, url: x.c.thumbnail! } },
      ]),
      {
        type: 'text',
        text: `Pour chaque clip (par son numéro), dis s'il s'agit d'un extrait (clip, montage, short) d'une vidéo ou d'un live de ${creator.name} : oui si on reconnaît ${creator.name} ou son contenu (personne, décor, jeu, style), non si c'est le contenu d'un autre créateur ou sans rapport. En cas de vrai doute, réponds oui. Raison en une phrase courte, en français.`,
      },
    ];
    try {
      const res = await this.client.messages.parse({
        model: MODEL,
        max_tokens: 4096,
        output_config: { effort: 'low', format: zodOutputFormat(Verdicts) },
        system: 'Tu vérifies les clips d’un programme de clipping : un fan ne gagne des récompenses que s’il clippe le bon créateur.',
        messages: [{ role: 'user', content }],
      });
      const out: Array<ClipVerdict | null> = clips.map(() => null);
      if (res.stop_reason === 'refusal' || !res.parsed_output) return out;
      for (const v of res.parsed_output.clips) {
        const x = withThumb[v.number - 1];
        if (x) out[x.i] = { ok: v.is_creator_clip, reason: v.reason.slice(0, 200) };
      }
      return out;
    } catch (err) {
      if (err instanceof Anthropic.BadRequestError) {
        // Miniature illisible (lien expiré, format) : on ne bloque pas le fan pour ça
        log.warn(`vérif clips IA : requête refusée (${err.message})`);
        return clips.map(() => null);
      }
      if (err instanceof Anthropic.APIError) {
        log.warn(`vérif clips IA : API ${err.status} (${err.message})`);
        return clips.map(() => null);
      }
      throw err;
    }
  }
}
