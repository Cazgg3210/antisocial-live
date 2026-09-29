-- EventEdition rows are keyed by "id", not "eventId": handle that table explicitly in the notifier.
CREATE OR REPLACE FUNCTION notify_realtime() RETURNS trigger AS $$
DECLARE
  event_id text;
BEGIN
  IF TG_TABLE_NAME = 'EventEdition' THEN
    event_id := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'Performance' THEN
    SELECT r."eventId" INTO event_id FROM "Round" r WHERE r.id = COALESCE(NEW."roundId", OLD."roundId");
  ELSIF TG_TABLE_NAME = 'PerformanceTimer' THEN
    SELECT r."eventId" INTO event_id FROM "Performance" p JOIN "Round" r ON r.id = p."roundId" WHERE p.id = COALESCE(NEW."performanceId", OLD."performanceId");
  ELSE
    event_id := COALESCE(NEW."eventId", OLD."eventId");
  END IF;
  PERFORM pg_notify('antisocial_realtime', json_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'eventId', event_id)::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
