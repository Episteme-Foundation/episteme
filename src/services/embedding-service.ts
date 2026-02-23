import OpenAI from "openai";
import { loadConfig } from "../config.js";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const config = loadConfig();
  _client = new OpenAI({ apiKey: config.openaiApiKey });
  return _client;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getClient();
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    dimensions: 1536,
  });
  return response.data[0]!.embedding;
}

export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getClient();
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
    dimensions: 1536,
  });
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
