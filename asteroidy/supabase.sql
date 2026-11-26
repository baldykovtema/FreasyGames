-- Астероиды на FreasyGames: таблицы лидеров. Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.asteroidy_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 10000000),
    best_wave int not null default 0 check (best_wave between 0 and 10000),
    updated_at timestamptz not null default now()
);

create index if not exists asteroidy_scores_score on public.asteroidy_scores (best_score desc);
create index if not exists asteroidy_scores_wave on public.asteroidy_scores (best_wave desc);

alter table public.asteroidy_scores enable row level security;

drop policy if exists "asteroidy_scores_select_all" on public.asteroidy_scores;
create policy "asteroidy_scores_select_all"
    on public.asteroidy_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Чтобы пройти волну, надо разбить все её камни, а это не меньше сотни очков.
create or replace function public.asteroidy_submit(new_score int, new_wave int)
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
    if new_score < 0 or new_score > 10000000 or new_wave < 0 or new_wave > 10000 or (new_wave > 1 and new_score < (new_wave - 1) * 100) then
        raise exception 'Неверный результат';
    end if;
    insert into public.asteroidy_scores (user_id, username, best_score, best_wave)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_wave)
    on conflict (user_id) do update
        set best_score = greatest(public.asteroidy_scores.best_score, excluded.best_score),
            best_wave = greatest(public.asteroidy_scores.best_wave, excluded.best_wave),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.asteroidy_scores.best_score or excluded.best_wave > public.asteroidy_scores.best_wave then now() else public.asteroidy_scores.updated_at end;
end;
$$;

revoke all on function public.asteroidy_submit(int, int) from public;
grant execute on function public.asteroidy_submit(int, int) to authenticated;
