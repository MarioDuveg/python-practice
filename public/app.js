let editor;
let problems = [];
let currentProblem = null;
let activeCategory = 'Todos';
let isJudging = false;

const $ = (id) => document.getElementById(id);
const storageKey = (id) => `python-practice-code:${id}`;
const solvedStorageKey = 'python-practice-solved';

function getSolvedProblems() {
  try {
    const value = JSON.parse(localStorage.getItem(solvedStorageKey) || '[]');
    return new Set(Array.isArray(value) ? value : []);
  } catch (_) {
    return new Set();
  }
}

function isProblemSolved(id) {
  return getSolvedProblems().has(id);
}

function markProblemSolved(id) {
  const solved = getSolvedProblems();
  solved.add(id);
  localStorage.setItem(solvedStorageKey, JSON.stringify([...solved]));
  renderProblemList();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function api(url, options = {}) {
  const controller = new AbortController();
  const method = String(options.method || 'GET').toUpperCase();
  const timeoutMs = method === 'POST' ? 60000 : 12000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      cache: 'no-store',
      headers: { ...(options.headers || {}), 'Cache-Control': 'no-cache' },
      signal: controller.signal
    });
    const raw = await res.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (_) {
      throw new Error(`Respuesta inválida del servidor (HTTP ${res.status}).`);
    }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`El servidor no respondió en ${Math.round(timeoutMs / 1000)} segundos.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function setHeaderVerdict(text, kind = 'neutral') {
  const el = $('headerVerdict');
  if (!el) return;
  el.textContent = text;
  el.className = `header-verdict ${kind}`;
}

function initEditor() {
  require.config({ paths: { vs: '/monaco/vs' } });
  require(['vs/editor/editor.main'], () => {
    monaco.editor.defineTheme('practice-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'C586C0', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: '4EC9B0' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' }
      ],
      colors: {
        'editor.background': '#101214',
        'editorLineNumber.foreground': '#555b63',
        'editorLineNumber.activeForeground': '#b8bec6',
        'editorCursor.foreground': '#f3a11a',
        'editor.selectionBackground': '#33415588'
      }
    });

    editor = monaco.editor.create($('editor'), {
      value: '// Selecciona un problema...',
      language: 'python',
      theme: 'practice-dark',
      fontSize: 14,
      lineHeight: 21,
      fontLigatures: true,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      tabSize: 4,
      insertSpaces: true,
      roundedSelection: false,
      padding: { top: 12 },
      suggest: { showWords: true },
      quickSuggestions: true,
      autoIndent: 'full',
      formatOnType: true
    });

    // Monaco conserva la indentación normal de Python.
    let saveTimer;
    editor.onDidChangeModelContent(() => {
      if (!currentProblem) return;
      $('saveStatus').textContent = 'Guardando...';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        localStorage.setItem(storageKey(currentProblem.id), editor.getValue());
        $('saveStatus').textContent = 'Guardado local';
      }, 250);
    });

    bootstrap();
  });
}

async function bootstrap() {
  problems = await api('/api/problems');
  $('problemCount').textContent = `${problems.length} ejercicios`;
  renderCategoryFilters();
  renderProblemList();
  const first = location.hash.slice(1) || problems[0]?.id;
  if (first) await selectProblem(first);
}

function renderCategoryFilters() {
  const categories = ['Todos', ...new Set(problems.map((p) => p.category))];
  $('categoryFilters').innerHTML = categories.map((c) =>
    `<button class="filter-chip ${c === activeCategory ? 'active' : ''}" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`
  ).join('');

  $('categoryFilters').querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.category;
      renderCategoryFilters();
      renderProblemList();
    });
  });
}

function renderProblemList() {
  const q = $('searchInput').value.trim().toLowerCase();
  const filtered = problems.filter((p) => {
    const categoryOk = activeCategory === 'Todos' || p.category === activeCategory;
    const searchOk = !q || `${p.title} ${p.category}`.toLowerCase().includes(q);
    return categoryOk && searchOk;
  });

  $('problemList').innerHTML = filtered.map((p) => `
    <button class="problem-item ${currentProblem?.id === p.id ? 'active' : ''}" data-id="${p.id}">
      <span class="title">${escapeHtml(p.title)}</span>
      ${isProblemSolved(p.id) ? '<span class="solved-check" title="Resuelto" aria-label="Resuelto">✓</span>' : ''}
    </button>
  `).join('');

  $('problemList').querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => selectProblem(btn.dataset.id));
  });
}

async function selectProblem(id) {
  if (isJudging) return;
  const problem = await api(`/api/problems/${encodeURIComponent(id)}`);
  currentProblem = problem;
  location.hash = problem.id;
  renderProblemList();
  renderProblem(problem);

  const saved = localStorage.getItem(storageKey(problem.id));
  editor.setValue(saved ?? problem.template);
  editor.setPosition({ lineNumber: 1, column: 1 });
  editor.focus();
  clearResults();
}

function renderProblem(p) {
  $('problemCategory').textContent = p.category;
  $('problemTitle').textContent = p.title;
  $('problemStatement').textContent = p.statement;
  $('difficultyBadge').textContent = p.difficulty;
  $('difficultyBadge').className = `difficulty ${p.difficulty.toLowerCase()}`;

  $('examples').innerHTML = p.examples.map((ex) => `
    <div class="example">
      <div><span class="label">Entrada</span>${escapeHtml(ex.input)}</div>
      <div><span class="label">Salida</span>${escapeHtml(ex.output)}</div>
    </div>
  `).join('');

  $('constraints').innerHTML = p.constraints.map((c) => `<li>${escapeHtml(c)}</li>`).join('');

  $('visibleTests').innerHTML = p.visibleTests.map((test) => `
    <div class="test-card">
      <div>${escapeHtml(test.input)}</div>
      <div class="expected">${escapeHtml(test.expected)}</div>
    </div>
  `).join('');
}

function clearResults() {
  $('verdict').className = 'verdict neutral';
  $('verdict').textContent = 'Listo';
  setHeaderVerdict('Listo', 'neutral');
  $('resultSummary').textContent = 'Aún no has ejecutado pruebas.';
  $('results').className = 'results-body empty-state';
  $('results').innerHTML = 'Presiona <strong>Ejecutar</strong> para correr casos visibles o <strong>Enviar</strong> para evaluar todos los casos.';
}

function setBusy(busy) {
  isJudging = busy;
  $('runBtn').disabled = busy;
  $('submitBtn').disabled = busy;
  $('resetBtn').disabled = busy;
  if (busy) {
    $('runBtn').dataset.originalText ||= $('runBtn').textContent;
    $('submitBtn').dataset.originalText ||= $('submitBtn').textContent;
    $('runBtn').textContent = 'Evaluando...';
    $('submitBtn').textContent = 'Evaluando...';
    $('verdict').className = 'verdict running';
    $('verdict').textContent = 'Evaluando';
    setHeaderVerdict('Evaluando', 'running');
    $('resultSummary').textContent = 'Verificando Python y ejecutando casos...';
    $('results').className = 'results-body empty-state';
    $('results').textContent = 'Ejecutando Python...';
  } else {
    $('runBtn').textContent = $('runBtn').dataset.originalText || 'Ejecutar';
    $('submitBtn').textContent = $('submitBtn').dataset.originalText || 'Enviar';
  }
}

async function judge(mode) {
  if (!currentProblem || isJudging) return;
  setBusy(true);
  try {
    const result = await api(`/api/judge/${encodeURIComponent(currentProblem.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: editor.getValue(), mode })
    });
    console.log('[JUDGE RESPONSE]', result);
    const kind = result.status === 'Accepted' ? 'accepted' : 'error';
    setHeaderVerdict(result.status || 'Resultado', kind);
    renderResults(result, mode);
    if (mode === 'submit' && result.status === 'Accepted') {
      markProblemSolved(currentProblem.id);
    }
  } catch (err) {
    console.error('[JUDGE FRONTEND ERROR]', err);
    $('verdict').className = 'verdict error';
    $('verdict').textContent = 'Error';
    setHeaderVerdict('Error', 'error');
    $('resultSummary').textContent = err.message;
    $('results').className = 'results-body';
    $('results').innerHTML = `<pre class="compile-error">${escapeHtml(err.message)}</pre>`;
  } finally {
    setBusy(false);
  }
}

