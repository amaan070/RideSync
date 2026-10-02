CREATE INDEX idx_trips_rider_id
ON trips(rider_id);

CREATE INDEX idx_trips_vehicle_id
ON trips(vehicle_id);

CREATE INDEX idx_wallet_audit_logs_rider_id
ON wallet_audit_logs(rider_id);

CREATE UNIQUE INDEX idx_one_active_trip_per_rider
ON trips(rider_id)
WHERE status IN ('REQUESTED', 'IN TRANSIT');