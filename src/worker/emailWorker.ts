import { Worker } from 'bullmq';
import redisConfig from '../config/redis';
import { sendOtpEmail, sendEmail } from '../config/mail';
import { EMAIL_QUEUE_NAME } from '../queue/emailQueue';

export const initEmailWorker = () => {
     const worker = new Worker(EMAIL_QUEUE_NAME, async (job) => {
          if (job.name === 'send-otp') {
               const { email, otp, name } = job.data;
               console.log(`[Worker] Processing OTP email for ${email}`);
               const success = await sendOtpEmail(email, otp, name);
               if (!success) throw new Error(`Failed to send OTP to ${email}`);
               return { sent: true, type: 'otp', email };
          }

          if (job.name === 'send-broadcast') {
               const { email, subject, template, data } = job.data;
               console.log(`[Worker] Processing Broadcast email for ${email}`);

               // Simple template replacement
               let htmlContent = template;
               Object.keys(data || {}).forEach(key => {
                    const regex = new RegExp(`{{${key}}}`, 'g');
                    htmlContent = htmlContent.replace(regex, data[key]);
               });

               // Wrapper for styling consistency if needed, or raw html
               const success = await sendEmail(email, subject, htmlContent);
               if (!success) throw new Error(`Failed to send Broadcast to ${email}`);
               return { sent: true, type: 'broadcast', email };
          }
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
