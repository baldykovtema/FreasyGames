-- Судоку на FreasyGames: таблицы лидеров по лучшему времени на средней сложности и по числу решённых судоку.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.sudoku_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_time int check (best_time between 60 and 100000),
    solved int not null default 0 check (solved between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists sudoku_scores_time on public.sudoku_scores (best_time asc);
create index if not exists sudoku_scores_solved on public.sudoku_scores (solved desc);

alter table public.sudoku_scores enable row level security;

drop policy if exists "sudoku_scores_select_all" on public.sudoku_scores;
create policy "sudoku_scores_select_all"
    on public.sudoku_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. new_time — время решения судоку средней сложности в секундах (0 для других сложностей);
-- быстрее 60 секунд 49 пустых клеток не заполнить. Счётчик решённых растёт не больше чем на одно за раз.
create or replace function public.sudoku_submit(new_time int, new_solved int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := auth.uid();
    t int := nullif(new_time, 0);
begin
    if uid is null then
        raise exception 'Нужно войти в аккаунт';
    end if;
    if (t is not null and (t < 60 or t > 100000)) or new_solved < 1 or new_solved > 1000000 then
        raise exception 'Неверный результат';
    end if;
    insert into public.sudoku_scores (user_id, username, best_time, solved)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), t, 1)
    on conflict (user_id) do update
        set best_time = case when t is null then public.sudoku_scores.best_time
                             else least(coalesce(public.sudoku_scores.best_time, t), t) end,
            solved = least(greatest(public.sudoku_scores.solved, new_solved), public.sudoku_scores.solved + 1),
            username = excluded.username,
            updated_at = now();
end;
$$;

revoke all on function public.sudoku_submit(int, int) from public;
grant execute on function public.sudoku_submit(int, int) to authenticated;
