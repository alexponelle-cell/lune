(() => {
  const FREE_SHIPPING = 60;
  const STORAGE_KEY = "nocta-cart";
  const eur = (n) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0 });
  const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
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

  function add(id, qty = 1) {
    cart[id] = (cart[id] || 0) + qty;
    save(); renderCart(); toast(`${byId[id].title} ajouté au panier`);
  }
  function setQty(id, qty) {
    if (qty <= 0) delete cart[id]; else cart[id] = qty;
    save(); renderCart();
  }

  // ---------- Grille produits ----------
  const stars = (r) => "★".repeat(Math.round(r)) + "☆".repeat(5 - Math.round(r));
  const off = (p) => Math.round((1 - p.price / p.compareAt) * 100);

  function cardHTML(p) {
    return `
      <button class="card" data-open="${p.id}" aria-label="Voir ${p.title}">
        <div class="card-media">
          ${p.tag ? `<span class="tag${p.tag === "Nouveau" ? " alt" : ""}">${p.tag}</span>` : ""}
          ${ICONS[p.icon]}
        </div>
        <div class="card-body">
          <span class="card-cat">${p.category}</span>
          <span class="card-title">${p.title}</span>
          <span class="rating"><span class="stars">${stars(p.rating)}</span>${p.rating} (${p.reviews.toLocaleString("fr-FR")})</span>
          <span class="price"><b>${eur(p.price)}</b><s>${eur(p.compareAt)}</s><span class="save">-${off(p)}%</span></span>
        </div>
      </button>`;
  }

  const categories = ["Tout", ...new Set(PRODUCTS.map((p) => p.category))];
  let activeCat = "Tout";

  function renderFilters() {
    $("#filters").innerHTML = categories
      .map((c) => `<button class="chip${c === activeCat ? " active" : ""}" data-cat="${c}">${c}</button>`)
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
    $("#modal-content").innerHTML = `
      <div class="pdp">
        <div class="pdp-media">${ICONS[p.icon]}</div>
        <div class="pdp-info">
          <span class="card-cat">${p.category}</span>
          <h3 id="modal-title">${p.title}</h3>
          <span class="rating"><span class="stars">${stars(p.rating)}</span>${p.rating} · ${p.reviews.toLocaleString("fr-FR")} avis vérifiés</span>
          <span class="price"><b>${eur(p.price)}</b><s>${eur(p.compareAt)}</s><span class="save">Économisez ${eur(p.compareAt - p.price)}</span></span>
          <p>${p.short}</p>
          <ul class="pdp-points">${p.points.map((x) => `<li>${x}</li>`).join("")}</ul>
          <span class="stock">En stock — expédié sous 24 h</span>
          <div style="display:flex;gap:10px;align-items:center;margin-top:6px">
            <div class="qty" style="margin:0;height:48px">
              <button data-mq="-1" aria-label="Diminuer" style="width:40px;height:46px">−</button>
              <span id="mq">1</span>
              <button data-mq="1" aria-label="Augmenter" style="width:40px;height:46px">+</button>
            </div>
            <button class="btn btn-primary" style="flex:1" data-add="${p.id}">Ajouter au panier</button>
          </div>
          <small style="color:var(--muted);font-size:12px">Livraison offerte dès ${eur(FREE_SHIPPING)} · Retours 30 jours</small>
        </div>
      </div>`;
    show("modal");
  }

  // ---------- Panier (tiroir) ----------
  function renderCart() {
    $("#cart-count").textContent = count();
    const items = Object.entries(cart);
    const sub = subtotal();
    const left = Math.max(0, FREE_SHIPPING - sub);

    $("#ship-text").innerHTML = left > 0
      ? `Plus que <b>${eur(left)}</b> pour la livraison offerte`
      : `<b>Livraison offerte</b> débloquée ✓`;
    $("#ship-progress").style.width = `${Math.min(100, (sub / FREE_SHIPPING) * 100)}%`;

    $("#cart-items").innerHTML = items.length
      ? items.map(([id, q]) => {
          const p = byId[id];
          return `
            <div class="line">
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
      : `<div class="empty">Votre panier est vide.</div>`;

    $("#cart-total").textContent = eur(sub);
    $("#checkout").disabled = !items.length;
    $("#checkout").style.opacity = items.length ? 1 : .4;
  }

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
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- Événements ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;
    const d = t.dataset;
    if (d.cat) { activeCat = d.cat; renderFilters(); renderGrid(); }
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
