import { redisConnection } from '../config/redis';

export const checkRateLimit = async (key: string, limit: number, durationSeconds: number): Promise<{ allowed: boolean; remaining: number; ttl: number }> => {
     const current = await redisConnection.incr(key);

     // Set expiry on first request
     if (current === 1) {
          await redisConnection.expire(key, durationSeconds);
     }

     // Get TTL to inform user when they can try again
     const ttl = await redisConnection.ttl(key);

     if (current > limit) {
          return { allowed: false, remaining: 0, ttl };
     }

     return { allowed: true, remaining: limit - current, ttl };
};
