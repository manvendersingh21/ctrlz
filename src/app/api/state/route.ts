import { handle } from "@/lib/http";
import { snapshot } from "@/lib/state";

export const GET = handle(async () => snapshot());
