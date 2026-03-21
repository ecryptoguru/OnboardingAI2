"use node";

import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";

interface UgcUniversity {
  uni_name: string;
  address: string | null;
  Zip: string | null;
  state: string;
  uni_type: string | null;
  url: string | null;
  NM_VC: string | null;
  NM_REG: string | null;
  [key: string]: any;
}

export const fetchFromUgc = action({
  args: {},
  handler: async (ctx): Promise<{ addedCount: number }> => {
    console.log("Starting UGC sync fetch...");
    
    // unitypeID=0 fetches all universities
    const response = await fetch("https://www.ugc.gov.in/universitydetails/Getuniversity_details?unitypeID=0", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.ugc.gov.in/universitydetails/university",
        "Origin": "https://www.ugc.gov.in",
        "X-Requested-With": "XMLHttpRequest"
      }
    });
    
    if (!response.ok) {
      throw new Error(`UGC API returned status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data || !data.List || !Array.isArray(data.List)) {
      throw new Error("Invalid response format from UGC API");
    }

    const rawList: UgcUniversity[] = data.List;
    console.log(`Fetched ${rawList.length} universities from UGC.`);

    // Map fields to our schema and filter
    const companiesToSync = rawList
      .filter(item => {
        const name = item.uni_name.trim().toLowerCase();
        return name.includes("yenepoya") || name.includes("vit university") || name.includes("vellore institute of technology");
      })
      .map(item => ({
      university_name: item.uni_name.trim(),
      state: item.state.trim(),
      address: item.address || undefined,
      zip_code: item.Zip || undefined,
      ugc_status: item.status || undefined,
      website: item.url || undefined,
      type: item.uni_type || undefined,
      vc_name: item.NM_VC || undefined,
      registrar_name: item.NM_REG || undefined,
    }));

    // Trigger the mutation to save data
    const result: { addedCount: number } = await ctx.runMutation(api.universities.bulkSyncUgc, {
      universities: companiesToSync
    });

    console.log(`Sync complete. Added ${result.addedCount} new universities.`);
    return result;
  },
});
