-- Бургерная на FreasyGames: таблицы лидеров по монетам и по поданным заказам за одну смену.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.burgernaya_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 10000000),
    best_orders int not null default 0 check (best_orders between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists burgernaya_scores_score on public.burgernaya_scores (best_score desc);
create index if not exists burgernaya_scores_orders on public.burgernaya_scores (best_orders desc);

alter table public.burgernaya_scores enable row level security;

drop policy if exists "burgernaya_scores_select_all" on public.burgernaya_scores;
create policy "burgernaya_scores_select_all"
    on public.burgernaya_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. new_time не хранится, по нему проверяется, что результат возможен:
-- за заказ не больше 220 монет (с чаевыми и серией), а на заказ уходит не меньше двух секунд.
create or replace function public.burgernaya_submit(new_score int, new_orders int, new_time int)
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
    if new_score < 0 or new_orders < 0 or new_time < 0 or new_time > 1000000
       or new_score > new_orders * 220 or new_orders * 2 > new_time + 5 then
        raise exception 'Неверный результат';
    end if;
    insert into public.burgernaya_scores (user_id, username, best_score, best_orders)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_orders)
    on conflict (user_id) do update
        set best_score = greatest(public.burgernaya_scores.best_score, excluded.best_score),
            best_orders = greatest(public.burgernaya_scores.best_orders, excluded.best_orders),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.burgernaya_scores.best_score or excluded.best_orders > public.burgernaya_scores.best_orders then now() else public.burgernaya_scores.updated_at end;
end;
$$;

revoke all on function public.burgernaya_submit(int, int, int) from public;
grant execute on function public.burgernaya_submit(int, int, int) to authenticated;
