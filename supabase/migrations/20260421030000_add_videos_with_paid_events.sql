drop view if exists public.fan_stats;
create view public.fan_stats with (security_invoker = true) as
select
  f.id,
  f.yt_id,
  f.name,
  f.owner_user_id,
  count(distinct m.yt_video_id)::int                                                   as videos_count,
  count(m.id)::int                                                                     as messages_count,
  max(m.time)                                                                          as latest_message_time,
  count(case when m.paid_event_type is not null then 1 end)::int                      as paid_event_count,
  count(distinct case when m.paid_event_type is not null then m.yt_video_id end)::int as videos_with_paid_events,
  bool_or(m.paid_event_type is not null)                                              as has_paid_event,
  fp.spend_prob
from public.fans f
left join public.messages m         on m.fan_id = f.id
left join public.fan_predictions fp on fp.fan_id = f.id
group by f.id, f.yt_id, f.name, f.owner_user_id, fp.spend_prob;
