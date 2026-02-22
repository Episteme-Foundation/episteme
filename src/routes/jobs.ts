import type { FastifyInstance } from "fastify";
import { getJobById } from "../services/job-service.js";

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  // GET /jobs/:job_id
  app.get<{ Params: { job_id: string } }>(
    "/:job_id",
    async (request, reply) => {
      const { job_id } = request.params;
      const job = await getJobById(job_id);

      if (!job) {
        return reply.code(404).send({ error: "Job not found" });
      }

      return reply.send({
        id: job.id,
        type: job.type,
        status: job.status,
        result: job.result,
        error: job.error,
      });
    }
  );
}
