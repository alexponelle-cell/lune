/** Phrase de motivation postée chaque jour à 9 h (Paris) dans #général du serveur de l'agence. */
export const MOTIVATION = [
  'Nouvelle journée, nouvelle chance de devenir le meilleur, alors vas-y à fond.',
  'Si tu reçois ce message, c’est qu’aujourd’hui c’est le jour où tu dois faire ton maximum.',
  'Il est tôt, tu as le temps de rendre cette journée celle où tu vas atteindre ton prime.',
  'Nouveau jour, nouvelle opportunité de progresser. Ne laisse pas cette journée passer sans donner le meilleur de toi-même.',
  'Pendant que certains dorment sur leurs rêves, toi, tu peux déjà commencer à les réaliser. À toi de jouer.',
  'Chaque matin est une nouvelle occasion de te rapprocher de la personne que tu veux devenir. Ne la gâche pas.',
  'Aujourd’hui, tu as 24 heures pour faire mieux qu’hier. Même un petit progrès reste un progrès.',
  'Personne ne peut faire le travail à ta place. Alors lève-toi, concentre-toi et montre de quoi tu es capable.',
  'Imagine où tu pourrais être dans un mois si tu donnais le maximum chaque jour. Commence dès aujourd’hui.',
  'Ton futur toi te remerciera pour les efforts que tu fais aujourd’hui. Alors ne lâche rien.',
  'Tu n’as pas besoin d’être le meilleur dès maintenant, tu dois simplement chercher à le devenir chaque jour.',
  'Une nouvelle journée commence. C’est le moment de transformer tes objectifs en actions et tes efforts en résultats.',
  'Ne cherche pas la motivation parfaite pour commencer. Commence, et la motivation viendra avec tes progrès.',
  'Aujourd’hui peut être le jour où tout commence à changer pour toi. Donne-toi une vraie chance.',
  'Chaque effort compte, même ceux que personne ne remarque. Continue de travailler en silence et laisse tes résultats parler.',
  'Tu veux atteindre ton prime ? Alors comporte-toi aujourd’hui comme la personne que tu veux devenir demain.',
  'Ne laisse pas la flemme décider de ce que tu peux accomplir. Tu es capable de bien plus que tu ne le penses.',
  'Le succès ne se construit pas en un jour, mais chaque jour peut te rapprocher de lui. Alors commence maintenant.',
  'Peu importe ce que tu as raté hier, aujourd’hui tu repars de zéro. Fais en sorte que cette journée compte.',
  'Tu as encore le temps de progresser, d’apprendre et de devenir meilleur. Ne sous-estime jamais ce que tu peux accomplir en une journée.',
  'Les résultats que tu veux demandent des efforts que tu dois commencer à faire aujourd’hui. Plus d’excuses, place à l’action.',
  'Même si personne ne croit en toi, continue de croire en ce que tu peux devenir. Le plus important, c’est de ne pas abandonner.',
  'Aujourd’hui, fais une chose qui te rapproche de ton objectif, même si elle te demande de sortir de ta zone de confort.',
  'Chaque journée où tu refuses d’abandonner est une journée où tu deviens plus fort. Continue sur cette lancée.',
  'Tu n’es pas obligé d’aller vite, mais tu dois continuer d’avancer. À toi de faire de cette journée une victoire.',
  'Le toi de demain dépend des décisions que tu prends aujourd’hui. Fais les bons choix et donne tout ce que tu as.',
  'Réveille-toi avec un objectif, avance avec de la discipline et termine la journée avec la fierté d’avoir essayé à fond.',
  'Tu peux passer cette journée comme toutes les autres, ou décider d’en faire une journée qui te fera avancer. Le choix t’appartient.',
  'Ton potentiel ne te servira à rien si tu ne l’exploites pas. Aujourd’hui, passe à l’action et montre ce que tu vaux.',
  'C’est reparti pour une nouvelle journée ! Garde tes objectifs en tête, reste discipliné et rapproche-toi un peu plus de ton prime.',
];

export interface MotivationState {
  /** Jour (Paris) du dernier envoi, "2026-10-16". */
  day: string;
  /** Phrases pas encore tirées dans le tour en cours (index). */
  bag: number[];
  last: number | null;
}

/**
 * Tirage « sac » : chaque phrase sort une fois avant qu'une phrase revienne, ordre aléatoire,
 * et jamais 2 fois la même à la suite (même entre deux tours).
 */
export function drawMotivation(state: MotivationState, count = MOTIVATION.length, random = Math.random): { index: number; bag: number[] } {
  let bag = state.bag.filter((i) => i < count);
  if (!bag.length) bag = Array.from({ length: count }, (_, i) => i);
  const choices = bag.length > 1 ? bag.filter((i) => i !== state.last) : bag;
  const index = choices[Math.floor(random() * choices.length) % choices.length]!;
  return { index, bag: bag.filter((i) => i !== index) };
}

export function motivationMessage(index: number): string {
  return `☀️ **${MOTIVATION[index]}**\n\nRendez-vous tous les jours à 9h dans le général !`;
}
