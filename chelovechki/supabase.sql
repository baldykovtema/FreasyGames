-- Кликер Человечков на FreasyGames: таблицы лидеров по очкам за всё время и по числу человечков.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.chelovechki_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_total double precision not null default 0 check (best_total >= 0 and best_total <= 1e300),
    best_men int not null default 0 check (best_men between 0 and 100000000),
    updated_at timestamptz not null default now()
);

create index if not exists chelovechki_scores_total on public.chelovechki_scores (best_total desc);
create index if not exists chelovechki_scores_men on public.chelovechki_scores (best_men desc);

alter table public.chelovechki_scores enable row level security;

drop policy if exists "chelovechki_scores_select_all" on public.chelovechki_scores;
create policy "chelovechki_scores_select_all"
    on public.chelovechki_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она хранит лучшие значения игрока.
create or replace function public.chelovechki_submit(new_total double precision, new_men int)
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
    if new_total is null or new_total < 0 or new_total > 1e300 or new_total <> new_total
       or new_men is null or new_men < 0 or new_men > 100000000 then
        raise exception 'Неверный результат';
    end if;
    insert into public.chelovechki_scores (user_id, username, best_total, best_men)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), floor(new_total), new_men)
    on conflict (user_id) do update
        set best_total = greatest(public.chelovechki_scores.best_total, excluded.best_total),
            best_men = greatest(public.chelovechki_scores.best_men, excluded.best_men),
            username = excluded.username,
            updated_at = case
                when excluded.best_total > public.chelovechki_scores.best_total or excluded.best_men > public.chelovechki_scores.best_men then now()
                else public.chelovechki_scores.updated_at end;
end;
$$;

revoke all on function public.chelovechki_submit(double precision, int) from public;
grant execute on function public.chelovechki_submit(double precision, int) to authenticated;
