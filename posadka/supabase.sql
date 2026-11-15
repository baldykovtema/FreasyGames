-- Посадка на FreasyGames: таблицы лидеров по очкам за полёт и по мягким посадкам подряд.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.posadka_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 10000000),
    best_lands int not null default 0 check (best_lands between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists posadka_scores_score on public.posadka_scores (best_score desc);
create index if not exists posadka_scores_lands on public.posadka_scores (best_lands desc);

alter table public.posadka_scores enable row level security;

drop policy if exists "posadka_scores_select_all" on public.posadka_scores;
create policy "posadka_scores_select_all"
    on public.posadka_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Посадка даёт не больше (100 + 250) × 3 очков и занимает
-- хотя бы 3 секунды полёта.
create or replace function public.posadka_submit(new_score int, new_lands int, new_time int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := auth.uid();
begin
    if uid is null then
        raise exception 'Нужно войти в аккаунт';
    end if;
    if new_score < 0 or new_lands < 0 or new_time < 0 or new_time > 100000
        or new_score > new_lands * 1050 or new_lands > new_time / 3 + 1 then
        raise exception 'Неверный результат';
    end if;
    insert into public.posadka_scores (user_id, username, best_score, best_lands)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_lands)
    on conflict (user_id) do update
        set best_score = greatest(public.posadka_scores.best_score, excluded.best_score),
            best_lands = greatest(public.posadka_scores.best_lands, excluded.best_lands),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.posadka_scores.best_score or excluded.best_lands > public.posadka_scores.best_lands then now() else public.posadka_scores.updated_at end;
end;
$$;

revoke all on function public.posadka_submit(int, int, int) from public;
grant execute on function public.posadka_submit(int, int, int) to authenticated;
