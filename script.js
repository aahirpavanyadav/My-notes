(() => {
'use strict';
const workspace = document.getElementById('workspace');
const titleInput = document.getElementById('note-title');
const imageInput = document.getElementById('imageInput');
const pdfInput = document.getElementById('pdfInput');
const saveState = document.getElementById('saveState');
const saveDropdown = document.getElementById('saveDropdown');
const STORAGE_KEY = 'my_notes_unified_v2';
let savedRange = null;
let saveTimer = null;
let dragItem = null;
let resizeState = null;
let lastSavedAt = 0;

function rememberSelection() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (workspace.contains(range.commonAncestorContainer) || range.commonAncestorContainer === workspace) {
    savedRange = range.cloneRange();
  }
}
document.addEventListener('selectionchange', rememberSelection);
workspace.addEventListener('keyup', rememberSelection);
workspace.addEventListener('mouseup', rememberSelection);
workspace.addEventListener('input', scheduleSave);
titleInput.addEventListener('input', scheduleSave);

function placeCaretAtEnd() {
  workspace.focus();
  const range = document.createRange();
  range.selectNodeContents(workspace);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  savedRange = range.cloneRange();
}
function restoreCaret() {
  workspace.focus();
  const sel = window.getSelection();
  if (savedRange && workspace.contains(savedRange.commonAncestorContainer)) {
    sel.removeAllRanges();
    sel.addRange(savedRange);
  } else if (!sel.rangeCount || !workspace.contains(sel.anchorNode)) {
    placeCaretAtEnd();
  }
}
function insertNodeAtCaret(node, addSpacing = true) {
  restoreCaret();
  let range = window.getSelection().getRangeAt(0);
  range.deleteContents();
  const after = document.createTextNode('\u00a0');
  range.insertNode(node);
  if (addSpacing) {
    node.parentNode.insertBefore(after, node.nextSibling);
  }
  range.setStartAfter(addSpacing ? after : node);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  savedRange = range.cloneRange();
  scheduleSave();
}
function safeFileName(name, fallback) {
  const clean = (name || fallback).replace(/[\\/:*?"<>|]+/g, '-').trim();
  return clean || fallback;
}
function setSaveStatus(text) {
  saveState.textContent = text;
}
function scheduleSave() {
  setSaveStatus('Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
function saveNow() {
  try {
    const payload = {title: titleInput.value, html: workspace.innerHTML, updatedAt: Date.now()};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    lastSavedAt = payload.updatedAt;
    setSaveStatus('Saved locally ✓');
    document.getElementById('storageInfo').textContent = 'Saved in this browser · ' + new Date(lastSavedAt).toLocaleTimeString();
  } catch (err) {
    setSaveStatus('Storage full');
    document.getElementById('storageInfo').textContent = 'Browser storage is full. Export an HTML backup and reduce large attachments.';
    console.error('Autosave failed:', err);
  }
}
function cleanRestoredHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html || '';
  template.content.querySelectorAll('script,iframe,object,embed,form,style,link,meta,base,video,audio,source').forEach(el => el.remove());
  template.content.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const val = attr.value.trim().toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || ((name === 'href' || name === 'src' || name === 'xlink:href') && val.startsWith('javascript:'))) {
        el.removeAttribute(attr.name);
      }
    });
    if (el.classList.contains('media-item')) {
      el.setAttribute('contenteditable', 'false');
      el.setAttribute('draggable', 'true');
      el.removeAttribute('data-wired');
    }
    if (el.classList.contains('pdf-inline')) {
      el.setAttribute('contenteditable', 'false');
      el.setAttribute('draggable', 'true');
      el.removeAttribute('data-wired');
    }
  });
  return template.innerHTML;
}
function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      titleInput.value = typeof data.title === 'string' ? data.title : 'Untitled Note';
      workspace.innerHTML = cleanRestoredHtml(data.html || '');
      wireExistingMedia();
      document.getElementById('storageInfo').textContent = 'Restored from this browser.';
    } else {
      // Migrate the original single-note save format when present.
      const oldTitle = localStorage.getItem('note_title');
      const oldText = localStorage.getItem('note_text');
      const oldMedia = localStorage.getItem('note_media');
      if (oldTitle !== null || oldText !== null || oldMedia !== null) {
        titleInput.value = oldTitle || 'Untitled Note';
        const textTemplate = document.createElement('template');
        textTemplate.innerHTML = cleanRestoredHtml(oldText || '');
        workspace.appendChild(textTemplate.content);
        const mediaTemplate = document.createElement('template');
        mediaTemplate.innerHTML = cleanRestoredHtml(oldMedia || '');
        // Bring old separate media into the same flow; retain size where possible.
        mediaTemplate.content.querySelectorAll('.img-wrap').forEach(wrap => {
          const img = wrap.querySelector('img');
          if (!img) return;
          const item = buildImageItem(img.src, img.alt, parseFloat(wrap.style.width) || 300);
          workspace.appendChild(item);
          workspace.appendChild(document.createTextNode(' '));
        });
        mediaTemplate.content.querySelectorAll('.pdf-chip').forEach(chip => {
          const item = buildPdfItem(chip.href, chip.download || chip.textContent.replace(/^📄\s*/, 'attached.pdf'));
          workspace.appendChild(item);
          workspace.appendChild(document.createTextNode(' '));
        });
        wireExistingMedia();
        saveNow();
      }
    }
  } catch (err) {
    console.error('Could not restore note:', err);
    setSaveStatus('Restore issue');
  }
}
function wireExistingMedia() {
  workspace.querySelectorAll('.media-item').forEach(wireImageItem);
  workspace.querySelectorAll('.pdf-inline').forEach(wirePdfItem);
}
function buildImageItem(src, alt, width) {
  const wrap = document.createElement('span');
  wrap.className = 'media-item';
  wrap.contentEditable = 'false';
  wrap.draggable = true;
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt || 'Inserted image';
  img.style.width = Math.max(40, Math.min(Number(width) || 320, 1600)) + 'px';
  img.style.height = 'auto';
  wrap.appendChild(img);
  const controls = document.createElement('span');
  controls.className = 'media-controls';
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'media-control delete'; del.title = 'Delete image'; del.textContent = '×';
  del.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); wrap.remove(); scheduleSave(); });
  controls.appendChild(del);
  wrap.appendChild(controls);
  const handle = document.createElement('span');
  handle.className = 'resize-handle';
  wrap.appendChild(handle);
  wireImageItem(wrap);
  return wrap;
}
function wireImageItem(wrap) {
  if (wrap.dataset.wired === '1') return;
  wrap.dataset.wired = '1';
  wrap.addEventListener('click', e => {
    if (e.target.closest('.media-controls') || e.target.closest('.resize-handle')) return;
    selectMedia(wrap);
  });
  const handle = wrap.querySelector('.resize-handle');
  if (handle) handle.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    const img = wrap.querySelector('img');
    const startX = e.clientX;
    const startW = img.getBoundingClientRect().width;
    resizeState = {wrap, img, startX, startW};
    handle.setPointerCapture?.(e.pointerId);
    const move = ev => {
      if (!resizeState || resizeState.wrap !== wrap) return;
      const max = Math.max(100, workspace.clientWidth - 30);
      const w = Math.max(40, Math.min(max, startW + ev.clientX - startX));
      img.style.width = w + 'px';
      img.style.height = 'auto';
    };
    const up = () => {
      if (resizeState && resizeState.wrap === wrap) { resizeState = null; scheduleSave(); }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  wrap.addEventListener('dragstart', e => {
    if (e.target.closest('.media-controls') || e.target.closest('.resize-handle')) { e.preventDefault(); return; }
    dragItem = wrap;
    e.dataTransfer.setData('text/plain', 'notes-media');
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => { if (dragItem) dragItem.style.opacity = '.45'; }, 0);
  });
  wrap.addEventListener('dragend', () => {
    wrap.style.opacity = '';
    dragItem = null;
    scheduleSave();
  });
}
function buildPdfItem(dataUrl, filename) {
  const wrap = document.createElement('span');
  wrap.className = 'pdf-inline';
  wrap.contentEditable = 'false';
  wrap.draggable = true;
  const icon = document.createElement('span'); icon.textContent = '📄'; icon.setAttribute('aria-hidden','true');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = filename || 'Attached PDF';
  link.title = 'Open attached PDF';
  link.addEventListener('click', e => {
    // A click opens the PDF; dragging the attachment still moves it in the note.
    if (dragItem) e.preventDefault();
  });
  wrap.append(icon, link);
  const controls = document.createElement('span');
  controls.className = 'media-controls';
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'media-control delete'; del.title = 'Remove PDF'; del.textContent = '×';
  del.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); wrap.remove(); scheduleSave(); });
  controls.appendChild(del); wrap.appendChild(controls);
  wirePdfItem(wrap);
  return wrap;
}
function wirePdfItem(wrap) {
  if (wrap.dataset.wired === '1') return;
  wrap.dataset.wired = '1';
  wrap.addEventListener('click', e => {
    if (e.target.closest('.media-controls')) return;
    selectMedia(wrap);
  });
  wrap.addEventListener('dragstart', e => {
    if (e.target.closest('.media-controls')) { e.preventDefault(); return; }
    dragItem = wrap;
    e.dataTransfer.setData('text/plain', 'notes-media');
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => { if (dragItem) dragItem.style.opacity = '.45'; }, 0);
  });
  wrap.addEventListener('dragend', () => {
    wrap.style.opacity = '';
    dragItem = null;
    scheduleSave();
  });
}
function selectMedia(item) {
  workspace.querySelectorAll('.media-item.selected,.pdf-inline.selected').forEach(el => el.classList.remove('selected'));
  item.classList.add('selected');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.media-item') && !e.target.closest('.pdf-inline')) {
    workspace.querySelectorAll('.media-item.selected,.pdf-inline.selected').forEach(el => el.classList.remove('selected'));
  }
});
workspace.addEventListener('dragover', e => {
  if (dragItem && workspace.contains(dragItem)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
});
workspace.addEventListener('drop', e => {
  if (!dragItem || !workspace.contains(dragItem)) return;
  e.preventDefault();
  const target = document.elementFromPoint(e.clientX, e.clientY);
  let range = null;
  if (target && workspace.contains(target)) {
    const sel = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (sel) range = sel;
  }
  const item = dragItem;
  item.style.opacity = '';
  if (range && !item.contains(range.startContainer)) {
    range.insertNode(item);
    const spacer = document.createTextNode('\u00a0');
    item.parentNode.insertBefore(spacer, item.nextSibling);
  } else if (target && target !== item && !item.contains(target)) {
    target.parentNode.insertBefore(item, target);
  }
  dragItem = null;
  scheduleSave();
});
document.querySelectorAll('[data-command]').forEach(btn => btn.addEventListener('mousedown', e => e.preventDefault()));
document.querySelectorAll('[data-command]').forEach(btn => btn.addEventListener('click', () => {
  restoreCaret();
  document.execCommand(btn.dataset.command, false, null);
  rememberSelection();
  scheduleSave();
}));
document.getElementById('blockStyle').addEventListener('change', e => {
  restoreCaret();
  document.execCommand('formatBlock', false, e.target.value);
  scheduleSave();
});
document.getElementById('linkBtn').addEventListener('click', () => {
  restoreCaret();
  const url = prompt('Enter the link URL (https://...)');
  if (!url) return;
  if (!/^(https?:\/\/|mailto:)/i.test(url)) { alert('Please use a valid https://, http://, or mailto: link.'); return; }
  document.execCommand('createLink', false, url);
  scheduleSave();
});
document.getElementById('undoBtn').addEventListener('click', () => { workspace.focus(); document.execCommand('undo'); scheduleSave(); });
document.getElementById('redoBtn').addEventListener('click', () => { workspace.focus(); document.execCommand('redo'); scheduleSave(); });
imageInput.addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { alert('This image is larger than 8 MB. Please resize it first to avoid filling browser storage.'); imageInput.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    const item = buildImageItem(reader.result, file.name, 360);
    insertNodeAtCaret(item);
  };
  reader.onerror = () => alert('Could not read this image.');
  reader.readAsDataURL(file);
  imageInput.value = '';
});
pdfInput.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { alert('This PDF is larger than 8 MB. Please compress it first to avoid filling browser storage.'); pdfInput.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => insertNodeAtCaret(buildPdfItem(reader.result, file.name));
  reader.onerror = () => alert('Could not read this PDF.');
  reader.readAsDataURL(file);
  pdfInput.value = '';
});
workspace.addEventListener('paste', e => {
  const items = [...(e.clipboardData?.items || [])];
  const image = items.find(item => item.type.startsWith('image/'));
  if (!image) return;
  const file = image.getAsFile();
  if (!file) return;
  e.preventDefault();
  const reader = new FileReader();
  reader.onload = () => insertNodeAtCaret(buildImageItem(reader.result, 'Pasted image', 360));
  reader.readAsDataURL(file);
});
document.getElementById('clearBtn').addEventListener('click', () => {
  if (!confirm('Clear all text, images, and PDFs in this note? This cannot be undone.')) return;
  workspace.replaceChildren();
  scheduleSave();
  placeCaretAtEnd();
});
document.getElementById('saveToggle').addEventListener('click', e => {
  e.stopPropagation();
  saveDropdown.classList.toggle('show');
});
document.addEventListener('click', e => {
  if (!e.target.closest('.save-menu')) saveDropdown.classList.remove('show');
});
function exportClone() {
  const clone = workspace.cloneNode(true);
  clone.querySelectorAll('.media-controls,.resize-handle').forEach(el => el.remove());
  clone.querySelectorAll('.media-item,.pdf-inline').forEach(el => {
    el.classList.remove('selected');
    el.style.opacity = '';
    el.style.outline = 'none';
  });
  clone.style.cssText = 'background:#fff;color:#222;font-family:Arial,sans-serif;font-size:12pt;line-height:1.6;overflow-wrap:anywhere;padding:0;min-height:0;border:0;box-shadow:none;white-space:normal';
  clone.querySelectorAll('img').forEach(img => { img.style.maxWidth = '100%'; img.style.height = 'auto'; });
  return clone;
}
document.getElementById('downloadHtmlBtn').addEventListener('click', () => {
  saveDropdown.classList.remove('show');
  const title = titleInput.value || 'Untitled Note';
  const clone = exportClone();
  const doc = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    escapeHtml(title) + '</title><style>body{font:16px/1.7 Arial,sans-serif;max-width:1000px;margin:32px auto;padding:0 20px;overflow-wrap:anywhere}img{max-width:100%;height:auto}.media-item,.pdf-inline{display:inline-block;vertical-align:middle;margin:5px 7px 5px 0}</style></head><body><h1>' +
    escapeHtml(title) + '</h1>' + clone.innerHTML + '</body></html>';
  downloadBlob(new Blob([doc], {type:'text/html;charset=utf-8'}), safeFileName(title,'note') + '.html');
});
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
document.getElementById('savePdfBtn').addEventListener('click', async () => {
  saveDropdown.classList.remove('show');
  if (!window.jspdf?.jsPDF || !window.html2canvas) { alert('PDF export libraries did not load. Check your internet connection and try again.'); return; }
  const title = titleInput.value || 'Untitled Note';
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;left:-10000px;top:0;width:760px;padding:36px;background:#fff;color:#222;font:16px/1.6 Arial,sans-serif;overflow-wrap:anywhere';
  const heading = document.createElement('h1'); heading.textContent = title; heading.style.cssText = 'font-size:26px;margin:0 0 24px';
  wrapper.append(heading, exportClone());
  document.body.appendChild(wrapper);
  try {
    await Promise.all([...wrapper.querySelectorAll('img')].map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve; })));
    const canvas = await html2canvas(wrapper, {scale:1.5, backgroundColor:'#ffffff', useCORS:true});
    const {jsPDF} = window.jspdf;
    const pdf = new jsPDF('p','pt','a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 34;
    const usableW = pageW - margin * 2;
    const scale = usableW / canvas.width;
    const sliceHeight = Math.floor((pageH - margin * 2) / scale);
    let y = 0, page = 0;
    while (y < canvas.height) {
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = Math.min(sliceHeight, canvas.height - y);
      slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', .92), 'JPEG', margin, margin, usableW, slice.height * scale);
      y += slice.height; page++;
    }
    pdf.save(safeFileName(title,'note') + '.pdf');
  } catch (err) {
    console.error(err); alert('PDF export failed. Try downloading the editable HTML backup instead.');
  } finally { wrapper.remove(); }
});
document.getElementById('saveWordBtn').addEventListener('click', async () => {
  saveDropdown.classList.remove('show');
  if (!window.docx || !window.saveAs) { alert('Word export libraries did not load. Check your internet connection and try again.'); return; }
  const {Document,Packer,Paragraph,TextRun,ImageRun,HeadingLevel}=window.docx;
  const title = titleInput.value || 'Untitled Note';
  const children = [new Paragraph({text:title,heading:HeadingLevel.HEADING_1})];
  async function addNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue.replace(/\u00a0/g,' ');
      if (text.trim()) children.push(new Paragraph(text.split('\n').filter(Boolean).join(' ')));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    if (el.matches('.media-controls,.resize-handle')) return;
    if (el.matches('.media-item')) {
      const img = el.querySelector('img');
      if (img && img.src.startsWith('data:image/')) {
        try {
          const res = await fetch(img.src); const bytes = new Uint8Array(await res.arrayBuffer());
          const width = Math.min(480, Math.max(40, Math.round(img.getBoundingClientRect().width || 320)));
          const ratio = (img.naturalHeight || 200) / (img.naturalWidth || 320);
          children.push(new Paragraph({children:[new ImageRun({data:bytes,transformation:{width,height:Math.max(25,Math.round(width*ratio))}})]}));
        } catch (e) { children.push(new Paragraph('[Image could not be exported]')); }
      }
      return;
    }
    if (el.matches('.pdf-inline')) {
      const link = el.querySelector('a');
      children.push(new Paragraph({children:[new TextRun({text:'📄 Attached PDF: ' + (link?.textContent || 'PDF'),italics:true})]}));
      return;
    }
    const tag = el.tagName;
    if (/^H[1-3]$/.test(tag)) {
      const text = el.innerText.trim();
      if (text) children.push(new Paragraph({text,heading:tag==='H1'?HeadingLevel.HEADING_1:tag==='H2'?HeadingLevel.HEADING_2:HeadingLevel.HEADING_3}));
      return;
    }
    if (tag === 'BR') { children.push(new Paragraph('')); return; }
    if (tag === 'LI') {
      const text = el.innerText.trim();
      if (text) children.push(new Paragraph({text,bullet:{indent:360}}));
      return;
    }
    if (tag === 'P' || tag === 'BLOCKQUOTE' || tag === 'DIV') {
      let text = '';
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) text += child.nodeValue;
        else if (child.nodeType === Node.ELEMENT_NODE && !child.matches('.media-item,.pdf-inline')) text += child.innerText || '';
      }
      text = text.replace(/\u00a0/g,' ').trim();
      if (text) children.push(new Paragraph(text));
      for (const child of el.children) if (child.matches('.media-item,.pdf-inline')) await addNode(child);
      return;
    }
    for (const child of el.childNodes) await addNode(child);
  }
  try {
    for (const node of workspace.childNodes) await addNode(node);
    const doc = new Document({sections:[{properties:{},children}]});
    const blob = await Packer.toBlob(doc);
    saveAs(blob,safeFileName(title,'note')+'.docx');
  } catch (err) {
    console.error(err); alert('Word export failed. Try downloading the editable HTML backup instead.');
  }
});
const themeToggle = document.getElementById('themeToggle');
function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeToggle.textContent = dark ? '☀️ Light' : '🌙 Dark';
  themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  themeToggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
}
let initialTheme = 'light';
try { initialTheme = localStorage.getItem('my_notes_theme') || 'light'; } catch (_) {}
applyTheme(initialTheme);
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('my_notes_theme', next); } catch (_) {}
});
restore();
})();
