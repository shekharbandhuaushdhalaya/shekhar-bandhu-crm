const os = require('os');
const Job = require('../models/Job');
const { runWithTenant } = require('../utils/tenantContext');
const config = require('../src/config');
const workerId = `${os.hostname()}:${process.pid}`;
const handlers = new Map();
let timer = null;
let running = false;
function registerJobHandler(type, handler) { handlers.set(type, handler); }
async function enqueue(type, payload = {}, options = {}) {
  return Job.create({ type, payload, firmId: options.firmId || null, runAt: options.runAt || new Date(), maxAttempts: options.maxAttempts || 5 });
}
async function processOne() {
  const now = new Date();
  const job = await Job.findOneAndUpdate(
    { status: 'queued', runAt: { $lte: now } },
    { $set: { status: 'processing', lockedAt: now, lockedBy: workerId }, $inc: { attempts: 1 } },
    { sort: { runAt: 1, createdAt: 1 }, new: true }
  );
  if (!job) return false;
  const handler = handlers.get(job.type);
  try {
    if (!handler) throw new Error(`No handler registered for job type: ${job.type}`);
    const result = await runWithTenant({ firmId: job.firmId }, () => handler(job.payload, job));
    await Job.updateOne({ _id: job._id }, { $set: { status: 'completed', result, completedAt: new Date(), lockedAt: null } });
  } catch (err) {
    const dead = job.attempts >= job.maxAttempts;
    const delay = Math.min(300000, 1000 * Math.pow(2, Math.max(0, job.attempts - 1)));
    await Job.updateOne({ _id: job._id }, { $set: { status: dead ? 'dead' : 'queued', runAt: new Date(Date.now() + delay), lastError: err.message, lockedAt: null } });
  }
  return true;
}
function startWorker() {
  if (timer) return;
  timer = setInterval(() => { if (!running) { running = true; processOne().catch(() => {}).finally(() => { running = false; }); } }, config.workerPollMs);
  timer.unref?.();
}
function stopWorker() { if (timer) clearInterval(timer); timer = null; }
module.exports = { enqueue, registerJobHandler, startWorker, stopWorker };
