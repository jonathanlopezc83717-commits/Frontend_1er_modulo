const { exec } = require('child_process');
const path = require('path');

const projectPath = path.resolve(__dirname);

console.log('🚀 Iniciando servidor de desarrollo...');
console.log('📁 Proyecto:', projectPath);
console.log('🌐 El servidor estará disponible en: http://localhost:5173');
console.log('');

const child = exec('npm run dev', {
  cwd: projectPath,
  windowsHide: false
});

child.stdout.on('data', (data) => {
  console.log(data);
});

child.stderr.on('data', (data) => {
  console.error(data);
});

child.on('close', (code) => {
  console.log(`Servidor cerrado con código: ${code}`);
});

// Mantener el proceso vivo
process.stdin.resume();
