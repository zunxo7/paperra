import "../load-env.ts";
import { createClient } from "@libsql/client";
import fetch from "node-fetch";

// Configuration from environment
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
const API_URL = "http://localhost:3000/api/user/register";

async function runTest() {
  if (!TURSO_URL || !TURSO_TOKEN) {
    console.error("✗ Error: Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables.");
    process.exit(1);
  }

  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  const ip = "::1"; // Localhost IP in many environments

  console.log("\n--- Paperra Rate Limit Automated Test ---");

  try {
    // 1. Reset tracking for local IP to ensure test is repeatable
    await client.execute({
      sql: "DELETE FROM registration_tracking WHERE ip_address = ?",
      args: [ip]
    });
    console.log(`✓ Reset tracking for local IP (${ip})`);

    const user1 = `test_user_1_${Date.now()}`;
    const user2 = `test_user_2_${Date.now()}`;

    // 2. First registration (should succeed)
    console.log(`\n1. Attempting first registration (${user1})...`);
    const res1 = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user1, password: "password123" })
    });
    
    if (res1.status === 200) {
      console.log("✓ Success: First registration accepted.");
    } else {
      const text = await res1.text();
      console.error(`✗ Error: First registration failed with status ${res1.status}:`, text);
      process.exit(1);
    }

    // 3. Second registration (should fail)
    console.log(`\n2. Attempting second registration from same IP (${user2})...`);
    const res2 = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user2, password: "password123" })
    });

    if (res2.status === 429) {
      const data: any = await res2.json();
      console.log("✓ Success: Second registration correctly blocked with 429.");
      console.log(`  Message: "${data.error}"`);
    } else {
      console.error(`✗ Error: Second registration was NOT blocked! Status: ${res2.status}`);
      process.exit(1);
    }

    console.log("\n--- All Tests Passed ✅ ---\n");
    process.exit(0);
  } catch (error) {
    console.error("\n✗ Test failed with unexpected error:", error);
    process.exit(1);
  }
}

runTest();
