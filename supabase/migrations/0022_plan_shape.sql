-- The shape of a person's plan (lib/plan/shape.ts).
--
-- run_mode    'program' is the 5K program everyone had until now (so existing people keep it); 'easy' is lifting
--             with easy runs and no goal; 'none' is lifting only. Only the program needs 5K times and a time trial.
-- train_days  the weekdays the person trains, 0 = Monday … 6 = Sunday, three to six of them; null = the plan's own.

alter table public.profiles
  add column run_mode text not null default 'program' check (run_mode in ('program', 'easy', 'none')),
  add column train_days smallint[] check (train_days is null or (array_length(train_days, 1) between 3 and 6 and train_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]));
