import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { badRequest } from '../lib/errors.js';

export type SupportedMime =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/msword'
  | 'text/plain';

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Extracts plain text from an uploaded CV buffer (PDF or DOCX/DOC or TXT).
 * Returns the normalized text content.
 */
export async function extractCvText(
  buffer: Buffer,
  mimetype: string,
  filename: string,
): Promise<string> {
  const ext = filename.toLowerCase().split('.').pop() ?? '';

  let text = '';

  if (mimetype === PDF_MIME || ext === 'pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      text = result.text;
    } finally {
      await parser.destroy();
    }
  } else if (
    mimetype === DOCX_MIME ||
    mimetype === 'application/msword' ||
    ext === 'docx' ||
    ext === 'doc'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (mimetype === 'text/plain' || ext === 'txt') {
    text = buffer.toString('utf-8');
  } else {
    throw badRequest(
      `Unsupported file type "${mimetype || ext}". Please upload a PDF, DOCX, or TXT file.`,
    );
  }

  const normalized = normalizeText(text);

  if (normalized.length < 30) {
    throw badRequest(
      'Could not extract readable text from this file. It may be an image-only or corrupted document.',
    );
  }

  return normalized;
}

function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
