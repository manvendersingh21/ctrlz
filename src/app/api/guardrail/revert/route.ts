import { revertGuardrail } from "@/lib/evolve";
import { handle } from "@/lib/http";

export const POST = handle(async () => revertGuardrail());
