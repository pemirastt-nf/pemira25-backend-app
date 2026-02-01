import { Worker } from 'bullmq';
import redisConfig from '../config/redis';
import { sendOtpEmail, sendEmail, wrapEmailBody, getButtonHtml } from '../config/mail';
import { OTP_QUEUE_NAME, BROADCAST_QUEUE_NAME } from '../queue/emailQueue';

export const initEmailWorker = () => {
     // OTP Worker: Fast, High Priority, No Rate Limit
     const otpWorker = new Worker(OTP_QUEUE_NAME, async (job) => {
          if (job.name === 'send-otp') {
               const { email, otp, name } = job.data;
               console.log(`[OTP-Worker] Processing OTP email for ${email}`);
               const success = await sendOtpEmail(email, otp, name);
               if (!success) throw new Error(`Failed to send OTP to ${email}`);
               return { sent: true, type: 'otp', email };
          }
     }, {
          connection: redisConfig,
          concurrency: 5,
     });

     otpWorker.on('completed', (job) => {
          console.log(`[OTP-Worker] Job ${job.id} completed. Email sent to ${job.data.email}`);
     });
     otpWorker.on('failed', (job, err) => {
          console.error(`[OTP-Worker] Job ${job?.id} failed: ${err.message}`);
     });

     // Broadcast Worker: Slow, Rate Limited
     const broadcastWorker = new Worker(BROADCAST_QUEUE_NAME, async (job) => {
          if (job.name === 'send-broadcast') {
               const { email, subject, template, data, cta_text, cta_url } = job.data;
               console.log(`[Broadcast-Worker] Processing Broadcast email for ${email}`);

               // Simple template replacement
               let content = template;
               Object.keys(data || {}).forEach(key => {
                    const regex = new RegExp(`{{${key}}}`, 'g');
                    content = content.replace(regex, data[key]);
               });

               // Inject CTA Button (Parameterized)
               // Pattern: {{cta_button|TEXT|URL}}
               const ctaRegex = /{{cta_button\|(.*?)\|(.*?)}}/g;
               content = content.replace(ctaRegex, (_: string, text: string, url: string) => getButtonHtml(text, url));

               // Legacy fallback for plain {{cta_button}} if we want to support it (optional)
               // For now, let's keep it strict to parameterized only as per plan.

               // Wrapper for styling consistency
               const htmlContent = wrapEmailBody(content);
               const success = await sendEmail(email, subject, htmlContent);
               if (!success) throw new Error(`Failed to send Broadcast to ${email}`);
               return { sent: true, type: 'broadcast', email };
          }
     }, {
          connection: redisConfig,
          concurrency: 5, // Can process 5 concurrently but...
          limiter: {
               // ...limited to 5 jobs every 5000ms (5 seconds) globally for this worker group
               max: 5,
               duration: 5000
          }
     });

     broadcastWorker.on('completed', (job) => {
          console.log(`[Broadcast-Worker] Job ${job.id} completed. Email sent to ${job.data.email}`);
     });
     broadcastWorker.on('failed', (job, err) => {
          console.error(`[Broadcast-Worker] Job ${job?.id} failed: ${err.message}`);
     });

     console.log('[Worker] Email workers started (OTP & Broadcast)');

     // Return list of workers if needed, or just standard
     return { otpWorker, broadcastWorker };
};
