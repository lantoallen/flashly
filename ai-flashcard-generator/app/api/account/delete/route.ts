import { createClient } from '@supabase/supabase-js';
import { clientIp, jsonError, rateLimited } from '@/lib/server';

/**
 * Permanently deletes the signed-in user's account and cloud data.
 * Needs SUPABASE_SERVICE_ROLE_KEY on the server (never exposed to the browser).
 * The caller proves who they are with their own access token.
 */
export async function POST(req: Request) {
  if (await rateLimited(clientIp(req))) {
    return jsonError('Too many requests. Please wait a minute and try again.', 429);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return jsonError(
      'Full account deletion is not enabled on this site. You can delete your cloud data instead.',
      501
    );
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return jsonError('Not signed in.', 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return jsonError('Not signed in.', 401);

  const userId = data.user.id;
  const cleanup = await admin.from('user_data').delete().eq('user_id', userId);
  if (cleanup.error) return jsonError('Could not delete your data. Please try again.', 500);

  const removed = await admin.auth.admin.deleteUser(userId);
  if (removed.error) return jsonError('Could not delete your account. Please try again.', 500);

  return Response.json({ ok: true });
}
