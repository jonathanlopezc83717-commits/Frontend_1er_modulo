import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Iniciando servidor de desarrollo...');
console.log('📁 Directorio:', __dirname);

const vite = exec('npm run dev', {
  cwd: __dirname,
  env: { ...process.env, FORCE_COLOR: '1' }
});

vite.stdout.on('data', (data) => {
  console.log(data.toString());
});

vite.stderr.on('data', (data) => {
  console.error(data.toString());
});

vite.on('close', (code) => {
  console.log(`Servidor cerrado con código ${code}`);
});

// Manejar señales de terminación
process.on('SIGINT', () => {
  console.log('\n👋 Cerrando servidor...');
  vite.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  vite.kill();
  process.exit(0);
});
