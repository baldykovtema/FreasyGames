-- Кроты на FreasyGames: таблицы лидеров. Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.kroty_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 1000000),
    best_combo int not null default 0 check (best_combo between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists kroty_scores_score on public.kroty_scores (best_score desc);
create index if not exists kroty_scores_combo on public.kroty_scores (best_combo desc);

alter table public.kroty_scores enable row level security;

drop policy if exists "kroty_scores_select_all" on public.kroty_scores;
create policy "kroty_scores_select_all"
    on public.kroty_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Каждый удар в серии даёт хотя бы очко, поэтому серия не длиннее очков.
create or replace function public.kroty_submit(new_score int, new_combo int)
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
    if new_score < 0 or new_score > 1000000 or new_combo < 0 or new_combo > 100000 or new_combo > new_score then
        raise exception 'Неверный результат';
    end if;
    insert into public.kroty_scores (user_id, username, best_score, best_combo)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_combo)
    on conflict (user_id) do update
        set best_score = greatest(public.kroty_scores.best_score, excluded.best_score),
            best_combo = greatest(public.kroty_scores.best_combo, excluded.best_combo),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.kroty_scores.best_score or excluded.best_combo > public.kroty_scores.best_combo then now() else public.kroty_scores.updated_at end;
end;
$$;

revoke all on function public.kroty_submit(int, int) from public;
grant execute on function public.kroty_submit(int, int) to authenticated;
