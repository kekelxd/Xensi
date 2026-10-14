-- Web Push is parked: stop firing pg_net deliveries. Tables, RPCs and the edge function stay dormant.
-- To re-enable: create trigger lfg_events_push after insert on lfg_private.events for each row execute function lfg_private.push_dispatch();
drop trigger if exists lfg_events_push on lfg_private.events;
