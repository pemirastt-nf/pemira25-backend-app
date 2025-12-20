import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const redisConfig = {
     host: process.env.REDIS_HOST || 'localhost',
     port: parseInt(process.env.REDIS_PORT || '6379'),
     maxRetriesPerRequest: null, // Required for BullMQ
};

// Shared connection for re-use if needed, though BullMQ manages its own connections
export const redisConnection = new Redis(redisConfig);

export default redisConfig;
