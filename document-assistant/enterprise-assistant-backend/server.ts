const express = require('express');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const { OpenAI } = require('openai');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const upload = multer({ storage: multer.memoryStorage() });

// Simple chunking function (splits by roughly 1000 characters)
function chunkText(text: string, chunkSize = 1000): string[] {
  const words = text.split(/\s+/);
  const chunks = [];
  let currentChunk = [];

  for (const word of words) {
    currentChunk.push(word);
    if (currentChunk.join(' ').length >= chunkSize) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [];
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk.join(' '));
  return chunks;
}

app.post('/api/upload', upload.single('file'), async (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let stage = 'extracting document text';
  try {
    let text = '';
    if (req.file.mimetype === 'application/pdf') {
      const parser = new PDFParse({ data: req.file.buffer });
      try {
        const pdfData = await parser.getText();
        text = pdfData.text;
      } finally {
        await parser.destroy();
      }
    } else {
      text = req.file.buffer.toString('utf-8');
    }

    if (!text.trim()) {
      return res.status(422).json({ error: 'No extractable text found in the uploaded document' });
    }

    stage = 'saving document metadata';
    const docResult = await pool.query(
      'INSERT INTO documents (filename) VALUES ($1) RETURNING id',
      [req.file.originalname]
    );
    const documentId = docResult.rows[0].id;

    const chunks = chunkText(text);
    stage = 'generating embeddings';
    const embeddingsResponse = await openai.embeddings.create({
      input: chunks,
      model: 'text-embedding-3-small',
    });

    stage = 'saving document chunks';
    for (let i = 0; i < chunks.length; i++) {
      const embedding = embeddingsResponse.data[i].embedding;
      await pool.query(
        `INSERT INTO document_chunks (document_id, content, metadata, embedding) 
         VALUES ($1, $2, $3, $4)`,
        [documentId, chunks[i], JSON.stringify({ source: req.file.originalname, chunk_index: i }), `[${embedding.join(',')}]`]
      );
    }

    res.json({ success: true, message: `Processed ${chunks.length} chunks.` });
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
      ? error.status
      : undefined;
    const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined;
    const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`Upload failed while ${stage}${status ? ` (HTTP ${status})` : ''}${code ? ` [${code}]` : ''}: ${details}`);

    let message = `Upload failed while ${stage}. Check the backend logs for details.`;
    if (stage === 'extracting document text') {
      message = 'Could not read the document. Check that the file is valid and, for PDFs, is not password-protected.';
    } else if (stage === 'generating embeddings') {
      if (status === 401) {
        message = 'OpenAI rejected the API key. Check OPENAI_API_KEY in the backend environment.';
      } else if (status === 429) {
        message = 'OpenAI rate limit or usage quota exceeded. Check the API project limits.';
      } else if (status) {
        message = `OpenAI could not generate embeddings (HTTP ${status}). Check the backend logs.`;
      }
    }

    res.status(stage === 'generating embeddings' ? 502 : 500).json({ error: message });
  }
});

const z = require('zod');

const chatSchema = z.object({ query: z.string().min(1) });

app.post('/api/chat', async (req: any, res: any) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const { query } = parsed.data;

  try {
    // 1. Embed user query
    const queryEmbeddingRes = await openai.embeddings.create({
      input: query,
      model: 'text-embedding-3-small',
    });
    const queryEmbedding = queryEmbeddingRes.data[0].embedding;

    // 2. Vector Search (Find top 3 closest chunks)
    const searchResult = await pool.query(`
      SELECT content, metadata, 1 - (embedding <=> $1::vector) as similarity
      FROM document_chunks
      ORDER BY embedding <=> $1::vector
      LIMIT 3
    `, [`[${queryEmbedding.join(',')}]`]);

    const contexts = searchResult.rows;
    const contextText = contexts.map((row: any, i: any) => `Source ${i + 1} (${row.metadata.source}):\n${row.content}`).join('\n\n');

    // 3. Generate Answer
    const systemPrompt = `
      You are an Enterprise Knowledge Assistant. Answer the user's question using ONLY the provided context. 
      If the answer is not in the context, explicitly state: "I couldn't find this information in the company documents."
      Always cite your sources using the source names provided in the context (e.g., "Source: Travel Policy.pdf").
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Context:\n${contextText}\n\nQuestion: ${query}` }
      ],
    });

    res.json({
      answer: completion.choices[0].message.content,
      sources: contexts.map((c: any) => c.metadata)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Query failed' });
  }
});

app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));