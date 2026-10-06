// Client side of src/server/route.ts. Sends JSON (or FormData for file uploads) and throws
// an Error carrying the server's `{ error }` message, so a component can show it.

// What api() throws. Most callers only show the message; status and data are there for the
// few answers that carry more, like the upload's { duplicate } for an exact copy.
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: unknown
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
  } = {}
): Promise<T> {
  const init: RequestInit = {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
  };

  if (options.body instanceof FormData) {
    init.body = options.body;
  } else if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = {
      'Content-Type': 'application/json',
    };
  }

  const response = await fetch(path, init);

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // An empty or non-JSON body. The status code below still decides.
  }

  if (!response.ok) {
    const message = (data as { error?: unknown } | null)?.error;
    throw new ApiError(
      typeof message === 'string' ? message : `Request failed (${response.status}).`,
      response.status,
      data
    );
  }

  return data as T;
}
