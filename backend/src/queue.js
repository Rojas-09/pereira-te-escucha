import { Queue } from 'bullmq';

let _queue = null;

export default function getQueue() {
  if (!_queue) {
    const REDIS_URL = process.env.REDIS_URL;
    const connection = REDIS_URL
      ? { url: REDIS_URL }
      : { host: '127.0.0.1', port: 6379 };

    _queue = new Queue('pqrs-radicacion', {
      connection,
      defaultJobOptions: {
        attempts: Number(process.env.WORKER_MAX_RETRIES || 3),
        backoff: {
          type: 'exponential',
          delay: Number(process.env.WORKER_RETRY_BASE_MS || 5000),
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }
  return _queue;
}
