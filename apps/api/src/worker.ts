import { config } from './config';
import { getRedis, closeRedis } from './lib/redis';
import prisma from './lib/prisma';
import { createWorker, QUEUE_NAMES } from './lib/queue';
import logger from './utils/logger';

async function processPdfJob(job: any) {
  logger.info('Processing PDF job', { jobId: job.id, data: job.data });
  return { success: true };
}

async function processEmailJob(job: any) {
  logger.info('Processing email job', { jobId: job.id, data: job.data });
  return { success: true };
}

async function processWhatsAppJob(job: any) {
  logger.info('Processing WhatsApp job', { jobId: job.id, data: job.data });
  return { success: true };
}

async function processStockJob(job: any) {
  logger.info('Processing stock job', { jobId: job.id, data: job.data });
  return { success: true };
}

async function main() {
  logger.info('Starting Sitara worker', { env: config.nodeEnv });

  await prisma.$connect();
  logger.info('Database connected');

  getRedis();
  logger.info('Redis connected');

  const pdfWorker = createWorker(QUEUE_NAMES.PDF, processPdfJob, { concurrency: 2 });
  const emailWorker = createWorker(QUEUE_NAMES.EMAIL, processEmailJob, { concurrency: 3 });
  const whatsappWorker = createWorker(QUEUE_NAMES.WHATSAPP, processWhatsAppJob, { concurrency: 2 });
  const stockWorker = createWorker(QUEUE_NAMES.STOCK, processStockJob, { concurrency: 2 });

  logger.info('All workers registered');

  process.on('SIGTERM', async () => {
    logger.info('Shutting down worker');
    await pdfWorker.close();
    await emailWorker.close();
    await whatsappWorker.close();
    await stockWorker.close();
    await closeRedis();
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error('Worker failed to start', { error: err.message });
  process.exit(1);
});
