import fs from "fs";
import path from "path";
import { createClerkClient } from "@clerk/backend";
import { test as teardown } from "@playwright/test";

const userStateFile = path.join(__dirname, ".clerk", "test-user.json");

teardown("delete the provisioned test user", async () => {
  if (!fs.existsSync(userStateFile)) return;

  const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  const { userId, email } = JSON.parse(fs.readFileSync(userStateFile, "utf-8")) as {
    userId: string;
    email: string;
  };

  try {
    await client.users.deleteUser(userId);
  } catch {
    const { data: found } = await client.users.getUserList({ emailAddress: [email] });
    for (const user of found) {
      await client.users.deleteUser(user.id);
    }
  }

  fs.unlinkSync(userStateFile);
});
