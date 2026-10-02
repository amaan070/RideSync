CREATE TABLE riders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    wallet_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT riders_wallet_balance_nonnegative
        CHECK (wallet_balance >= 0)
);


CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_plate VARCHAR(20) NOT NULL UNIQUE,
    class VARCHAR(30) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);


CREATE TABLE trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL,
    vehicle_id UUID NOT NULL,
    fare_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT trips_rider_fk
        FOREIGN KEY (rider_id)
        REFERENCES riders(id),

    CONSTRAINT trips_vehicle_fk
        FOREIGN KEY (vehicle_id)
        REFERENCES vehicles(id),

    CONSTRAINT trips_fare_nonnegative
        CHECK (fare_amount >= 0),

    CONSTRAINT trips_status_check
        CHECK (status IN ('REQUESTED', 'IN TRANSIT', 'COMPLETED'))
);


CREATE TABLE wallet_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL,
    amount_changed NUMERIC(12,2) NOT NULL,
    action_type VARCHAR(20) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT wallet_audit_rider_fk
        FOREIGN KEY (rider_id)
        REFERENCES riders(id),

    CONSTRAINT wallet_audit_action_check
        CHECK (action_type IN ('CREDIT','ESCROW_HOLD','ESCROW_RELEASE', 'DEBIT')),

    CONSTRAINT wallet_audit_balance_nonnegative
        CHECK (balance_after >= 0)
);