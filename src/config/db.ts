import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const poolConfig = process.env.DATABASE_URL
     ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
     : {
          user: process.env.DB_USER || 'postgres',
          host: process.env.DB_HOST || 'localhost',
          database: process.env.DB_NAME || 'pemira_db',
          password: process.env.DB_PASSWORD || 'postgres',
          port: parseInt(process.env.DB_PORT || '5432'),
     };

const pool = new Pool(poolConfig);

export const db = drizzle(pool, { schema });
export default pool; // Keep pool for any raw queries if absolutely needed, but prefer 'db'
