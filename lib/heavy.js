const { Worker } = require('worker_threads'); const path = require('path');
function run(task, args, onProgress) {
  return new Promise((resolve, reject) => {
    let settled = false; const w = new Worker(path.join(__dirname, 'heavy-worker.js'), { workerData: { task, args } });
    w.on('message', (m) => { if (m.progress) { if (onProgress) onProgress(m.progress); } else if (m.error) { settled = true; reject(new Error(m.error)); } else { settled = true; resolve(m.result); } });
    w.on('error', (e) => { if (!settled) { settled = true; reject(e); } });
    w.on('exit', (c) => { if (!settled) reject(new Error('The background job stopped (code ' + c + ')')); });
  });
}
module.exports = { run };
