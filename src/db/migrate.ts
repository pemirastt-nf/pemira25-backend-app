import dns from 'dns';
// Force IPv4 to avoid ENETUNREACH errors in environments with poor IPv6 support (e.g. GitHub Actions)
if (dns.setDefaultResultOrder) {
     dns.setDefaultResultOrder('ipv4first');
}

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from '../config/db';
import pool from '../config/db';

async function main() {
     console.log('Running migrations...');
     try {
          // This will run migrations on the database, skipping the ones already applied
          await migrate(db, { migrationsFolder: 'drizzle' });
          console.log('Migrations completed successfully');
     } catch (error) {
          console.error('Migration failed:', error);
          process.exit(1);
     } finally {
          // Don't forget to close the connection, otherwise the script won't exit
          await pool.end();
     }
}

main();
