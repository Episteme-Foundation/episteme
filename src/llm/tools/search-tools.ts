import type Anthropic from "@anthropic-ai/sdk";
type Tool = Anthropic.Tool;
import { hybridSearch } from "../../services/search-service.js";

export function getSearchToolDefinitions(): Tool[] {
  return [
    {
      name: "search_claims",
      description:
        "Search the knowledge graph for claims matching a text query. " +
        "Uses hybrid keyword + semantic search.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "The search query text",
          },
          limit: {
            type: "integer",
            description: "Maximum number of results (default 10)",
          },
        },
        required: ["query"],
      },
    },
  ];
}

export async function executeSearchTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<string> {
  if (toolName !== "search_claims") {
    return `Error: Unknown tool: ${toolName}`;
  }

  const query = input.query as string;
  const limit = (input.limit as number) ?? 10;

  const { results } = await hybridSearch(query, { limit });
  return JSON.stringify({ query, results, count: results.length }, null, 2);
}
