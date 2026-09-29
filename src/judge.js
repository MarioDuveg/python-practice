const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const RESULT_MARKER = '__PYTHON_PRACTICE_RESULT__';
const MAX_OUTPUT = 64 * 1024;

function buildHarness(userCode, problem) {
  const cases = problem.tests.map((test, i) => {
    const keyword = i === 0 ? 'if' : 'elif';
    return `    ${keyword} __case == ${i}:\n        return ${test.call}`;
  }).join('\n');

  return `${userCode}\n\nimport json as __json\nimport sys as __sys\n\ndef __jsonable(value):\n    if isinstance(value, tuple):\n        return [__jsonable(v) for v in value]\n    if isinstance(value, list):\n        return [__jsonable(v) for v in value]\n    if isinstance(value, set):\n        return sorted((__jsonable(v) for v in value), key=lambda x: repr(x))\n    if isinstance(value, dict):\n        return {str(k): __jsonable(v) for k, v in value.items()}\n    return value\n\ndef __run_case(__case):\n    solution = Solution()\n${cases}\n    raise IndexError('Caso de prueba inexistente')\n\n__case = int(__sys.argv[1])\n__value = __run_case(__case)\n__answer = __json.dumps(__jsonable(__value), ensure_ascii=False, separators=(',', ':'), sort_keys=True, allow_nan=False)\nprint('${RESULT_MARKER}' + __answer)\n`;
}

function killProcessTree(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
    else child.kill('SIGKILL');
  } catch (_) {
    try { child.kill('SIGKILL'); } catch (_) {}
  }
}

function runProcess(command, args, options = {}) {
  const timeoutMs = options.timeoutMs || 10000;
  const cwd = options.cwd;
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let overflow = false;
    let timedOut = false;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, stdout, stderr, timedOut, overflow, elapsedMs: Date.now() - started });
    };

    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: '1',
          PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
        },
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (err) {
      return resolve({ code: -1, stdout: '', stderr: err.message, timedOut: false, overflow: false, elapsedMs: Date.now() - started });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
      setTimeout(() => finish({ code: -1, signal: 'SIGKILL' }), 150).unref();
    }, timeoutMs);

    const collect = (which) => (chunk) => {
      const text = chunk.toString('utf8');
      if (which === 'stdout') stdout += text;
      else stderr += text;
      if (stdout.length + stderr.length > MAX_OUTPUT && !overflow) {
        overflow = true;
        killProcessTree(child);
        setTimeout(() => finish({ code: -1, signal: 'SIGKILL' }), 150).unref();
      }
    };

    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    child.on('error', (err) => {
      stderr += `\n${err.message}`;
      finish({ code: -1 });
    });
    child.on('close', (code, signal) => finish({ code, signal }));
  });
}

function canonicalTopLevel(value) {
  if (!Array.isArray(value)) return null;
  return value.map((item) => JSON.stringify(item)).sort();
}

function canonicalNestedSet(value) {
  if (!Array.isArray(value)) return null;
  return value.map((item) => {
    if (!Array.isArray(item)) return null;
    const normalized = [...item].sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      return String(a).localeCompare(String(b));
    });
    return JSON.stringify(normalized);
  }).sort();
}

function validateActivity(actualText, test) {
  let value;
  try { value = JSON.parse(actualText); } catch (_) { return { ok: false, displayActual: actualText }; }
  if (!Array.isArray(value)) return { ok: false, displayActual: 'La función no regresó una lista.' };

  const source = Array.isArray(test.intervals) ? test.intervals : [];
  const available = new Map();
  for (const interval of source) {
    const key = JSON.stringify(interval);
    available.set(key, (available.get(key) || 0) + 1);
  }

  for (const interval of value) {
    if (!Array.isArray(interval) || interval.length !== 2 || !interval.every(Number.isFinite)) {
      return { ok: false, displayActual: 'La salida contiene un intervalo inválido.' };
    }
    const key = JSON.stringify(interval);
    const count = available.get(key) || 0;
    if (count <= 0) return { ok: false, displayActual: 'La salida usa un intervalo que no está disponible en la entrada.' };
    available.set(key, count - 1);
  }

  const ordered = [...value].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i][0] < ordered[i - 1][1]) {
      return { ok: false, displayActual: 'Los intervalos regresados se traslapan.' };
    }
  }

  const ok = value.length === Number(test.expectedCount);
  return { ok, displayActual: `${value.length} intervalos compatibles` };
}

