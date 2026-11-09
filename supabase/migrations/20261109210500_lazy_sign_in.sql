-- Lazy sign-in: the app signs a visitor in (anonymously) only when they create or join a group, and tags that
-- sign-in with {"app": "arthop"} in its user metadata. The daily retention job also removes tagged sign-ins that
-- never ended up in a night, a day after they were made. The tag matters because this project's auth is shared with
-- other apps: only ArtHop's own sign-ins are touched. Groups go 30 days after the event (event_date is 22 Nov 2026,
-- the last day of Art Week, so on 23 December 2026).

select cron.schedule('arthop-retention', '23 3 * * *', $job$
  delete from public.ah_nights where event_date < current_date - 30;
  delete from auth.users u
    where u.email like 'm-%@users.arthop.arian-shafa.xyz'
      and not exists (select 1 from public.ah_members m where m.user_id = u.id);
  delete from auth.users u
    where u.is_anonymous and u.raw_user_meta_data ->> 'app' = 'arthop'
      and u.created_at < now() - interval '1 day'
      and not exists (select 1 from public.ah_members m where m.user_id = u.id);
$job$);
