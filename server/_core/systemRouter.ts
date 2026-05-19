import { router, publicProcedure } from "./trpc";

export const systemRouter = router({
  health: publicProcedure.query(() => ({ status: "ok", timestamp: new Date().toISOString() })),
});
