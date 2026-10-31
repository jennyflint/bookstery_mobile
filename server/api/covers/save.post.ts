import fs from 'node:fs/promises';
import path from 'node:path';
import { defineEventHandler, readBody, createError } from 'h3';

interface CoverSavePayload {
  bookId?: string;
  base64?: string;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CoverSavePayload>(event);
  const { bookId, base64 } = body || {};

  if (!bookId || !base64) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid payload: missing bookId or base64 data',
    });
  }

  const coversDir = path.resolve(process.cwd(), 'public/covers');
  await fs.mkdir(coversDir, { recursive: true });

  const filePath = path.join(coversDir, `${bookId}.webp`);
  const buffer = Buffer.from(base64, 'base64');
  await fs.writeFile(filePath, buffer);

  return {
    success: true,
    path: `/covers/${bookId}.webp`,
  };
});
