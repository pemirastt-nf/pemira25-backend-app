import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { configureSecurity } from './middleware/security';
import authRoutes from './routes/authRoutes';
import voteRoutes from './routes/voteRoutes';
import candidateRoutes from './routes/candidateRoutes';
import { db } from './config/db';
import { sql } from 'drizzle-orm';

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
     origin: ['http://localhost:3000', 'http://10.0.3.111:3000'],
     credentials: true
}));
app.use(express.json());

// Security
configureSecurity(app);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/candidates', candidateRoutes);

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

app.listen(PORT, () => {
     console.log(`Server running on port ${PORT}`);

     if (process.env.JWT_SECRET === undefined || process.env.JWT_SECRET === 'super_secret_key_change_me') {
          console.warn('\x1b[33m%s\x1b[0m', 'WARNING: You are using the default JWT_SECRET. This is insecure for production!');
          console.warn('\x1b[33m%s\x1b[0m', 'Please set a strong JWT_SECRET in your .env file.');
     }
});

export default app;
