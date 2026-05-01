/**
 * Endpoint zip download du pack fin de formation.
 *
 * Stream le buffer construit par buildClosureZipBuffer (server action),
 * filename : `pack-fin-formation_<sessionCode>_<YYYYMMDD>.zip`.
 */

import { NextResponse } from 'next/server';
import { buildClosureZipBuffer } from '@/server/actions/closure-pack';

export async function GET(
  _req: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await context.params;
  const r = await buildClosureZipBuffer(batchId);
  if (!r.ok || !r.buffer || !r.filename) {
    return new NextResponse(r.error ?? 'Zip indisponible', { status: 400 });
  }
  return new NextResponse(r.buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${r.filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  });
}
