import { Queue } from 'bullmq';
import redisConfig from '../config/redis';

// Define the queue name
export const EMAIL_QUEUE_NAME = 'email-queue';

// Create the queue instance
export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
     connection: redisConfig,
});

// Helper to add OTP email job
export const addOtpEmailJob = async (email: string, otp: string, name?: string) => {
     await emailQueue.add('send-otp', {
          email,
          otp,
          name,
     }, {
          attempts: 3, // Retry 3 times if fails
          backoff: {
               type: 'exponential',
               delay: 1000,
          },
          removeOnComplete: true, // Keep Redis clean
          removeOnFail: 1000, // Keep last 1000 failed jobs for inspection
     });
};
// Helper to add Broadcast email job
export const addBroadcastJob = async (email: string, subject: string, template: string, data: Record<string, string>) => {
     await emailQueue.add('send-broadcast', {
          email,
          subject,
          template,
          data,
     }, {
          attempts: 3,
          backoff: {
               type: 'exponential',
               delay: 1000,
          },
          removeOnComplete: true,
          removeOnFail: 5000, // Keep failed jobs for debugging
     });
};
