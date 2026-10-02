// Select database
const ridesyncDb = db.getSiblingDB("ridesync_mongo");


function findNearestVehicle(
    longitude,
    latitude,
    maxDistanceMeters = 5000
) {
    const rider_location = {
        type: "Point",
        coordinates: [longitude, latitude]
    };

    const result = ridesyncDb.TelemetryPings.aggregate([
        {
            $geoNear: {
                near: rider_location,
                key: "location",
                distanceField: "distance_meters",
                maxDistance: maxDistanceMeters,
                spherical: true,
                query: {
                    is_available: true
                }
            }
        },
        {
            $limit: 1
        }
    ]).toArray();

    return result.length > 0 ? result[0] : null;
}

// Example: findNearestVehicle(78.4867, 17.3850, 5000);
