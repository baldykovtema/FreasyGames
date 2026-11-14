-- Минное поле на FreasyGames: таблицы лидеров по самому быстрому разминированию поля 10 × 14 (22 мины)
-- и по числу разминированных полей. Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com).
-- Скрипт можно запускать повторно.

create table if not exists public.mines_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_time int check (best_time between 3 and 100000),
    wins int not null default 0 check (wins between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists mines_scores_time on public.mines_scores (best_time) where best_time is not null;
create index if not exists mines_scores_wins on public.mines_scores (wins desc);

alter table public.mines_scores enable row level security;

drop policy if exists "mines_scores_select_all" on public.mines_scores;
create policy "mines_scores_select_all"
    on public.mines_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Быстрее 3 секунд поле не открыть, а побед за раз прибавляется не больше одной
-- (браузер присылает свой счётчик; сервер не даёт ему расти скачками).
create or replace function public.mines_submit(new_time int, new_wins int)
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
    if new_time < 3 or new_time > 100000 or new_wins < 1 or new_wins > 1000000 then
        raise exception 'Неверный результат';
    end if;
    insert into public.mines_scores (user_id, username, best_time, wins)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_time, 1)
    on conflict (user_id) do update
        set best_time = least(coalesce(public.mines_scores.best_time, excluded.best_time), excluded.best_time),
            wins = least(greatest(public.mines_scores.wins, new_wins), public.mines_scores.wins + 1),
            username = excluded.username,
            updated_at = now();
end;
$$;

revoke all on function public.mines_submit(int, int) from public;
grant execute on function public.mines_submit(int, int) to authenticated;
