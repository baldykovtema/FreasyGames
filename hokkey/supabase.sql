-- Аэрохоккей на FreasyGames: таблицы лидеров по выигранным матчам подряд и по голам за одну игру.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.hokkey_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_wins int not null default 0 check (best_wins between 0 and 10000),
    best_goals int not null default 0 check (best_goals between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists hokkey_scores_wins on public.hokkey_scores (best_wins desc);
create index if not exists hokkey_scores_goals on public.hokkey_scores (best_goals desc);

alter table public.hokkey_scores enable row level security;

drop policy if exists "hokkey_scores_select_all" on public.hokkey_scores;
create policy "hokkey_scores_select_all"
    on public.hokkey_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Матч — до 5 голов, проигранный матч заканчивает игру,
-- поэтому голов не больше 5 за каждую победу плюс 4 в последнем матче; гол — не чаще раза в секунду.
-- Хотя бы гол за победу (реклама «переиграть концовку» ставит счёт 4 : 4 без голов).
create or replace function public.hokkey_submit(new_wins int, new_goals int, new_time int)
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
    if new_wins < 0 or new_goals < 0 or new_time < 0 or new_time > 100000
        or new_goals < new_wins or new_goals > new_wins * 5 + 5 or new_goals > new_time + 1 then
        raise exception 'Неверный результат';
    end if;
    insert into public.hokkey_scores (user_id, username, best_wins, best_goals)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_wins, new_goals)
    on conflict (user_id) do update
        set best_wins = greatest(public.hokkey_scores.best_wins, excluded.best_wins),
            best_goals = greatest(public.hokkey_scores.best_goals, excluded.best_goals),
            username = excluded.username,
            updated_at = case when excluded.best_wins > public.hokkey_scores.best_wins or excluded.best_goals > public.hokkey_scores.best_goals then now() else public.hokkey_scores.updated_at end;
end;
$$;

revoke all on function public.hokkey_submit(int, int, int) from public;
grant execute on function public.hokkey_submit(int, int, int) to authenticated;
