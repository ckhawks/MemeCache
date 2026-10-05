import { z } from 'zod';
import { isAdmin } from '@/auth/role';
import { createInviteCode, generateInviteCode } from '@/db/queries/invites';
import { logModeration } from '@/db/queries/moderation';
import { HttpError, route } from '@/server/route';

// POST { code?, note?, maxUses?, expiresAt? }: makes an invite code (migration 009). No code
// generates a readable random one. Admins only. Goes in the moderation log.
export const POST = route({
  auth: 'required',
  body: z.object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{4,32}$/, 'A code is 4 to 32 letters, digits, dashes or underscores.')
      .optional(),
    note: z.string().trim().max(200, 'Keep the note under 200 characters.').optional(),
    maxUses: z.int().min(1, 'Max uses must be at least 1.').max(100_000).nullable().optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
  }),
  handler: async ({ user, body }) => {
    if (!isAdmin(user)) {
      throw new HttpError(403, 'Only admins can make invite codes.');
    }

    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new HttpError(400, 'That expiry is already in the past.');
    }

    const invite = {
      note: body.note || null,
      maxUses: body.maxUses ?? null,
      expiresAt,
      createdBy: user.id,
    };

    const log = (created: { id: string; code: string }) =>
      logModeration({
        actorId: user.id,
        action: 'invite_create',
        targetType: 'invite',
        targetId: created.id,
        data: {
          code: created.code,
          note: invite.note,
          maxUses: invite.maxUses,
          expiresAt: invite.expiresAt,
        },
      });

    if (body.code) {
      const created = await createInviteCode({ ...invite, code: body.code });
      if (!created) {
        throw new HttpError(409, 'That code already exists.');
      }
      await log(created);
      return created;
    }

    // A generated code colliding is about one in a trillion, but a retry is cheap.
    for (let attempt = 0; attempt < 3; attempt++) {
      const created = await createInviteCode({ ...invite, code: generateInviteCode() });
      if (created) {
        await log(created);
        return created;
      }
    }
    throw new HttpError(500, 'Could not generate a free code. Try again.');
  },
});
