import { cookies } from 'next/headers';

export type FeedView = 'grid' | 'feed';

// The viewer's choice of gallery layout, kept in a cookie (set by FeedViewToggle) so the
// server renders the right layout straight away instead of flashing the default.
export async function getFeedView(): Promise<FeedView> {
  const value = (await cookies()).get('feedView')?.value;
  return value === 'feed' ? 'feed' : 'grid';
}