function validateCoinCollection(actualText, test) {
  let value;
  try { value = JSON.parse(actualText); } catch (_) { return { ok: false, displayActual: actualText }; }
  if (!Array.isArray(value) || value.some((x) => !Number.isInteger(x))) {
    return { ok: false, displayActual: 'La función debe regresar una lista de monedas enteras.' };
  }
  const allowed = new Set((test.coins || []).map(Number));
  if (value.some((x) => !allowed.has(x))) {
    return { ok: false, displayActual: 'La salida contiene una denominación no permitida.' };
  }
  const sum = value.reduce((a, b) => a + b, 0);
  if (sum !== Number(test.amount)) {
    return { ok: false, displayActual: `${value.length} monedas; suma ${sum}` };
  }
  const ok = value.length === Number(test.expectedCount);
  return { ok, displayActual: `${value.length} monedas; suma ${sum}` };
}

function validateBeautifulArray(actualText, test) {
  let value;
  try { value = JSON.parse(actualText); } catch (_) { return { ok: false, displayActual: actualText }; }
  const n = Number(test.n);
  if (!Array.isArray(value) || value.length !== n || value.some((x) => !Number.isInteger(x))) {
    return { ok: false, displayActual: 'La salida no es una permutación válida.' };
  }
  const sorted = [...value].sort((a, b) => a - b);
  for (let i = 0; i < n; i += 1) {
    if (sorted[i] !== i + 1) return { ok: false, displayActual: 'La salida no contiene exactamente los valores 1..n.' };
  }
  for (let i = 0; i < n; i += 1) {
    for (let k = i + 1; k < n; k += 1) {
      for (let j = k + 1; j < n; j += 1) {
        if (2 * value[k] === value[i] + value[j]) {
          return { ok: false, displayActual: `No cumple la propiedad en i=${i}, k=${k}, j=${j}.` };
        }
      }
    }
  }
  return { ok: true, displayActual: JSON.stringify(value) };
}

function validateNKnights(actualText, test) {
  let value;
  try {
    value = JSON.parse(actualText);
  } catch (_) {
    return { ok: false, displayActual: actualText };
  }

  const n = Number(test.n);
  if (!Array.isArray(value)) {
    return { ok: false, displayActual: 'La función no regresó una lista.' };
  }

  const seen = new Set();
  for (const board of value) {
    if (!Array.isArray(board) || board.length !== n || board.some((row) => typeof row !== 'string' || row.length !== n)) {
      return { ok: false, displayActual: `${value.length} resultados; al menos un tablero tiene formato inválido.` };
    }

    const key = JSON.stringify(board);
    if (seen.has(key)) {
      return { ok: false, displayActual: `${value.length} resultados; hay configuraciones duplicadas.` };
    }
    seen.add(key);

    const knights = [];
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        const ch = board[r][c];
        if (ch !== 'K' && ch !== '.') {
          return { ok: false, displayActual: `${value.length} resultados; se encontró un símbolo distinto de K o .` };
        }
        if (ch === 'K') knights.push([r, c]);
      }
    }

    if (knights.length !== n) {
      return { ok: false, displayActual: `${value.length} resultados; un tablero no contiene exactamente ${n} caballos.` };
    }

    for (let i = 0; i < knights.length; i += 1) {
      for (let j = i + 1; j < knights.length; j += 1) {
        const dr = Math.abs(knights[i][0] - knights[j][0]);
        const dc = Math.abs(knights[i][1] - knights[j][1]);
        if ((dr === 1 && dc === 2) || (dr === 2 && dc === 1)) {
          return { ok: false, displayActual: `${value.length} resultados; al menos dos caballos se atacan.` };
        }
      }
    }
  }

  const ok = value.length === Number(test.expectedCount);
  return {
    ok,
    displayActual: `${value.length} configuraciones válidas`
  };
}

