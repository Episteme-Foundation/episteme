import { z } from "zod";
import { uuidSchema, stanceEnum } from "./common.js";

export const argumentResponse = z.object({
  id: uuidSchema,
  claim_id: uuidSchema,
  stance: stanceEnum,
  content: z.string(),
  evidence_urls: z.array(z.string()),
  created_by: z.string(),
  created_at: z.string(),
});
