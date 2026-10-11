import { z } from "zod";
import { runTurn } from "@/lib/agent";
import { handle } from "@/lib/http";

export const maxDuration = 60;

const Body = z.object({ agentId: z.enum(["concierge", "finance"]), speaker: z.string().min(1).max(40), text: z.string().min(1).max(1000) });

export const POST = handle(async (req: Request) => runTurn(Body.parse(await req.json())));
