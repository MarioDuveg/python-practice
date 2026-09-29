const express = require('express');
const path = require('path');
const crypto = require('crypto');
const problems = require('./problems.json');
const { judge, runtimeDiagnostic } = require('./judge');

const app = express();
const APP_VERSION = 'python-v2-21-problems';
app.set('etag', false);
const PORT = Number(process.env.PORT || 10000);
const MAX_CODE_LENGTH = 30000;
const MAX_CONCURRENT_JOBS = Number(process.env.MAX_CONCURRENT_JOBS || 1);
let activeJobs = 0;

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

app.use((req, res, next) => {
  if (!req.path.startsWith('/monaco/')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  next();
});

app.use('/api', (req, res, next) => {
  const started = Date.now();
  const requestId = crypto.randomBytes(3).toString('hex');
  req.requestId = requestId;
  console.log(`[HTTP ${requestId}] ${req.method} ${req.originalUrl} -> recibido`);
  res.on('finish', () => {
    console.log(`[HTTP ${requestId}] ${res.statusCode} ${req.method} ${req.originalUrl} -> ${Date.now() - started} ms`);
  });
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/monaco', express.static(path.join(__dirname, '..', 'node_modules', 'monaco-editor', 'min')));

function publicProblem(problem) {
  return {
    id: problem.id,
    title: problem.title,
    difficulty: problem.difficulty,
    category: problem.category,
    statement: problem.statement,
    constraints: problem.constraints,
    template: problem.template,
    examples: problem.examples,
    testCount: problem.tests.length,
    visibleTests: problem.tests
      .filter((t) => !t.hidden)
      .map((t, index) => ({ index: index + 1, input: t.input, expected: t.publicExpected ?? t.expected }))
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: APP_VERSION, runtime: 'Python 3', problems: problems.length });
});

app.get('/api/diagnostics/runtime', async (_req, res) => {
  try {
    res.json(await runtimeDiagnostic());
  } catch (err) {
    console.error('[DIAG] runtime:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/problems', (_req, res) => {
  res.json(problems.map(({ id, title, difficulty, category }) => ({ id, title, difficulty, category })));
});

app.get('/api/problems/:id', (req, res) => {
  const problem = problems.find((p) => p.id === req.params.id);
  if (!problem) return res.status(404).json({ error: 'Problema no encontrado.' });
  res.json(publicProblem(problem));
});

app.post('/api/judge/:id', async (req, res) => {
  const rid = req.requestId || '------';
  const problem = problems.find((p) => p.id === req.params.id);
  if (!problem) return res.status(404).json({ error: 'Problema no encontrado.' });

  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const mode = req.body?.mode === 'run' ? 'run' : 'submit';
  if (!code.trim()) return res.status(400).json({ error: 'El código está vacío.' });
  if (code.length > MAX_CODE_LENGTH) return res.status(413).json({ error: 'El código excede 30 KB.' });
  if (activeJobs >= MAX_CONCURRENT_JOBS) return res.status(429).json({ error: 'El juez está ocupado. Intenta nuevamente en unos segundos.' });

  activeJobs += 1;
  const log = (message) => console.log(`[JUDGE ${rid}] ${problem.id}: ${message}`);
  log(`inicio mode=${mode}, ${code.length} caracteres, activeJobs=${activeJobs}`);

  let watchdog;
  try {
    const hardTimeout = new Promise((_, reject) => {
      watchdog = setTimeout(() => reject(new Error('JUDGE_HARD_TIMEOUT')), 55000);
    });
    const result = await Promise.race([judge(problem, code, mode, log), hardTimeout]);
    log(`fin status=${result.status}`);
    if (!res.headersSent) res.json({ ...result, serverVersion: APP_VERSION, requestId: rid });
  } catch (err) {
    console.error(`[JUDGE ${rid}]`, err);
    if (!res.headersSent) {
      const timeout = err?.message === 'JUDGE_HARD_TIMEOUT';
      res.status(timeout ? 504 : 500).json({
        error: timeout ? 'El juez excedió el límite global de 55 segundos.' : 'Error interno del juez.'
      });
    }
  } finally {
    clearTimeout(watchdog);
    activeJobs = Math.max(0, activeJobs - 1);
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Python Practice Judge escuchando en 0.0.0.0:${PORT}`);
});
