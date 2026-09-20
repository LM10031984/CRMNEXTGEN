import { getAfterTrainingPreview } from '@/server/actions/after-training-delivery';
import { AfterTrainingDeliveryClient } from './after-training-delivery-client';

/** Server component for the session page. Integration contract: sessionId only. */
export async function AfterTrainingDelivery({ sessionId }: { sessionId: string }) {
  const preview = await getAfterTrainingPreview(sessionId);
  if (!preview.ok) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {preview.error ?? 'Impossible de préparer les envois de fin de formation.'}
      </div>
    );
  }
  return (
    <AfterTrainingDeliveryClient
      sessionId={sessionId}
      sessionEnded={Boolean(preview.sessionEnded)}
      deliveries={preview.deliveries ?? []}
    />
  );
}
