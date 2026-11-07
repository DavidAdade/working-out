/* ---------- fitness classes (yoga, pilates, spin...) as their own kind of log ---------- */
-- A class is extra work: it never counts toward a planned day, only toward the Score's extra work.
-- The activity is the log's title ("Yoga"), so a class always has one.
alter table public.logs drop constraint logs_kind_check;
alter table public.logs add constraint logs_kind_check check (kind in ('run', 'test', 'strength', 'walk', 'check', 'class'));
alter table public.logs add constraint logs_class_title check (kind <> 'class' or title is not null);
