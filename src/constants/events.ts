// Kinds of row in the event table (migration 017). The database takes any text, so adding a
// kind is a change here only.
//
// Sent by the browser through POST /api/event, for things the server never sees happen:
//   meme_send       the Send button was tapped. What came of it is one of the next two, or
//                   neither when the share sheet was closed.
//   share           the meme went out through the share sheet (Web Share).
//   meme_copy_link  its link was copied, which is what Send does where sharing files is not
//                   possible.
//   meme_download   a Download link was clicked.
//   search_click    a search result was opened. data: query, position (0 is the top).
export const CLIENT_EVENT_KINDS = [
  'meme_send',
  'share',
  'meme_copy_link',
  'meme_download',
  'search_click',
] as const;

export type ClientEventKind = (typeof CLIENT_EVENT_KINDS)[number];

// Written by the server as part of handling a request:
//   search  a search on /search. data: query (as typed), text and tags (as parsed), results
//           (the total found).
//   import  a link import. data: site, outcome ('imported', 'duplicate' or 'failed'), error.
//   upload  a new meme. data: contentType, bytes, imported, warnings.
//   active  the user made a request today. At most one per user per UTC day.
export type ServerEventKind = 'search' | 'import' | 'upload' | 'active';

export type EventKind = ClientEventKind | ServerEventKind;
