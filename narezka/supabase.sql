-- Нарезка на FreasyGames: таблицы лидеров по очкам за игру и по лучшему комбо (фруктов одним росчерком).
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.narezka_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 10000000),
    best_combo int not null default 0 check (best_combo between 0 and 100),
    updated_at timestamptz not null default now()
);

create index if not exists narezka_scores_score on public.narezka_scores (best_score desc);
create index if not exists narezka_scores_combo on public.narezka_scores (best_combo desc);

alter table public.narezka_scores enable row level security;

drop policy if exists "narezka_scores_select_all" on public.narezka_scores;
create policy "narezka_scores_select_all"
    on public.narezka_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она хранит лучшие очки и лучшее комбо игрока.
-- new_sliced и new_time не хранятся, по ним проверяется, что такой результат вообще возможен.
create or replace function public.narezka_submit(new_score int, new_combo int, new_sliced int, new_time int)
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
    if new_score < 0 or new_combo < 0 or new_sliced < 0 or new_time < 0 or new_time > 100000 then
        raise exception 'Неверный результат';
    end if;
    -- Фрукты вылетают волнами не больше 5 штук и не чаще раза в 0,6 с; очко за фрукт и бонус 2 за каждый фрукт комбо от трёх.
    if new_sliced > new_time * 9 + 10 or new_score > new_sliced * 3 or new_combo > new_sliced or new_combo > 30 then
        raise exception 'Неверный результат';
    end if;
    insert into public.narezka_scores (user_id, username, best_score, best_combo)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_combo)
    on conflict (user_id) do update
        set best_score = greatest(public.narezka_scores.best_score, excluded.best_score),
            best_combo = greatest(public.narezka_scores.best_combo, excluded.best_combo),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.narezka_scores.best_score or excluded.best_combo > public.narezka_scores.best_combo then now() else public.narezka_scores.updated_at end;
end;
$$;

revoke all on function public.narezka_submit(int, int, int, int) from public;
grant execute on function public.narezka_submit(int, int, int, int) to authenticated;
