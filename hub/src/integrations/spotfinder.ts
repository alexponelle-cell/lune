import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';

/**
 * Chercheur de spots « boosté » : Adrien envoie une photo de référence (« je veux comme lui ») et/ou une description.
 * Claude décrit le style, cherche sur le web de vrais lieux à louer qui ressemblent (dans la ville et le budget),
 * et rédige le message à envoyer au studio. Coût : environ 10 à 25 centimes par recherche (clé ANTHROPIC_API_KEY dans Railway, quota 30 par jour).
 */
const Result = z.object({
  style: z.string().describe('Le style de la référence en une phrase simple (décor, lumière, ambiance, cadrage).'),
  tags: z.array(z.string()).describe('5 à 8 mots-clés courts du décor, en français (ex. « bois », « lumière chaude »).'),
  keywords: z.array(z.string()).describe('3 à 5 requêtes de recherche prêtes à coller (ex. « studio podcast bois Paris »).'),
  spots: z.array(z.object({
    name: z.string(),
    place: z.string().describe('Quartier ou arrondissement'),
    pricePerHour: z.number().nullable().describe('Prix à l’heure en euros si affiché, sinon null'),
    priceText: z.string().describe('Le prix tel qu’affiché (HT / TTC, formule), ou « prix sur demande »'),
    url: z.string().describe('Lien direct vers la page du lieu ou de l’annonce'),
    match: z.number().describe('Ressemblance avec la référence, de 0 à 100'),
    why: z.string().describe('Pourquoi ce lieu colle à la référence, en une phrase'),
  })).describe('Les meilleurs lieux trouvés, du plus ressemblant au moins ressemblant. Uniquement des lieux réellement trouvés dans les résultats de recherche.'),
  brief: z.string().describe('Message court et poli à envoyer au studio pour demander une dispo (date, durée, nombre de personnes, besoins).'),
});
export type SpotSearch = z.infer<typeof Result>;
export interface SpotQuery { image?: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string }; text: string; city: string; budget: string; people: number; when?: string }

const SYSTEM = `Tu aides un Head of Content parisien à trouver des lieux de tournage (podcast, interview face caméra, reels) à louer à l'heure.
À partir de la référence (photo et/ou description), décris le style, puis cherche sur le web de VRAIS lieux à louer dans la ville demandée qui y ressemblent, en visant le budget.
Sites utiles : Peerspace, Giggster, OfficeRiders, sites des studios podcast. Ne propose que des lieux vus dans les résultats de recherche, avec leur vrai lien ; n'invente jamais un nom, un prix ou un lien.
Si un lieu dépasse le budget mais ressemble beaucoup, garde-le et dis-le. Réponds en français, simplement.`;

export async function findSpots(q: SpotQuery, client = new Anthropic()): Promise<SpotSearch> {
  const content: Exclude<BetaMessageParam['content'], string> = [];
  if (q.image) content.push({ type: 'image', source: { type: 'base64', media_type: q.image.mediaType, data: q.image.data } });
  content.push({ type: 'text', text: `${q.image ? 'Voici ma référence (photo ci-dessus).' : ''} ${q.text ? `Ce que je veux : ${q.text}.` : ''}
Ville : ${q.city}. Budget : ${q.budget}. Personnes à l'image : ${q.people}.${q.when ? ` Quand : ${q.when}.` : ''}
Trouve 4 à 8 lieux réels à louer qui ressemblent, et rédige le message pour demander une dispo.`.trim() });
  const messages: BetaMessageParam[] = [{ role: 'user', content }];
  // pause_turn : la recherche web a besoin d'un tour de plus, on relance avec la réponse partielle
  for (let turn = 0; turn < 4; turn++) {
    const res = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
      output_config: { effort: 'medium', format: betaZodOutputFormat(Result) },
      messages,
    });
    if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue; }
    if (res.stop_reason === 'refusal') throw new Error('La recherche a été refusée : reformule la description');
    if (!res.parsed_output) throw new Error('Réponse illisible, relance la recherche');
    return res.parsed_output;
  }
  throw new Error('La recherche a pris trop de temps, relance-la');
}
