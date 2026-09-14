import Redis from 'ioredis';
import { config } from '../config';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
    });

    redis.on('error', (err) => {
      console.error('[REDIS] Connection error:', err.message);
    });

    redis.on('connect', () => {
      console.log('[REDIS] Connected');
    });
  }
  return redis;
}

/**
 * Dedicated connection for BullMQ (queues/workers). BullMQ requires
 * maxRetriesPerRequest: null and manages retries/blocking itself — the
 * shared client above (maxRetriesPerRequest: 3) makes Workers refuse to
 * start. Separate instance, same URL (incl. password).
 */
export function getBullMQConnection(): Redis {
  return new Redis(config.redis.url, { maxRetriesPerRequest: null });
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
