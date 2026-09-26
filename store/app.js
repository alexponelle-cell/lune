(() => {
  const STORAGE_KEY = "nocta-cart";
  const eur = (n) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0 });
  const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
  const color = (p) => CATEGORY_COLORS[p.category] || "#F472B6";
  const $ = (sel) => document.querySelector(sel);

  // ---------- Panier (persisté localement si possible) ----------
  let cart = {};
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    for (const [id, qty] of Object.entries(saved)) if (byId[id] && qty > 0) cart[id] = qty;
  } catch { /* stockage indisponible : panier en mémoire */ }

  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch {} };
  const count = () => Object.values(cart).reduce((a, b) => a + b, 0);
  const subtotal = () => Object.entries(cart).reduce((s, [id, q]) => s + byId[id].price * q, 0);
  const discount = () => (count() >= STORE.bundleMin ? Math.round(subtotal() * STORE.bundlePct) / 100 : 0);
  const total = () => subtotal() - discount();

  function add(id, qty = 1) {
    cart[id] = (cart[id] || 0) + qty;
    save(); renderCart();
    const btn = $("#cart-open");
    btn.classList.remove("bump"); void btn.offsetWidth; btn.classList.add("bump");
    const n = count();
    toast(n === STORE.bundleMin - 1
      ? `Ajouté ✓ — encore 1 article pour -${STORE.bundlePct} %`
      : `${byId[id].title} ajouté ✓`);
  }
  function setQty(id, qty) {
    if (qty <= 0) delete cart[id]; else cart[id] = qty;
    save(); renderCart();
  }

  // ---------- Grille produits ----------
  const stars = (r) => "★".repeat(Math.round(r)) + "☆".repeat(5 - Math.round(r));
  const off = (p) => Math.round((1 - p.price / p.compareAt) * 100);
  const tagClass = (t) => (t === "Nouveau" ? " new" : t === "Viral" ? " viral" : "");
  const lowStock = (p) => p.stock != null && p.stock <= STORE.lowStock;

  function cardHTML(p) {
    return `
      <article class="card" style="--c:${color(p)}">
        <div class="media-wrap">
          <button class="card-media" data-open="${p.id}" tabindex="-1" aria-hidden="true">
            ${p.tag ? `<span class="tag${tagClass(p.tag)}">${p.tag}</span>` : ""}
            <span class="off-badge">-${off(p)}%</span>
            ${ICONS[p.icon]}
          </button>
          <button class="quick-add" data-quick="${p.id}" aria-label="Ajouter ${p.title} au panier">+ Ajout rapide</button>
        </div>
        <button class="card-link" data-open="${p.id}">
          <span class="card-body">
            <span class="card-cat">${p.category}</span>
            <span class="card-title">${p.title}</span>
            <span class="rating"><span class="stars">${stars(p.rating)}</span>${p.rating} (${p.reviews.toLocaleString("fr-FR")})</span>
            <span class="price"><b>${eur(p.price)}</b><s>${eur(p.compareAt)}</s></span>
            ${lowStock(p) ? `<span class="stock-bar">🔥 Plus que ${p.stock} en stock<span class="progress" style="display:block"><i style="width:${Math.max(8, (p.stock / 40) * 100)}%"></i></span></span>` : ""}
          </span>
        </button>
      </article>`;
  }

  const categories = ["Tout", ...new Set(PRODUCTS.map((p) => p.category))];
  let activeCat = "Tout";

  function renderFilters() {
    $("#filters").innerHTML = categories
      .map((c) => {
        const col = CATEGORY_COLORS[c];
        return `<button class="chip${c === activeCat ? " active" : ""}" data-cat="${c}"${col ? ` style="--c:${col}"` : ""}>${col ? "<i></i>" : ""}${c}</button>`;
      })
      .join("");
  }
  function renderGrid() {
    const list = activeCat === "Tout" ? PRODUCTS : PRODUCTS.filter((p) => p.category === activeCat);
    $("#grid").innerHTML = list.map(cardHTML).join("");
  }

  // ---------- Fiche produit (modale) ----------
  let modalQty = 1;
  function openProduct(id) {
    const p = byId[id];
    modalQty = 1;
    $("#modal").style.setProperty("--c", color(p));
    $("#modal-content").innerHTML = `
      <div class="pdp">
        <div class="pdp-media">
          ${p.tag ? `<span class="tag${tagClass(p.tag)}">${p.tag}</span>` : ""}
          ${ICONS[p.icon]}
        </div>
        <div class="pdp-info">
          <span class="card-cat">${p.category}</span>
          <h3 id="modal-title">${p.title}</h3>
          <span class="rating"><span class="stars">${stars(p.rating)}</span>${p.rating} · ${p.reviews.toLocaleString("fr-FR")} avis</span>
          <span class="price"><b>${eur(p.price)}</b><s>${eur(p.compareAt)}</s><span class="save">Vous économisez ${eur(p.compareAt - p.price)}</span></span>
          <p>${p.short}</p>
          <ul class="pdp-points">${p.points.map((x) => `<li>${x}</li>`).join("")}</ul>
          <div class="deal">🎁 <span><b>-${STORE.bundlePct} % dès ${STORE.bundleMin} articles</b> · livraison offerte dès ${eur(STORE.freeShipping)}</span></div>
          ${lowStock(p)
            ? `<span class="stock low">Plus que ${p.stock} en stock — expédié sous 24 h</span>`
            : `<span class="stock">En stock — expédié sous 24 h</span>`}
          <div class="buy-row">
            <div class="qty">
              <button data-mq="-1" aria-label="Diminuer">−</button>
              <span id="mq">1</span>
              <button data-mq="1" aria-label="Augmenter">+</button>
            </div>
            <button class="btn btn-primary" data-add="${p.id}">Ajouter au panier <span class="arrow">→</span></button>
          </div>
          <small style="color:var(--muted);font-size:12px">Paiement sécurisé · Retours gratuits 30 jours</small>
        </div>
      </div>`;
    show("modal");
  }

  // ---------- Panier (tiroir) ----------
  function renderCart() {
    $("#cart-count").textContent = count();
    const items = Object.entries(cart);
    const n = count();
    const tot = total();
    const leftShip = Math.max(0, STORE.freeShipping - tot);

    const bundleMsg = n >= STORE.bundleMin
      ? `<b>-${STORE.bundlePct} % appliqué</b> sur votre panier ✓`
      : `Ajoutez <b>${STORE.bundleMin - n} article${STORE.bundleMin - n > 1 ? "s" : ""}</b> pour -${STORE.bundlePct} %`;
    const shipMsg = leftShip > 0
      ? `Plus que <b>${eur(leftShip)}</b> pour la livraison offerte`
      : `<b>Livraison offerte</b> débloquée ✓`;
    $("#ship-bar").innerHTML = `
      <div>${bundleMsg}<div class="progress"><i style="width:${Math.min(100, (n / STORE.bundleMin) * 100)}%"></i></div></div>
      <div>${shipMsg}<div class="progress"><i style="width:${Math.min(100, (tot / STORE.freeShipping) * 100)}%"></i></div></div>`;

    $("#cart-items").innerHTML = items.length
      ? items.map(([id, q]) => {
          const p = byId[id];
          return `
            <div class="line" style="--c:${color(p)}">
              <div class="line-media">${ICONS[p.icon]}</div>
              <div>
                <div class="line-title">${p.title}</div>
                <div class="line-price">${eur(p.price)}</div>
                <div class="qty">
                  <button data-q="${id}" data-d="-1" aria-label="Diminuer">−</button>
                  <span>${q}</span>
                  <button data-q="${id}" data-d="1" aria-label="Augmenter">+</button>
                </div>
              </div>
              <button class="remove" data-rm="${id}">Retirer</button>
            </div>`;
        }).join("")
      : `<div class="empty">Votre panier est vide.<a href="#shop" class="btn btn-ghost" data-close>Voir les produits</a></div>`;

    const d = discount();
    $("#cart-sub").textContent = eur(subtotal());
    $("#cart-discount-row").style.display = d ? "" : "none";
    $("#cart-discount").textContent = `-${eur(d)}`;
    $("#cart-total").textContent = eur(tot);
    $("#checkout").disabled = !items.length;
    $("#checkout").style.opacity = items.length ? 1 : .4;
  }

  // ---------- Compte à rebours promo ----------
  const saleEnd = new Date(STORE.saleEnds).getTime();
  function tick() {
    const ms = saleEnd - Date.now();
    const els = document.querySelectorAll("[data-timer]");
    if (!(ms > 0)) { document.querySelectorAll("[data-sale]").forEach((e) => e.remove()); return false; }
    const s = Math.floor(ms / 1000);
    const parts = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
    const labels = ["j", "h", "m", "s"];
    const html = parts.map((v, i) => `<span>${String(v).padStart(2, "0")}${labels[i]}</span>`).join("");
    els.forEach((e) => (e.innerHTML = html));
    return true;
  }
  if (tick()) setInterval(tick, 1000);

  // ---------- Overlays ----------
  let lastFocus = null;
  function show(which) {
    lastFocus = document.activeElement;
    hideAll(false);
    $(`#${which}`).classList.add("open");
    $("#overlay").classList.add("open");
    document.body.classList.add("locked");
    $(`#${which}`).querySelector(".icon-btn")?.focus();
  }
  function hideAll(restore = true) {
    ["drawer", "modal", "overlay"].forEach((id) => $(`#${id}`).classList.remove("open"));
    document.body.classList.remove("locked");
    if (restore && lastFocus) lastFocus.focus();
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  // ---------- Événements ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;
    const d = t.dataset;
    if (d.cat) { activeCat = d.cat; renderFilters(); renderGrid(); }
    else if (d.quick) add(d.quick, 1);
    else if (d.open) openProduct(d.open);
    else if (d.add) { add(d.add, modalQty); hideAll(); show("drawer"); }
    else if (d.mq) { modalQty = Math.max(1, modalQty + Number(d.mq)); $("#mq").textContent = modalQty; }
    else if (d.q) setQty(d.q, (cart[d.q] || 0) + Number(d.d));
    else if (d.rm) setQty(d.rm, 0);
    else if (t.id === "cart-open") show("drawer");
    else if (d.close !== undefined) hideAll();
    else if (t.id === "checkout") toast("Démo : le paiement sera branché sur Shopify Checkout");
  });
  $("#overlay").addEventListener("click", () => hideAll());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideAll(); });

  $("#news-form").addEventListener("submit", (e) => {
    e.preventDefault();
    $("#news-msg").textContent = "Merci ! Votre code -10 % arrive par e-mail.";
    e.target.reset();
  });

  $("#year").textContent = new Date().getFullYear();
  renderFilters(); renderGrid(); renderCart();
})();
