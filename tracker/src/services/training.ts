/**
 * Formation des clippeurs (reprise de Neptune Academy) : modules à regarder et cocher sur /formation.
 * Tous cochés → « 🎓 Formation validée » sur Discord, qui débloque 📝│inscription.
 * Les liens des vidéos se règlent dans Mars (une ligne par module : « 206 | https://… »).
 */
export interface TrainingModule {
  /** Vidéo par défaut (YouTube non répertorié) ; un lien réglé dans Mars la remplace. */
  url?: string;
  phase: number;
  phaseName: string;
  num: string;
  title: string;
  duration: string;
}

export const TRAINING_PHASES: Record<number, string> = { 1: 'Préparation', 2: 'Faire un clip', 3: 'Finalisation & export' };

export const TRAINING_MODULES: TrainingModule[] = [
  { phase: 1, phaseName: TRAINING_PHASES[1]!, num: '206', url: 'https://youtu.be/fL4Sl9tA7tU', title: 'Créer un compte pour poster ses clips', duration: '1:49' },
  { phase: 1, phaseName: TRAINING_PHASES[1]!, num: '201', url: 'https://youtu.be/P46t4jhMAI0', title: 'Installation de CapCut', duration: '1:11' },
  { phase: 1, phaseName: TRAINING_PHASES[1]!, num: '202', url: 'https://youtu.be/ZO9LS5-7yAM', title: 'Raccourcis et paramètres CapCut', duration: '5:15' },
  { phase: 2, phaseName: TRAINING_PHASES[2]!, num: '203', url: 'https://youtu.be/vdmxjAC7MlM', title: 'Faire un clip', duration: '2:49' },
  { phase: 3, phaseName: TRAINING_PHASES[3]!, num: '205', url: 'https://youtu.be/jIh_hddZTQE', title: 'Avoir CapCut Pro gratuitement', duration: '0:46' },
  { phase: 3, phaseName: TRAINING_PHASES[3]!, num: '204', url: 'https://youtu.be/0a85aRIXAiA', title: 'Utiliser Frame.io', duration: '0:42' },
];

/** Lignes « 206 | https://… » (ou « 206 https://… ») → lien de chaque module. */
export function parseTrainingLinks(text: string): Map<string, string> {
  const links = new Map<string, string>();
  for (const line of text.split('\n')) {
    const num = line.match(/^\s*(\d{2,4})\b/)?.[1];
    const url = line.match(/https?:\/\/\S+/i)?.[0];
    if (num && url) links.set(num, url);
  }
  return links;
}

/** Fichier vidéo direct (.mp4, .webm, .mov, .m3u8) : lu dans la page avec le lecteur du navigateur. */
export const isVideoFile = (url: string) => /\.(mp4|webm|mov|m4v|m3u8)(\?|#|$)/i.test(url);

/** Lien YouTube → lien intégrable (lecture dans la page) ; autre lien → null (ouvert dans un onglet). */
export function youtubeEmbed(url: string): string | null {
  const id = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/))([\w-]{11})/i)?.[1];
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
}
