# RideSync — Hybrid Ride-Booking Database System

**Repository:** [amaan070/RideSync](https://github.com/amaan070/RideSync)

RideSync is a database-focused ride-booking platform prototype built with **PostgreSQL** and **MongoDB**. It separates transactional records from flexible, high-volume operational data and demonstrates relational integrity, document modelling, geospatial search, analytics, and query-plan analysis.

## Architecture

| Data responsibility | Database | Examples |
|---|---|---|
| Transactional/core data | PostgreSQL | Riders, vehicles, trips, wallet balances, audit logs |
| Flexible/operational data | MongoDB | Vehicle metadata, GPS telemetry, trip reviews |

The databases are logically linked through shared UUID values (`vehicle_id`, `trip_id`); this repository does not implement a distributed transaction coordinator between them.

### Repository layout

```text
.
├── sql/                 # PostgreSQL schema, indexes, procedures, views
├── mongo/               # MongoDB collections, indexes and workflows
├── data_generation/     # Synthetic data seeders
├── performance/         # EXPLAIN / execution-statistics scripts and snapshots
├── data_generation/    # Synthetic data seeders
├── performance/        # EXPLAIN / execution-statistics scripts and snapshots
└── docs/                # ERD and MongoDB schema map
```

## Key database features

### PostgreSQL
- Relational schema with UUID primary keys, foreign keys, check constraints and unique constraints.
- Indexes for trip and wallet-history lookups, including a partial unique index enforcing one active trip per rider.
- Trigger-based wallet audit logging.
- Stored procedures for trip booking and escrow release.
- Materialized vehicle-lifetime statistics and a seven-day moving-revenue analytics view using window functions.

### MongoDB
- Separate collections for `VehicleMetadata`, `TelemetryPings` and `TripReviews`.
- `2dsphere` geospatial index and `$geoNear` workflow for nearby available-vehicle discovery.
- TTL index to expire old telemetry records.
- Aggregation pipelines using `$facet`, `$group`, `$unwind` and `$lookup` for review analytics and vehicle metadata enrichment.
- Query execution inspection using `explain("executionStats")`.

## Tech stack

- PostgreSQL / PLpgSQL
- MongoDB Community Server / `mongosh`
- Python 3, `psycopg2`, `pymongo`, `Faker`, `python-dotenv`

## Setup

### 1. Create databases

Start PostgreSQL and MongoDB locally, then create the PostgreSQL database:

```sql
CREATE DATABASE ridesync_db;
```

MongoDB creates/uses `ridesync_mongo` when the scripts run.

### 2. Configure credentials

```bash
python -m venv .venv
# Linux/macOS
source .venv/bin/activate
# Windows PowerShell
# .venv\Scripts\Activate.ps1

pip install -r data_generation/requirements.txt
cp .env.example .env
```

Edit `.env` with your local PostgreSQL credentials and MongoDB URI. **Do not commit `.env`.**

### 3. Apply PostgreSQL schema

Run these scripts in order from the repository root:

```bash
psql -U postgres -d ridesync_db -f sql/01_schema_ddl.sql
psql -U postgres -d ridesync_db -f sql/02_indexes.sql
psql -U postgres -d ridesync_db -f sql/03_triggers_and_audit.sql
psql -U postgres -d ridesync_db -f sql/04_stored_procedures.sql
psql -U postgres -d ridesync_db -f sql/05_materialized_views.sql
psql -U postgres -d ridesync_db -f sql/06_window_analytics.sql
```

### 4. Create MongoDB collections and indexes

```bash
mongosh mongo/01_collections_and_indexes.js
```

### 5. Generate sample data (optional)

Run the PostgreSQL seeder first; it also creates vehicle metadata in MongoDB:

```bash
python data_generation/postgres_seeder.py
```

Then generate telemetry pings and trip reviews:

```bash
python data_generation/mongo_seeder.py
```

The seeders generate synthetic data and can take time. Review their configuration constants before running against a non-empty database. They are intended for a disposable development database, not production use.

### 6. Run MongoDB workflows

```bash
mongosh ridesync_mongo
```

In the `mongosh` prompt, load and run the workflows:

```javascript
load("mongo/02_workflow_geonear.js")
findNearestVehicle(78.4867, 17.3850, 5000)

load("mongo/03_workflow4_facet.js")
```

### 7. Inspect query performance

PostgreSQL:

```bash
psql -U postgres -d ridesync_db -f performance/pg_explain_queries.sql
```

MongoDB:

```bash
mongosh performance/mongo_execution_stats.js
```

The `performance/` directory contains captured execution-statistics and output snapshots from a previous run. They are illustrative measurements from that dataset and environment, not guaranteed timings.

## Data snapshot in the committed performance report

The supplied PostgreSQL report records approximately:
- 300,000 riders
- 80,000 vehicles
- 99,569 trips
- 194,206 wallet audit-log records

The seeder's default generation parameters may differ from this captured snapshot. Treat the report as historical evidence, not as the guaranteed output of a fresh default run.

## Team contributions

This was developed as a team database project. The README and codebase document the division of work; my primary contribution was the **MongoDB component: collections, indexes, geospatial queries and related workflows**. PostgreSQL schema/procedural work, data generation and performance testing were shared across other team responsibilities.

## Notes

- PostgreSQL and MongoDB are connected through application-level UUID references; referential integrity across the two databases is not enforced by a single database engine.
- Seed data is synthetic.
- Review and adapt credentials, dataset sizes and cleanup strategy before running the seeders.
