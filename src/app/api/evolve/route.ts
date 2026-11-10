import { z } from "zod";
import { evolveGuardrail } from "@/lib/evolve";
import { handle } from "@/lib/http";

export const maxDuration = 120;

const Body = z.object({ incidentId: z.string().min(1) });

export const POST = handle(async (req: Request) => evolveGuardrail(Body.parse(await req.json()).incidentId));
