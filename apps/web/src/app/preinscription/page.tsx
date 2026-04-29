/**
 * Page racine /preinscription — point d'entrée public ouvert.
 *
 * Au lieu d'1 token unique par apprenant (modèle "lien personnalisé envoyé
 * par l'admin"), on permet à n'importe qui d'arriver sur /preinscription,
 * on crée une PreEnrollment vide à la volée et on redirige vers le
 * formulaire token-based existant.
 *
 * → 1 lien permanent partageable, N pré-inscriptions distinctes.
 */

import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { prisma } from '@qualiof/db';

export const dynamic = 'force-dynamic';

const DEFAULT_VALIDITY_DAYS = 30;

export default async function OpenPreEnrollmentPage() {
  // Pour le mode single-tenant Start Academy, on récupère le 1er tenant.
  // À terme : slug tenant dans l'URL (ex: /inscription/start-academy).
  const tenant = await prisma.tenant.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!tenant) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Service indisponible</h1>
          <p className="text-sm text-muted-foreground">
            Le formulaire n'est pas configuré. Merci de contacter l'organisme de formation.
          </p>
        </div>
      </main>
    );
  }

  const token = randomUUID().replace(/-/g, '');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + DEFAULT_VALIDITY_DAYS);

  await prisma.preEnrollment.create({
    data: {
      tenantId: tenant.id,
      token,
      expiresAt,
      status: 'PENDING_FORM',
      // Pas de sentByUserId : ouverture publique
    },
  });

  redirect(`/preinscription/${token}`);
}
