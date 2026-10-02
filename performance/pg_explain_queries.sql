
\o performance/query_stats.txt

-- ------------------------------------------------------------
-- PART 1: ROW COUNTS
-- ------------------------------------------------------------

\echo '===================================================='
\echo 'PART 1: ROW COUNTS PER TABLE'
\echo '===================================================='

\echo '--- riders ---'
SELECT 'riders' AS table_name, count(*) AS row_count FROM riders;

\echo '--- vehicles ---'
SELECT 'vehicles' AS table_name, count(*) AS row_count FROM vehicles;

\echo '--- trips ---'
SELECT 'trips' AS table_name, count(*) AS row_count FROM trips;

\echo '--- wallet_audit_logs ---'
SELECT 'wallet_audit_logs' AS table_name, count(*) AS row_count FROM wallet_audit_logs;

\echo '--- mv_vehicle_lifetime_stats (materialized view) ---'
SELECT 'mv_vehicle_lifetime_stats' AS table_name, count(*) AS row_count FROM mv_vehicle_lifetime_stats;

\echo '--- vw_vehicle_revenue_moving_avg (view) ---'
SELECT 'vw_vehicle_revenue_moving_avg' AS table_name, count(*) AS row_count FROM vw_vehicle_revenue_moving_avg;

\echo ''
\echo '--- Row counts broken down: trips by status ---'
SELECT 'trips' AS table_name, status, count(*) AS row_count
FROM trips
GROUP BY status
ORDER BY status;

\echo ''
\echo '--- Row counts broken down: wallet_audit_logs by action_type ---'
SELECT 'wallet_audit_logs' AS table_name, action_type, count(*) AS row_count
FROM wallet_audit_logs
GROUP BY action_type
ORDER BY action_type;

\echo ''
\echo '--- Summary: all tables in one result set ---'
SELECT 'riders' AS table_name, count(*) AS row_count FROM riders
UNION ALL
SELECT 'vehicles', count(*) FROM vehicles
UNION ALL
SELECT 'trips', count(*) FROM trips
UNION ALL
SELECT 'wallet_audit_logs', count(*) FROM wallet_audit_logs
UNION ALL
SELECT 'mv_vehicle_lifetime_stats', count(*) FROM mv_vehicle_lifetime_stats
UNION ALL
SELECT 'vw_vehicle_revenue_moving_avg', count(*) FROM vw_vehicle_revenue_moving_avg
ORDER BY table_name;

-- ------------------------------------------------------------
-- PART 2: EXECUTION STATS (EXPLAIN ANALYZE)
-- ------------------------------------------------------------

\echo ''
\echo '===================================================='
\echo 'PART 2: EXPLAIN ANALYZE PLANS'
\echo '===================================================='

\echo '===  Vehicle lookup by license plate (tests unique constraint index) ==='
EXPLAIN ANALYZE
SELECT * FROM vehicles
WHERE license_plate = (SELECT license_plate FROM vehicles ORDER BY random() LIMIT 1);

\echo '===  Wallet audit history for one rider, most recent first ==='
EXPLAIN ANALYZE
SELECT * FROM wallet_audit_logs
WHERE rider_id = (SELECT id FROM riders ORDER BY random() LIMIT 1)
ORDER BY "timestamp" DESC
LIMIT 20;

\echo '===  Trips joined with vehicles, filtered by date range and status ==='
EXPLAIN ANALYZE
SELECT t.id, t.fare_amount, t.created_at, v.class, v.license_plate
FROM trips t
JOIN vehicles v ON v.id = t.vehicle_id
WHERE t.status = 'COMPLETED'
  AND t.created_at >= now() - interval '7 days';

\echo '===  Average fare grouped by vehicle class (aggregate over full trips table) ==='
EXPLAIN ANALYZE
SELECT v.class, round(avg(t.fare_amount), 2) AS avg_fare, count(*)
FROM trips t
JOIN vehicles v ON v.id = t.vehicle_id
GROUP BY v.class
ORDER BY avg_fare;

\echo '=== Top 10 vehicles by lifetime earnings (materialized view) ==='
EXPLAIN ANALYZE
SELECT * FROM mv_vehicle_lifetime_stats
ORDER BY lifetime_earnings DESC
LIMIT 10;

\echo '===  Revenue moving average + rank for one vehicle (window-function view) ==='
EXPLAIN ANALYZE
SELECT * FROM vw_vehicle_revenue_moving_avg
WHERE vehicle_id = (SELECT id FROM vehicles ORDER BY random() LIMIT 1)
ORDER BY revenue_date;

\echo '=== Riders with a wallet balance above average (subquery + full scan comparison) ==='
EXPLAIN ANALYZE
SELECT id, name, wallet_balance FROM riders
WHERE wallet_balance > (SELECT avg(wallet_balance) FROM riders)
ORDER BY wallet_balance DESC
LIMIT 20;

-- ------------------------------------------------------------
-- Restore output to terminal (stdout) at the very end
-- ------------------------------------------------------------
\o
\echo 'Done. Stats + row counts -> performance/query_stats.txt'