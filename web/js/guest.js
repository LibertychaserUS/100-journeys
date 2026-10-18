/**
 * Guest state — what a visitor has chosen before (or without) signing in, in one
 * localStorage entry. The shape is part of the content contract (docs/content/SCHEMA.md):
 *
 *   { v: 1,
 *     mbti: 'INFP' | '',            // the type the visitor chose or arrived at with the guide
 *     mbti_source: 'self' | 'pet' | '',
 *     choices: { [slug]: optionKey }, // what they picked at each journey's fork
 *     composed: [ ...tickets ] }      // journeys pieced together in the compose game
 *
 * Storage can be missing or throw (private mode); every call degrades to an in-memory copy.
 */
var Guest = (() => {
  const KEY = 'guest_state';
  const empty = () => ({ v: 1, mbti: '', mbti_source: '', choices: {}, composed: [] });
  let memory = null;

  function read() {
    if (memory) return memory;
    let state = empty();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && raw.v === 1) state = { ...state, ...raw, choices: { ...(raw.choices || {}) }, composed: [...(raw.composed || [])] };
    } catch {}
    memory = state;
    return state;
  }

  function write(state) {
    memory = state;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    window.dispatchEvent(new CustomEvent('guest:updated', { detail: state }));
  }

  return {
    get: () => read(),
    update(fn) {
      const next = { ...read() };
      fn(next);
      write(next);
      return next;
    },
    choice: (slug) => read().choices[slug] || '',
    setChoice(slug, key) { return this.update((s) => { s.choices = { ...s.choices, [slug]: key }; }); },
    clear() { write(empty()); },
  };
})();
