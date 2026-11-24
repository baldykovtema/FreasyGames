-- Звездопад на FreasyGames: таблицы лидеров по очкам и по пойманным звёздам за одну игру.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.zvezdopad_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 100000000),
    best_caught int not null default 0 check (best_caught between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists zvezdopad_scores_score on public.zvezdopad_scores (best_score desc);
create index if not exists zvezdopad_scores_caught on public.zvezdopad_scores (best_caught desc);

alter table public.zvezdopad_scores enable row level security;

drop policy if exists "zvezdopad_scores_select_all" on public.zvezdopad_scores;
create policy "zvezdopad_scores_select_all"
    on public.zvezdopad_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Предметы падают не чаще трёх в секунду, звезда даёт не больше
-- 5 × 5 = 25 очков (золотая при множителе ×5), множитель — от 1 до 5.
create or replace function public.zvezdopad_submit(new_score int, new_mult int, new_caught int, new_time int)
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
    if new_score < 0 or new_caught < 0 or new_time < 0 or new_time > 1000000 or new_mult < 1 or new_mult > 5
       or new_caught > new_time * 4 + 5 or new_score > new_caught * 25 then
        raise exception 'Неверный результат';
    end if;
    insert into public.zvezdopad_scores (user_id, username, best_score, best_caught)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_caught)
    on conflict (user_id) do update
        set best_score = greatest(public.zvezdopad_scores.best_score, excluded.best_score),
            best_caught = greatest(public.zvezdopad_scores.best_caught, excluded.best_caught),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.zvezdopad_scores.best_score or excluded.best_caught > public.zvezdopad_scores.best_caught then now() else public.zvezdopad_scores.updated_at end;
end;
$$;

revoke all on function public.zvezdopad_submit(int, int, int, int) from public;
grant execute on function public.zvezdopad_submit(int, int, int, int) to authenticated;
