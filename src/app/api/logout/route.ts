// app/api/logout/route.ts
import { logout } from '@/auth/actions';

export async function GET(request: Request) {
  await logout();
}