function validateNQueens(actualText, test) {
  let value;
  try {
    value = JSON.parse(actualText);
  } catch (_) {
    return { ok: false, displayActual: actualText };
  }

  const n = Number(test.n);
  if (!Array.isArray(value)) {
    return { ok: false, displayActual: 'La función no regresó una lista.' };
  }

  const seen = new Set();
  for (const board of value) {
    if (!Array.isArray(board) || board.length !== n || board.some((row) => typeof row !== 'string' || row.length !== n)) {
      return { ok: false, displayActual: `${value.length} resultados; al menos un tablero tiene formato inválido.` };
    }

    const key = JSON.stringify(board);
    if (seen.has(key)) {
      return { ok: false, displayActual: `${value.length} resultados; hay configuraciones duplicadas.` };
    }
    seen.add(key);

    const columns = new Set();
    const diag1 = new Set();
    const diag2 = new Set();
    let queens = 0;

    for (let r = 0; r < n; r += 1) {
      let rowQueens = 0;
      for (let c = 0; c < n; c += 1) {
        const ch = board[r][c];
        if (ch !== 'Q' && ch !== '.') {
          return { ok: false, displayActual: `${value.length} resultados; se encontró un símbolo distinto de Q o .` };
        }
        if (ch !== 'Q') continue;

        queens += 1;
        rowQueens += 1;
        const d1 = r - c;
        const d2 = r + c;
        if (columns.has(c) || diag1.has(d1) || diag2.has(d2)) {
          return { ok: false, displayActual: `${value.length} resultados; al menos dos reinas se atacan.` };
        }
        columns.add(c);
        diag1.add(d1);
        diag2.add(d2);
      }
      if (rowQueens !== 1) {
        return { ok: false, displayActual: `${value.length} resultados; cada fila debe contener exactamente una reina.` };
      }
    }

    if (queens !== n) {
      return { ok: false, displayActual: `${value.length} resultados; un tablero no contiene exactamente ${n} reinas.` };
    }
  }

  const ok = value.length === Number(test.expectedCount);
  return { ok, displayActual: `${value.length} configuraciones válidas` };
}

function compareResult(actualText, test) {
  const mode = test.compare || 'exact';

  if (mode === 'float') {
    const actual = Number(actualText);
    const expected = Number(test.expected);
    const tolerance = Number(test.tolerance || 1e-9);
    const scale = Math.max(1, Math.abs(expected));
    return {
      ok: Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance * scale,
      displayActual: actualText
    };
  }

  if (mode === 'unordered') {
    try {
      const actual = canonicalTopLevel(JSON.parse(actualText));
      const expected = canonicalTopLevel(JSON.parse(String(test.expected)));
      const ok = actual !== null && expected !== null && JSON.stringify(actual) === JSON.stringify(expected);
      return { ok, displayActual: actualText };
    } catch (_) {
      return { ok: false, displayActual: actualText };
    }
  }

  if (mode === 'unordered_nested_set') {
    try {
      const actual = canonicalNestedSet(JSON.parse(actualText));
      const expected = canonicalNestedSet(JSON.parse(String(test.expected)));
      const ok = actual !== null && expected !== null && JSON.stringify(actual) === JSON.stringify(expected);
      return { ok, displayActual: actualText };
    } catch (_) {
      return { ok: false, displayActual: actualText };
    }
  }

  if (mode === 'activity') return validateActivity(actualText, test);
  if (mode === 'coin_collection') return validateCoinCollection(actualText, test);
  if (mode === 'beautiful') return validateBeautifulArray(actualText, test);
  if (mode === 'nknights') return validateNKnights(actualText, test);
  if (mode === 'nqueens') return validateNQueens(actualText, test);

  return {
    ok: actualText.trimEnd() === String(test.expected).trimEnd(),
    displayActual: actualText
  };
}

