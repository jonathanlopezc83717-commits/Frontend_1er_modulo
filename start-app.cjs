const { exec } = require('child_process');
const http = require('http');
const path = require('path');

const PROJECT_DIR = __dirname;
const FRONTEND_URL = 'http://localhost:5173';
const MAX_RETRIES = 30;

function checkServerReady(attempt = 0) {
  return new Promise((resolve, reject) => {
    const req = http.get(FRONTEND_URL, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        reject(new Error('Status: ' + res.statusCode));
      }
    });
    req.on('error', (err) => {
      if (attempt >= MAX_RETRIES) {
        reject(err);
        return;
      }
      setTimeout(() => {
        checkServerReady(attempt + 1).then(resolve).catch(reject);
      }, 1000);
    });
    req.setTimeout(3000, () => {
      req.destroy();
      if (attempt >= MAX_RETRIES) {
        reject(new Error('Timeout'));
        return;
      }
      setTimeout(() => {
        checkServerReady(attempt + 1).then(resolve).catch(reject);
      }, 1000);
    });
  });
}

function openBrowser() {
  console.log('🌐 Abriendo navegador...');
  exec(`start ${FRONTEND_URL}`, { cwd: PROJECT_DIR });
}

const CROQUIS_PORT = 8000;

function startCroquisApi() {
  if (process.env.CROQUIS_API_DISABLED === '1') return;
  const fs = require('fs');
  const py = path.join(PROJECT_DIR, '.venv', 'Scripts', 'python.exe');
  if (!fs.existsSync(py)) return;
  let ocupado = false;
  const probe = http.get(
    { host: '127.0.0.1', port: CROQUIS_PORT, path: '/api/health', timeout: 1500 },
    (res) => { ocupado = true; res.resume(); }
  );
  probe.on('timeout', () => { ocupado = true; probe.destroy(); });
  probe.on('error', () => {
    if (ocupado) return;
    console.log(`🗺️  Iniciando API de croquis (Civil 3D COM) en :${CROQUIS_PORT}...`);
    const api = exec(`"${py}" server\\api_croquis.py`, { cwd: PROJECT_DIR });
    api.stdout.on('data', (data) => process.stdout.write(`[croquis] ${data}`));
    api.stderr.on('data', (data) => process.stderr.write(`[croquis] ${data}`));
  });
}

function findCommand() {
  // Intentar bun primero (más rápido)
  const bunPath = path.join(process.env.USERPROFILE || 'C:\\Users\\YOGA-01', '.bun', 'bin', 'bun.exe');
  const fs = require('fs');
  if (fs.existsSync(bunPath)) {
    return { cmd: bunPath, args: ['run', 'dev'] };
  }
  return { cmd: 'npm', args: ['run', 'dev'] };
}

async function main() {
  console.log('🚀 Iniciando Obras Ferroviarias...\n');

  startCroquisApi();

  const { cmd, args } = findCommand();
  console.log(`Usando: ${cmd} ${args.join(' ')}`);

  const vite = exec(`"${cmd}" ${args.join(' ')}`, {
    cwd: PROJECT_DIR,
    env: { ...process.env, FORCE_COLOR: '1' }
  });

  vite.stdout.on('data', (data) => {
    process.stdout.write(data);
  });

  vite.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  vite.on('close', (code) => {
    console.log(`\nServidor cerrado con código ${code}`);
    process.exit(code);
  });

  console.log('\n⏳ Esperando a que el servidor esté listo...');
  try {
    await checkServerReady();
    console.log('✅ Servidor listo!');
    openBrowser();
  } catch (err) {
    console.error('❌ No se pudo conectar al servidor:', err.message);
  }
}

main();
