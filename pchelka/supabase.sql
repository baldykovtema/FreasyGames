-- Пчёлка на FreasyGames: таблицы лидеров по цветам и по пыльце за один полёт.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.pchelka_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 1000000),
    best_pollen int not null default 0 check (best_pollen between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists pchelka_scores_score on public.pchelka_scores (best_score desc);
create index if not exists pchelka_scores_pollen on public.pchelka_scores (best_pollen desc);

alter table public.pchelka_scores enable row level security;

drop policy if exists "pchelka_scores_select_all" on public.pchelka_scores;
create policy "pchelka_scores_select_all"
    on public.pchelka_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Цветы стоят через 270 единиц, а пчёлка летит не быстрее 270 в секунду,
-- поэтому цветов не больше, чем секунд полёта (+3 на первые); пыльцы — не больше одной у каждого цветка.
create or replace function public.pchelka_submit(new_score int, new_pollen int, new_time int)
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
    if new_score < 0 or new_pollen < 0 or new_time < 0 or new_time > 1000000
       or new_score > new_time + 3 or new_pollen > new_score + 6 then
        raise exception 'Неверный результат';
    end if;
    insert into public.pchelka_scores (user_id, username, best_score, best_pollen)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_pollen)
    on conflict (user_id) do update
        set best_score = greatest(public.pchelka_scores.best_score, excluded.best_score),
            best_pollen = greatest(public.pchelka_scores.best_pollen, excluded.best_pollen),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.pchelka_scores.best_score or excluded.best_pollen > public.pchelka_scores.best_pollen then now() else public.pchelka_scores.updated_at end;
end;
$$;

revoke all on function public.pchelka_submit(int, int, int) from public;
grant execute on function public.pchelka_submit(int, int, int) to authenticated;
