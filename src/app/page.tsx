import Site from '@/components/Site';
import { getBoardState } from '@/lib/positions';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await currentUser();
  const state = await getBoardState(user?.id ?? null);
  return <Site state={state} />;
}
