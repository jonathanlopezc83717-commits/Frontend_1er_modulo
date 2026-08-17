const { exec, spawn, spawnSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PROJECT_DIR = __dirname;
const HOST = process.env.CROQUIS_API_HOST || '0.0.0.0';
const PORT = parseInt(process.env.CROQUIS_API_PORT || '8000', 10);
const MAX_RETRIES = 30;

function checkApiReady(attempt = 0) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port: PORT, path: '/api/health', timeout: 3000 },
      (res) => {
        res.resume();
        if (res.statusCode === 200) resolve(true);
        else reject(new Error('Status: ' + res.statusCode));
      }
    );
    const retry = (err) => {
      if (attempt >= MAX_RETRIES) {
        reject(err);
        return;
      }
      setTimeout(() => {
        checkApiReady(attempt + 1).then(resolve).catch(reject);
      }, 1000);
    };
    req.on('error', retry);
    req.on('timeout', () => {
      req.destroy();
      retry(new Error('Timeout'));
    });
  });
}

function openBrowser() {
  console.log('🌐 Abriendo navegador...');
  exec(`start http://localhost:${PORT}`);
}

function buildIfNeeded() {
  if (fs.existsSync(path.join(PROJECT_DIR, 'dist', 'index.html'))) return;
  console.log('📦 dist/index.html no encontrado, ejecutando npm run build...');
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: PROJECT_DIR,
    stdio: 'inherit',
    shell: true,
  });
  if (build.status !== 0) {
    console.error('❌ El build falló, no se puede iniciar producción.');
    process.exit(build.status || 1);
  }
}

async function main() {
  console.log('🚀 Iniciando Obras Ferroviarias (producción)...\n');

  buildIfNeeded();

  const py = path.join(PROJECT_DIR, '.venv', 'Scripts', 'python.exe');
  if (!fs.existsSync(py)) {
    console.error(`❌ No existe ${py}. Crea el venv con FastAPI/uvicorn primero.`);
    process.exit(1);
  }

  const api = spawn(py, ['server\\api_croquis.py'], {
    cwd: PROJECT_DIR,
    env: { ...process.env, CROQUIS_API_HOST: HOST, CROQUIS_API_PORT: String(PORT) },
  });
  api.stdout.on('data', (data) => process.stdout.write(`[api] ${data}`));
  api.stderr.on('data', (data) => process.stderr.write(`[api] ${data}`));
  api.on('close', (code) => {
    console.log(`\nAPI cerrada con código ${code}`);
    process.exit(code ?? 0);
  });
  process.on('SIGINT', () => api.kill());

  console.log('\n⏳ Esperando a la API en :' + PORT + '...');
  try {
    await checkApiReady();
    console.log('✅ Servidor listo!');
    openBrowser();
  } catch (err) {
    console.error('❌ No se pudo conectar con la API:', err.message);
  }
}

main();
