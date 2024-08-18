import { UserPayload } from './lib';

// Utility functions for role checking
export function isAdmin(user: UserPayload) {
  return user.role === 'admin';
}

export function isModerator(user: UserPayload) {
  return user.role === 'moderator' || user.role === 'admin';
}

export function isUser(user: UserPayload) {
  return user.role === 'user' || isModerator(user);
}
