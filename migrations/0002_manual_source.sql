-- Allow registrations entered by hand in the admin panel (phone calls, e-mail,
-- in-person), which the original CHECK constraint rejected.
--
-- SQLite cannot alter a CHECK constraint, so the table is rebuilt. Column order
-- below is identical to 0001 and the INSERT is explicit about names, so a future
-- column added to 0001 cannot silently shift the copy.

CREATE TABLE registrations_new (
  id              TEXT PRIMARY KEY,
  created_at      TEXT NOT NULL,
  course_slug     TEXT NOT NULL,
  date_start      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  full_name       TEXT NOT NULL,
  title_prefix    TEXT,
  pwz             TEXT,
  email           TEXT NOT NULL,
  phone           TEXT,
  invoice_data    TEXT,
  price_amount    INTEGER NOT NULL,
  consent_at      TEXT NOT NULL,
  -- Manual rows carry a '<version>+manual' marker: an audit has to be able to
  -- tell a ticked checkbox from a consent an admin attests was given verbally.
  consent_version TEXT NOT NULL,
  notes           TEXT,
  confirmed_at    TEXT,
  confirmed_by    TEXT,
  source          TEXT NOT NULL DEFAULT 'web'
                  CHECK (source IN ('web', 'google-forms-import', 'manual'))
);

INSERT INTO registrations_new
  (id, created_at, course_slug, date_start, status, full_name, title_prefix, pwz,
   email, phone, invoice_data, price_amount, consent_at, consent_version, notes,
   confirmed_at, confirmed_by, source)
SELECT
   id, created_at, course_slug, date_start, status, full_name, title_prefix, pwz,
   email, phone, invoice_data, price_amount, consent_at, consent_version, notes,
   confirmed_at, confirmed_by, source
FROM registrations;

DROP TABLE registrations;

ALTER TABLE registrations_new RENAME TO registrations;

-- Dropped with the old table; recreated verbatim from 0001.
CREATE INDEX idx_reg_slot ON registrations (course_slug, date_start, status);
CREATE INDEX idx_reg_created ON registrations (created_at DESC);
