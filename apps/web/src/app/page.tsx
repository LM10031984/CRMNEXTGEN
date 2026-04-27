import { redirect } from 'next/navigation';
import { validateRequest } from '@/lib/auth';

export default async function HomePage() {
  const { user } = await validateRequest();
  redirect(user ? '/app' : '/login');
}
