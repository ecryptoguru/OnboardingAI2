import { query } from "./_generated/server";
import { validateAdmin } from "./lib/auth_utils";

export const getTotalUsers = query({
  args: {},
  handler: async (ctx) => {
    await validateAdmin(ctx);
    const users = await ctx.db.query("users").take(1000);
    return users.length;
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await validateAdmin(ctx);
    const users = await ctx.db.query("users").take(1000);
    return users.map((u) => ({
      _id: u._id,
      email: u.email,
      name: u.name,
      emailVerificationTime: u.emailVerificationTime,
      created_at: u._creationTime,
    }));
  },
});
