import { NextResponse } from 'next/server';
import { flushFormationEventAlerts } from '@/lib/alertes/formation-notifier';
import {
  checkFormationDocuments,
  checkReimbursementReminders,
} from '@/lib/alertes/formation-check';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse('CRON_SECRET non configuré', { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`)
    return new NextResponse('Unauthorized', { status: 401 });
  const metrics = { sent: await flushFormationEventAlerts(), errors: 0 };
  const now = new Date();
  const examined = await checkFormationDocuments(now, undefined, metrics);
  const reimbursements = await checkReimbursementReminders(now, undefined, metrics);
  return NextResponse.json({
    ok: metrics.errors === 0,
    examined,
    reimbursements,
    sent: metrics.sent,
    errors: metrics.errors,
  });
}
