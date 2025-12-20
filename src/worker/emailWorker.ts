import { Worker } from 'bullmq';
import redisConfig from '../config/redis';
import { sendOtpEmail } from '../config/mail';
import { EMAIL_QUEUE_NAME } from '../queue/emailQueue';

export const initEmailWorker = () => {
     const worker = new Worker(EMAIL_QUEUE_NAME, async (job) => {
          const { email, otp, name } = job.data;

          console.log(`[Worker] Processing OTP email for ${email}`);

          const success = await sendOtpEmail(email, otp, name);

          if (!success) {
               throw new Error(`Failed to send email to ${email}`);
          }

          return { sent: true, email };
     }, {
          connection: redisConfig,
          concurrency: 5, // Process 5 emails in parallel
     });

     worker.on('completed', (job) => {
          console.log(`[Worker] Job ${job.id} completed. Email sent to ${job.data.email}`);
     });

     worker.on('failed', (job, err) => {
          console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
     });

     console.log('[Worker] Email worker started');
     return worker;
};
