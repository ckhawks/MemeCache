// Shared by the comment box, its API routes and the queries (migration 014).

// Characters in a comment's text. Same cap as the database's CHECK.
export const COMMENT_MAX = 1000;

// How long after posting the author can still edit a comment.
export const COMMENT_EDIT_MINUTES = 10;
