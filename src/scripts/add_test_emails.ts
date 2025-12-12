
import { db } from '../config/db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

async function updateEmails() {
     console.log('Updating emails...');

     // Update admin
     await db.update(users)
          .set({ email: 'admin@sttnf.ac.id' })
          .where(eq(users.nim, 'admin'));

     // Update student
     await db.update(users)
          .set({ email: '0110224174@student.nurulfikri.ac.id', name: 'Oktaa' }) // Adding name for testing
          .where(eq(users.nim, '12345'));

     console.log('Emails updated.');
     process.exit(0);
}

updateEmails();
