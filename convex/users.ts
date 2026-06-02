import { query } from "./_generated/server";
import { validateAuth } from "./lib/auth_utils";

export const getTotalUsers = query({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    const users = await ctx.db.query("users").take(1000);
    return users.length;
  },
});
