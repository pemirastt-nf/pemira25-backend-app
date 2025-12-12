import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import { promises as dns } from 'dns';
import { URL } from 'url';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function resolveHostToIPv4(connectionString: string): Promise<string> {
     try {
          const url = new URL(connectionString);
          const hostname = url.hostname;

          // Skip resolution for localhost or IP addresses
          const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
          if (hostname === 'localhost' || isIp) {
               return connectionString;
          }

          console.log(`Resolving IP for ${hostname}...`);
          const addresses = await dns.resolve4(hostname);

          if (addresses && addresses.length > 0) {
               console.log(`Resolved to IPv4: ${addresses[0]}`);
               url.hostname = addresses[0];
               return url.toString();
          }
     } catch (error) {
          console.warn('Manual DNS resolution failed, using original connection string:', error);
     }
     return connectionString;
}

async function main() {
     console.log('Running migrations...');

     let connectionString = process.env.DATABASE_URL;

     if (!connectionString) {
          // Fallback or construct from individual env vars if needed
          const user = process.env.DB_USER || 'postgres';
          const pass = process.env.DB_PASSWORD || 'postgres';
          const host = process.env.DB_HOST || 'localhost';
          const port = process.env.DB_PORT || '5432';
          const dbName = process.env.DB_NAME || 'pemira_db';
          connectionString = `postgres://${user}:${pass}@${host}:${port}/${dbName}`;
     }

     // Force IPv4
     const finalConnectionString = await resolveHostToIPv4(connectionString);

     const pool = new Pool({
          connectionString: finalConnectionString,
          ssl: { rejectUnauthorized: false }
     });

     const db = drizzle(pool);

     try {
          await migrate(db, { migrationsFolder: 'drizzle' });
          console.log('Migrations completed successfully');
     } catch (error) {
          console.error('Migration failed:', error);
          process.exit(1);
     } finally {
          await pool.end();
     }
}

main();
