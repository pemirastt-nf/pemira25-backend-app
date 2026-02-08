import { Response } from 'express';
import { db } from '../config/db';
import { votes, users, candidates, offlineVoteLogs } from '../db/schema';
import { eq, sql, and, isNull } from 'drizzle-orm';
import { AuthRequest } from '../middleware/authMiddleware';
import { Request } from 'express';

import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 30 }); // 30 seconds cache

export const vote = async (req: AuthRequest, res: Response) => {
     const { candidateId } = req.body;
     const userId = req.user.id;

     if (!candidateId) {
          return res.status(400).json({ message: 'Candidate ID is required' });
     }

     try {
          await db.transaction(async (tx) => {
               // Lock the user row to prevent race conditions (Double Voting)
               const userCheck = await tx.execute(sql`SELECT has_voted FROM users WHERE id = ${userId} FOR UPDATE`);

               if (userCheck.rows[0].has_voted) {
                    throw new Error('User has already voted');
               }

               await tx.insert(votes).values({
                    candidateId: candidateId,
                    source: 'online'
               });

               await tx.update(users)
                    .set({ hasVoted: true, votedAt: sql`now()` })
                    .where(eq(users.id, userId));
          });

          cache.del("stats");
          cache.del("results");
          cache.del("recent-activity");

          res.json({ message: 'Vote cast successfully' });
     } catch (error: any) {
          console.error('Vote error:', error);
          if (error.message === 'User has already voted') {
               return res.status(400).json({ message: error.message });
          }
          res.status(500).json({ message: 'Error casting vote' });
     }
};

export const getVoteStatus = async (req: AuthRequest, res: Response) => {
     const userId = req.user.id;
     try {
          const result = await db.select({ hasVoted: users.hasVoted }).from(users).where(eq(users.id, userId));
          res.json({ hasVoted: result[0]?.hasVoted || false });
     } catch (error) {
          res.status(500).json({ message: 'Error checking status' });
     }
}

export const getStats = async (req: Request, res: Response) => {
     try {
          const cached = cache.get("stats");
          if (cached) return res.json(cached);

          const userCount = await db.select({ count: sql<number>`count(*)` }).from(users).where(and(isNull(users.deletedAt), sql`${users.nim} != 'admin'`));
          const voteCount = await db.select({ count: sql<number>`count(*)` }).from(votes);

          const onlineCount = await db.select({ count: sql<number>`count(*)` }).from(votes).where(eq(votes.source, 'online'));
          const offlineCount = await db.select({ count: sql<number>`count(*)` }).from(votes).where(eq(votes.source, 'offline'));

          const totalVoters = Number(userCount[0].count);
          const votesCast = Number(voteCount[0].count);
          const turnout = totalVoters > 0 ? ((votesCast / totalVoters) * 100).toFixed(2) + "%" : "0%";

          const data = {
               totalVoters,
               votesCast,
               turnout,
               onlineVotes: Number(onlineCount[0].count),
               offlineVotes: Number(offlineCount[0].count)
          };

          cache.set("stats", data);
          res.json(data);
     } catch (error) {
          console.error("Stats Error", error);
          res.status(500).json({ message: 'Error fetching stats' });
     }
}

export const getResults = async (req: Request, res: Response) => {
     try {
          const cached = cache.get("results");
          if (cached) return res.json(cached);

          // Group by candidate and source
          const results = await db.select({
               candidateId: votes.candidateId,
               source: votes.source,
               count: sql<number>`count(*)`
          })
               .from(votes)
               .groupBy(votes.candidateId, votes.source);

          // Fetch candidates to map names
          const candidatesData = await db.select().from(candidates);

          // Map results to candidates
          const finalResults = candidatesData.map(c => {
               const onlineCount = results.find(r => r.candidateId === c.id && r.source === 'online')?.count || 0;
               const offlineCount = results.find(r => r.candidateId === c.id && r.source === 'offline')?.count || 0;

               return {
                    id: c.id,
                    name: c.name,
                    orderNumber: c.orderNumber,
                    onlineVotes: Number(onlineCount),
                    offlineVotes: Number(offlineCount),
                    votes: Number(onlineCount) + Number(offlineCount),
                    fill: c.orderNumber === 1 ? "#3b82f6" : "#ef4444"
               };
          });

          cache.set("results", finalResults);
          res.json(finalResults);
     } catch (error) {
          console.error("Results Error", error);
          res.status(500).json({ message: 'Error fetching results' });
     }
}

export const checkIn = async (req: AuthRequest, res: Response) => {
     const { nim } = req.body;
     const operatorId = req.user.id; // Admin/Panitia who checks in

     if (!nim) return res.status(400).json({ message: 'NIM is required' });

     try {
          await db.transaction(async (tx) => {
               // Lock user row
               const userRes = await tx.execute(sql`SELECT * FROM users WHERE nim = ${String(nim)} FOR UPDATE`);

               if (userRes.rowCount === 0) {
                    throw new Error('Mahasiswa tidak ditemukan');
               }

               const user = userRes.rows[0];

               if (user.has_voted) {
                    throw new Error(`Mahasiswa SUDAH memilih! (${user.vote_method === 'online' ? 'Via Online' : 'Via Offline'})`);
               }

               // Mark as Offline Voted + Check-in Audit
               await tx.update(users).set({
                    hasVoted: true,
                    voteMethod: 'offline', // Explicitly offline
                    accessType: 'offline', // Update eligibility to strict offline
                    votedAt: new Date(),
                    checkedInAt: new Date(),
                    checkedInBy: operatorId
               }).where(eq(users.id, String(user.id)));
          });

          // Fetch user name for response (outside tx is fine)
          const updatedUser = await db.select({ name: users.name, nim: users.nim }).from(users).where(eq(users.nim, String(nim)));

          res.json({
               message: 'Check-in Berhasil. Hak suara online dicabut.',
               user: updatedUser[0]
          });

     } catch (error) {
          console.error("Check-in Error", error);
          res.status(500).json({ message: 'Gagal melakukan check-in' });
     }
}

