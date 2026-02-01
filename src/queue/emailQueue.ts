import { Queue } from 'bullmq';
import redisConfig from '../config/redis';

// Define the queue names
export const OTP_QUEUE_NAME = 'otp-queue';
export const BROADCAST_QUEUE_NAME = 'broadcast-queue';

// OTP Queue (High Priority, Fast)
export const otpQueue = new Queue(OTP_QUEUE_NAME, {
     connection: redisConfig,
     defaultJobOptions: {
          priority: 1, // Higher priority
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
          removeOnFail: 1000
     }
});

// Broadcast Queue (Rate Limited, Lower Priority)
export const broadcastQueue = new Queue(BROADCAST_QUEUE_NAME, {
     connection: redisConfig,
     defaultJobOptions: {
          priority: 5, // Lower priority
          attempts: 5, // More attempts for delivery issues
          backoff: { type: 'exponential', delay: 5000 }, // Longer backoff
          removeOnComplete: true,
          removeOnFail: 5000
     }
});

// Helper to add OTP email job
export const addOtpEmailJob = async (email: string, otp: string, name?: string) => {
     await otpQueue.add('send-otp', {
          email,
          otp,
          name,
     });
};

// Helper to add Broadcast email job
export const addBroadcastJob = async (email: string, subject: string, template: string, data: Record<string, string>, cta_text?: string, cta_url?: string) => {
     await broadcastQueue.add('send-broadcast', {
          email,
          subject,
          template,
          data,
          cta_text,
          cta_url,
     });
};
