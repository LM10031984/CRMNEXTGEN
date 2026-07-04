/**
 * Downscale image avant vision OCR (Pitfall 3 — Phase 18).
 *
 * Module NEUTRE (aucun import auth/React) : consommé par l'extracteur
 * préinscriptions qui tourne AUSSI côté worker — règle projet « worker
 * jamais d'imports auth React ». Vivait dans storage-upload.ts ('use server'),
 * déplacé ici pour être câblé dans preinscription-extractor.ts.
 */

const OCR_DOWNSCALE_THRESHOLD = 4 * 1024 * 1024; // 4 Mo

/**
 * Réduit une image trop lourde AVANT de l'envoyer à la vision OCR (Pitfall 3 :
 * photo smartphone 10-50 Mo → échec vision silencieux). Décision RESEARCH Open Q2 :
 * sharp ajouté (le NO-OP risquait l'échec OCR silencieux, critère de succès #3).
 *
 * - Non-image ou < seuil → renvoie le buffer tel quel.
 * - Image ≥ seuil → resize width 2000 (withoutEnlargement) + jpeg qualité 80.
 * - sharp échoue (format exotique, native binding) → fallback buffer original.
 *
 * sharp importé dynamiquement pour ne pas charger la native lib au load du module
 * (server actions collectées au build) ni dans les tests hermétiques.
 */
export async function downscaleForOcr(buffer: Buffer, contentType: string): Promise<Buffer> {
  if (!contentType.startsWith('image/')) return buffer;
  if (buffer.length <= OCR_DOWNSCALE_THRESHOLD) return buffer;
  try {
    const sharp = (await import('sharp')).default;
    return await sharp(buffer)
      .resize({ width: 2000, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (e) {
    // Fallback : mieux vaut tenter la vision sur l'original que perdre le doc.
    console.error('downscaleForOcr : sharp a échoué, fallback buffer original', e);
    return buffer;
  }
}
