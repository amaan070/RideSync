DROP VIEW IF EXISTS vw_vehicle_revenue_moving_avg;

CREATE VIEW vw_vehicle_revenue_moving_avg AS
WITH daily_revenue AS (
    SELECT
        vehicle_id,
        created_at::date AS revenue_date,
        SUM(fare_amount)  AS daily_fare
    FROM trips
    WHERE status = 'COMPLETED'
    GROUP BY vehicle_id, created_at::date
),
moving_avg AS (
    SELECT
        vehicle_id,
        revenue_date,
        daily_fare,
        AVG(daily_fare) OVER (
            PARTITION BY vehicle_id
            ORDER BY revenue_date
            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ) AS moving_avg_7day
    FROM daily_revenue
)

SELECT
    m.vehicle_id,
    v.license_plate,
    v.class,
    m.revenue_date,
    m.daily_fare,
    ROUND(m.moving_avg_7day, 2) AS moving_avg_7day_revenue,
    DENSE_RANK() OVER (
        PARTITION BY m.revenue_date
        ORDER BY m.moving_avg_7day DESC
    ) AS revenue_rank_on_date
FROM moving_avg m
JOIN vehicles v ON v.id = m.vehicle_id
ORDER BY m.revenue_date, revenue_rank_on_date;
