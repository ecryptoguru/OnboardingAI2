import { mutation } from "./_generated/server";
import { validateAuth } from "./lib/auth_utils";

/**
 * Generic file upload helpers used across the app.
 * Call generateUploadUrl from the client, POST the file to the returned URL,
 * and pass the storageId to the relevant action/mutation.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});
