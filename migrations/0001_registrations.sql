-- Course registrations. Replaces the Google Form + Apps Script flow.
--
-- Capacity is NOT stored here: the limit lives in the CMS
-- (dates[].capacity ?? capacityDefault, null = unlimited) and seats taken are
-- COUNT(*) WHERE status='confirmed'. Nothing writes back to git.

CREATE TABLE registrations (
  id              TEXT PRIMARY KEY,
  created_at      TEXT NOT NULL,
  -- References a course slug + one of its dates[].start values. Not a real FK:
  -- the course catalogue lives in MDX, not in this database.
  course_slug     TEXT NOT NULL,
  date_start      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  full_name       TEXT NOT NULL,
  title_prefix    TEXT,
  pwz             TEXT,
  email           TEXT NOT NULL,
  phone           TEXT,
  -- Free text, as in the Google Form: people paste anything from a bare NIP to
  -- a full company address block.
  invoice_data    TEXT,
  -- Snapshot of the price at registration time. The Google Form baked the price
  -- into the answer label, so historical rows lost their meaning whenever a
  -- price changed; storing it here fixes that permanently.
  price_amount    INTEGER NOT NULL,
  consent_at      TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  notes           TEXT,
  confirmed_at    TEXT,
  confirmed_by    TEXT,
  source          TEXT NOT NULL DEFAULT 'web'
                  CHECK (source IN ('web', 'google-forms-import'))
);

-- Serves the capacity count on every page load of /zapisy/ and every POST.
CREATE INDEX idx_reg_slot ON registrations (course_slug, date_start, status);

-- Admin list ordering.
CREATE INDEX idx_reg_created ON registrations (created_at DESC);
