import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import cookieParser from 'cookie-parser';
import { configureSecurity } from './middleware/security';
import authRoutes from './routes/authRoutes';
import voteRoutes from './routes/voteRoutes';
import candidateRoutes from './routes/candidateRoutes';
import adminRoutes from './routes/adminRoutes';
import studentRoutes from './routes/studentRoutes';
import { db } from './config/db';
import { sql } from 'drizzle-orm';
import settingsRoutes from './routes/settings';
import broadcastRoutes from './routes/broadcastRoutes';

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Trust Vercel Proxy (Required for secure cookies)
app.set('trust proxy', 1);

// Middleware
app.use(cors({
     origin: [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
          'http://10.0.3.111:3000',
          'https://pemira-sttnf.vercel.app',
          'https://pemira.nurulfikri.ac.id',
          'https://pemira.oktaa.my.id',
          'https://admin-pemira-pi.vercel.app',
          process.env.FRONTEND_URL || ''
     ].filter(Boolean),
     credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Swagger Documentation
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger';
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Security
configureSecurity(app);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/broadcast', broadcastRoutes);

// Health check
app.get('/health', async (req, res) => {
     try {
          await db.execute(sql`SELECT 1`);
          res.json({ status: 'ok', timestamp: new Date(), dbStatus: 'ok' });
     } catch (error) {
          console.error('Health check failed:', error);
          res.status(500).json({ status: 'error', timestamp: new Date(), dbStatus: 'disconnected' });
     }
});

import { initEmailWorker } from './worker/emailWorker';

// ... imports

// Initialize Worker
initEmailWorker();

app.listen(PORT, () => {
     console.log(`Server running on port ${PORT}`);

     if (process.env.JWT_SECRET === undefined || process.env.JWT_SECRET === 'super_secret_key_change_me') {
          console.warn('\x1b[33m%s\x1b[0m', 'WARNING: You are using the default JWT_SECRET. This is insecure for production!');
          console.warn('\x1b[33m%s\x1b[0m', 'Please set a strong JWT_SECRET in your .env file.');
     }
});

export default app;
