import { mutation } from "./_generated/server";

export default mutation({
  args: {},
  handler: async (ctx) => {
    const universities = await ctx.db.query("universities").collect();
    
    // Group by normalized name
    const grouped = new Map<string, any[]>();
    for (const uni of universities) {
      const name = uni.university_name.trim().toLowerCase();
      if (!grouped.has(name)) {
        grouped.set(name, []);
      }
      grouped.get(name)!.push(uni);
    }
    
    let deletedCount = 0;
    for (const [name, unis] of grouped.entries()) {
      if (unis.length > 1) {
        // Sort by some criteria if needed, or just keep the first one
        // Let's keep the one that has UGC data if possible, or just the first one.
        unis.sort((a, b) => {
           // Prefer ones with ugc_status mapped
           if (a.ugc_status && !b.ugc_status) return -1;
           if (!a.ugc_status && b.ugc_status) return 1;
           return 0;
        });
        
        // Keep the first one, delete the rest
        const toDelete = unis.slice(1);
        for (const uni of toDelete) {
          await ctx.db.delete(uni._id);
          deletedCount++;
        }
      }
    }
    
    return { success: true, deletedCount };
  },
});
