import { z } from "zod";
import { uuidSchema } from "./common.js";

export const sourceSubmitBody = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  content: z.string().optional(),
});

export const sourceSubmitResponse = z.object({
  source_id: uuidSchema,
  job_id: uuidSchema,
  status: z.literal("queued"),
});
