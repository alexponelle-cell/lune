/**
 * Page d'accueil publique « Neptune Clipping » (exigée par TikTok pour valider l'app : le site doit porter le nom
 * de l'app et ne pas être une page de connexion). Servie sur « / » aux visiteurs non connectés ; le staff connecté voit Mars.
 */
export const NEPTUNE_HOME = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Neptune Clipping</title>
<meta name="description" content="Neptune Clipping runs clipping rewards programs for content creators: fans post short clips of a creator's videos on TikTok, Instagram and YouTube Shorts and earn rewards based on their views.">
<link rel="icon" href="/neptune-logo.png">
<style>
  :root { --bg:#05101a; --card:#0b1b2a; --line:#163247; --ink:#e8f4fb; --muted:#8fb3c7; --accent:#2fd6c6; --accent2:#3b82f6; }
  * { box-sizing:border-box; }
  body { margin:0; background:radial-gradient(1200px 600px at 70% -10%, #0e3a4d 0%, transparent 60%), var(--bg); color:var(--ink); font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  a { color:var(--accent); }
  .wrap { max-width:1080px; margin:0 auto; padding:0 20px; }
  header { display:flex; align-items:center; justify-content:space-between; padding:20px 0; }
  .brand { display:flex; align-items:center; gap:12px; font-weight:800; font-size:20px; letter-spacing:.2px; color:var(--ink); text-decoration:none; }
  .brand img { width:40px; height:40px; border-radius:10px; }
  nav a { color:var(--muted); text-decoration:none; margin-left:18px; font-size:14px; }
  nav a:hover { color:var(--ink); }
  .hero { padding:72px 0 56px; }
  .hero h1 { font-size:clamp(34px,6vw,60px); line-height:1.05; margin:0 0 18px; }
  .hero h1 span { background:linear-gradient(90deg,var(--accent),var(--accent2)); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .hero p { color:var(--muted); font-size:19px; max-width:640px; margin:0 0 28px; }
  .btn { display:inline-block; padding:13px 22px; border-radius:12px; background:linear-gradient(90deg,var(--accent),var(--accent2)); color:#04131c; font-weight:800; text-decoration:none; }
  .btn.ghost { background:transparent; color:var(--ink); border:1px solid var(--line); margin-left:10px; }
  section { padding:40px 0; }
  h2 { font-size:28px; margin:0 0 20px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:16px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:22px; }
  .card h3 { margin:6px 0 8px; font-size:18px; }
  .card p { margin:0; color:var(--muted); font-size:15px; }
  .num { width:34px; height:34px; border-radius:10px; display:grid; place-items:center; font-weight:800; color:#04131c; background:var(--accent); }
  .stats { display:flex; flex-wrap:wrap; gap:28px; margin-top:8px; }
  .stats b { display:block; font-size:28px; }
  .stats span { color:var(--muted); font-size:14px; }
  footer { border-top:1px solid var(--line); margin-top:40px; padding:28px 0 40px; color:var(--muted); font-size:14px; }
  footer a { color:var(--muted); margin-right:16px; }
</style></head>
<body>
<div class="wrap">
  <header>
    <a class="brand" href="/"><img src="/neptune-logo.png" alt="Neptune Clipping logo">Neptune Clipping</a>
    <nav><a href="#how">How it works</a><a href="#creators">For creators</a><a href="/legal/privacy">Privacy</a><a href="/legal/terms">Terms</a></nav>
  </header>

  <div class="hero">
    <h1>Neptune Clipping: <span>clips that grow creators</span></h1>
    <p>Neptune Clipping runs clipping rewards programs for YouTube creators. Fans post short clips of a creator's videos on TikTok, Instagram Reels and YouTube Shorts, and earn rewards based on the views their clips get.</p>
    <a class="btn" href="#how">How it works</a><a class="btn ghost" href="#creators">Work with us</a>
    <div class="stats">
      <div><b>3</b><span>platforms tracked</span></div>
      <div><b>1 / day</b><span>automatic view updates</span></div>
      <div><b>0 €</b><span>to join as a clipper</span></div>
    </div>
  </div>

  <section id="how">
    <h2>How Neptune Clipping works</h2>
    <div class="grid">
      <div class="card"><div class="num">1</div><h3>Join a creator's program</h3><p>Each creator has their own Discord server and rewards site. Clippers sign in with Discord and follow a short free training.</p></div>
      <div class="card"><div class="num">2</div><h3>Link your accounts</h3><p>Clippers link their own TikTok, Instagram and YouTube accounts. Connecting TikTok with Login Kit proves the account is theirs. Nothing is ever posted on their behalf.</p></div>
      <div class="card"><div class="num">3</div><h3>Post clips, earn coins</h3><p>Each night we read the public view counts of the clips posted on the linked accounts. Views turn into coins on the clipper's dashboard.</p></div>
      <div class="card"><div class="num">4</div><h3>Get rewarded</h3><p>Coins are exchanged for rewards chosen by the creator: memberships, courses, in-game items. Rewards are checked and delivered by our team.</p></div>
    </div>
  </section>

  <section id="tiktok">
    <h2>What we use TikTok for</h2>
    <div class="card"><p>With the clipper's permission (TikTok Login Kit), Neptune Clipping reads their basic profile (username, display name, follower count) and the list of their public videos with their view, like and comment counts. This is only used to count the views of their clips and calculate their rewards. We never post, edit or delete anything, and clippers can disconnect at any time from their TikTok settings. Details in our <a href="/legal/privacy">Privacy Policy</a>.</p></div>
  </section>

  <section id="creators">
    <h2>For creators</h2>
    <div class="grid">
      <div class="card"><h3>A branded program</h3><p>Your own rewards site in your colors, your own Discord server with onboarding, leaderboards and level roles.</p></div>
      <div class="card"><h3>Anti-cheat built in</h3><p>Only clips posted after an account is linked count, accounts are verified, and suspicious accounts are reviewed by our staff.</p></div>
      <div class="card"><h3>Clear reporting</h3><p>Views, top clippers and best clips in one staff dashboard, so you see exactly what your community brings.</p></div>
    </div>
  </section>

  <footer>
    <div style="margin-bottom:10px"><b style="color:var(--ink)">Neptune Clipping</b>: clipping rewards programs for content creators.</div>
    <a href="/legal/privacy">Privacy Policy</a><a href="/legal/terms">Terms of Service</a><a href="/login">Staff login</a>
  </footer>
</div>
</body></html>`;
