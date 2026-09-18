import { expect, it } from 'vitest';
import { manualSignedKey } from '../manual-signed-key';
it.each(['CONVENTION', 'AGEFICE', 'EMARGEMENT', 'ASSIDUITE'])(
  'reprend un dépôt de %s et refuse le simple marquage',
  (type) => {
    expect(manualSignedKey({ [type]: { state: 'MANUAL_OK' } }, type)).toBeNull();
    const statuses = {
      [type]: {
        state: 'MANUAL_OK',
        uploadedSignedPdfKey: 'signed.pdf',
        uploadedSignedAt: '2026-01-01',
      },
    };
    expect(manualSignedKey(statuses, type)).toBe('signed.pdf');
    expect(manualSignedKey(statuses, type, new Date('2026-02-01'))).toBeNull();
    expect(manualSignedKey(statuses, 'OTHER')).toBeNull();
  },
);
