// Push notifications to the admins' phones through Pushover (pushover.net). Set
// PUSHOVER_APP_TOKEN (the application's API token) and PUSHOVER_USER_KEY (a user or group
// key) in .env; with either missing this does nothing, so local dev and CI never send.
//
// A side effect like recordEvent: a failure is logged and never fails the request that
// caused it. Call it inside after() so the person waiting on the request does not also wait
// on Pushover.

const PUSHOVER_URL = 'https://api.pushover.net/1/messages.json';

export interface PushMessage {
  title: string;
  message: string;
  // A link the notification opens, and its label.
  url?: string;
  urlTitle?: string;
}

export async function pushToAdmins(push: PushMessage): Promise<void> {
  const token = process.env.PUSHOVER_APP_TOKEN;
  const user = process.env.PUSHOVER_USER_KEY;
  if (!token || !user) {
    return;
  }
  const body = new URLSearchParams({
    token,
    user,
    title: push.title,
    message: push.message,
  });
  if (push.url) {
    body.set('url', push.url);
  }
  if (push.urlTitle) {
    body.set('url_title', push.urlTitle);
  }
  try {
    const response = await fetch(PUSHOVER_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`Pushover refused a notification (${response.status}):`, await response.text());
    }
  } catch (error) {
    console.error('Could not send a Pushover notification:', error);
  }
}
