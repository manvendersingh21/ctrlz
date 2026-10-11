import { handle } from "@/lib/http";
import { resetWorld } from "@/lib/seed";

export const maxDuration = 120;

export const POST = handle(async () => resetWorld());