export const unCheckIn = async (req: AuthRequest, res: Response) => {
     const { nim } = req.body;

     if (!nim) return res.status(400).json({ message: 'NIM is required' });

     try {
          const userRes = await db.select().from(users).where(eq(users.nim, String(nim)));
          if (userRes.length === 0) return res.status(404).json({ message: 'Mahasiswa tidak ditemukan' });

          const user = userRes[0];

          if (!user.hasVoted) {
               return res.status(400).json({ message: 'Mahasiswa belum di-checkin.' });
          }

          if (user.voteMethod === 'online') {
               return res.status(400).json({ message: 'Tidak bisa undo: Mahasiswa sudah voting ONLINE.' });
          }

          await db.update(users).set({
               hasVoted: false,
               voteMethod: null,
               votedAt: null,
               checkedInAt: null,
               checkedInBy: null
          }).where(eq(users.id, user.id));

          res.json({
               message: 'Undo Check-in berhasil. Status voting di-reset.',
               user: { name: user.name, nim: user.nim }
          });

     } catch (error) {
          console.error("UnCheck-in Error", error);
          res.status(500).json({ message: 'Gagal melakukan undo check-in' });
     }
}

// Enhanced Manual Vote (Tally Input) with Inflation Guard
export const manualVote = async (req: AuthRequest, res: Response) => {
     const { candidateId, count } = req.body;
     const voteCount = Math.max(1, parseInt(count) || 1);
     const operatorId = req.user.id;

     if (!candidateId) {
          return res.status(400).json({ message: 'Candidate ID is required' });
     }

     try {
          // 1. Get total Offline Voters (The "DPT" for offline) - People who actually checked in
          const offlineVotersRes = await db.select({ count: sql<number>`count(*)` })
               .from(users)
               .where(eq(users.voteMethod, 'offline'));

          const totalOfflineVoters = Number(offlineVotersRes[0].count);

          // 2. Get total Offline Votes already tallied (History)
          // We count from 'votes' table where source='offline'
          const talliedRes = await db.select({ count: sql<number>`count(*)` })
               .from(votes)
               .where(eq(votes.source, 'offline'));

          const totalTallied = Number(talliedRes[0].count);

          // 3. INFLATION GUARD: Check if New Votes + Existing Tallied > Total Checked-in People
          if ((totalTallied + voteCount) > totalOfflineVoters) {
               return res.status(400).json({
                    message: 'Jumlah suara melebihi jumlah mahasiswa yang hadir (Check-in).',
                    detail: {
                         present: totalOfflineVoters,
                         tallied: totalTallied,
                         attempted: voteCount,
                         excess: (totalTallied + voteCount) - totalOfflineVoters,
                         remaining: Math.max(0, totalOfflineVoters - totalTallied)
                    }
               });
          }

          // 4. Proceed: Record Audit Log
          await db.insert(offlineVoteLogs).values({
               candidateId: candidateId,
               count: voteCount,
               inputBy: operatorId
          });

          // 5. Proceed: Insert Actual Votes (for calculation)
          const values = Array(voteCount).fill({
               candidateId: candidateId,
               source: 'offline'
          });

          await db.insert(votes).values(values);

          cache.del("stats");
          cache.del("results");

          res.json({ message: `${voteCount} Offline vote(s) successfully verified and tallied.` });
     } catch (error: any) {
          console.error('Manual Vote Error:', error);
          res.status(500).json({ message: 'Error recording offline vote' });
     }
}

import { desc } from 'drizzle-orm';

export const getRecentActivity = async (req: Request, res: Response) => {
     try {
          const recentVotes = await db.select({
               id: votes.id,
               timestamp: votes.timestamp,
               candidateId: votes.candidateId,
               source: votes.source,
               candidateName: candidates.name
          })
               .from(votes)
               .leftJoin(candidates, eq(votes.candidateId, candidates.id))
               .orderBy(desc(votes.timestamp))
               .limit(10);

          res.json(recentVotes);
     } catch (error) {
          console.error("Activity Error", error);
          res.status(500).json({ message: 'Error fetching activity' });
     }
}

export const deleteVote = async (req: Request, res: Response) => {
     const { id } = req.params;
     try {
          const result = await db.execute(sql`
               DELETE FROM votes 
               WHERE id = ${id} 
               AND timestamp > NOW() - INTERVAL '1 minute'
               RETURNING id
          `);

          if (result.rowCount === 0) {
               const exists = await db.select({ id: votes.id }).from(votes).where(eq(votes.id, id));
               if (exists.length === 0) {
                    return res.status(404).json({ message: 'Vote not found' });
               }
               return res.status(403).json({ message: 'Cannot delete vote older than 1 minute (Permanent)' });
          }

          cache.del("stats");
          cache.del("results");

          res.json({ message: 'Vote deleted successfully' });
     } catch (error) {
          console.error("Delete Vote Error", error);
          res.status(500).json({ message: 'Failed to delete vote' });
     }
}
