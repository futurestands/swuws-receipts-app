-- 0053_crm_bootstrap_seed.sql
--
-- Seeds the CRM service desk with departments and complaint categories.
--
-- 0048 created crm_department and crm_complaint_category empty and nothing
-- ever populated them. Because the register-ticket form requires a category,
-- an empty crm_complaint_category means the Category dropdown is empty and no
-- complaint can be logged at all -- the module is unusable until these rows
-- exist.
--
-- Names and descriptions are safe to change afterwards through
-- CRM Hub -> CRM Setup. Keep the ids stable once tickets reference them.
-- ON CONFLICT DO NOTHING so re-running never overwrites live edits.

BEGIN;

INSERT INTO "crm_department" ("id", "name", "description", "active") VALUES
  ('dept-technical',  'Technical & Field Operations', 'Pipe bursts, leakages, supply interruptions, meter installation and repair.', true),
  ('dept-commercial', 'Commercial & Billing',         'Meter reading, bill preparation, tariffs, new connections and disconnections.', true),
  ('dept-finance',    'Finance & Revenue',            'Payment posting, receipting, refunds and account reconciliation.', true),
  ('dept-callcenter', 'Customer Care / Call Center',  'First-line contact, ticket capture, follow-up and customer feedback.', true),
  ('dept-quality',    'Water Quality',                'Water safety, colour, taste, odour and contamination reports.', true),
  ('dept-admin',      'Administration',               'Staff conduct, general inquiries and anything not owned by another team.', true)
ON CONFLICT ("id") DO NOTHING;

-- defaultHandlerDepartmentId is the team a ticket routes to when the agent
-- does not pick a department by hand.
INSERT INTO "crm_complaint_category" ("id", "name", "description", "defaultHandlerDepartmentId", "active") VALUES
  ('cat-burst',        'Pipe Burst / Leakage',         'Visible burst or leaking pipe on the network or at the connection.', 'dept-technical',  true),
  ('cat-no-water',     'No Water Supply',              'Customer has no water at all.',                                      'dept-technical',  true),
  ('cat-low-pressure', 'Low Water Pressure',           'Water flows but pressure is too low to use.',                        'dept-technical',  true),
  ('cat-meter-fault',  'Faulty / Stuck Meter',         'Meter not turning, broken glass, or reading implausibly.',           'dept-technical',  true),
  ('cat-illegal',      'Illegal Connection Report',    'Report of an unauthorised connection or tampering.',                 'dept-technical',  true),
  ('cat-no-reading',   'Meter Not Read',               'Meter was skipped during the reading cycle.',                        'dept-commercial', true),
  ('cat-no-bill',      'Bill Not Received',            'Customer did not get a bill or demand note for the period.',         'dept-commercial', true),
  ('cat-wrong-bill',   'Wrong / Disputed Bill',        'Customer disputes the consumption or amount charged.',               'dept-commercial', true),
  ('cat-new-conn',     'New Connection Request',       'Application for a new water connection.',                           'dept-commercial', true),
  ('cat-reconnect',    'Disconnection / Reconnection', 'Request or complaint about disconnection or reconnection.',          'dept-commercial', true),
  ('cat-payment',      'Payment Not Reflected',        'Customer paid but the account balance has not been updated.',        'dept-finance',    true),
  ('cat-receipt',      'Receipt Not Issued',           'Payment made without a receipt, or receipt details are wrong.',      'dept-finance',    true),
  ('cat-quality',      'Water Quality Concern',        'Dirty, coloured, smelly or bad-tasting water.',                      'dept-quality',    true),
  ('cat-conduct',      'Staff Conduct',                'Complaint about the behaviour of staff or an agent.',                'dept-admin',      true),
  ('cat-inquiry',      'General Inquiry',              'Questions about tariffs, offices, procedures or anything else.',     'dept-callcenter', true)
ON CONFLICT ("id") DO NOTHING;

COMMIT;
