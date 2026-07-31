import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const instances = [
  { port: 3001, id: 'Instance-3001' },
  { port: 3002, id: 'Instance-3002' },
  { port: 3003, id: 'Instance-3003' }
];

console.log('🚀 Launching Stateless Backend Cluster...');

// Spawn backend worker processes
const workerProcesses = instances.map((inst) => {
  const child = fork(path.join(__dirname, 'server.js'), [], {
    env: {
      ...process.env,
      PORT: inst.port,
      SERVER_ID: inst.id
    }
  });

  child.on('exit', (code) => {
    console.log(`⚠️  Worker ${inst.id} exited with code ${code}`);
  });

  return child;
});

// Spawn Load Balancer proxy
const lbProcess = fork(path.join(__dirname, 'load_balancer.js'), [], {
  env: {
    ...process.env,
    LB_PORT: process.env.PORT || process.env.LB_PORT || 3000
  }
});

process.on('SIGINT', () => {
  console.log('\nStopping backend cluster and load balancer...');
  workerProcesses.forEach((proc) => proc.kill());
  lbProcess.kill();
  process.exit(0);
});