function renderResults(result, mode) {
  if (!result || typeof result !== 'object') throw new Error('Respuesta inválida del juez.');
  if (!Array.isArray(result.results)) result.results = [];
  const accepted = result.status === 'Accepted';
  $('verdict').className = `verdict ${accepted ? 'accepted' : 'error'}`;
  $('verdict').textContent = result.status;

  if (result.compileError) {
    $('resultSummary').textContent = 'El código contiene un error de sintaxis.';
    $('results').className = 'results-body';
    $('results').innerHTML = `<pre class="compile-error">${escapeHtml(result.compileError)}</pre>`;
    return;
  }

  const passed = result.results.filter((r) => r.status === 'Accepted').length;
  $('resultSummary').textContent = `${passed}/${result.results.length} casos aprobados · ${mode === 'run' ? 'casos visibles' : 'evaluación completa'}`;
  $('results').className = 'results-body';
  $('results').innerHTML = result.results.map((r) => {
    const ok = r.status === 'Accepted';
    let io = r.hidden
      ? '<div class="io">Caso oculto</div>'
      : `<div class="io"><b>Entrada:</b> ${escapeHtml(r.input ?? '')}</div>
         <div class="io"><b>Esperado:</b> ${escapeHtml(r.expected ?? '')}</div>
         <div class="io"><b>Obtenido:</b> ${escapeHtml(r.actual ?? '')}</div>`;
    if (r.runtimeError) io += `<div class="io"><b>Error:</b> ${escapeHtml(r.runtimeError)}</div>`;
    return `
      <div class="result-row">
        <div class="result-index">#${r.index}</div>
        <div class="result-main">${io}</div>
        <div class="result-status ${ok ? 'ok' : 'bad'}">${escapeHtml(r.status)} · ${r.elapsedMs} ms</div>
      </div>
    `;
  }).join('');
}

