
import { db } from './config/db';
import { users, candidates } from './db/schema';


async function seed() {
     console.log('Seeding...');

     // Users
     await db.insert(users).values([
          { nim: 'admin', role: 'admin' },
          { nim: '12345', role: 'voter' }
     ]).onConflictDoNothing();

     // Candidates
     await db.insert(candidates).values([
          {
               orderNumber: 1,
               name: 'Budi Santoso & Siti Aminah',
               vision: 'Mewujudkan BEM STTNF yang inklusif, inovatif, dan berintegritas.',
               mission: 'Meningkatkan partisipasi mahasiswa dalam kegiatan kampus.\nMembangun kolaborasi strategis dengan pihak eksternal.\nMengoptimalkan penggunaan teknologi dalam layanan kemahasiswaan.',
               photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8YXZhdGFyfGVufDB8fDB8fHww'
          },
          {
               orderNumber: 2,
               name: 'Andi Pratama & Rina Wati',
               vision: 'STTNF Berdaya, Mahasiswa Berkarya.',
               mission: 'Memfasilitasi pengembangan minat dan bakat mahasiswa.\nMenciptakan lingkungan kampus yang aspiratif dan demokratis.\nMenjaga transparansi dan akuntabilitas organisasi.',
               photoUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8YXZhdGFyfGVufDB8fDB8fHww'
          }
     ]).onConflictDoNothing();

     console.log('Seeding complete');
     process.exit(0);
}

seed();
