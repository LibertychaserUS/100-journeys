/**
 * Road — what the Ticket Road's pages share (票路).
 *
 *   slips you hold      rubbed at the end of a door (account, or Guest.rubbings for guests),
 *                       plus the near slips everyone starts with and the open ones
 *   postmarks           where each line of a ticket was borrowed from (entrance numbers)
 *   lamps               your lamp on a work; guests keep theirs in Guest.lamps until sign-in
 *   blocks              authors you no longer share a platform with
 *   ticket stubs        the paper stub of a posted ticket and its back
 *   sheets              hand to the station staff, never share a platform, age band, ledger
 *
 * Nothing here is free text: every label comes from the server's vocabulary or the slips.
 * localStorage can be missing or throw; Guest degrades to memory, and so does everything here.
 */
const Road = (() => {
  const esc = (s) => UI.esc(s);
  const signedIn = () => API.isLoggedIn();
  const motion = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The eight realms are the eight platforms, in the order of the world vocabulary.
  const REALMS = ['mirror-salt', 'fire-stone', 'ice-night', 'sand-stars', 'mist-temple', 'water-deep', 'city-rules', 'old-roads'];
  const HOURS = ['predawn', 'dawn', 'morning', 'noon', 'afternoon', 'dusk', 'blue-hour', 'night', 'midnight'];
  const SEASONS = ['spring', 'summer', 'autumn', 'winter', 'rainy', 'dry', 'polar-night', 'midnight-sun'];
  const platform = (realm) => REALMS.indexOf(realm) + 1;
  /** The realm's sky across the top of a stub (an AVIF strip; the CSS gradient shows until it loads). */
  const bandArt = (realm) => (REALMS.includes(realm)
    ? UI.picture(API.mediaUrl(`generated/road/realm-band-${realm}.jpg`), { sizes: '(max-width: 760px) 92vw, 320px', cls: 'stub__art', width: 600, height: 130 })
    : '');
  const realmLabel = (realm) => (realm ? t(`entrance.realm.${realm}`) : '');

  /** The hour bucket of the viewer's own clock. Only the bucket ever leaves the device. */
  function hourNow(d = new Date()) {
    const h = d.getHours();
    if (h < 4) return 'midnight';
    if (h < 5) return 'predawn';
    if (h < 7) return 'dawn';
    if (h < 11) return 'morning';
    if (h < 13) return 'noon';
    if (h < 17) return 'afternoon';
    if (h < 19) return 'dusk';
    if (h < 20) return 'blue-hour';
    if (h < 23) return 'night';
    return 'midnight';
  }

  // ---------- vocabulary ----------
  const vocabCache = {};
  let vocabNow = null;
  function vocab() {
    const lang = I18n.apiLang;
    if (!vocabCache[lang]) {
      vocabCache[lang] = API.roadVocab().then((res) => {
        const v = res.data;
        v.tag = Object.fromEntries(v.tags.map((x) => [x.key, x]));
        v.stamp = Object.fromEntries(v.stamps.map((x) => [x.key, x]));
        v.flag = Object.fromEntries(v.flags.map((x) => [x.key, x]));
        v.reason = Object.fromEntries(v.reasons.map((x) => [x.key, x]));
        vocabNow = v;
        return v;
      });
      vocabCache[lang].catch(() => { delete vocabCache[lang]; });
    }
    return vocabCache[lang];
  }
  const tagLabel = (key) => (vocabNow && vocabNow.tag[key] ? vocabNow.tag[key].label : key);
  const stampLabel = (key) => (vocabNow && vocabNow.stamp[key] ? vocabNow.stamp[key].label : key);

  // ---------- slips you hold ----------
  let rubbedCache = null; // account rubbings, { slipId: slug }
  function rubbed() {
    if (!signedIn()) return Promise.resolve({ ...(Guest.get().rubbings || {}) });
    if (!rubbedCache) {
      rubbedCache = API.rubbings().then((res) => res.data || {});
      rubbedCache.catch(() => { rubbedCache = null; });
    }
    return rubbedCache.then((r) => ({ ...r }));
  }
  const slipId = (f) => `${f.group}:${f.key}`;
  const owns = (f, held) => f.unlock === 'starter' || f.unlock === 'open' || !f.unlock || !!held[slipId(f)];

  /** entrance slug -> number, from the doors the slips point at. */
  function doorIndex(list) {
    const bySlug = {};
    const byNo = {};
    list.forEach((f) => {
      if (f.door) { bySlug[f.door.slug] = f.door.no; byNo[f.door.no] = f.door; }
    });
    return { bySlug, byNo };
  }

  /** The slips the end of door `no` hands out, with the keepsake of `option`. */
  function slipsAt(no, option, list) {
    return list.filter((f) => (f.group === 'place' && f.no === no)
      || ((f.group === 'hour' || f.group === 'season') && (f.doors || []).includes(no))
      || (f.group === 'keepsake' && option && f.key === `keep-${no}-${option}`));
  }

  /** { group: entrance no } for a ticket's picks: a place or keepsake carries its own door, an
   *  hour or season the door it was rubbed at. */
  function postmarks(picks, by, held, doors) {
    const marks = {};
    Object.entries(picks || {}).forEach(([g, key]) => {
      const f = by[g] && by[g][key];
      if (!f) return;
      if (f.no) marks[g] = f.no;
      else if (held[slipId(f)] && doors.bySlug[held[slipId(f)]]) marks[g] = doors.bySlug[held[slipId(f)]];
    });
    return marks;
  }
  const transfer = (marks) => new Set(Object.values(marks || {})).size >= 2;

  /** Rub the end of a door: the account records it (with the arrival), a guest keeps it here. */
  async function rub(slug, no, option, list) {
    const slips = slipsAt(no, option, list).map(slipId);
    if (signedIn()) {
      const res = await API.rub(slug, option || '');
      rubbedCache = null;
      return { ids: res.data.rubbed, fresh: res.data.fresh, local: false };
    }
    const before = Guest.get().rubbings || {};
    const fresh = slips.filter((id) => !before[id]);
    Guest.update((s) => {
      s.rubbings = { ...(s.rubbings || {}) };
      slips.forEach((id) => { if (!s.rubbings[id]) s.rubbings[id] = slug; });
    });
    return { ids: slips, fresh, local: true };
  }

  // ---------- arrivals ----------
  function arrive(kind, id, step) {
    if (!signedIn()) return Promise.resolve();
    return API.arrive(kind, id, step).catch(() => {});
  }

  // ---------- lamps ----------
  const lampKey = (kind, id) => `${kind}:${id}`;
  const pendingLamp = (kind, id) => (Guest.get().lamps || {})[lampKey(kind, id)] || null;
  function keepLamp(lamp) {
    Guest.update((s) => { s.lamps = { ...(s.lamps || {}), [lampKey(lamp.kind, lamp.id)]: lamp }; });
  }
  function dropLamp(kind, id) {
    Guest.update((s) => { const l = { ...(s.lamps || {}) }; delete l[lampKey(kind, id)]; s.lamps = l; });
  }

  /** Lights a lamp in the account; keeps it on this device when signed out or not arrived. */
  async function light(lamp) {
    if (!signedIn()) {
      keepLamp(lamp);
      return { local: true };
    }
    try {
      const res = await API.lightLamp(lamp);
      dropLamp(lamp.kind, lamp.id);
      return { local: false, light: res.data.light, mine: res.data.mine };
    } catch (err) {
      if (err.status === 409 && err.apiError === 'not arrived') {
        keepLamp(lamp);
        return { local: true, held: true, wait: err.body && err.body.data ? err.body.data.wait_s : 0 };
      }
      throw err;
    }
  }

  // ---------- blocks ----------
  let blockCache = null;
  function blocked() {
    if (!signedIn()) return Promise.resolve(new Set());
    if (!blockCache) {
      blockCache = API.blocks().then((res) => new Set(res.data || []));
      blockCache.catch(() => { blockCache = null; });
    }
    return blockCache;
  }

  // ---------- after sign-in ----------
  let merging = null;
  async function mergeGuest() {
    if (!signedIn() || merging) return merging;
    const g = Guest.get();
    const rubs = g.rubbings || {};
    const lamps = Object.values(g.lamps || {});
    if (!Object.keys(rubs).length && !lamps.length) return null;
    merging = (async () => {
      if (Object.keys(rubs).length) {
        try {
          await API.mergeRubbings(rubs);
          Guest.update((s) => { s.rubbings = {}; });
          rubbedCache = null;
          window.dispatchEvent(new CustomEvent('road:rubbed'));
        } catch {}
      }
      // A lamp lit on a ticket's back before signing in: turn the back over again in the
      // account, wait the dwell, then light it. Journeys wait for the next real arrival.
      for (const lamp of lamps) {
        if (lamp.kind === 'ticket') {
          await arrive('ticket', lamp.id, 'view');
          setTimeout(() => { light(lamp).catch(() => {}); }, 9000);
        } else {
          light(lamp).catch(() => {});
        }
      }
    })().finally(() => { merging = null; });
    return merging;
  }
  window.addEventListener('session:updated', (e) => {
    rubbedCache = null;
    blockCache = null;
    postedCache = null;
    if (e.detail) mergeGuest();
  });

  // ---------- your posted tickets ----------
  let postedCache = null;
  function posted(force = false) {
    if (!signedIn()) return Promise.resolve({});
    if (!postedCache || force) {
      postedCache = API.myPosts().then((res) => res.data || {});
      postedCache.catch(() => { postedCache = null; });
    }
    return postedCache;
  }
  const forgetPosted = () => { postedCache = null; };

  // ---------- errors ----------
  function error(err) {
    const raw = String((err && (err.apiError || err.message)) || '').toLowerCase();
    if (raw.includes('not arrived')) return t('err.notArrived');
    if (raw.includes('daily limit')) return t('err.dailyCap');
    if (raw.includes('age band needed')) return t('err.ageNeeded');
    if (raw.includes('under 14')) return t('err.under14');
    if (raw.includes('more slips')) return t('err.needSlips');
    if (raw.includes('on the station')) return t('err.postedFrozen');
    if (raw.includes('own work')) return t('err.ownWork');
    if (raw.includes('silenced')) return t('err.silenced');
    if (raw.includes('taken down')) return t('err.removed');
    return I18n.error(err);
  }

  // ---------- ticket stubs ----------
  // The punch a ticket gets when it is opened, in the shape of its hour.
  const PUNCH = {
    predawn: '<path d="M12 4a8 8 0 1 0 6.9 12A6.5 6.5 0 0 1 12 4z"/>',
    dawn: '<path d="M4 15a8 8 0 0 1 16 0z"/>',
    morning: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2.5" fill="var(--paper)"/>',
    noon: '<circle cx="12" cy="12" r="5"/>',
    afternoon: '<path d="M12 4l6 8-6 8-6-8z"/>',
    dusk: '<path d="M4 9a8 8 0 0 0 16 0z"/>',
    'blue-hour': '<path d="M12 4a8 8 0 0 1 0 16z"/>',
    night: '<path d="M14 4a8 8 0 1 0 6 13.5A7 7 0 0 1 14 4z"/>',
    midnight: '<path d="M12 3l2.2 6.3H21l-5.4 4 2 6.7-5.6-4-5.6 4 2-6.7L3 9.3h6.8z"/>',
  };
  const punch = (hour) => (PUNCH[hour] ? `<svg class="punch" viewBox="0 0 24 24" aria-hidden="true">${PUNCH[hour]}</svg>` : '');

  function sentence(v, by) {
    const s = Compose.sentence(v.picks || {}, by);
    const plain = Compose.plainTitle(v, by);
    return { title: s.title || esc(t('compose.ticket.blank')), story: s.story, plain };
  }

  function marksHTML(marks, small = false) {
    const nos = [...new Set(Object.values(marks || {}))].sort((a, b) => a - b);
    if (!nos.length) return `<span class="postmark postmark--near">${esc(t('stub.near'))}</span>`;
    return nos.map((n) => `<span class="postmark${small ? ' postmark--sm' : ''}" title="${esc(t('stub.postmark', { n }))}"><span aria-hidden="true">№</span>${n}<span class="sr-only">${esc(t('stub.postmark', { n }))}</span></span>`).join('');
  }

  function glowHTML(light) {
    const glow = light && light.glow != null ? light.glow : -1;
    return `<span class="stub__glow" style="--glow:${Math.max(glow, 0)}" data-lit="${glow >= 0}" aria-hidden="true"></span>`;
  }

  /** The front of a posted ticket, as a button that turns it over. */
  function stubHTML(v, by, { openNow = false, mini = false } = {}) {
    const s = sentence(v, by);
    const realm = v.realm || '';
    const count = v.light && v.light.count;
    return `
      <article class="stub${mini ? ' stub--mini' : ''}" data-code="${esc(v.code)}" ${realm ? `data-realm="${esc(realm)}"` : ''}>
        <span class="stub__band" aria-hidden="true">
          ${bandArt(realm)}
          <span class="stub__platform num">${realm ? esc(t('station.platform.no', { n: platform(realm) })) : ''}</span>
          <span class="stub__realm">${esc(realmLabel(realm))}</span>
        </span>
        <span class="stub__body">
          <span class="stub__title"><button type="button" class="stub__open"><span class="sr-only">${esc(t('stub.open', { title: '' }))}</span>${s.title}</button></span>
          ${s.story && !mini ? `<span class="stub__story">${s.story}</span>` : ''}
        </span>
        <span class="stub__perf" aria-hidden="true"></span>
        <span class="stub__foot">
          <span class="stub__marks">${marksHTML(v.marks, true)}${v.transfer ? `<span class="stub__transfer">${esc(t('stub.transfer'))}</span>` : ''}</span>
          ${(v.tags || []).length && !mini ? `<span class="stub__tags">${v.tags.map((k) => `<span class="ltag">${esc(tagLabel(k))}</span>`).join('')}</span>` : ''}
          <span class="stub__alias">${esc(v.alias)}${v.mine ? ` · ${esc(t('stub.mine'))}` : ''}</span>
          ${count ? `<span class="stub__lit">${esc(t('stub.lit', { n: count }))}</span>` : ''}
          ${openNow || v.open_now ? `<span class="stub__now">${esc(t('stub.openNow'))}</span>` : ''}
        </span>
        ${glowHTML(v.light)}
      </article>`;
  }

  // ---------- the back of a ticket ----------
  /**
   * Opens a ticket: it slides out, gets punched in the shape of its hour and turns over.
   * The back shows the doors it borrowed from, its lanterns, "set out from this ticket", and the
   * station staff / block actions. Signed in, turning it over is the arrival a lamp waits for.
   */
  async function open(v, by, { onBlocked } = {}) {
    API.track('ticket_flip', '', { code: v.code });
    arrive('ticket', v.code, 'view');
    const doors = doorIndex(Object.values(by).flatMap((g) => Object.values(g)));
    const nos = [...new Set(Object.values(v.marks || {}))].sort((a, b) => a - b);
    const s = sentence(v, by);
    let lantern = null;
    const sheet = UI.sheet({
      label: t('back.label'),
      wide: true,
      onClose: () => { if (lantern) lantern.destroy(); },
      render: () => `
        <div class="ticket-open" data-realm="${esc(v.realm || '')}">
          <div class="ticket-open__card">
            <div class="ticket-open__face ticket-open__front" aria-hidden="true">
              <div class="stub stub--static" data-realm="${esc(v.realm || '')}">
                <span class="stub__band">${bandArt(v.realm)}<span class="stub__platform num">${v.realm ? esc(t('station.platform.no', { n: platform(v.realm) })) : ''}</span><span class="stub__realm">${esc(realmLabel(v.realm))}</span></span>
                <span class="stub__body"><span class="stub__title">${s.title}</span>${s.story ? `<span class="stub__story">${s.story}</span>` : ''}</span>
                ${v.picks && v.picks.hour ? `<span class="stub__hole">${punch(v.picks.hour)}</span>` : ''}
              </div>
            </div>
            <section class="ticket-open__face ticket-open__back" aria-labelledby="back-title">
              <header class="back__head">
                <p class="back__alias">${esc(v.alias)}</p>
                <h2 class="back__title" id="back-title">${s.title}</h2>
                ${s.story ? `<p class="back__story">${s.story}</p>` : ''}
                ${v.picks && v.picks.hour ? `<span class="back__hole">${punch(v.picks.hour)}</span>` : ''}
                <button class="icon-btn back__close" type="button" data-close aria-label="${esc(t('back.turn'))}">${UI.icon('close')}</button>
              </header>
              <div class="back__grid">
                <div class="back__doors">
                  <h3>${esc(t('back.doors'))}</h3>
                  ${nos.length ? `<ul>${nos.map((n) => {
                    const d = doors.byNo[n];
                    return d ? `<li><span class="postmark"><span aria-hidden="true">№</span>${n}</span><span><b>${esc(realmLabel(d.realm))}</b><small>${esc(d.role)}</small></span><a class="link" href="#/journey/${encodeURIComponent(d.slug)}">${esc(t('back.walkIn'))}</a></li>` : '';
                  }).join('')}</ul>` : `<p class="back__near">${esc(t('back.nearOnly'))}</p>`}
                  ${(v.tags || []).length ? `<p class="back__tags">${v.tags.map((k) => `<span class="ltag">${esc(tagLabel(k))}</span>`).join('')}</p>` : ''}
                </div>
                <div class="back__lamp" id="back-lamp"></div>
              </div>
              <footer class="back__foot">
                <a class="btn btn--primary" href="#/compose?from=${encodeURIComponent(v.code)}" data-depart>${esc(t('back.depart'))}</a>
                ${v.mine ? '' : `<button class="btn btn--quiet btn--sm" type="button" data-report>${esc(t('back.report'))}</button>
                <button class="btn btn--quiet btn--sm" type="button" data-block>${esc(t('back.block'))}</button>`}
              </footer>
            </section>
          </div>
        </div>`,
    });
    const box = sheet.el;
    box.classList.add('sheet--ticket');
    // Punched, then turned over: the front turns away to its edge, the back turns in from the other.
    const flip = box.querySelector('.ticket-open');
    const turn = () => {
      flip.classList.add('is-over');
      if (motion()) flip.querySelector('.ticket-open__back').animate([{ transform: 'rotateY(-90deg)', opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' });
      box.querySelector('.back__close')?.focus({ preventScroll: true });
    };
    if (motion()) {
      const front = flip.querySelector('.ticket-open__front .stub');
      front.animate([{ transform: 'translateY(16px) scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' });
      setTimeout(() => {
        if (!flip.isConnected) return;
        front.animate([{ transform: 'none' }, { transform: 'rotateY(90deg)' }], { duration: 300, easing: 'cubic-bezier(.6,0,.9,.4)', fill: 'forwards' })
          .finished.catch(() => {}).finally(() => { if (flip.isConnected) turn(); });
      }, 620);
    } else {
      turn();
    }
    box.querySelector('[data-depart]')?.addEventListener('click', () => API.track('ticket_depart', '', { code: v.code }));
    box.querySelector('[data-report]')?.addEventListener('click', () => reportSheet(v));
    box.querySelector('[data-block]')?.addEventListener('click', () => blockSheet(v, () => { sheet.close(); if (onBlocked) onBlocked(v.aid); }));
    lantern = Lantern.mount(box.querySelector('#back-lamp'), { kind: 'ticket', id: v.code, own: !!v.mine, dwell: true, compact: true });
    return sheet;
  }

  // ---------- sheets ----------
  function needSignIn(messageKey, next) {
    UI.toast(t(messageKey), { href: `#/login?next=${encodeURIComponent(next || (window.location.hash.slice(1) || '/'))}`, label: t('nav.login') });
  }

  async function reportSheet(v) {
    if (!signedIn()) { needSignIn('compose.post.signIn'); return; }
    const voc = await vocab();
    const sheet = UI.sheet({
      label: t('report.title'),
      render: () => `
        <form class="road-sheet" id="report-form">
          <h2>${esc(t('report.title'))}</h2>
          <p class="road-sheet__lead">${esc(t('report.lead'))}</p>
          <fieldset class="road-sheet__choices"><legend class="sr-only">${esc(t('report.title'))}</legend>
            ${voc.reasons.map((r, i) => `<label class="road-choice"><input type="radio" name="reason" value="${esc(r.key)}" ${i === 0 ? 'checked data-autofocus' : ''}><span>${esc(r.label)}</span></label>`).join('')}
          </fieldset>
          <div class="road-sheet__actions"><button type="button" class="btn btn--ghost" data-close>${esc(t('common.cancel'))}</button><button type="submit" class="btn btn--primary">${esc(t('report.send'))}</button></div>
        </form>`,
    });
    sheet.el.querySelector('#report-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const reason = sheet.el.querySelector('input[name="reason"]:checked').value;
      try {
        await API.report('ticket', v.code, reason);
        sheet.close();
        UI.toast(t('report.sent'));
      } catch (err) { UI.toast(error(err)); }
    });
  }

  function blockSheet(v, done) {
    if (!signedIn()) { needSignIn('compose.post.signIn'); return; }
    const sheet = UI.sheet({
      label: t('block.title'),
      render: () => `
        <div class="road-sheet">
          <h2>${esc(t('block.title'))}</h2>
          <p class="road-sheet__lead">${esc(t('block.lead'))}</p>
          <p class="road-sheet__who">${esc(v.alias)}</p>
          <div class="road-sheet__actions"><button type="button" class="btn btn--ghost" data-close>${esc(t('common.cancel'))}</button><button type="button" class="btn btn--primary" data-autofocus id="block-do">${esc(t('block.do'))}</button></div>
        </div>`,
    });
    sheet.el.querySelector('#block-do').addEventListener('click', async () => {
      try {
        await API.block(v.aid, true);
        blockCache = null;
        sheet.close();
        UI.toast(t('block.done'));
        if (done) done();
      } catch (err) { UI.toast(error(err)); }
    });
  }

  /** Asks the age band once (older accounts). Resolves to the band, or null if dismissed. */
  function ageSheet() {
    return new Promise((resolve) => {
      let settled = false;
      const sheet = UI.sheet({
        label: t('compose.age.title'),
        onClose: () => { if (!settled) resolve(null); },
        render: () => `
          <form class="road-sheet" id="age-form">
            <h2>${esc(t('compose.age.title'))}</h2>
            <p class="road-sheet__lead">${esc(t('compose.age.lead'))}</p>
            <fieldset class="road-sheet__choices"><legend class="sr-only">${esc(t('register.age'))}</legend>
              ${['under14', '14-17', '18+'].map((b, i) => `<label class="road-choice"><input type="radio" name="band" value="${b}" ${i === 2 ? 'data-autofocus' : ''}><span>${esc(t(`age.${b}`))}</span></label>`).join('')}
            </fieldset>
            <div class="road-sheet__actions"><button type="button" class="btn btn--ghost" data-close>${esc(t('common.cancel'))}</button><button type="submit" class="btn btn--primary">${esc(t('compose.age.save'))}</button></div>
          </form>`,
      });
      sheet.el.querySelector('#age-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pick = sheet.el.querySelector('input[name="band"]:checked');
        if (!pick) return;
        try {
          await API.setAgeBand(pick.value);
          await Session.refresh();
          settled = true;
          sheet.close();
          resolve(pick.value);
        } catch (err) { UI.toast(error(err)); }
      });
    });
  }

  /** The author's ledger: the colour of the light, without who lit it. */
  async function ledgerSheet(code) {
    let res;
    try { [res] = await Promise.all([API.ledger('ticket', code), vocab()]); } catch (err) { UI.toast(error(err)); return; }
    const d = res.data;
    const bars = (axis) => {
      const counts = d.ledger.axes[axis] || [0, 0, 0, 0, 0];
      const max = Math.max(1, ...counts);
      return `<div class="ledger__axis"><h3>${esc(t(`lamp.axis.${axis}`))}</h3><ol class="ledger__bars">${counts.map((n, i) => `<li style="--h:${n / max}"><span class="sr-only">${esc(t(`lamp.level.${i + 1}`))}: </span><b class="num">${n}</b></li>`).join('')}</ol></div>`;
    };
    const list = (obj, label) => {
      const entries = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
      return entries.length ? `<ul class="ledger__list">${entries.map(([k, n]) => `<li><span>${esc(label(k))}</span><b class="num">${n}</b></li>`).join('')}</ul>` : `<p class="ledger__none">${esc(t('ledger.none'))}</p>`;
    };
    UI.sheet({
      label: t('ledger.title'),
      wide: true,
      render: () => `
        <div class="road-sheet ledger">
          <h2>${esc(t('ledger.title'))}</h2>
          ${d.ready ? `
            <div class="ledger__glow" style="--glow:${d.glow}" aria-hidden="true"></div>
            <div class="ledger__axes">${(vocabNow.axes || ['real', 'moved', 'fit']).map(bars).join('')}</div>
            <div class="ledger__cols">
              <div><h3>${esc(t('ledger.stamps'))}</h3>${list(d.ledger.stamps, stampLabel)}</div>
              <div><h3>${esc(t('ledger.flags'))}</h3>${list(d.ledger.flags, (k) => (vocabNow.flag[k] ? vocabNow.flag[k].label : k))}</div>
            </div>` : `<p class="road-sheet__lead">${esc(t('ledger.notYet', { n: d.needed }))}</p>`}
          <div class="road-sheet__actions"><button type="button" class="btn btn--ghost" data-close data-autofocus>${esc(t('common.close'))}</button></div>
        </div>`,
    });
  }

  return {
    REALMS, HOURS, SEASONS, platform, realmLabel, hourNow,
    vocab, tagLabel, stampLabel,
    rubbed, owns, slipId, slipsAt, doorIndex, postmarks, transfer, rub,
    arrive, light, pendingLamp, keepLamp, dropLamp, blocked, posted, forgetPosted, mergeGuest,
    error, stubHTML, marksHTML, punch, open, reportSheet, blockSheet, ageSheet, ledgerSheet, needSignIn,
  };
})();
