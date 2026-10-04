import type { CreatorConfig } from '../creators/types.js';

/** Une question du test d'accès à l'inscription (réponses en boutons, une seule bonne). */
export interface QuizQuestion {
  q: string;
  answers: string[];
  /** Index de la bonne réponse dans `answers`. */
  correct: number;
}

/** Questions par défaut (tirées des tutos / règles) ; un créateur peut fournir les siennes via `quiz`. */
export function quizFor(c: CreatorConfig, rate: number): QuizQuestion[] {
  if (c.quiz?.length) return c.quiz;
  const reward = c.reward?.name ?? 'une récompense';
  return [
    {
      q: `Quelles vues te rapportent des coins ?`,
      answers: ['Toutes les vues de mon compte, même les anciennes', 'Les vues des clips postés après mon inscription', 'Seulement les vues TikTok'],
      correct: 1,
    },
    {
      q: `Combien de coins rapportent 1 000 vues ?`,
      answers: [`${rate} coins`, '1 coin', '1 000 coins'],
      correct: 0,
    },
    {
      q: `Tu as le droit d'acheter des vues ou d'utiliser de faux comptes ?`,
      answers: ['Oui, tant que ça fait des vues', 'Non : les coins gagnés comme ça sont retirés'],
      correct: 1,
    },
    {
      q: `Quel est le bon format pour un clip de ${c.creatorName} ?`,
      answers: ['La vidéo entière en horizontal', 'Un moment fort, en vertical, sous-titré, avec une accroche dès les 3 premières secondes', 'Une capture d’écran de la miniature'],
      correct: 1,
    },
    {
      q: `Comment tu échanges tes coins contre ${reward} ?`,
      answers: ['En demandant au staff en message privé', 'Dans la boutique du site, avec tes coins'],
      correct: 1,
    },
  ];
}

export const QUIZ_PREFIX = 'fans:quiz:';
export const QUIZ_START = `${QUIZ_PREFIX}start`;
/** Bouton de réponse : fans:quiz:<question>:<réponse>. */
export const answerId = (question: number, answer: number) => `${QUIZ_PREFIX}${question}:${answer}`;
export function parseAnswer(customId: string): { question: number; answer: number } | null {
  const m = customId.match(/^fans:quiz:(\d+):(\d+)$/);
  return m ? { question: Number(m[1]), answer: Number(m[2]) } : null;
}
