"use node";

import { action } from "../_generated/server";
import { withRetry } from "../lib/utils";

export const testRetryBypass = action({
  args: {},
  handler: async (): Promise<any> => {
    let attempts = 0;
    
    console.log("[TestRetry] Starting retry test...");
    console.log("[TestRetry] SKIP_RATE_LIMITS:", process.env.SKIP_RATE_LIMITS);

    try {
      await withRetry(async () => {
        attempts++;
        console.log(`[TestRetry] Attempt ${attempts}...`);
        
        // Fail twice, succeed on 3rd
        if (attempts < 3) {
          const error = new Error("Simulated 429 Too Many Requests");
          (error as any).status = 429;
          throw error;
        }
        
        return "Success on attempt 3";
      });
      
      console.log("[TestRetry] ✅ Retry test completed successfully.");
      return { success: true, attempts };
    } catch (e) {
      console.error("[TestRetry] ❌ Retry test failed:", e);
      return { success: false, error: String(e), attempts };
    }
  },
});
