-- security_invoker ensures auth.uid()-based RLS on fans/messages propagates through the view.
create or replace view public.fan_stats with (security_invoker = true) as
select
  f.id,
  f.yt_id,
  f.name,
  f.owner_user_id,
  count(distinct m.yt_video_id)::int  as videos_count,
  count(m.id)::int                    as messages_count,
  max(m.time)                         as latest_message_time,
  fp.spend_prob
from public.fans f
left join public.messages m          on m.fan_id = f.id
left join public.fan_predictions fp  on fp.fan_id = f.id
group by f.id, f.yt_id, f.name, f.owner_user_id, fp.spend_prob;
