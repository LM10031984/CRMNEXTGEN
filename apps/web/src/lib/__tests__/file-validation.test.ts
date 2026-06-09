import { describe, it, expect } from 'vitest';
import { detectMime, validateFileBuffer } from '../file-validation';

/**
 * Sprint 1 — Hardening uploads.
 *
 * Couvre le helper `validateFileBuffer` qui remplace la confiance aveugle
 * dans le `Content-Type` envoyé par le client : on doit détecter le vrai
 * MIME via les magic-bytes, refuser les formats hors liste blanche, et
 * appliquer les bornes de taille.
 */

// Buffers minimalistes mais réalistes (header magic + padding pour passer min size).
const pad = (n: number) => Buffer.alloc(n, 0);
const concat = (a: Buffer, b: Buffer) => Buffer.concat([a, b]);

const PDF_HEADER = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // SOI + JFIF
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('detectMime', () => {
  it('détecte un PDF via "%PDF-"', () => {
    expect(detectMime(concat(PDF_HEADER, pad(200)))).toBe('application/pdf');
  });

  it('détecte un JPEG via FF D8 FF', () => {
    expect(detectMime(concat(JPEG_HEADER, pad(200)))).toBe('image/jpeg');
  });

  it('détecte un PNG via 89 50 4E 47 0D 0A 1A 0A', () => {
    expect(detectMime(concat(PNG_HEADER, pad(200)))).toBe('image/png');
  });

  it('renvoie null sur format inconnu', () => {
    expect(detectMime(Buffer.from('hello world'))).toBeNull();
  });

  it('renvoie null sur buffer trop court', () => {
    expect(detectMime(Buffer.from([0x25, 0x50]))).toBeNull();
  });
});

describe('validateFileBuffer', () => {
  it('accepte un PDF valide', () => {
    const r = validateFileBuffer(concat(PDF_HEADER, pad(500)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mime).toBe('application/pdf');
  });

  it('rejette un fichier dont le MIME détecté ne fait pas partie de la liste blanche', () => {
    const r = validateFileBuffer(concat(PDF_HEADER, pad(500)), {
      allowed: ['image/png'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/non autorisé/);
  });

  it('rejette un fichier trop petit', () => {
    const r = validateFileBuffer(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/trop petit|vide/);
  });

  it('rejette un fichier trop volumineux', () => {
    const r = validateFileBuffer(concat(PDF_HEADER, pad(2_000_000)), {
      maxBytes: 1_000_000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/volumineux/);
  });

  it('rejette un fichier dont le Content-Type est falsifié (texte présenté comme PDF)', () => {
    // Un attaquant pourrait envoyer du texte avec Content-Type: application/pdf —
    // la validation magic-bytes doit le détecter.
    const fakePdf = Buffer.from('GIF89a' + 'A'.repeat(500));
    const r = validateFileBuffer(fakePdf, { allowed: ['application/pdf'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/non reconnu/);
  });

  it('borne minBytes paramétrable : rejette un fichier de 58 octets quand min=100', () => {
    // PNG header (8 o) + 50 o de padding = 58 o → en dessous du minBytes 100.
    const r = validateFileBuffer(concat(PNG_HEADER, pad(50)), { minBytes: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/trop petit/);
  });
});
