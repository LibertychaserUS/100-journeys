// Finds text that a reader would see as broken: words split across lines (or hyphenated), text
// drawn on top of other text, and columns squeezed to a word or two per line. Runs in the page;
// returns short descriptions.

/** Elements whose text is meant to sit behind other text (outline art, watermarks). */
const DECORATIVE = ['.scene__art', '.rubbing__texture', '.home-hero__particles'];

async function textProblems(page) {
  return page.evaluate((decorative) => {
    const problems = [];
    const visible = (el) => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
        if (e.classList.contains('sr-only') || e.hasAttribute('inert')) return false;
        // the body of a closed <details> is not drawn
        if (e.parentElement && e.parentElement.tagName === 'DETAILS' && !e.parentElement.open && e.tagName !== 'SUMMARY') return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };
    const label = (el) => {
      const cls = [...el.classList].slice(0, 2).join('.');
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`;
    };
    // Fixed and sticky bars float over the page on purpose; text is only compared within one layer.
    const layerOf = (el) => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const pos = getComputedStyle(e).position;
        if (pos === 'fixed' || pos === 'sticky') return e;
      }
      return null;
    };
    const inView = (r) => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    // What of a text box is actually drawn: cut to every scrolling or clipping ancestor, and to the
    // em box (line boxes from the font's metrics reach well above and below the letters).
    const drawn = (r, el, fontSize) => {
      const h = Math.min(r.height, fontSize * 0.92);
      let box = { left: r.left, right: r.right, top: r.top + (r.height - h) / 2, bottom: r.top + (r.height + h) / 2 };
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
          const c = e.getBoundingClientRect();
          box = { left: Math.max(box.left, c.left), right: Math.min(box.right, c.right), top: Math.max(box.top, c.top), bottom: Math.min(box.bottom, c.bottom) };
        }
      }
      return box.right - box.left > 1 && box.bottom - box.top > 1 ? { ...box, width: box.right - box.left, height: box.bottom - box.top } : null;
    };
    const boxes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.data;
      const el = node.parentElement;
      if (!el || !text.trim() || !visible(el) || el.closest(decorative.join(','))) continue;
      const cs = getComputedStyle(el);
      if (cs.writingMode.startsWith('vertical')) continue;
      // 1. A word split over two lines: its glyph boxes sit on different lines
      const re = /[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’-]*[A-Za-zÀ-ɏ]/g;
      let m;
      const tops = [];
      while ((m = re.exec(text))) {
        const range = document.createRange();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && inView(r));
        const rows = new Set(rects.map((r) => Math.round(r.top / 4)));
        if (rows.size > 1 && !m[0].includes('-')) problems.push(`broken word "${m[0]}" in ${label(el)}`);
        if (rects.length) tops.push(rects[0].top);
      }
      // 3. A column squeezed to a word or two per line (lines told apart by the line height, so a
      // slightly rotated label still reads as one line)
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      const lines = tops.sort((x, y) => x - y).filter((t, i, all) => i === 0 || t - all[i - 1] > lh * 0.6).length;
      if (tops.length >= 4 && lines >= 3 && tops.length / lines < 1.6) problems.push(`squeezed text "${text.trim().slice(0, 24)}" in ${label(el)} (${tops.length} words on ${lines} lines)`);
      // collect line boxes of this text for the overlap check
      const range = document.createRange();
      range.selectNodeContents(node);
      const layer = layerOf(el);
      const fontSize = parseFloat(cs.fontSize);
      for (const raw of range.getClientRects()) {
        const r = inView(raw) && drawn(raw, el, fontSize);
        if (r) boxes.push({ r, el, layer, text: text.trim().slice(0, 24) });
      }
    }
    // 2. Text over other text (different elements whose line boxes intersect noticeably)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.layer !== b.layer || a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w <= 2 || h <= 2) continue;
        const area = w * h, small = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
        if (area > 0.2 * small) problems.push(`"${a.text}" (${label(a.el)}) overlaps "${b.text}" (${label(b.el)})`);
      }
    }
    return [...new Set(problems)];
  }, DECORATIVE);
}

module.exports = { textProblems };
