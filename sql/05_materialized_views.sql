DROP MATERIALIZED VIEW IF EXISTS mv_vehicle_lifetime_stats;

CREATE MATERIALIZED VIEW mv_vehicle_lifetime_stats AS
SELECT
    v.id AS vehicle_id,
    v.license_plate,
    v.class,
    v.is_active,

    COUNT(t.id) AS lifetime_trip_count,

    COALESCE(SUM(t.fare_amount) FILTER (WHERE t.status = 'COMPLETED'), 0.00) AS lifetime_earnings
FROM vehicles v


LEFT JOIN trips t ON t.vehicle_id = v.id


GROUP BY v.id, v.license_plate, v.class, v.is_active
WITH DATA;


CREATE UNIQUE INDEX idx_mv_vehicle_lifetime_stats_vehicle_id
    ON mv_vehicle_lifetime_stats (vehicle_id);


CREATE OR REPLACE FUNCTION refresh_mv_vehicle_lifetime_stats()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_vehicle_lifetime_stats;
END;
$$;