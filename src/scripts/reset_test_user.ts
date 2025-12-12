
import { db } from '../config/db';
import { users, votes } from '../db/schema';
import { eq } from 'drizzle-orm';

async function resetUser() {
     const targetEmail = '0110224174@student.nurulfikri.ac.id';
     console.log(`Resetting vote status for ${targetEmail}...`);

     // Get user
     const userResult = await db.select().from(users).where(eq(users.email, targetEmail));

     if (userResult.length === 0) {
          console.error('User not found!');
          process.exit(1);
     }

     const user = userResult[0];

     // Delete vote record
     await db.delete(votes).where(eq(votes.voterId, user.id));
     console.log('Vote record deleted.');

     // Reset hasVoted flag
     await db.update(users)
          .set({ hasVoted: false })
          .where(eq(users.id, user.id));

     console.log('User hasVoted flag reset to false.');

     console.log('Done! valid for re-voting.');
     process.exit(0);
}

resetUser();
