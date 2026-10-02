DROP PROCEDURE IF EXISTS sp_book_trip(UUID, UUID, DECIMAL, UUID, TEXT);

CREATE OR REPLACE PROCEDURE sp_book_trip(
    IN  p_rider_id     UUID,
    IN  p_vehicle_id   UUID,
    IN  p_fare_amount  DECIMAL(10,2),
    OUT p_trip_id      UUID,
    OUT p_status       TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_new_trip_id UUID;
    v_failed      BOOLEAN := false;
    v_error_msg   TEXT;
BEGIN

    PERFORM set_config('ridesync.wallet_action', 'ESCROW_HOLD', true);

    BEGIN
		IF p_fare_amount <= 0 THEN
	    	RAISE EXCEPTION 'Fare amount must be greater than zero';
		END IF;
		
        UPDATE riders
           SET wallet_balance = wallet_balance - p_fare_amount
         WHERE id = p_rider_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Rider % not found', p_rider_id
                USING ERRCODE = 'no_data_found';
        END IF;

        INSERT INTO trips (rider_id, vehicle_id, fare_amount, status)
        VALUES (p_rider_id, p_vehicle_id, p_fare_amount, 'REQUESTED')
        RETURNING id INTO v_new_trip_id;

    EXCEPTION
        WHEN check_violation THEN
            v_failed    := true;
            v_error_msg := 'insufficient wallet balance or invalid data (' || SQLERRM || ')';

        WHEN no_data_found THEN
            v_failed    := true;
            v_error_msg := SQLERRM;

        WHEN OTHERS THEN
            v_failed    := true;
            v_error_msg := SQLERRM;
    END;

    IF v_failed THEN
        ROLLBACK;
        p_trip_id := NULL;
        p_status  := 'FAILED: ' || v_error_msg;
    ELSE
        COMMIT;
        p_trip_id := v_new_trip_id;
        p_status  := 'BOOKED';
    END IF;
END;
$$;

DROP PROCEDURE IF EXISTS sp_release_escrow(UUID);

CREATE OR REPLACE PROCEDURE sp_release_escrow(
    IN p_trip_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_rider_id  UUID;
    v_failed    BOOLEAN := false;
    v_error_msg TEXT;
BEGIN
    PERFORM set_config('ridesync.wallet_action', 'ESCROW_RELEASE', true);
    BEGIN
        UPDATE trips
           SET status = 'COMPLETED'
         WHERE id = p_trip_id
           AND status = 'IN TRANSIT'
        RETURNING rider_id INTO v_rider_id;

        IF v_rider_id IS NULL THEN
            RAISE EXCEPTION 'Trip % not found or not IN TRANSIT', p_trip_id
                USING ERRCODE = 'no_data_found';
        END IF;

        INSERT INTO wallet_audit_logs (rider_id, amount_changed, action_type, balance_after, "timestamp")
        SELECT v_rider_id, 0.00, 'ESCROW_RELEASE', r.wallet_balance, now()
        FROM riders r
        WHERE r.id = v_rider_id;

    EXCEPTION
        WHEN OTHERS THEN
            v_failed    := true;
            v_error_msg := SQLERRM;
    END;

    IF v_failed THEN
        ROLLBACK;
        RAISE NOTICE 'sp_release_escrow failed: %', v_error_msg;
    ELSE
        COMMIT;
    END IF;
END;
$$;