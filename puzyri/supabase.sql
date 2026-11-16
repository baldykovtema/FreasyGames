-- Пузыри на FreasyGames: таблицы лидеров по очкам за игру и по лучшему выстрелу.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.puzyri_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 100000000),
    best_combo int not null default 0 check (best_combo between 0 and 1000),
    updated_at timestamptz not null default now()
);

create index if not exists puzyri_scores_score on public.puzyri_scores (best_score desc);
create index if not exists puzyri_scores_combo on public.puzyri_scores (best_combo desc);

alter table public.puzyri_scores enable row level security;

drop policy if exists "puzyri_scores_select_all" on public.puzyri_scores;
create policy "puzyri_scores_select_all"
    on public.puzyri_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. На поле не больше ~170 пузырей, так что выстрел даёт
-- не больше 200 пузырей и 5000 очков (с бонусом за чистое поле).
create or replace function public.puzyri_submit(new_score int, new_combo int, new_shots int)
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
    if new_score < 0 or new_combo < 0 or new_shots < 0 or new_shots > 1000000 or new_combo > 200
        or new_score > new_shots * 5000 then
        raise exception 'Неверный результат';
    end if;
    insert into public.puzyri_scores (user_id, username, best_score, best_combo)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_combo)
    on conflict (user_id) do update
        set best_score = greatest(public.puzyri_scores.best_score, excluded.best_score),
            best_combo = greatest(public.puzyri_scores.best_combo, excluded.best_combo),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.puzyri_scores.best_score or excluded.best_combo > public.puzyri_scores.best_combo then now() else public.puzyri_scores.updated_at end;
end;
$$;

revoke all on function public.puzyri_submit(int, int, int) from public;
grant execute on function public.puzyri_submit(int, int, int) to authenticated;
