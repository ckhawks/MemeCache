// app/api/logout/route.ts
import { logout } from '@/auth/lib';

export async function GET(request: Request) {
  await logout();
}
