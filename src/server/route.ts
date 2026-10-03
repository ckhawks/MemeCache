import { NextResponse } from 'next/server';
import type { ZodType, z } from 'zod';
import { getUserFromAccessToken, UserPayload } from '@/auth/lib';

// The one way to write an API route. It resolves the session user, parses a JSON body
// against a zod schema, and turns every failure into the same JSON shape,
// `{ error: string }`, so handlers hold only their own logic and the client can always
// show a message.
//
// Route handlers rather than server actions: see architecture-plan.md step 4.

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

type AuthMode = 'required' | 'optional';

type UserFor<A extends AuthMode> = A extends 'required' ? UserPayload : UserPayload | undefined;

type BodyFor<S> = S extends ZodType ? z.infer<S> : undefined;

interface RouteContext<A extends AuthMode, S> {
  // Identity always comes from the session, never from the request.
  user: UserFor<A>;
  body: BodyFor<S>;
  params: Record<string, string>;
  request: Request;
}

export function route<A extends AuthMode, S extends ZodType | undefined = undefined>(options: {
  auth: A;
  // A JSON body schema. File uploads leave it out and read request.formData() themselves.
  body?: S;
  // Return a plain object to send it as JSON, or a Response to send that as-is.
  handler: (ctx: RouteContext<A, S>) => Promise<unknown>;
}) {
  return async (request: Request, { params }: { params: Record<string, string> }) => {
    try {
      const user = await getUserFromAccessToken();
      if (options.auth === 'required' && !user) {
        throw new HttpError(401, 'You need to be logged in.');
      }

      let body: unknown = undefined;
      if (options.body) {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          throw new HttpError(400, 'The request body must be JSON.');
        }
        const parsed = options.body.safeParse(raw);
        if (!parsed.success) {
          throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request.');
        }
        body = parsed.data;
      }

      const result = await options.handler({
        user,
        body,
        params,
        request,
      } as RouteContext<A, S>);

      if (result instanceof Response) {
        return result;
      }
      return NextResponse.json(result ?? { ok: true });
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error(`${request.method} ${new URL(request.url).pathname}:`, error);
      return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
    }
  };
}
