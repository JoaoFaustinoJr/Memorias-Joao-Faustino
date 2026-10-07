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
    const startedNotes=new Set(), paragraphKeys=new WeakMap();let paragraphSequence=0;
    function paragraphKey(node){if(node.dataset?.paragraphKey)return node.dataset.paragraphKey;if(!paragraphKeys.has(node))paragraphKeys.set(node,String(++paragraphSequence));return paragraphKeys.get(node);}
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
          copy.classList.add('leaf-fragment');
          if(part>1 && startedNotes.has(original) && original.matches('.inline-anchor,.nature-anchor')){const label=document.createElement('span');label.className='anchor-continuation-label';label.textContent=(original.querySelector(':scope > span')?.textContent||'Nota')+' · continuação';copy.append(label)}
          parent.append(copy); wrappers.set(original, copy);
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
    function hasContent() {
      const clone=leaf.cloneNode(true);
      clone.querySelectorAll('.leaf-running-title,.anchor-continuation-label,.engraving-line,audio').forEach(e=>e.remove());
      return clone.textContent.trim().length > 0 || !!clone.querySelector('img,svg');
    }
    function slice(node, start, end) {
      const clone = node.cloneNode(false);if(node.matches('p'))clone.dataset.paragraphKey=paragraphKey(node); if (start) {clone.removeAttribute('id');clone.classList.add('paragraph-carry')}
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
        let end = boundaries[best];
        if(end < text.length && node.matches('p')) {
          const trial=slice(node,start,end);container(path).append(trial);
          const line=parseFloat(getComputedStyle(trial).lineHeight)||24;
          const lines=Math.max(1,trial.getBoundingClientRect().height/line);trial.remove();
          if(lines<3 && hasContent()){next();continue;}
          const charsPerLine=(end-start)/lines;
          // Deixar pelo menos duas linhas para a continuação do parágrafo.
          while(best>0 && text.length-end<charsPerLine*2.2 && boundaries[best-1]>start+charsPerLine*3){end=boundaries[--best];}
          const sentences=[...text.slice(start,end).matchAll(/[.!?][”"']?\s+/g)];
          const last=sentences.at(-1);
          if(last){const natural=start+last.index+last[0].length;if(natural>start+charsPerLine*3 && end-natural<charsPerLine*2)end=natural;}
        }
        container(path).append(slice(node,start,end)); start = end;
        if (start < text.length) next();
      }
    }
    function place(node, path = []) {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) return;
      // Ornamentação de fechamento nunca cria uma folha sozinha.
      if(node.nodeType===Node.ELEMENT_NODE && node.matches('.engraving-line,.engraving,.source-sign')) {
        const copy=node.cloneNode(true);container(path).append(copy);
        if(!fits() && !node.matches('.source-sign')) copy.remove();
        else if(!fits()){copy.remove();textPieces(node,path);}
        return;
      }
      // Rótulos e subtítulos precisam levar ao menos o início do bloco seguinte.
      if(node.nodeType===Node.ELEMENT_NODE && node.matches('span,b,h2,h3,h4,.running-head')) {
        const following=node.nextElementSibling;
        if(following && hasContent()) {
          const probe=node.cloneNode(true), nextProbe=following.cloneNode(true);
          if(nextProbe.textContent.length>150 && nextProbe.matches('p')) nextProbe.textContent=nextProbe.textContent.slice(0,150);
          container(path).append(probe,nextProbe);const okay=fits();probe.remove();nextProbe.remove();
          if(!okay)next();
        }
      }
      let copy = node.cloneNode(true), parent = container(path);
      if(node.nodeType===Node.ELEMENT_NODE && node.matches('p'))copy.dataset.paragraphKey=paragraphKey(node);
      parent.append(copy); if (fits()) {if(node.nodeType===Node.ELEMENT_NODE && node.matches('span') && node.parentElement?.matches('.inline-anchor,.nature-anchor'))startedNotes.add(node.parentElement);return;} copy.remove();
      const atomic = node.nodeType !== Node.ELEMENT_NODE || node.matches('figure,img,svg,audio,header,.soundscape-cue,.page-head,.inline-anchor,.nature-anchor,.era-strip,.context-document-grid');
      if (atomic && hasContent()) {next(); parent = container(path); copy = node.cloneNode(true); parent.append(copy); if (fits()) return; copy.remove();}
      if (node.nodeType === Node.ELEMENT_NODE && node.matches('p,li,blockquote,figcaption') && node.textContent.trim()) {textPieces(node,path); return;}
      if (node.childNodes.length && !node.matches('svg,img,audio')) {
        for (const child of node.childNodes) place(child,[...path,node]);
      } else { container(path).append(node.cloneNode(true)); }
    }
    for (const node of nodes) place(node);
    clean();
    // Redistribuir o fim entre as duas últimas folhas, sem alterar a sequência.
    const group=[...book.querySelectorAll(`[data-page-source="${sourceIndex}"]`)];
    if(group.length>1) {
      const tail=group.at(-1), previous=group.at(-2);
      const words=page=>{const c=page.cloneNode(true);c.querySelectorAll('.leaf-running-title,.anchor-continuation-label,audio,.engraving-line').forEach(e=>e.remove());return c.textContent.trim().split(/\s+/).filter(Boolean).length};
      if(words(tail)<45) {
        const tailArticle=tail.querySelector('article'), prevArticle=previous.querySelector('article');
        if(tailArticle && prevArticle) {
          for(let i=0;i<4 && words(tail)<40;i++) {
            const candidate=prevArticle.lastElementChild;
            if(!candidate || !candidate.matches('p') || candidate.classList.contains('source-sign'))break;
            const first=tailArticle.firstChild, marker=candidate.nextSibling;
            const wasCarry=candidate.classList.contains('paragraph-carry');
            candidate.classList.add('paragraph-carry');tailArticle.insertBefore(candidate,first);
            if(fits() && words(previous)>=25)continue;
            prevArticle.insertBefore(candidate,marker);if(!wasCarry)candidate.classList.remove('paragraph-carry');
            // Um parágrafo extenso pode ceder suas últimas linhas à folha final.
            if(prevArticle.classList.contains('verse'))break;
            const text=candidate.textContent, matches=[...text.matchAll(/\S+\s*/g)];
            const take=Math.min(45,Math.max(0,matches.length-30));
            if(take<8)break;
            const cut=matches[matches.length-take].index;
            const ending=slice(candidate,cut,text.length), beginning=slice(candidate,0,cut);
            candidate.replaceWith(beginning);tailArticle.insertBefore(ending,first);
            if(!fits()){ending.remove();beginning.replaceWith(candidate);break;}
          }
        }
      }
      // Remover uma continuação gerada só para decoração ou áudio.
      if(!hasContent()){tail.remove();leaf=previous;}
      // Uma continuação com apenas fonte/legenda curta não merece uma folha inteira.
      // Move a nota para a folha anterior quando houver espaço; caso contrário,
      // mantém a continuação sem inflar artificialmente a página.
      else if(words(tail)<24 && !tail.querySelector('img,svg,figure,.page-head')) {
        const tailItems=[...tail.children].filter(e=>!e.matches('.leaf-running-title,audio,.leaf-folio'));
        const moved=[];
        for(const item of tailItems){const clone=item.cloneNode(true);previous.append(clone);moved.push(clone);}
        const prevFits=previous.scrollHeight<=previous.clientHeight+2;
        if(prevFits){tail.remove();leaf=previous;}
        else moved.forEach(e=>e.remove());
      }
    }
    // Reconectar partes do mesmo parágrafo após a redistribuição.
    for(const page of book.querySelectorAll(`[data-page-source="${sourceIndex}"]`)) {
      for(const paragraph of [...page.querySelectorAll('p[data-paragraph-key]')]) {
        const next=paragraph.nextElementSibling;
        if(next?.matches('p') && next.dataset.paragraphKey===paragraph.dataset.paragraphKey){paragraph.append(...next.childNodes);next.remove();}
      }
    }
    // Um respiro visual contextual nas páginas curtas, sem ampliar fotografias.
    for(const page of book.querySelectorAll(`[data-page-source="${sourceIndex}"]`)) {
      if(!page.matches('.prose-page') || page.querySelector('img,svg,.engraving,.roots-illustration'))continue;
      const last=[...page.children].at(-1);
      const free=page.getBoundingClientRect().bottom-parseFloat(getComputedStyle(page).paddingBottom)-(last?.getBoundingClientRect().bottom||0);
      if(free<150)continue;
      const text=page.textContent;
      const motif=/rio|ribeir|lagoa|água/i.test(text)?'rio':/tropa|mula|cargueiro|tropeir/i.test(text)?'tropa':/serra|Mantiqueira|colina/i.test(text)?'serra':/passar|saracura|coruja/i.test(text)?'passaros':null;
      const closing=document.createElement('div');closing.className='editorial-close';
      if(motif){const photos={"serra": ["https://upload.wikimedia.org/wikipedia/commons/d/d5/Serra_da_mantiqueira.jpg", "Mantiqueira e Vale do Paraíba · fotografia de contexto, 2009 · Schermann · domínio público", "https://commons.wikimedia.org/wiki/File:Serra_da_mantiqueira.jpg"], "raizes": ["https://upload.wikimedia.org/wikipedia/commons/f/fe/%C3%81rvore_e_suas_grandes_ra%C3%ADzes.jpg", "Árvore e raízes · fotografia de contexto · Ramon Hoffmann · CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:Árvore_e_suas_grandes_raízes.jpg"], "cafe": ["https://upload.wikimedia.org/wikipedia/commons/1/19/Coffee_arabica_plant.jpg", "Cafeeiro · fotografia de contexto · Ashokkumar para · CC BY-SA 3.0", "https://commons.wikimedia.org/wiki/File:Coffee_arabica_plant.jpg"], "galo": ["https://upload.wikimedia.org/wikipedia/commons/4/45/Galo_no_quintal.jpg", "Galo no quintal · fotografia de contexto · Jonathan Wilkins · CC BY-SA 3.0", "https://commons.wikimedia.org/wiki/File:Galo_no_quintal.jpg"], "passaros": ["https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a3/BEM-TE-VI_%28Pitangus_sulphuratus%29.jpg/330px-BEM-TE-VI_%28Pitangus_sulphuratus%29.jpg", "Bem-te-vi · Curitiba, 2014 · Ivelise Hey · CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:BEM-TE-VI_(Pitangus_sulphuratus).jpg"], "rio": ["./assets/fotos/cachoeira-usina-natercia.jpg", "Cachoeira da Usina · paisagem atual de Natércia e Conceição das Pedras · JCRCAMARGO · CC BY-SA 4.0", "https://commons.wikimedia.org/wiki/File:CACHOEIRA_USINA.jpg"], "tropa": ["./assets/fotos/tropeiros-ponta-grossa-c1900.jpg", "Tropeiros em Ponta Grossa · cerca de 1900 · contexto histórico; não é a comitiva familiar", "./assets/fotos/tropeiros-ponta-grossa-c1900.jpg"]};const [src,caption,href]=photos[motif];const figure=document.createElement('figure');figure.className='real-context-photo';const a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener';const image=document.createElement('img');image.src=src;image.alt=caption;const credit=document.createElement('figcaption');credit.textContent=caption;a.append(image);figure.append(a,credit);closing.append(figure);}
      else closing.classList.add('editorial-close-rule');
      page.append(closing);if(page.scrollHeight>page.clientHeight+1)closing.remove();
    }
    if (audioTemplates.length) for (const page of book.querySelectorAll(`[data-page-source="${sourceIndex}"]`)) {
      for (const audio of audioTemplates) if (!page.querySelector(`audio[data-bird="${audio.dataset.bird}"]`)) page.append(audio.cloneNode(true));
    }
  });
  // v3.59 — evitar folhas de continuação com apenas fonte/nota curta.
  // Se a folha tiver somente uma nota final, tenta devolvê-la à folha anterior;
  // se não couber, mantém a nota acompanhada por um fecho editorial discreto.
  {
    const leaves=[...book.querySelectorAll(':scope > .book-leaf')];
    const wordCount=page=>{const c=page.cloneNode(true);c.querySelectorAll('.leaf-running-title,.leaf-folio,audio,.engraving-line').forEach(e=>e.remove());return c.textContent.trim().split(/\s+/).filter(Boolean).length};
    const pageFits=page=>page.scrollHeight<=page.clientHeight+2;
    for(let n=1;n<leaves.length;n++){
      const page=leaves[n], prev=leaves[n-1];
      const wc=wordCount(page);
      const substantiveVisual=page.querySelector('img:not([hidden]),svg:not(.engraving-line),figure:not(.anchor-real-thumb)');
      if(page.id || page.matches('.part-page') || wc>58 || substantiveVisual || page.querySelector('.page-head')) continue;
      const body=page.querySelector('article,.leaf-fragment,.archival-find,.document-anchor') || page;
      const prevBody=prev.querySelector('article,.leaf-fragment,.archival-find,.document-anchor') || prev;
      if(!body||!prevBody) continue;
      const movable=[...body.children].filter(e=>!e.matches('.leaf-running-title,.anchor-continuation-label,.editorial-close'));
      if(!movable.length) continue;
      const moved=[];
      for(const el of movable){const clone=el.cloneNode(true);prevBody.append(clone);moved.push(clone);}
      if(pageFits(prev)){
        movable.forEach(e=>e.remove());
        page.remove();
      }else{
        moved.forEach(e=>e.remove());
        // Uma folha curta deve parecer intencional, não um erro de paginação.
        page.classList.add('short-continuation');
        if(wc<26 && !page.querySelector('.editorial-close-rule')){const rule=document.createElement('div');rule.className='editorial-close editorial-close-rule';body.append(rule);}
      }
    }
  }
  [...book.querySelectorAll(':scope > .page')].forEach((page,i)=>{page.style.removeProperty('display');page.dataset.folio=String(i+1);if(page.classList.contains('book-leaf')){const folio=document.createElement('span');folio.className='leaf-folio';folio.setAttribute('aria-hidden','true');folio.textContent=String(i+1);page.append(folio)}});
};

