/**
 * EventBus — Lightweight frontend pub/sub
 */
const EventBus = (() => {
  const listeners = {};

  function on(event, handler) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(handler);
    return () => off(event, handler);
  }

  function off(event, handler) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter((h) => h !== handler);
  }

  function emit(event, data) {
    if (!listeners[event]) return;
    listeners[event].forEach((h) => {
      try { h(data); } catch (e) { console.error('EventBus error:', e); }
    });
  }

  return { on, off, emit };
})();
