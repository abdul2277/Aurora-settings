/* Runs one slow job (reading or joining gigabytes) away from the main window, so Aurora stays responsive. */
const { parentPort, workerData } = require('worker_threads');
const os = require('./osimage'), joiner = require('./joiner');
const progress = (done, total) => parentPort.postMessage({ progress: { done, total } });
try {
  const { task, args } = workerData; let result;
  if (task === 'verifyIso') result = os.verifyIso(args.file, { onProgress: progress });
  else if (task === 'checkParts') result = os.checkParts(args.files);
  else if (task === 'verifyParts') result = joiner.verifyParts(args.files, joiner.parseSums(args.sums));
  else if (task === 'join') result = joiner.join(args.parts, args.out, { onProgress: progress });
  else throw new Error('Unknown job');
  parentPort.postMessage({ result });
} catch (e) { parentPort.postMessage({ error: String((e && e.message) || e) }); }
