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
  await flushFormationEventAlerts();
  const examined = await checkFormationDocuments();
  const reimbursements = await checkReimbursementReminders();
  return NextResponse.json({ ok: true, examined, reimbursements });
}
