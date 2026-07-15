import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { badRequest } from '../lib/errors.js';

// Only PDF and DOCX (modern Word) are accepted.
export const PDF_MIME = 'application/pdf';
export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const ALLOWED_MIMES = [PDF_MIME, DOCX_MIME];
export const ALLOWED_EXTENSIONS = ['pdf', 'docx'];

export function fileExtension(filename: string): string {
  return filename.toLowerCase().split('.').pop() ?? '';
}

/**
 * Checks extension + MIME. Returns the resolved kind or null if not allowed.
 * (First-line filter — the byte signature is verified separately in extractCvText.)
 */
export function detectCvKind(mimetype: string, filename: string): 'pdf' | 'docx' | null {
  const ext = fileExtension(filename);
  if (ext === 'pdf' && (mimetype === PDF_MIME || mimetype === 'application/octet-stream' || !mimetype)) {
    return 'pdf';
  }
  if (
    ext === 'docx' &&
    (mimetype === DOCX_MIME || mimetype === 'application/octet-stream' || !mimetype)
  ) {
    return 'docx';
  }
  return null;
}

/** Verifies the buffer's magic bytes match the claimed kind (prevents renamed files). */
function signatureMatches(buffer: Buffer, kind: 'pdf' | 'docx'): boolean {
  if (buffer.length < 4) return false;
  if (kind === 'pdf') {
    // %PDF
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  }
  // DOCX is a ZIP container: PK\x03\x04 (or empty/spanned PK\x05\x06 / PK\x07\x08)
  const pk = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const marker = buffer[2];
  return pk && (marker === 0x03 || marker === 0x05 || marker === 0x07);
}

/**
 * Extracts plain text from an uploaded CV buffer. Accepts PDF or DOCX only, and
 * verifies the file signature so a mislabeled/renamed file is rejected.
 */
export async function extractCvText(
  buffer: Buffer,
  mimetype: string,
  filename: string,
): Promise<string> {
  const kind = detectCvKind(mimetype, filename);
  if (!kind) {
    throw badRequest('Only PDF or DOCX files are accepted. Please upload your CV as a PDF or Word (.docx) document.');
  }

  if (!signatureMatches(buffer, kind)) {
    throw badRequest(
      `This file does not appear to be a valid ${kind.toUpperCase()} document. Please upload a genuine PDF or DOCX file.`,
    );
  }

  let text = '';
  if (kind === 'pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      text = result.text;
    } finally {
      await parser.destroy();
    }
  } else {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
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
