import { z } from "zod";
import { handle } from "@/lib/http";
import { openIncident, runIncident } from "@/lib/rollback";

export const maxDuration = 120;

const Body = z.union([
  z.object({ rootId: z.string().min(1), reason: z.string().max(300).default("reported as poisoned") }),
  z.object({ resume: z.string().min(1) }),
]);

export const POST = handle(async (req: Request) => {
  const b = Body.parse(await req.json());
  return "resume" in b ? runIncident(b.resume) : openIncident(b.rootId, b.reason);
});
