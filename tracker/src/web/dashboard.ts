import { readFileSync } from 'node:fs';

// Page statique (HTML + JS vanilla) qui consomme l'API JSON. Copiée dans dist/ par `npm run build`.
export const dashboardHtml = readFileSync(new URL('./dashboard.html', import.meta.url), 'utf8');
