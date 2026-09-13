import { Queue, Worker, QueueEvents } from 'bullmq';
import { getRedis } from './redis';

export const QUEUE_NAMES = {
  PDF: 'pdf-generation',
  EMAIL: 'email-sending',
  WHATSAPP: 'whatsapp-notification',
  STOCK: 'stock-processing',
} as const;

export function createQueue(name: string): Queue {
  const connection = getRedis();
  return new Queue(name, { connection: connection as any });
}

export function getQueue(name: string): Queue {
  return createQueue(name);
}

export function createWorker(
  name: string,
  processor: (job: any) => Promise<any>,
  options?: { concurrency?: number }
): Worker {
  const connection = getRedis();
  return new Worker(name, processor, {
    connection: connection as any,
    concurrency: options?.concurrency || 1,
    lockDuration: 60000,
  });
}

export const pdfQueue = createQueue(QUEUE_NAMES.PDF);
export const emailQueue = createQueue(QUEUE_NAMES.EMAIL);
export const whatsappQueue = createQueue(QUEUE_NAMES.WHATSAPP);
export const stockQueue = createQueue(QUEUE_NAMES.STOCK);
