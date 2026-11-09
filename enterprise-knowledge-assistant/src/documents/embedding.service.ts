import { openai } from "../index.js";
import { env } from "../config/env.js";

export async function createEmbedding(
  text: string
): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: env.embeddingModel,
    input: text,
  });

  return response.data[0].embedding;
}