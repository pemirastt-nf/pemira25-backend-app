import { db } from '../config/db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function seedAdmin() {
     console.log('Seeding admin...');

     const hashedPassword = await bcrypt.hash('oktaganteng12', 10);

     const adminData = {
          nim: 'admin',
          email: 'hi@oktaa.my.id',
          name: 'Super Admin',
          password: hashedPassword,
          role: 'super_admin',
          batch: null,
          hasVoted: false,
          accessType: 'online',
          voteMethod: null,
     };

     const existing = await db.select().from(users).where(eq(users.nim, 'admin'));
     if (existing.length === 0) {
          await db.insert(users).values(adminData);
          console.log('Admin created.');
     } else {
          await db.update(users).set(adminData).where(eq(users.nim, 'admin'));
          console.log('Admin updated.');
     }

     console.log('Done.');
     process.exit(0);
}

seedAdmin().catch((err) => {
     console.error('Seed error:', err);
     process.exit(1);
});
