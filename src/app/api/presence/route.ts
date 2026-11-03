import { z } from 'zod';
import { recordEvent } from '@/db/queries/events';
import { noteVisit } from '@/db/queries/visits';
import { route } from '@/server/route';
import { isBot } from '@/server/isBot';
import { visitorKey } from '@/server/visitor';
import { describeDevice } from '@/util/describeDevice';

// POST { path, view, referrer?, installed? }: sent by PresenceBeacon when a page opens
// (view: true) and every 30 seconds while the tab is in front (view: false). Both keep the
// person's visit going (migration 022); opening a page is also a page_view event. Bots are
// dropped quietly.
export const POST = route({
  auth: 'optional',
  body: z.object({
    path: z.string().startsWith('/').max(300),
    view: z.boolean(),
    referrer: z.string().max(500).optional(),
    installed: z.boolean().optional(),
  }),
  handler: async ({ user, body, request }) => {
    const userAgent = request.headers.get('user-agent');
    if (isBot(userAgent)) {
      return { ok: true };
    }
    const visitor = user ? null : await visitorKey();
    const referrer = externalHost(body.referrer, request.url);
    await noteVisit({
      userId: user?.id ?? null,
      visitorKey: visitor,
      path: body.path,
      device: describeDevice(userAgent),
      referrer,
      installed: body.installed ?? false,
      view: body.view,
    });
    if (body.view) {
      await recordEvent({
        kind: 'page_view',
        userId: user?.id,
        visitorKey: visitor,
        data: referrer ? { path: body.path, referrer } : { path: body.path },
      });
    }
    return { ok: true };
  },
});

// The referring site's host, or null when there is none or it is this site.
function externalHost(referrer: string | undefined, requestUrl: string): string | null {
  if (!referrer) {
    return null;
  }
  try {
    const host = new URL(referrer).host;
    return host && host !== new URL(requestUrl).host ? host : null;
  } catch {
    return null;
  }
}
