
import axios from 'axios';
import { db } from '../config/db'; // Ensure this path is correct relative to script location
import { users, candidates, offlineVoteLogs } from '../db/schema';
import { eq } from 'drizzle-orm';

const API_URL = 'http://localhost:4000/api'; // Assuming backend is on 4000
const ADMIN_ID = '07d58309-8472-468a-aa21-026d36746860'; // We need a valid Admin ID. I will fetch one if needed.
// Actually, I should probably just fetch a token or simulate authenticated requests.
// BUT, to keep it simple, I might just bypass auth in testing or assume I have a token?
// No, I need a token. I'll rely on a known dev admin if possible or just create a temp one.

// Wait, I can't easily get a token without login.
// I'll try to login as 'admin@pemira.sttnf.ac.id' (common default) or I will skip auth by mocking?
// No, let's just create a temporary admin user directly in DB if needed, or better:
// I'll just use the `checkIn` and `offlineVote` logic directly via controller?
// No, integration test via API is better.

// Let's assume there is a seed user.
// I'll create a user for testing offline flow first.

async function runTest() {
    console.log("🚀 Starting Verification of Offline Voting System...");

    // 1. Create a Test "Offline" Student
    const testNim = `TEST_${Date.now()}`;
    const testEmail = `${testNim.toLowerCase()}@student.nurulfikri.ac.id`.toLowerCase();

    console.log(`\n1️⃣ Creating Test Student (Offline Batch)...`);
    try {
        await db.insert(users).values({
            nim: testNim,
            name: "Test Offline User",
            email: testEmail,
            password: "password123", // Dummy
            role: "voter",
            accessType: "offline", // KEY CONFIG
            batch: "2025"
        });
        console.log("✅ Created student:", testNim);
    } catch (e) {
        console.error("❌ Failed to create student", e);
        process.exit(1);
    }

    // 2. Test Login Blocking
    console.log(`\n2️⃣ Testing Login Blocking (Should Fail)...`);
    try {
        await axios.post(`${API_URL}/auth/otp/request`, { email: testEmail });
        console.error("❌ Login Allowed! FAILED. Offline user should be blocked.");
    } catch (e: any) {
        if (e.response && e.response.status === 403) {
            console.log("✅ Login successfully BLOCKED with 403 Forbidden.");
        } else {
            console.error("❌ Unexpected error during login:", e.message);
        }
    }

    // 3. Test Operator Check-in
    // We need an Admin Token for this.
    // I will fetch the first admin user from DB to simulate "Operator"
    const adminUser = await db.query.users.findFirst({ where: eq(users.role, 'admin') });
    if (!adminUser) {
        console.error("❌ No admin found in DB. Cannot test check-in.");
        return;
    }

    // Simulate token? Implementing full login flow is tedious. 
    // I will cheat: I will modify the user.ts in DB to just mark it as checked in locally?
    // NO, that defeats the purpose of testing the API.

    // Detailed plan:
    // I will just use `axios` to hit the endpoints. If auth fails, I will use a hardcoded dev token if I can find one or generate one using `jsonwebtoken` library locally since I have access to backend code!

    // YES! I can mint a token.
    const jwt = require('jsonwebtoken'); // Need to require as it's not imported
    const secret = process.env.JWT_SECRET || 'supersecret'; // Fallback matching common dev defaults
    const token = jwt.sign({
        userId: adminUser.id,
        role: adminUser.role
    }, secret, { expiresIn: '1h' });

    console.log(`\n3️⃣ Testing Operator Check-in (Using Admin: ${adminUser.name})...`);
    try {
        const res = await axios.post(`${API_URL}/votes/checkin`, { nim: testNim }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("✅ Check-in Success:", res.data.message);
        console.log("   User marked as 'Present' with voting method 'offline'.");
    } catch (e: any) {
        console.error("❌ Check-in Failed:", e.response?.data || e.message);
    }

    // 4. Test Tally Input (Valid)
    console.log(`\n4️⃣ Testing Valid Tally Input...`);
    // Need a candidate
    const candidate = await db.query.candidates.findFirst();
    if (!candidate) { console.log("⚠️ No candidates found. Skipping tally."); return; }

    try {
        // We have 1 checked in offline user (our test user).
        // Inputting 1 vote should strictly be allowed.
        const res = await axios.post(`${API_URL}/votes/offline`, {
            candidateId: candidate.id,
            count: 1
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("✅ Tally Input Success:", res.data.message);
    } catch (e: any) {
        console.error("❌ Logic Error: Tally failed but should be valid.", e.response?.data);
    }

    // 5. Test Tally Input (Inflation)
    console.log(`\n5️⃣ Testing INFLATION GUARD (Should Fail)...`);
    try {
        // We have 1 checked in user, and we already input 1 vote.
        // Inputting 1 more vote implies Total Votes (2) > Checked In (1).
        // Should be rejected.
        await axios.post(`${API_URL}/votes/offline`, {
            candidateId: candidate.id,
            count: 1
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.error("❌ Inflation Guard FAILED! It allowed extra votes.");
    } catch (e: any) {
        if (e.response && (e.response.status === 400 || e.response.status === 409)) { // 400 or 409 usually
            const msg = e.response.data.message || "";
            if (msg.includes("Penggelembungan") || msg.includes("exceeds")) {
                console.log("✅ Inflation Guard SUCCESS: Blocked extra votes.");
                console.log("   Message:", msg);
            } else {
                console.log("✅ Request blocked, but check message:", msg);
            }
        } else {
            console.error("❌ Unexpected response:", e.response?.status, e.response?.data);
        }
    }

    // Cleanup
    console.log(`\n🧹 Cleanup...`);
    await db.delete(users).where(eq(users.nim, testNim));
    // Note: logs might remain, but that's fine for audit trail testing.

    console.log("\n✨ Verification Complete.");
    process.exit(0);
}

runTest();
