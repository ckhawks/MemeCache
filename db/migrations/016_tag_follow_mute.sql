-- 016: following and muting tags, for the "For you" feed and for hiding what you never want
-- to see.
--
-- One row per member per tag they follow or mute. Following and muting the same tag at once
-- makes no sense, so it is one table with a kind and the key is (user_id, tag_id): switching
-- from follow to mute replaces the row. Unfollowing or unmuting deletes it.
--
--   follow  the tag's memes come first in Explore's "For you", with the tag named on the
--           card as the reason.
--   mute    memes where the tag stands (a net counted score of at least 1, the tag page's
--           rule) are left out of that member's feeds: Explore, the home page, browse tags,
--           related memes, search and the queue. The meme page and the tag's own page still
--           open.
--
-- Both are private. A tag removed from its last meme is deleted (removeTagFromMeme), and its
-- follows and mutes go with it.

CREATE TABLE tag_preference (
  user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tag (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('follow', 'mute')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tag_id)
);
