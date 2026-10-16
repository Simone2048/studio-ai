const MODEL = 'gemini-3.1-flash-lite';
const $ = (selector) => document.querySelector(selector);
const els = {
  text: $('#source-text'), files: $('#file-input'), fileList: $('#file-list'), drop: $('#drop-zone'),
  count: $('#char-count'), status: $('#status'), generate: $('#generate-btn'), label: $('#generate-label'),
  result: $('#result-section'), resultContent: $('#result-content'), resultTitle: $('#result-title'),
  settings: $('#settings-dialog'), apiKey: $('#api-key'), settingsStatus: $('#settings-status'),
  custom: $('#custom-option'), countOption: $('#count-option'), languageOption: $('#language-option'),
};
let selectedFiles = [];
let currentMode = 'flashcards';
let resultData = null;
let installPrompt = null;

function getKey() { return localStorage.getItem('studioai-gemini-key') || sessionStorage.getItem('studioai-gemini-key') || ''; }
function setStatus(message, type = '') { els.status.textContent = message; els.status.className = `status ${type}`; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function updateCount() { els.count.textContent = `${els.text.value.length.toLocaleString('it-IT')} caratteri`; }
function renderFiles() {
  els.fileList.innerHTML = selectedFiles.map((file, index) => `<span class="file-chip">${escapeHtml(file.name)} <button type="button" data-remove="${index}" aria-label="Rimuovi ${escapeHtml(file.name)}">×</button></span>`).join('');
}
function addFiles(files) {
  for (const file of files) {
    const allowed = file.type.startsWith('image/') || file.type.startsWith('audio/') || file.type === 'application/pdf' || /\.(txt|md|csv|json)$/i.test(file.name);
    if (!allowed) { setStatus(`Formato non supportato: ${file.name}`); continue; }
    if (file.size > 20 * 1024 * 1024) { setStatus(`${file.name} supera il limite di 20 MB.`); continue; }
    if (!selectedFiles.some((existing) => existing.name === file.name && existing.size === file.size)) selectedFiles.push(file);
  }
  renderFiles();
}
function updateMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-card').forEach((card) => card.classList.toggle('selected', card.dataset.mode === mode));
  els.countOption.hidden = mode !== 'flashcards';
  els.languageOption.hidden = mode === 'flashcards';
  els.custom.hidden = mode !== 'custom';
  els.label.textContent = ({flashcards:'Crea le mie flashcard',outline:'Crea il mio schema',summary:'Crea il mio riassunto',custom:'Crea il mio testo'})[mode];
}
function makePrompt(source) {
  const lang = $('#language').value;
  const base = `Lavora esclusivamente sul materiale fornito. Non inventare fatti; se un dato manca, dichiaralo. Scrivi in ${lang}. Usa un linguaggio chiaro e ben organizzato.`;
  const task = {
    flashcards: `Crea esattamente ${$('#card-count').value} flashcard. Rispondi con JSON valido e nessun testo esterno: {"flashcards":[{"question":"...","answer":"..."}]}. Ogni carta verifica un concetto importante, con risposta concisa.`,
    outline: 'Crea uno schema gerarchico di studio, con titolo, sezioni, concetti chiave e relazioni tra le idee. Usa Markdown leggibile, punti elenco e livelli di rientro.',
    summary: 'Scrivi un riassunto accurato e ben strutturato: titolo, idea centrale, passaggi o concetti principali e conclusione. Adatta la lunghezza al materiale senza perdere informazioni importanti.',
    custom: `Crea il contenuto richiesto dall’utente: ${$('#custom-prompt').value.trim() || 'una spiegazione didattica ben strutturata'}. Segui formato e tono indicati; mantieni accuratezza e chiarezza.`,
  };
  return `${base}\n\n${task[currentMode]}\n\nMATERIALE DI STUDIO:\n${source}`;
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Impossibile leggere ${file.name}.`));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
}
async function collectSource() {
  let text = els.text.value.trim();
  const media = [];
  for (const file of selectedFiles) {
    if (/\.(txt|md|csv|json)$/i.test(file.name) || file.type.startsWith('text/')) {
      text += `\n\n--- ${file.name} ---\n${await file.text()}`;
    } else {
      media.push({ inline_data: { mime_type: file.type || 'application/octet-stream', data: await fileToBase64(file) } });
    }
  }
  if (!text && media.length) text = 'Analizza il materiale allegato. Se contiene audio, trascrivilo integralmente prima di elaborarlo. Se contiene appunti o documenti, leggili e usali come materiale di studio.';
  if (text.length < 30 && media.length === 0) throw new Error('Aggiungi almeno 30 caratteri di appunti o un file da analizzare.');
  return { text: makePrompt(text || 'Esamina il file fornito e basa la risposta solo sul suo contenuto.'), media };
}
function extractResponse(payload) {
  if (payload.error) throw new Error(payload.error.message || 'Gemini non ha potuto elaborare la richiesta.');
  const candidate = payload.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) throw new Error('Gemini non ha restituito testo. Riprova con un file o appunti diversi.');
  return text;
}
async function callGemini(key, prompt, media) {
  const parts = [{ text: prompt }, ...media];
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: currentMode === 'flashcards' ? { responseMimeType: 'application/json', maxOutputTokens: 8192 } : { maxOutputTokens: 8192 } }),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('Risposta non valida dal servizio Gemini.'); }
  if (!response.ok) {
    const msg = data.error?.message || `Richiesta non riuscita (${response.status}).`;
    if (response.status === 400 || response.status === 403) throw new Error(`${msg} Controlla la chiave API e i tipi di file supportati.`);
    if (response.status === 429) throw new Error('Limite di richieste Gemini raggiunto. Attendi e riprova.');
    throw new Error(msg);
  }
  return extractResponse(data);
}
function parseCards(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) { try { parsed = JSON.parse(match[0]); } catch {} }
  }
  const cards = parsed?.flashcards;
  if (!Array.isArray(cards)) throw new Error('Le flashcard ricevute non sono nel formato atteso. Riprova.');
  const clean = cards.filter((c) => typeof c.question === 'string' && c.question.trim() && typeof c.answer === 'string' && c.answer.trim());
  if (!clean.length) throw new Error('Non sono state create flashcard valide.');
  return clean;
}
function markdownToHtml(markdown) {
  let html = escapeHtml(markdown);
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/(?:^\s*[-*] .+(?:\n|$))+/gm, (block) => `<ul>${block.trim().split('\n').map((line) => `<li>${line.replace(/^\s*[-*] /, '')}</li>`).join('')}</ul>`);
  html = html.replace(/(?:^\s*\d+\. .+(?:\n|$))+/gm, (block) => `<ol>${block.trim().split('\n').map((line) => `<li>${line.replace(/^\s*\d+\. /, '')}</li>`).join('')}</ol>`);
  html = html.split(/\n{2,}/).map((part) => /^(<h[23]>|<ul>|<ol>|<blockquote>)/.test(part.trim()) ? part : `<p>${part.replace(/\n/g, '<br>')}</p>`).join('');
  return html;
}
function renderResult() {
  els.result.hidden = false;
  els.resultTitle.textContent = ({flashcards:'Pronto per studiare',outline:'La mappa delle idee',summary:'Il succo della lezione',custom:'Il tuo testo su misura'})[currentMode];
  if (currentMode === 'flashcards') {
    els.resultContent.innerHTML = `<div class="result-text">${resultData.map((card, i) => `<details class="flashcard"><summary><span class="step-label">${String(i + 1).padStart(2, '0')}</span> &nbsp;${escapeHtml(card.question)}</summary><div class="flashcard-answer">${escapeHtml(card.answer).replace(/\n/g, '<br>')}</div></details>`).join('')}</div>`;
  } else {
    els.resultContent.innerHTML = `<article class="result-text">${markdownToHtml(resultData)}</article>`;
  }
  els.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function generate() {
  if (!getKey()) { els.settings.showModal(); els.settingsStatus.textContent = 'Aggiungi la tua chiave API per continuare.'; return; }
  els.generate.disabled = true; els.label.textContent = 'Sto preparando il materiale…'; setStatus('Gemini sta leggendo i tuoi appunti.');
  try {
    const source = await collectSource();
    const text = await callGemini(getKey(), source.text, source.media);
    resultData = currentMode === 'flashcards' ? parseCards(text) : text;
    renderResult(); setStatus('Ecco il tuo materiale, pronto da esplorare.', 'success');
  } catch (error) { setStatus(error.message || 'Si è verificato un errore. Riprova.'); }
  finally { els.generate.disabled = false; els.label.textContent = ({flashcards:'Crea le mie flashcard',outline:'Crea il mio schema',summary:'Crea il mio riassunto',custom:'Crea il mio testo'})[currentMode]; }
}
function downloadResult() {
  if (!resultData) return;
  const content = currentMode === 'flashcards' ? resultData.map((c, i) => `${i + 1}. ${c.question}\n${c.answer}`).join('\n\n') : resultData;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `studio-ai-${currentMode}.md`; a.click(); URL.revokeObjectURL(a.href);
}

$('#upload-btn').addEventListener('click', () => els.files.click());
els.files.addEventListener('change', (event) => { addFiles(event.target.files); event.target.value = ''; });
els.fileList.addEventListener('click', (event) => { const button = event.target.closest('[data-remove]'); if (button) { selectedFiles.splice(Number(button.dataset.remove), 1); renderFiles(); } });
['dragenter','dragover'].forEach((type) => els.drop.addEventListener(type, (event) => { event.preventDefault(); els.drop.classList.add('dragover'); }));
['dragleave','drop'].forEach((type) => els.drop.addEventListener(type, (event) => { event.preventDefault(); els.drop.classList.remove('dragover'); }));
els.drop.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
els.text.addEventListener('input', updateCount);
$('#clear-btn').addEventListener('click', () => { els.text.value = ''; selectedFiles = []; renderFiles(); updateCount(); setStatus(''); });
document.querySelectorAll('.mode-card').forEach((card) => card.addEventListener('click', () => updateMode(card.dataset.mode)));
els.generate.addEventListener('click', generate);
$('#settings-btn').addEventListener('click', () => { els.apiKey.value = getKey(); els.settings.showModal(); });
$('#save-key-btn').addEventListener('click', () => {
  const key = els.apiKey.value.trim();
  if (!key) { els.settingsStatus.textContent = 'Inserisci una chiave API valida.'; return; }
  localStorage.removeItem('studioai-gemini-key'); sessionStorage.removeItem('studioai-gemini-key');
  if ($('#remember-key').checked) localStorage.setItem('studioai-gemini-key', key); else sessionStorage.setItem('studioai-gemini-key', key);
  els.settings.close(); els.settingsStatus.textContent = ''; setStatus('Gemini è collegato. Puoi iniziare.', 'success');
});
$('#copy-btn').addEventListener('click', async () => {
  if (!resultData) return;
  const text = currentMode === 'flashcards' ? resultData.map((c) => `Q: ${c.question}\nA: ${c.answer}`).join('\n\n') : resultData;
  try { await navigator.clipboard.writeText(text); $('#copy-btn').textContent = 'Copiato ✓'; setTimeout(() => { $('#copy-btn').textContent = 'Copia'; }, 1800); } catch { setStatus('Non riesco a copiare: il browser non ha dato accesso agli appunti.'); }
});
$('#download-btn').addEventListener('click', downloadResult);
window.addEventListener('online', () => { $('#offline-badge').hidden = true; });
window.addEventListener('offline', () => { $('#offline-badge').hidden = false; });
window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installPrompt = event; $('#install-btn').hidden = false; });
$('#install-btn').addEventListener('click', async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $('#install-btn').hidden = true; });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
if (!getKey()) setTimeout(() => { els.settings.showModal(); }, 450);
updateCount(); updateMode('flashcards'); if (!navigator.onLine) $('#offline-badge').hidden = false;
