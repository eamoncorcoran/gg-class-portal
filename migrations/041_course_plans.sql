BEGIN;

-- The teaching plan for a course: what is meant to be covered, week by week,
-- and what has been.
--
-- Rows rather than a blob of JSON, because the whole point is ticking items off
-- one at a time. A document would mean rewriting the entire plan to record that
-- one topic was covered, and two people ticking at once would each save over the
-- other's tick.
CREATE TABLE IF NOT EXISTS course_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One plan per course. A second would leave nothing to say which is the plan.
  course_id uuid NOT NULL UNIQUE REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  starts_on date,
  break_start date,
  break_end date,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES course_plans(id) ON DELETE CASCADE,
  position integer NOT NULL,
  name text NOT NULL,
  -- The planner carries these as free text per week, written by a person.
  homework text,
  notes text
);

CREATE INDEX IF NOT EXISTS plan_weeks_plan_idx ON plan_weeks(plan_id, position);

-- One scheduled item, which is a topic in a particular week rather than a topic.
-- The same topic appears in several weeks of this plan, "Revision Week" three
-- times, so ticking a topic would tick all of its appearances at once.
CREATE TABLE IF NOT EXISTS plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES plan_weeks(id) ON DELETE CASCADE,
  position integer NOT NULL,
  title text NOT NULL,
  category text,
  done_at timestamptz,
  done_by uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS plan_items_week_idx ON plan_items(week_id, position);
-- Asked on every load of the plan, to count what is done.
CREATE INDEX IF NOT EXISTS plan_items_done_idx ON plan_items(week_id) WHERE done_at IS NOT NULL;

COMMIT;
