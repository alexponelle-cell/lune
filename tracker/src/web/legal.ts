/** Pages légales du programme de clipping (demandées par TikTok pour valider la connexion « Login Kit »). */
export const legalPage = (title: string, body: string) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Neptune Clipping</title>
<link rel="icon" href="/neptune-logo.png">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; background: #111; color: #eee; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 26px; } h2 { font-size: 18px; margin-top: 28px; } a { color: #ff7a59; }
</style></head>
<body><main><p><a href="/" style="display:inline-flex;align-items:center;gap:10px;color:inherit;text-decoration:none;font-weight:800"><img src="/neptune-logo.png" alt="" width="32" height="32" style="border-radius:8px">Neptune Clipping</a></p><h1>${title}</h1>${body}<p style="margin-top:40px;opacity:.6">Neptune Clipping · programme de clipping</p></main></body></html>`;

export const PRIVACY_HTML = `
<p>Ce site permet aux clippeurs de suivre les vues de leurs clips et d'échanger les coins gagnés contre des récompenses.</p>
<h2>Données collectées</h2>
<p>Ton identifiant et ton pseudo Discord (connexion), les pseudos de tes comptes TikTok, YouTube et Instagram que tu ajoutes,
l'e-mail ou le pseudo de jeu que tu donnes pour recevoir tes récompenses.</p>
<p>Si tu connectes ton TikTok ou ton Instagram : ton pseudo, ton nom affiché, ton nombre d'abonnés, et la liste de tes vidéos publiques
(description, date, nombre de vues, de likes et de commentaires). Rien n'est publié sur ton compte.</p>
<h2>Utilisation</h2>
<p>Ces données servent uniquement à compter les vues de tes clips, calculer tes coins, afficher le classement et livrer tes récompenses.
Elles ne sont ni vendues ni partagées, sauf l'e-mail ou le pseudo de jeu transmis au créateur pour livrer ta récompense.</p>
<h2>Durée et suppression</h2>
<p>Les données sont gardées tant que tu participes au programme. Tu peux déconnecter ton TikTok ou ton Instagram à tout moment dans leurs réglages
(applications connectées), et demander la suppression de toutes tes données au staff sur le serveur Discord.</p>`;

export const TERMS_HTML = `
<p>En participant au programme de clipping, tu acceptes ces conditions.</p>
<h2>Le programme</h2>
<p>Tu publies des clips des vidéos du créateur sur tes propres comptes. Les vues de ces clips te rapportent des coins,
échangeables contre les récompenses de la boutique, dans la limite des stocks.</p>
<h2>Règles</h2>
<p>Chaque clip doit citer le créateur dans sa légende. Les faux comptes, les comptes d'autres personnes, les vues achetées
et toute triche entraînent le retrait des coins et l'exclusion du programme.</p>
<h2>Modifications</h2>
<p>Le staff peut modifier les récompenses, le nombre de coins par vue ou ces conditions, et retirer un compte ou des coins en cas d'abus.</p>`;
