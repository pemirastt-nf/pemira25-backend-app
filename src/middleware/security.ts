import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Express } from 'express';

export const configureSecurity = (app: Express) => {
     app.use(helmet());

     const limiter = rateLimit({
          windowMs: 15 * 60 * 1000, // 15 minutes
          limit: 10000, // Increased to 10000 to handle campus NAT/WiFi (shared IPs)
          standardHeaders: true,
          legacyHeaders: false,
          message: 'Too many requests from this IP, please try again after 15 minutes',
     });

     app.use(limiter);
};
