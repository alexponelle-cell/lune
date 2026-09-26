/* NOCTA — comportement du thème (panier Ajax, variantes, filtres, compte à rebours, thème). */
(() => {
  const cfg = window.NOCTA || {};
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const money = (cents) =>
    new Intl.NumberFormat(cfg.locale || "fr", { style: "currency", currency: cfg.currency || "EUR" }).format(cents / 100);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const sized = (url, w) => { try { const u = new URL(url, location.origin); u.searchParams.set("width", w); return u.toString(); } catch (e) { return url; } };

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ---------- Panneaux (panier, menu mobile) ---------- */
  let lastFocus = null;
  function openPanel(id) {
    const panel = document.getElementById(id);
    if (!panel) return;
    lastFocus = document.activeElement;
    closePanels(false);
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    $("#overlay")?.classList.add("open");
    document.body.classList.add("locked");
    panel.querySelector(".icon-btn")?.focus();
  }
  function closePanels(restore = true) {
    ["drawer", "mobile-nav"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove("open"); el.setAttribute("aria-hidden", "true"); }
    });
    $("#overlay")?.classList.remove("open");
    document.body.classList.remove("locked");
    if (restore && lastFocus) lastFocus.focus();
  }

  /* ---------- Panier ---------- */
  const api = async (url, body) => {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.description || data.message || "Une erreur est survenue.");
    return data;
  };

  function renderCart(cart) {
    $$("#cart-count").forEach((el) => (el.textContent = cart.item_count));
    const items = $("#cart-items");
    if (!items) return;

    // Jauges : remise dès N articles + livraison offerte
    const bars = [];
    const n = cart.item_count;
    if (cfg.bundleMin > 0) {
      const left = cfg.bundleMin - n;
      bars.push(`<div>${left > 0
        ? `Ajoutez <b>${left} article${left > 1 ? "s" : ""}</b> pour -${cfg.bundlePct} %`
        : `<b>-${cfg.bundlePct} % appliqué</b> sur votre panier ✓`}
        <div class="progress"><i style="width:${Math.min(100, (n / cfg.bundleMin) * 100)}%"></i></div></div>`);
    }
    if (cfg.freeShipping > 0) {
      const left = cfg.freeShipping - cart.total_price;
      bars.push(`<div>${left > 0
        ? `Plus que <b>${money(left)}</b> pour la livraison offerte`
        : `<b>Livraison offerte</b> débloquée ✓`}
        <div class="progress"><i style="width:${Math.min(100, (cart.total_price / cfg.freeShipping) * 100)}%"></i></div></div>`);
    }
    const shipBar = $("#ship-bar");
    if (shipBar) { shipBar.innerHTML = bars.join(""); shipBar.style.display = bars.length && n ? "" : "none"; }

    items.innerHTML = cart.items.length
      ? cart.items.map((it) => `
          <div class="line">
            <a class="line-media" href="${esc(it.url)}">${it.image ? `<img src="${esc(sized(it.image, 160))}" alt="" loading="lazy">` : ""}</a>
            <div>
              <a class="line-title" href="${esc(it.url)}">${esc(it.product_title)}</a>
              ${it.product_has_only_default_variant ? "" : `<div class="line-price">${esc(it.variant_title)}</div>`}
              <div class="line-price">${money(it.final_line_price)}</div>
              <div class="qty">
                <button type="button" data-line="${esc(it.key)}" data-qty="${it.quantity - 1}" aria-label="Diminuer">−</button>
                <span>${it.quantity}</span>
                <button type="button" data-line="${esc(it.key)}" data-qty="${it.quantity + 1}" aria-label="Augmenter">+</button>
              </div>
            </div>
            <button type="button" class="remove" data-line="${esc(it.key)}" data-qty="0">Retirer</button>
          </div>`).join("")
      : `<div class="empty">Votre panier est vide.<a href="${esc(cfg.routes.allProducts)}" class="btn btn-ghost">Voir les produits</a></div>`;

    const d = cart.total_discount;
    const row = $("#cart-discount-row");
    if (row) row.style.display = d > 0 ? "" : "none";
    const titles = (cart.cart_level_discount_applications || []).map((a) => a.title).filter(Boolean);
    if ($("#cart-discount-label")) $("#cart-discount-label").textContent = titles.length ? titles.join(", ") : "Remise";
    if ($("#cart-discount")) $("#cart-discount").textContent = `-${money(d)}`;
    if ($("#cart-sub")) $("#cart-sub").textContent = money(cart.original_total_price);
    if ($("#cart-total")) $("#cart-total").textContent = money(cart.total_price);
    const checkout = $("#checkout");
    if (checkout) { checkout.disabled = !cart.item_count; checkout.style.opacity = cart.item_count ? 1 : 0.4; }
  }

  const refreshCart = () => api(cfg.routes.cartJs).then(renderCart);

  async function addToCart(items, button) {
    if (button) button.setAttribute("aria-busy", "true");
    try {
      await api(cfg.routes.cartAdd, { items });
      const cart = await api(cfg.routes.cartJs);
      renderCart(cart);
      bump();
      if (cfg.cartType === "page") { window.location.href = cfg.routes.cart; return; }
      openPanel("drawer");
      if (cfg.bundleMin > 0 && cart.item_count === cfg.bundleMin - 1) {
        toast(`Ajouté ✓ — encore 1 article pour -${cfg.bundlePct} %`);
      }
    } finally {
      if (button) button.removeAttribute("aria-busy");
    }
  }

  function bump() {
    const btn = $("#cart-open");
    if (!btn) return;
    btn.classList.remove("bump"); void btn.offsetWidth; btn.classList.add("bump");
  }

  /* ---------- Fiche produit : variantes, quantité, galerie ---------- */
  function initProduct(section) {
    const json = section.querySelector("[data-product-json]");
    const form = section.querySelector("[data-product-form]");
    if (!json || !form) return;
    const data = JSON.parse(json.textContent);
    const idInput = form.querySelector("[data-variant-id]");
    const addBtn = form.querySelector("[data-add-button]");
    const addLabel = form.querySelector("[data-add-label]");
    const stock = form.querySelector("[data-stock]");
    const priceWrap = section.querySelector("[data-price-wrap] [data-price]");
    const errorEl = form.querySelector("[data-form-error]");
    const radios = $$("input[data-option-index]", form);

    function selected() {
      const opts = [];
      radios.filter((r) => r.checked).forEach((r) => (opts[Number(r.dataset.optionIndex)] = r.value));
      return opts;
    }

    function markUnavailable() {
      // Grise les valeurs qui ne mènent à aucune variante disponible, compte tenu des autres choix.
      const current = selected();
      radios.forEach((r) => {
        const i = Number(r.dataset.optionIndex);
        const test = current.slice(); test[i] = r.value;
        const ok = data.variants.some((v) => v.available && v.options.every((o, k) => o === test[k]));
        r.nextElementSibling?.classList.toggle("unavailable", !ok);
      });
    }

    function update() {
      const opts = selected();
      const v = data.variants.find((x) => x.options.every((o, i) => o === opts[i]));
      $$("[data-option-label]", form).forEach((el) => (el.textContent = opts[Number(el.dataset.optionLabel)] || ""));
      markUnavailable();
      if (!v) {
        addBtn.disabled = true; addLabel.textContent = "Indisponible";
        return;
      }
      idInput.value = v.id;
      addBtn.disabled = !v.available;
      addLabel.textContent = v.available ? "Ajouter au panier" : "Épuisé";
      if (priceWrap) {
        priceWrap.innerHTML = `<b>${money(v.price)}</b>${v.compare ? `<s>${money(v.compare)}</s><span class="save">Vous économisez ${money(v.compare - v.price)}</span>` : ""}`;
      }
      if (stock) {
        const low = v.tracked === "shopify" && v.qty > 0 && v.qty <= data.lowStock;
        stock.classList.toggle("low", low);
        stock.textContent = !v.available ? "Épuisé"
          : (low ? `Plus que ${v.qty} en stock` : "En stock") + (data.shippingNote ? ` — ${data.shippingNote}` : "");
      }
      if (v.image) showImage(v.image, "");
      const url = new URL(window.location.href);
      url.searchParams.set("variant", v.id);
      window.history.replaceState({}, "", url);
    }

    radios.forEach((r) => r.addEventListener("change", update));
    if (radios.length) markUnavailable();

    const qty = form.querySelector("[data-qty-input]");
    $$("[data-qty-step]", form).forEach((b) =>
      b.addEventListener("click", () => { qty.value = Math.max(1, (parseInt(qty.value, 10) || 1) + Number(b.dataset.qtyStep)); })
    );

    form.addEventListener("submit", async (e) => {
      if (cfg.cartType === "page") return; // envoi classique vers la page panier
      e.preventDefault();
      errorEl.hidden = true;
      try {
        await addToCart([{ id: Number(idInput.value), quantity: Math.max(1, parseInt(qty.value, 10) || 1) }], addBtn);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });

    const main = section.querySelector("[data-gallery-main]");
    function showImage(src, alt) {
      const img = main?.querySelector("img");
      if (!img) return;
      img.removeAttribute("srcset");
      img.src = src;
      if (alt) img.alt = alt;
    }
    $$(".gallery-thumbs button", section).forEach((b) =>
      b.addEventListener("click", () => {
        showImage(b.dataset.src, b.dataset.alt);
        $$(".gallery-thumbs button", section).forEach((x) => x.setAttribute("aria-current", String(x === b)));
      })
    );
  }

  /* ---------- Filtres par catégorie ---------- */
  function initFilters(group) {
    const grid = document.getElementById(`grid-${group.dataset.filters}`);
    if (!grid) return;
    group.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-cat]");
      if (!chip) return;
      $$(".chip", group).forEach((c) => c.classList.toggle("active", c === chip));
      const cat = chip.dataset.cat;
      $$(".card", grid).forEach((card) => card.classList.toggle("is-hidden", cat !== "*" && card.dataset.type !== cat));
    });
  }

  /* ---------- Compte à rebours ---------- */
  function initTimers() {
    const timers = $$("[data-timer]");
    if (!timers.length) return;
    function tick() {
      let running = false;
      timers.forEach((el) => {
        const ms = new Date(el.dataset.end).getTime() - Date.now();
        if (!(ms > 0)) { el.closest("[data-sale]")?.remove(); return; }
        running = true;
        const s = Math.floor(ms / 1000);
        const parts = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
        el.innerHTML = parts.map((v, i) => `<span>${String(v).padStart(2, "0")}${"jhms"[i]}</span>`).join("");
      });
      return running;
    }
    if (tick()) { const id = setInterval(() => { if (!tick()) clearInterval(id); }, 1000); }
  }

  /* ---------- Thème clair / sombre ---------- */
  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme !== "dark";
    if (dark) root.dataset.theme = "dark"; else delete root.dataset.theme;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#09090B" : "#F7F7FA";
    try { localStorage.setItem("nocta-theme", dark ? "dark" : "light"); } catch (e) {}
  }

  /* ---------- Événements globaux ---------- */
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;

    if (t.id === "cart-open" && cfg.cartType !== "page") {
      e.preventDefault();
      openPanel("drawer");
      refreshCart().catch(() => {});
    } else if (t.id === "menu-open") {
      openPanel("mobile-nav");
    } else if (t.id === "theme-toggle") {
      toggleTheme();
    } else if (t.hasAttribute("data-close")) {
      closePanels();
    } else if (t.dataset.quickAdd) {
      e.preventDefault();
      try { await addToCart([{ id: Number(t.dataset.quickAdd), quantity: 1 }], t); }
      catch (err) { toast(err.message); }
    } else if (t.dataset.line) {
      try { renderCart(await api(cfg.routes.cartChange, { id: t.dataset.line, quantity: Number(t.dataset.qty) })); }
      catch (err) { toast(err.message); }
    }
  });
  $("#overlay")?.addEventListener("click", () => closePanels());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanels(); });

  $$("[data-product-section]").forEach(initProduct);
  $$("[data-filters]").forEach(initFilters);
  initTimers();

  // Rafraîchit le panier quand on revient sur la page (bouton retour du navigateur).
  window.addEventListener("pageshow", (e) => { if (e.persisted) refreshCart().catch(() => {}); });
  if ($("#cart-items")) refreshCart().catch(() => {});
})();
