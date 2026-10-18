/**
 * Guest state — what a visitor has chosen before (or without) signing in, in one
 * localStorage entry. The shape is part of the content contract (docs/content/SCHEMA.md):
 *
 *   { v: 1,
 *     vid: 'k3…',                     // anonymous visitor id for the funnel (no personal data)
 *     mbti: 'INFP' | '',              // the type the visitor chose or arrived at with the guide
 *     mbti_source: 'self' | 'pet' | '',
 *     choices: { [slug]: optionKey }, // what they picked at each journey's fork
 *     opened: [slug],                 // entrances they have opened
 *     dialog: { step, answers },      // the guide's conversation, so it can be resumed
 *     invite: '' | 'dismissed',       // the home invitation
 *     composed: [ ...tickets ] }      // journeys pieced together in the compose game
 *
 * Signed in, the account is the source of truth for the type and fork picks: the first time a
 * session becomes signed in, pending guest picks are merged into it once (POST /auth/guest/merge).
 * Storage can be missing or throw (private mode); every call degrades to an in-memory copy.
 */
var Guest = (() => {
  const KEY = 'guest_state';
  const randomId = () => {
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(12));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    } catch { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; }
  };
  const empty = () => ({ v: 1, vid: randomId(), mbti: '', mbti_source: '', choices: {}, opened: [], dialog: null, invite: '', composed: [] });
  let memory = null;
  let account = null; // signed-in fork picks, loaded on demand
  let merging = null;

  function read() {
    if (memory) return memory;
    let state = empty();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && raw.v === 1) {
        state = { ...state, ...raw, choices: { ...(raw.choices || {}) }, opened: [...(raw.opened || [])], composed: [...(raw.composed || [])] };
        if (!state.vid) state.vid = randomId();
      }
    } catch {}
    memory = state;
    return state;
  }

  function write(state) {
    memory = state;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    window.dispatchEvent(new CustomEvent('guest:updated', { detail: state }));
  }

  function update(fn) {
    const next = { ...read() };
    fn(next);
    write(next);
    return next;
  }

  const signedIn = () => typeof API !== 'undefined' && API.isLoggedIn();

  /** The traveller's type: the account's when signed in, otherwise the guest's. */
  function mbti() {
    const user = typeof Session !== 'undefined' ? Session.user : null;
    if (signedIn() && user) return user.mbti_type || '';
    return read().mbti;
  }

  async function setMbti(code, source) {
    if (signedIn()) {
      await API.updateMBTI(code);
      await Session.refresh();
    } else {
      update((s) => { s.mbti = code; s.mbti_source = source; });
    }
  }

  async function loadAccountChoices() {
    if (!signedIn()) { account = null; return {}; }
    try { account = (await API.listChoices()).data || {}; } catch { account = account || {}; }
    return account;
  }

  /** The option picked at slug's fork (account first when signed in). */
  function pick(slug) {
    if (signedIn() && account) return account[slug] || '';
    return read().choices[slug] || '';
  }

  async function choose(slug, key) {
    if (signedIn()) {
      account = { ...(account || {}), [slug]: key };
      await API.setChoice(slug, key);
    } else {
      update((s) => { s.choices = { ...s.choices, [slug]: key }; });
    }
  }

  function markOpened(slug) {
    if (read().opened.includes(slug)) return;
    update((s) => { s.opened = [...s.opened, slug].slice(-100); });
  }

  /** Merges pending guest picks into the account once per sign-in; safe to call repeatedly. */
  function mergeIntoAccount() {
    if (!signedIn() || merging) return merging;
    const s = read();
    const choices = s.choices || {};
    if (!s.mbti && !Object.keys(choices).length) return null;
    merging = API.mergeGuest({ mbti_type: s.mbti, choices })
      .then((res) => {
        account = (res.data && res.data.choices) || {};
        update((g) => { g.mbti = ''; g.mbti_source = ''; g.choices = {}; });
        return Session.refresh();
      })
      .catch(() => null)
      .finally(() => { merging = null; });
    return merging;
  }

  window.addEventListener('session:updated', (e) => {
    if (e.detail) mergeIntoAccount();
    else account = null;
  });

  // First load of this browser session counts as one arrival.
  try {
    if (!sessionStorage.getItem('arrived')) {
      sessionStorage.setItem('arrived', '1');
      setTimeout(() => API.track('arrive'), 0);
    }
  } catch {}

  return {
    get: () => read(),
    update,
    vid: () => read().vid,
    mbti,
    setMbti,
    pick,
    choose,
    loadAccountChoices,
    markOpened,
    mergeIntoAccount,
    choice: (slug) => pick(slug),
    setChoice: (slug, key) => choose(slug, key),
    clear() { write({ ...empty(), vid: read().vid }); },
  };
})();
