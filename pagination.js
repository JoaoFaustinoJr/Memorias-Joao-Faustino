/* Paginação do leitor: preserva a ordem e continua blocos longos em novas folhas. */
window.paginateBook = async function () {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const book = document.querySelector('.book');
  const originals = [...book.querySelectorAll(':scope > .page')];
  const toolbar = document.querySelector('.toolbar');
  const height = Math.max(420, Math.min(980, window.innerHeight - (toolbar?.getBoundingClientRect().height || 60) - 28));
  document.documentElement.style.setProperty('--book-leaf-height', height + 'px');
  document.documentElement.classList.add('uniform-book','paged-reader');
  const oldBookmark = localStorage.getItem('memorias-bookmark');
  if (oldBookmark !== null && /^\d+$/.test(oldBookmark)) localStorage.setItem('memorias-bookmark', 'leaf-' + oldBookmark + '-1');
  originals.forEach((source, sourceIndex) => {
    const template = source.cloneNode(false);
    const title = (source.querySelector('.page-head h2,h2,h1,.running-head')?.textContent.trim() || 'Texto').replace(/\s*continuação$/i,'').trim();
    const nodes = [...source.childNodes];
    const audioTemplates = [...source.querySelectorAll("audio")].map(a=>a.cloneNode(true));
    let leaf = source, part = 1, wrappers = new Map();
    source.style.setProperty('display','block','important');
    source.replaceChildren();
    function identify() { leaf.dataset.pageTitle = title; leaf.dataset.pageSource = String(sourceIndex); leaf.dataset.pageKey = 'leaf-' + sourceIndex + '-' + part; }
    identify();
    // Capa e contracapa conservam a composição própria.
    if (source.matches('.cover,.back-cover')) { source.append(...nodes); source.style.removeProperty('display'); return; }
    leaf.classList.add('book-leaf');
    function clean() {
      for (const e of [...leaf.querySelectorAll(".leaf-fragment")].reverse()) if (!e.textContent.trim() && !e.querySelector("img,svg,audio,button")) e.remove();
    }
    function next() {
      clean();
      const newLeaf = template.cloneNode(false);
      newLeaf.removeAttribute('id'); newLeaf.style.setProperty('display','block','important'); newLeaf.classList.add('book-leaf','leaf-continuation');
      leaf.after(newLeaf); leaf = newLeaf; part++; wrappers = new Map(); identify();
      const head = document.createElement('div'); head.className = 'leaf-running-title';
      head.textContent = title + ' · continuação'; leaf.append(head);
    }
    function container(path) {
      let parent = leaf;
      for (const original of path) {
        if (!wrappers.has(original)) {
          const copy = original.cloneNode(false); copy.removeAttribute('id');
          copy.classList.add('leaf-fragment'); parent.append(copy); wrappers.set(original, copy);
        }
        parent = wrappers.get(original);
      }
      return parent;
    }
    function fits() {
      const bottom = leaf.getBoundingClientRect().bottom - parseFloat(getComputedStyle(leaf).paddingBottom);
      return leaf.scrollHeight <= leaf.clientHeight + 1 && [...leaf.querySelectorAll('*')].filter(e => !e.matches('audio,svg *,script,style')).every(e => {
        const style = getComputedStyle(e);
        return style.position === 'absolute' || style.position === 'fixed' || style.display === 'none' || e.getBoundingClientRect().bottom <= bottom + 1;
      });
    }
    function hasContent() { return leaf.textContent.replace(title + ' · continuação','').trim().length > 0 || !!leaf.querySelector('img,svg'); }
    function slice(node, start, end) {
      const clone = node.cloneNode(false); if (start) clone.removeAttribute('id');
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), texts = [];
      let t; while ((t = walker.nextNode())) texts.push(t);
      const range = document.createRange(); let offset = 0, begun = false;
      for (const text of texts) {
        const len = text.length;
        if (!begun && start <= offset + len) { range.setStart(text, Math.max(0, start-offset)); begun = true; }
        if (begun && end <= offset + len) { range.setEnd(text, Math.max(0,end-offset)); clone.append(range.cloneContents()); break; }
        offset += len;
      }
      return clone;
    }
    function textPieces(node, path) {
      const text = node.textContent, boundaries = [0];
      for (const m of text.matchAll(/\s+/g)) boundaries.push(m.index + m[0].length);
      boundaries.push(text.length); let start = 0;
      while (start < text.length) {
        let lo = boundaries.findIndex(n => n > start), hi = boundaries.length - 1, best = -1;
        while (lo <= hi) {
          const mid = Math.floor((lo+hi)/2), trial = slice(node,start,boundaries[mid]);
          container(path).append(trial); const okay = fits(); trial.remove();
          if (okay) {best = mid; lo = mid+1;} else hi = mid-1;
        }
        if (best < 0) { if (hasContent()) {next(); continue;} best = boundaries.findIndex(n => n > start); }
        const end = boundaries[best]; container(path).append(slice(node,start,end)); start = end;
        if (start < text.length) next();
      }
    }
    function place(node, path = []) {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) return;
      let copy = node.cloneNode(true), parent = container(path);
      parent.append(copy); if (fits()) return; copy.remove();
      const atomic = node.nodeType !== Node.ELEMENT_NODE || node.matches('figure,img,svg,audio,header,.soundscape-cue,.page-head');
      if (atomic && hasContent()) {next(); parent = container(path); copy = node.cloneNode(true); parent.append(copy); if (fits()) return; copy.remove();}
      if (node.nodeType === Node.ELEMENT_NODE && node.matches('p,li,blockquote,figcaption') && node.textContent.trim()) {textPieces(node,path); return;}
      if (node.childNodes.length && !node.matches('svg,img,audio')) {
        for (const child of node.childNodes) place(child,[...path,node]);
      } else { container(path).append(node.cloneNode(true)); }
    }
    for (const node of nodes) place(node);
    clean();
    if (audioTemplates.length) for (const page of book.querySelectorAll(`[data-page-source="${sourceIndex}"]`)) {
      for (const audio of audioTemplates) if (!page.querySelector(`audio[data-bird="${audio.dataset.bird}"]`)) page.append(audio.cloneNode(true));
    }
  });
  [...book.querySelectorAll(':scope > .page')].forEach((page,i)=>{page.style.removeProperty('display');page.dataset.folio=String(i+1)});
};
