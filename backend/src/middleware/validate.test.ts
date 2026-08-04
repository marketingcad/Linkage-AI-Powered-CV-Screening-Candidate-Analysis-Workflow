import { describe, expect, it } from 'vitest';
import { httpUrl, idNoteParams, idParams, optionalQueryString, roomParams, text, tokenParams } from './validate.js';

const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

describe('idParams', () => {
  it('accepts a uuid', () => {
    expect(idParams.parse({ id: UUID })).toEqual({ id: UUID });
  });

  // Regression: an unvalidated id reached a Postgres uuid column and raised 22P02,
  // surfacing as a 500 instead of a 400.
  it.each(['xyz', '123', '', 'not-a-uuid', `${UUID}'; DROP TABLE jobs; --`])(
    'rejects %j',
    (bad) => {
      expect(idParams.safeParse({ id: bad }).success).toBe(false);
    },
  );
});

describe('idNoteParams', () => {
  it('requires both ids to be uuids', () => {
    expect(idNoteParams.safeParse({ id: UUID, noteId: UUID }).success).toBe(true);
    expect(idNoteParams.safeParse({ id: UUID, noteId: 'nope' }).success).toBe(false);
    expect(idNoteParams.safeParse({ id: 'nope', noteId: UUID }).success).toBe(false);
  });
});

describe('tokenParams', () => {
  it('accepts a uuid tracking token and rejects junk', () => {
    expect(tokenParams.safeParse({ token: UUID }).success).toBe(true);
    expect(tokenParams.safeParse({ token: 'abc' }).success).toBe(false);
  });
});

describe('roomParams', () => {
  it('accepts our room naming and rejects path/injection characters', () => {
    expect(roomParams.safeParse({ room: `ai-interview-${UUID}` }).success).toBe(true);
    expect(roomParams.safeParse({ room: '../../etc/passwd' }).success).toBe(false);
    expect(roomParams.safeParse({ room: 'room name' }).success).toBe(false);
    expect(roomParams.safeParse({ room: '' }).success).toBe(false);
  });
});

describe('httpUrl', () => {
  it('accepts http(s) urls', () => {
    expect(httpUrl().safeParse('https://example.com/profile').success).toBe(true);
    expect(httpUrl().safeParse('http://example.com').success).toBe(true);
  });

  // These are stored and later rendered as clickable links in the HR UI and emails.
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'asdf',
    '',
  ])('rejects %j', (bad) => {
    expect(httpUrl().safeParse(bad).success).toBe(false);
  });

  it('enforces the max length', () => {
    expect(httpUrl(20).safeParse(`https://example.com/${'a'.repeat(50)}`).success).toBe(false);
  });
});

describe('text', () => {
  it('trims and bounds', () => {
    expect(text(10).parse('  hi  ')).toBe('hi');
    expect(text(5).safeParse('abcdef').success).toBe(false);
    expect(text(10, 2).safeParse('a').success).toBe(false);
  });
});

describe('optionalQueryString', () => {
  it('treats an empty query value as absent', () => {
    expect(optionalQueryString().parse('')).toBeUndefined();
    expect(optionalQueryString().parse(undefined)).toBeUndefined();
    expect(optionalQueryString().parse(' indeed ')).toBe('indeed');
  });
});
