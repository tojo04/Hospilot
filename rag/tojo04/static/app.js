const form = document.querySelector('#ask-form');
const questionInput = document.querySelector('#question');
const questionCount = document.querySelector('#question-count');
const askButton = document.querySelector('#ask-button');
const loading = document.querySelector('#loading');
const loadingTitle = document.querySelector('#loading-title');
const loadingCopy = document.querySelector('#loading-copy');
const result = document.querySelector('#result');
const answer = document.querySelector('#answer');
const interpretationWrap = document.querySelector('#interpretation-wrap');
const interpretation = document.querySelector('#interpretation');
const evidenceCard = document.querySelector('#evidence-card');
const sql = document.querySelector('#sql');
const rows = document.querySelector('#rows');
const rowCount = document.querySelector('#row-count');
const errorCard = document.querySelector('#error-card');
const errorMessage = document.querySelector('#error-message');
const healthPill = document.querySelector('#health-pill');

if (window.lucide) window.lucide.createIcons();

function setHealth(kind, text) {
  healthPill.className = `health-pill ${kind}`.trim();
  healthPill.querySelector('span:last-child').textContent = text;
}

fetch('/api/health').then(async (response) => {
  const health = await response.json();
  if (!response.ok || !health.databaseReady) return setHealth('warning', 'Setup required');
  if (!health.apiKeyConfigured) return setHealth('warning', 'API key required');
  setHealth('ready', `${health.model} · Ready`);
}).catch(() => setHealth('warning', 'Server unavailable'));

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[character]));
}

function renderMarkdown(markdown) {
  const safe = escapeHtml(markdown);
  const withInline = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
  const lines = withInline.split(/\r?\n/);
  let html = '';
  let list = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const line of lines) {
    const unordered = line.match(/^[-*]\s+(.+)/);
    const ordered = line.match(/^\d+\.\s+(.+)/);
    if (unordered || ordered) {
      const wanted = unordered ? 'ul' : 'ol';
      if (list !== wanted) { closeList(); html += `<${wanted}>`; list = wanted; }
      html += `<li>${unordered?.[1] || ordered[1]}</li>`;
    } else {
      closeList();
      if (line.trim()) html += `<p>${line}</p>`;
    }
  }
  closeList();
  return html;
}

function renderRows(data) {
  rows.replaceChildren();
  if (!data.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-rows';
    empty.textContent = 'The query returned no matching rows.';
    rows.append(empty);
    return;
  }
  const columns = Object.keys(data[0]);
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  columns.forEach((column) => {
    const th = document.createElement('th'); th.textContent = column; headRow.append(th);
  });
  head.append(headRow); table.append(head);
  const body = document.createElement('tbody');
  data.forEach((row) => {
    const tr = document.createElement('tr');
    columns.forEach((column) => {
      const td = document.createElement('td');
      const value = row[column]; td.textContent = value === null ? 'NULL' : String(value); tr.append(td);
    });
    body.append(tr);
  });
  table.append(body); rows.append(table);
}

function resetOutput() {
  result.hidden = true; errorCard.hidden = true; loading.hidden = false;
  answer.replaceChildren(); rows.replaceChildren(); sql.textContent = '';
}

let loadingTimer;
function startLoadingSequence() {
  const stages = [
    ['Understanding your question','Checking the available schema and planning a safe query…'],
    ['Building a read-only query','Matching your wording to hospital operations data…'],
    ['Grounding the answer','Executing SQL and composing only from retrieved rows…']
  ];
  let index = 0;
  loadingTitle.textContent = stages[0][0]; loadingCopy.textContent = stages[0][1];
  loadingTimer = setInterval(() => {
    index = Math.min(index + 1, stages.length - 1);
    loadingTitle.textContent = stages[index][0]; loadingCopy.textContent = stages[index][1];
  }, 2200);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) return;
  resetOutput(); startLoadingSequence(); askButton.disabled = true;

  try {
    const response = await fetch('/api/ask', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ question })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The request failed.');

    loading.hidden = true; result.hidden = false;
    answer.innerHTML = renderMarkdown(data.answer);
    interpretation.textContent = data.interpretation || '';
    interpretationWrap.hidden = !data.interpretation;
    evidenceCard.hidden = !data.answerable;
    if (data.answerable) {
      sql.textContent = data.sql;
      renderRows(data.rows);
      rowCount.textContent = `${data.rows.length} row${data.rows.length === 1 ? '' : 's'}`;
    }
  } catch (error) {
    loading.hidden = true; errorCard.hidden = false; errorMessage.textContent = error.message;
  } finally {
    clearInterval(loadingTimer); askButton.disabled = false;
  }
});

questionInput.addEventListener('input', () => { questionCount.textContent = `${questionInput.value.length} / 1000`; });
document.querySelectorAll('[data-question]').forEach((button) => {
  button.addEventListener('click', () => {
    questionInput.value = button.dataset.question;
    questionInput.dispatchEvent(new Event('input'));
    questionInput.focus();
  });
});
document.querySelector('#copy-sql').addEventListener('click', async (event) => {
  await navigator.clipboard.writeText(sql.textContent);
  const button = event.currentTarget;
  button.innerHTML = '<i data-lucide="check"></i>';
  if (window.lucide) window.lucide.createIcons();
  setTimeout(() => { button.innerHTML = '<i data-lucide="copy"></i>'; if (window.lucide) window.lucide.createIcons(); }, 1200);
});
