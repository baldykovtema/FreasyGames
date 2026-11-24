-- Пятнашки на FreasyGames: таблицы лидеров по лучшему времени на поле 4×4 и по числу собранных полей.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.pyatnashki_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_time int check (best_time between 5 and 100000),
    solved int not null default 0 check (solved between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists pyatnashki_scores_time on public.pyatnashki_scores (best_time asc);
create index if not exists pyatnashki_scores_solved on public.pyatnashki_scores (solved desc);

alter table public.pyatnashki_scores enable row level security;

drop policy if exists "pyatnashki_scores_select_all" on public.pyatnashki_scores;
create policy "pyatnashki_scores_select_all"
    on public.pyatnashki_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. new_time — время сборки поля 4×4 в секундах (0, если собрано другое поле);
-- быстрее 5 секунд поле 4×4 не собрать. Счётчик собранных полей растёт не больше чем на одно за раз.
create or replace function public.pyatnashki_submit(new_time int, new_solved int)
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
    if (t is not null and (t < 5 or t > 100000)) or new_solved < 1 or new_solved > 1000000 then
        raise exception 'Неверный результат';
    end if;
    insert into public.pyatnashki_scores (user_id, username, best_time, solved)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), t, 1)
    on conflict (user_id) do update
        set best_time = case when t is null then public.pyatnashki_scores.best_time
                             else least(coalesce(public.pyatnashki_scores.best_time, t), t) end,
            solved = least(greatest(public.pyatnashki_scores.solved, new_solved), public.pyatnashki_scores.solved + 1),
            username = excluded.username,
            updated_at = now();
end;
$$;

revoke all on function public.pyatnashki_submit(int, int) from public;
grant execute on function public.pyatnashki_submit(int, int) to authenticated;
