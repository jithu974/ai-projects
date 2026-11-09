import fs from "node:fs/promises";
import { PDFParse } from "pdf-parse";

export async function extractPdfText(
  filePath: string
): Promise<string> {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;  
}