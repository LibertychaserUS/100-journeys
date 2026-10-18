/**
 * checkout.js — in-page order confirmation and payment sheet (replaces confirm()/alert()).
 * start(journey) creates an order; resume(orderId, journey) reopens a pending one,
 * e.g. after a top-up or from My trips. Insufficient balance links to the recharge page
 * with the exact shortfall and a return path back to this order.
 */
const Checkout = (() => {
  const esc = UI.esc;

  function head(order) {
    return `<div class="sheet__head">
      <div><h2 id="pay-title">${esc(t('pay.title'))}</h2>${order ? `<p class="num">${esc(t('pay.orderNo', { no: order.order_no }))}</p>` : ''}</div>
      <button class="icon-btn sheet__close" type="button" data-close aria-label="${esc(t('common.close'))}">${UI.icon('close')}</button>
    </div>`;
  }

  function summary(journey) {
    return `<div class="checkout-sum">
      <img src="${esc(journey.image_url)}" alt="" width="72" height="72">
      <div><b>${esc(journey.title)}</b><span>${esc(UI.region(journey))} · ×1</span></div>
    </div>`;
  }

  function loading(journey) {
    return `${head()}${journey ? summary(journey) : ''}<p class="checkout-wait" aria-live="polite">${esc(t('pay.creating'))}</p>`;
  }

  function failure(err) {
    return `${head()}<div class="alert" role="alert">${UI.icon('alert')}<span>${esc(I18n.error(err))}</span></div>
      <div class="sheet__actions sheet__actions--single"><button class="btn btn--ghost" type="button" data-close>${esc(t('common.close'))}</button></div>`;
  }

  function orderView(order, journey, user) {
    const total = order.total_amount;
    const price = (journey.price || total) * ((order.items && order.items[0] && order.items[0].quantity) || 1);
    const discount = Math.max(0, price - total);
    const balance = user ? user.balance : 0;
    const short = Math.max(0, total - balance);
    const next = `/journey/${journey.slug}?order=${order.id}`;
    return `${head(order)}${summary(journey)}
      <div class="lines">
        <div><span>${esc(t('pay.price'))}</span><b>${esc(UI.coins(price))}</b></div>
        ${discount ? `<div class="is-plus"><span>${esc(t('pay.discount'))}</span><b>−${esc(UI.coins(discount))}</b></div>` : ''}
        <div class="is-total"><span>${esc(t('pay.total'))}</span><b>${esc(UI.coins(total))}</b></div>
        <div><span>${esc(t('pay.balance'))}</span><b>${esc(UI.coins(balance))}</b></div>
        ${short ? `<div class="is-short"><span>${esc(t('pay.short'))}</span><b>${esc(UI.coins(short))}</b></div>`
          : `<div><span>${esc(t('pay.after'))}</span><b>${esc(UI.coins(balance - total))}</b></div>`}
      </div>
      ${short ? `<div class="alert" role="alert">${UI.icon('alert')}<span>${esc(t('pay.insufficient'))}</span></div>` : ''}
      <p class="checkout-error alert" role="alert" id="pay-error" hidden></p>
      <div class="sheet__actions">
        <button class="btn btn--ghost" type="button" data-close>${esc(t('pay.later'))}</button>
        ${short
          ? `<a class="btn btn--primary" id="pay-recharge" data-autofocus href="#/recharge?need=${short}&next=${encodeURIComponent(next)}">${esc(t('pay.recharge'))}</a>`
          : `<button class="btn btn--primary" type="button" id="pay-confirm" data-autofocus>${esc(t('pay.confirm', { n: I18n.num(total) }))}</button>`}
      </div>`;
  }

  function success(order, journey) {
    return `<div class="checkout-done" id="pay-success">
      <span class="checkout-done__icon">${UI.icon('check', 'icon--lg')}</span>
      <h2>${esc(t('pay.success.title'))}</h2>
      <p>${esc(t('pay.success.text', { title: journey.title }))}</p>
      <p class="checkout-done__no num">${esc(t('pay.orderNo', { no: order.order_no }))}</p>
      <div class="sheet__actions">
        <button class="btn btn--ghost" type="button" data-close>${esc(t('pay.success.continue'))}</button>
        <a class="btn btn--primary" href="#/profile?tab=orders" data-autofocus>${esc(t('pay.success.orders'))}</a>
      </div>
    </div>`;
  }

  function bind(sheet, order, journey, onPaid) {
    sheet.el.querySelector('a[href^="#/"]')?.addEventListener('click', () => sheet.close());
    const btn = sheet.el.querySelector('#pay-confirm');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      try {
        await API.payOrder(order.id);
        const user = await Session.refresh();
        sheet.set(success(order, journey));
        sheet.el.querySelector('a[href^="#/"]')?.addEventListener('click', () => sheet.close());
        if (onPaid) onPaid(user);
      } catch (err) {
        if (err.status === 402) {
          const user = await Session.refresh();
          sheet.set(orderView(order, journey, user));
          bind(sheet, order, journey, onPaid);
          return;
        }
        const box = sheet.el.querySelector('#pay-error');
        box.hidden = false;
        box.textContent = I18n.error(err);
        btn.removeAttribute('aria-busy');
        btn.disabled = false;
      }
    });
  }

  async function show(sheet, order, journey, onPaid) {
    if (order.status !== 'pending') {
      sheet.set(success(order, journey));
      return;
    }
    const user = await Session.refresh();
    sheet.set(orderView(order, journey, user));
    bind(sheet, order, journey, onPaid);
  }

  async function start(journey, { onPaid } = {}) {
    if (!API.isLoggedIn()) {
      UI.toast(t('pay.loginFirst'), { href: `#/login?next=${encodeURIComponent(`/journey/${journey.slug}`)}`, label: t('nav.login') });
      return;
    }
    const sheet = UI.sheet({ label: t('pay.title'), render: () => loading(journey) });
    try {
      const res = await API.createOrder([{ journey_slug: journey.slug, quantity: 1 }]);
      await show(sheet, res.data, journey, onPaid);
    } catch (err) {
      sheet.set(failure(err));
    }
  }

  async function resume(orderId, journey, { onPaid } = {}) {
    const sheet = UI.sheet({ label: t('pay.title'), render: () => loading(journey) });
    try {
      const res = await API.getOrder(orderId);
      await show(sheet, res.data, journey, onPaid);
    } catch (err) {
      sheet.set(failure(err));
    }
  }

  return { start, resume };
})();