$('searchInput').addEventListener('input', renderProblemList);
$('runBtn').addEventListener('click', () => judge('run'));
$('submitBtn').addEventListener('click', () => judge('submit'));
$('resetBtn').addEventListener('click', () => {
  if (!currentProblem || isJudging) return;
  localStorage.removeItem(storageKey(currentProblem.id));
  editor.setValue(currentProblem.template);
  clearResults();
});

window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (id && id !== currentProblem?.id && problems.some((p) => p.id === id)) selectProblem(id);
});

initEditor();


function showInterfaceError(message) {
  const text = message || 'Error JavaScript inesperado.';
  setHeaderVerdict('Error', 'error');
  if ($('verdict')) {
    $('verdict').className = 'verdict error';
    $('verdict').textContent = 'Error';
  }
  if ($('resultSummary')) $('resultSummary').textContent = 'Error de interfaz';
  if ($('results')) {
    $('results').className = 'results-body';
    $('results').innerHTML = `<pre class="compile-error">${escapeHtml(text)}</pre>`;
  }
}

window.addEventListener('error', (event) => {
  console.error('[FRONTEND ERROR]', event.error || event.message);
  showInterfaceError(event.message || 'Error JavaScript inesperado.');
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[FRONTEND PROMISE ERROR]', event.reason);
  showInterfaceError(event.reason?.message || String(event.reason || 'Error inesperado.'));
});
