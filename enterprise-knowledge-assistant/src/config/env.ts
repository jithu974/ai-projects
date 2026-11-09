import "dotenv/config";

export const env = {
  openaiApiKey: process.env.OPENAI_API_KEY!,
  openaiModel: process.env.OPENAI_MODEL!,
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL!,
  databaseUrl: process.env.DATABASE_URL!,
  port: Number(process.env.PORT ?? 3000),
};