import { z } from "zod";
import { feedback } from "@/lib/blame";
import { handle } from "@/lib/http";

const Body = z.object({ eventId: z.string().min(1).max(40), rating: z.enum(["up", "down"]), comment: z.string().max(500).optional() });

export const POST = handle(async (req: Request) => {
  const b = Body.parse(await req.json());
  return feedback(b.eventId, b.rating, b.comment);
});
