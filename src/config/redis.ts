import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const getRedisConfig = () => {
     if (process.env.REDIS_URL) {
          const url = new URL(process.env.REDIS_URL);
          return {
               host: url.hostname,
               port: parseInt(url.port || '6379'),
               username: url.username,
               password: url.password,
               maxRetriesPerRequest: null,
          };
     }

     return {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          maxRetriesPerRequest: null, // Required for BullMQ
     };
};

const redisConfig = getRedisConfig();

// Shared connection for re-use if needed, though BullMQ manages its own connections
export const redisConnection = new Redis(redisConfig);

export default redisConfig;