async function judge(problem, userCode, mode = 'submit', log = () => {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'python-judge-'));
  const sourcePath = path.join(tempDir, 'solution.py');

  try {
    log(`directorio temporal ${tempDir}`);
    await fs.writeFile(sourcePath, buildHarness(userCode, problem), 'utf8');

    log('verificando sintaxis de Python');
    const syntax = await runProcess('python3', ['-I', '-B', '-m', 'py_compile', sourcePath], {
      cwd: tempDir,
      timeoutMs: 8000
    });
    log(`verificación terminó code=${syntax.code} timeout=${syntax.timedOut} en ${syntax.elapsedMs} ms`);

    if (syntax.timedOut) {
      return { status: 'Syntax Timeout', compileError: 'La verificación de sintaxis excedió el tiempo permitido.', results: [] };
    }
    if (syntax.overflow) {
      return { status: 'Syntax Error', compileError: 'La salida del intérprete excedió el límite permitido.', results: [] };
    }
    if (syntax.code !== 0) {
      return { status: 'Syntax Error', compileError: syntax.stderr.slice(0, 16000) || 'Python detectó un error de sintaxis.', results: [] };
    }

    const indexedTests = problem.tests.map((test, index) => ({ test, index }));
    const selected = mode === 'run'
      ? indexedTests.filter(({ test }) => !test.hidden).slice(0, 3)
      : indexedTests;

    const results = [];
    let overall = 'Accepted';

    for (const { test, index } of selected) {
      log(`test ${index + 1} iniciado`);
      const run = await runProcess('python3', ['-I', '-B', sourcePath, String(index)], {
        cwd: tempDir,
        timeoutMs: 3500
      });
      log(`test ${index + 1} terminó code=${run.code} signal=${run.signal || '-'} timeout=${run.timedOut} en ${run.elapsedMs} ms`);

      let status = 'Accepted';
      let actual = '';

      if (run.timedOut || run.signal === 'SIGKILL') {
        status = 'Time Limit Exceeded';
      } else if (run.overflow) {
        status = 'Output Limit Exceeded';
      } else if (run.code !== 0) {
        status = 'Runtime Error';
      } else {
        const pos = run.stdout.lastIndexOf(RESULT_MARKER);
        if (pos < 0) {
          status = 'Runtime Error';
        } else {
          const rawActual = run.stdout.slice(pos + RESULT_MARKER.length).trimEnd();
          const comparison = compareResult(rawActual, test);
          actual = comparison.displayActual;
          if (!comparison.ok) status = 'Wrong Answer';
        }
      }

      if (status !== 'Accepted' && overall === 'Accepted') overall = status;
      results.push({
        index: index + 1,
        hidden: !!test.hidden,
        input: test.hidden ? 'Caso oculto' : test.input,
        expected: test.hidden ? undefined : (test.publicExpected ?? test.expected),
        actual: test.hidden ? undefined : actual,
        status,
        elapsedMs: run.elapsedMs,
        runtimeError: status === 'Runtime Error' ? run.stderr.slice(0, 4000) : undefined
      });

      if (status === 'Time Limit Exceeded' || status === 'Runtime Error' || status === 'Output Limit Exceeded') break;
    }

    return { status: overall, compileError: null, results };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function runtimeDiagnostic() {
  const version = await runProcess('python3', ['--version'], { timeoutMs: 5000 });
  const smoke = await runProcess('python3', ['-I', '-B', '-c', 'print(6 * 7)'], { timeoutMs: 5000 });
  return {
    ok: version.code === 0 && !version.timedOut && smoke.code === 0 && smoke.stdout.trim() === '42',
    runtime: (version.stdout || version.stderr).trim().slice(0, 300),
    versionElapsedMs: version.elapsedMs,
    smokeCode: smoke.code,
    smokeTimedOut: smoke.timedOut,
    smokeElapsedMs: smoke.elapsedMs,
    smokeError: smoke.code === 0 ? null : smoke.stderr.slice(0, 2000)
  };
}

module.exports = { judge, runtimeDiagnostic };
