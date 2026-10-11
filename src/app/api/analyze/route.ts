import { z } from "zod";
import { analyzeMessage } from "@/lib/analyze";
import { handle } from "@/lib/http";

export const maxDuration = 30;

const Body = z.object({ speaker: z.enum(["alice", "bob", "mallory"]), text: z.string().min(1).max(600) });

export const POST = handle(async (req: Request) => {
  const b = Body.parse(await req.json());
  return analyzeMessage(b.speaker, b.text);
});
