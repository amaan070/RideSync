use("ridesync_mongo");

// ============================================================
// Node fs module (available inside mongosh)
// ============================================================
const fs = require("fs");

// ============================================================
// Output file setup
// ============================================================
const OUTPUT_FILE = "performance/mongo_output.txt";
const STATS_FILE  = "performance/mongo_explain_stats.txt";

// Clear/create both files at the start of the run
fs.writeFileSync(OUTPUT_FILE, "");
fs.writeFileSync(STATS_FILE, "");

// ============================================================
// Helper functions
// ============================================================

// Console-only logging (full raw detail, kept for debugging on screen)
function printSection(title, data) {
    print("\n" + "=".repeat(70));
    print(title);
    print("=".repeat(70));
    printjson(data);
}

// ---- mongo_output.txt (analysis report) helpers ----
function reportLine(line = "") {
    fs.appendFileSync(OUTPUT_FILE, line + "\n");
}

function reportHeading(title) {
    const bar = "=".repeat(60);
    reportLine("\n" + bar);
    reportLine(title.toUpperCase());
    reportLine(bar);
}

function reportSubHeading(title) {
    reportLine("\n" + "-".repeat(60));
    reportLine(title);
    reportLine("-".repeat(60));
}

// ---- mongo_explain_stats.txt (execution stats) helpers ----
function statsLine(line = "") {
    fs.appendFileSync(STATS_FILE, line + "\n");
}

function statsHeading(title) {
    const bar = "=".repeat(60);
    statsLine("\n" + bar);
    statsLine(title.toUpperCase());
    statsLine(bar);
}

// Pulls out the metrics that matter most for perf triage, when present.
// Handles both:
//  - find().explain("executionStats")  -> top-level queryPlanner/executionStats
//  - aggregate(pipeline, {explain:true}) -> stages array (shape varies by
//    server version; $cursor / $geoNear stages carry executionStats/inputStage)
function extractKeyMetrics(explainObj) {
    const metrics = {};

    // Case 1: classic find() explain shape
    if (explainObj.executionStats) {
        const es = explainObj.executionStats;
        metrics.executionTimeMillis = es.executionTimeMillis;
        metrics.totalKeysExamined = es.totalKeysExamined;
        metrics.totalDocsExamined = es.totalDocsExamined;
        metrics.nReturned = es.nReturned;
        if (explainObj.queryPlanner && explainObj.queryPlanner.winningPlan) {
            metrics.winningPlanStage = explainObj.queryPlanner.winningPlan.stage;
            metrics.indexUsed =
                (explainObj.queryPlanner.winningPlan.inputStage &&
                 explainObj.queryPlanner.winningPlan.inputStage.indexName) || null;
        }
        return metrics;
    }

    // Case 2: aggregate() explain shape - walk the stages array looking
    // for anything carrying executionStats or a winning plan.
    if (Array.isArray(explainObj.stages)) {
        const stageSummaries = [];
        explainObj.stages.forEach(stage => {
            const stageName = Object.keys(stage)[0];
            const stageBody = stage[stageName];
            const summary = { stage: stageName };

            // $cursor / $geoNear stages often embed a queryPlanner/executionStats
            const qp = stageBody && (stageBody.queryPlanner || stageBody);
            const es = stageBody && stageBody.executionStats;

            if (es) {
                summary.executionTimeMillisEstimate = es.executionTimeMillisEstimate;
                summary.totalKeysExamined = es.totalKeysExamined;
                summary.totalDocsExamined = es.totalDocsExamined;
                summary.nReturned = es.nReturned;
            }
            if (qp && qp.winningPlan) {
                summary.winningPlanStage = qp.winningPlan.stage;
                summary.indexUsed =
                    (qp.winningPlan.inputStage &&
                     qp.winningPlan.inputStage.indexName) || null;
            }
            stageSummaries.push(summary);
        });
        metrics.stageSummaries = stageSummaries;
    }

    return metrics;
}

function writeExplainSection(title, explainObj) {
    statsHeading(title);

    if (!explainObj) {
        statsLine("No explain data captured.");
        return;
    }

    const metrics = extractKeyMetrics(explainObj);

    statsLine("\n-- Key Metrics --");
    if (metrics.stageSummaries) {
        metrics.stageSummaries.forEach((s, i) => {
            statsLine(`  Stage ${i + 1}: ${s.stage}`);
            if (s.winningPlanStage) statsLine(`    Winning plan stage : ${s.winningPlanStage}`);
            if (s.indexUsed !== undefined) statsLine(`    Index used         : ${s.indexUsed || "COLLSCAN / none"}`);
            if (s.totalKeysExamined !== undefined) statsLine(`    Keys examined      : ${s.totalKeysExamined}`);
            if (s.totalDocsExamined !== undefined) statsLine(`    Docs examined      : ${s.totalDocsExamined}`);
            if (s.nReturned !== undefined) statsLine(`    Returned           : ${s.nReturned}`);
            if (s.executionTimeMillisEstimate !== undefined) statsLine(`    Est. time (ms)     : ${s.executionTimeMillisEstimate}`);
        });
    } else {
        statsLine(`  Winning plan stage : ${metrics.winningPlanStage || "N/A"}`);
        statsLine(`  Index used         : ${metrics.indexUsed || "COLLSCAN / none"}`);
        statsLine(`  Keys examined      : ${metrics.totalKeysExamined ?? "N/A"}`);
        statsLine(`  Docs examined      : ${metrics.totalDocsExamined ?? "N/A"}`);
        statsLine(`  Returned           : ${metrics.nReturned ?? "N/A"}`);
        statsLine(`  Execution time(ms) : ${metrics.executionTimeMillis ?? "N/A"}`);
    }

    statsLine("\n-- Full Explain Output (raw JSON) --");
    statsLine(JSON.stringify(explainObj, null, 2));
}


// ============================================================
// RESULTS OBJECT
// Each result is stored separately
// ============================================================
const results = {};


// ============================================================
// 1. $geoNear - nearest available vehicle within 5km
// ============================================================

results.geoNearResult = db.TelemetryPings.aggregate([
    {
        $geoNear: {
            near: {
                type: "Point",
                coordinates: [78.4867, 17.3850]
            },
            distanceField: "distance_meters",
            maxDistance: 5000,
            query: {
                is_available: true
            },
            spherical: true
        }
    },
    {
        $limit: 5
    }
]).toArray();

printSection(
    "1. NEAREST AVAILABLE VEHICLE - DATA",
    results.geoNearResult
);

results.geoNearExplain = db.TelemetryPings.aggregate([
    {
        $geoNear: {
            near: {
                type: "Point",
                coordinates: [78.4867, 17.3850]
            },
            distanceField: "distance_meters",
            maxDistance: 5000,
            query: {
                is_available: true
            },
            spherical: true
        }
    },
    {
        $limit: 5
    }
], {
    explain: true
});

printSection(
    "1. NEAREST AVAILABLE VEHICLE - EXPLAIN PLAN",
    results.geoNearExplain
);
writeExplainSection("1. Nearest Available Vehicle ($geoNear)", results.geoNearExplain);


// ============================================================
// 2. Find all pings for one vehicle (console only - not in report)
// ============================================================

const samplePing = db.TelemetryPings.findOne();

if (samplePing) {

    const samplePingVehicleId = samplePing.vehicle_id;

    results.pingsByVehicleResult = db.TelemetryPings.find(
        { vehicle_id: samplePingVehicleId }
    )
    .limit(5)
    .toArray();

    printSection(
        `2. PINGS FOR VEHICLE ${samplePingVehicleId} - DATA`,
        results.pingsByVehicleResult
    );

    results.pingsByVehicleExplain = db.TelemetryPings.find(
        { vehicle_id: samplePingVehicleId }
    ).explain("executionStats");

    printSection(
        `2. PINGS FOR VEHICLE ${samplePingVehicleId} - EXPLAIN PLAN`,
        results.pingsByVehicleExplain
    );
    writeExplainSection(`2. Pings for Vehicle ${samplePingVehicleId}`, results.pingsByVehicleExplain);

} else {
    printSection("2. PINGS BY VEHICLE", "No TelemetryPings documents found.");
    writeExplainSection("2. Pings by Vehicle", null);
}


// ============================================================
// 3. Count available vehicles
// ============================================================

results.countAvailableResult =
    db.TelemetryPings.countDocuments({ is_available: true });

printSection(
    "3. COUNT OF AVAILABLE VEHICLES - DATA",
    results.countAvailableResult
);

results.countAvailableExplain =
    db.TelemetryPings.find({ is_available: true })
        .explain("executionStats");

printSection(
    "3. COUNT OF AVAILABLE VEHICLES - EXPLAIN PLAN",
    results.countAvailableExplain
);
writeExplainSection("3. Count of Available Vehicles", results.countAvailableExplain);


// ============================================================
// 4. Geospatial + availability combined filter (console only)
// ============================================================

results.geoPlusAvailabilityResult =
    db.TelemetryPings.find({
        location: {
            $near: {
                $geometry: { type: "Point", coordinates: [78.4867, 17.3850] },
                $maxDistance: 3000
            }
        },
        is_available: true
    })
    .limit(5)
    .toArray();

printSection(
    "4. GEO + AVAILABILITY FILTER - DATA",
    results.geoPlusAvailabilityResult
);

results.geoPlusAvailabilityExplain =
    db.TelemetryPings.find({
        location: {
            $near: {
                $geometry: { type: "Point", coordinates: [78.4867, 17.3850] },
                $maxDistance: 3000
            }
        },
        is_available: true
    }).explain("executionStats");

printSection(
    "4. GEO + AVAILABILITY FILTER - EXPLAIN PLAN",
    results.geoPlusAvailabilityExplain
);
writeExplainSection("4. Geo + Availability Filter", results.geoPlusAvailabilityExplain);


// ============================================================
// 5. Reviews for one vehicle (console only)
// ============================================================

const sampleReview = db.TripReviews.findOne();

if (sampleReview) {

    const sampleReviewVehicleId = sampleReview.vehicle_id;

    results.reviewsByVehicleResult =
        db.TripReviews.find({ vehicle_id: sampleReviewVehicleId })
            .limit(5)
            .toArray();

    printSection(
        `5. REVIEWS FOR VEHICLE ${sampleReviewVehicleId} - DATA`,
        results.reviewsByVehicleResult
    );

    results.reviewsByVehicleExplain =
        db.TripReviews.find({ vehicle_id: sampleReviewVehicleId })
            .explain("executionStats");

    printSection(
        `5. REVIEWS FOR VEHICLE ${sampleReviewVehicleId} - EXPLAIN PLAN`,
        results.reviewsByVehicleExplain
    );
    writeExplainSection(`5. Reviews for Vehicle ${sampleReviewVehicleId}`, results.reviewsByVehicleExplain);

} else {
    printSection("5. REVIEWS BY VEHICLE", "No TripReviews documents found.");
    writeExplainSection("5. Reviews by Vehicle", null);
}


// ============================================================
// 6. Reviews with rating >= 4 (console only)
// ============================================================

results.highRatedReviewsResult =
    db.TripReviews.find({ rating: { $gte: 4 } })
        .limit(5)
        .toArray();

printSection(
    "6. HIGH RATED REVIEWS (rating >= 4) - DATA",
    results.highRatedReviewsResult
);

results.highRatedReviewsExplain =
    db.TripReviews.find({ rating: { $gte: 4 } })
        .explain("executionStats");

printSection(
    "6. HIGH RATED REVIEWS (rating >= 4) - EXPLAIN PLAN",
    results.highRatedReviewsExplain
);
writeExplainSection("6. High Rated Reviews (rating >= 4)", results.highRatedReviewsExplain);


// ============================================================
// 7. Review analysis
//    Rating statistics / Average rating / Total reviews / Top tags
// ============================================================

results.reviewAnalysisResult =
    db.TripReviews.aggregate([
        {
            $facet: {
                ratingStats: [
                    { $group: { _id: "$rating", count: { $sum: 1 } } },
                    { $sort: { _id: 1 } }
                ],
                averageRating: [
                    {
                        $group: {
                            _id: null,
                            avgRating: { $avg: "$rating" },
                            totalReviews: { $sum: 1 }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            avgRating: { $round: ["$avgRating", 2] },
                            totalReviews: 1
                        }
                    }
                ],
                topFeedbackTags: [
                    { $unwind: "$feedback_tags" },
                    { $group: { _id: "$feedback_tags", count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 10 }
                ]
            }
        }
    ]).toArray();

printSection("7. REVIEW ANALYSIS - DATA", results.reviewAnalysisResult);

results.reviewAnalysisExplain =
    db.TripReviews.aggregate([
        {
            $facet: {
                ratingStats: [
                    { $group: { _id: "$rating", count: { $sum: 1 } } },
                    { $sort: { _id: 1 } }
                ],
                averageRating: [
                    {
                        $group: {
                            _id: null,
                            avgRating: { $avg: "$rating" },
                            totalReviews: { $sum: 1 }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            avgRating: { $round: ["$avgRating", 2] },
                            totalReviews: 1
                        }
                    }
                ],
                topFeedbackTags: [
                    { $unwind: "$feedback_tags" },
                    { $group: { _id: "$feedback_tags", count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 10 }
                ]
            }
        }
    ], { explain: true });

printSection("7. REVIEW ANALYSIS - EXPLAIN PLAN", results.reviewAnalysisExplain);
writeExplainSection("7. Review Analysis ($facet)", results.reviewAnalysisExplain);


// ============================================================
// 8. VehicleMetadata lookup by vehicle_id (console only)
// ============================================================

const sampleMetadata = db.VehicleMetadata.findOne();

if (sampleMetadata) {

    const sampleMetadataVehicleId = sampleMetadata.vehicle_id;

    results.vehicleMetadataResult =
        db.VehicleMetadata.find({ vehicle_id: sampleMetadataVehicleId })
            .limit(5)
            .toArray();

    printSection(
        `8. VEHICLE METADATA FOR ${sampleMetadataVehicleId} - DATA`,
        results.vehicleMetadataResult
    );

    results.vehicleMetadataExplain =
        db.VehicleMetadata.find({ vehicle_id: sampleMetadataVehicleId })
            .explain("executionStats");

    printSection(
        `8. VEHICLE METADATA FOR ${sampleMetadataVehicleId} - EXPLAIN PLAN`,
        results.vehicleMetadataExplain
    );
    writeExplainSection(`8. Vehicle Metadata for ${sampleMetadataVehicleId}`, results.vehicleMetadataExplain);

} else {
    printSection("8. VEHICLE METADATA", "No VehicleMetadata documents found.");
    writeExplainSection("8. Vehicle Metadata", null);
}


// ============================================================
// 8B. Cross-reference: review ratings vs vehicle metadata
//     (join TripReviews -> VehicleMetadata on vehicle_id)
//     This is where VehicleMetadata actually gets used in
//     analysis: top-rated vehicles, joined with their features
//     and most recent inspection date.
//
//     PERF NOTE: the original version put $lookup FIRST, which
//     means MongoDB joins VehicleMetadata onto every single
//     TripReviews document (could be 100k+ lookups) before ever
//     narrowing down to the top 10. Instead: $group + $sort +
//     $limit run first on TripReviews alone (cheap, no join),
//     and $lookup only runs against the resulting 10 vehicle_ids.
//     That turns "N reviews x 1 lookup each" into "10 lookups
//     total", which is the single biggest cost difference in
//     this pipeline. Compare the EXPLAIN plan's totalDocsExamined
//     / nReturned per stage before/after to see it directly.
//
//     Also requires: db.VehicleMetadata.createIndex({ vehicle_id: 1 })
//     Without it, even those 10 lookups fall back to a collection
//     scan on VehicleMetadata. Check 01_collections_and_indexes.js.
// ============================================================

const ratingsVsMetadataPipeline = [
    // Step 1: aggregate ratings per vehicle from TripReviews ONLY.
    // No join yet -> cheap regardless of review volume.
    {
        $group: {
            _id: "$vehicle_id",
            avgRating: { $avg: "$rating" },
            reviewCount: { $sum: 1 }
        }
    },
    // Step 2: narrow down to the top 10 BEFORE joining anything.
    { $sort: { avgRating: -1 } },
    { $limit: 10 },
    // Step 3: now join metadata for just those 10 vehicle_ids.
    {
        $lookup: {
            from: "VehicleMetadata",
            localField: "_id",
            foreignField: "vehicle_id",
            as: "metadata"
        }
    },
    { $unwind: "$metadata" },
    {
        $project: {
            _id: 1,
            avgRating: { $round: ["$avgRating", 2] },
            reviewCount: 1,
            features: "$metadata.features",
            lastInspection: { $max: "$metadata.inspection_records.date" }
        }
    }
];

results.ratingsVsMetadataResult =
    db.TripReviews.aggregate(ratingsVsMetadataPipeline).toArray();

printSection(
    "8B. TOP RATED VEHICLES + METADATA - DATA",
    results.ratingsVsMetadataResult
);

results.ratingsVsMetadataExplain =
    db.TripReviews.aggregate(ratingsVsMetadataPipeline, { explain: true });

printSection(
    "8B. TOP RATED VEHICLES + METADATA - EXPLAIN PLAN",
    results.ratingsVsMetadataExplain
);
writeExplainSection("8B. Top Rated Vehicles + Metadata (lookup after limit)", results.ratingsVsMetadataExplain);


// ============================================================
// 9. Console recap of key results (unchanged, screen only)
// ============================================================

printSection("9A. NEAREST VEHICLE RESULT", results.geoNearResult);
printSection("9B. PINGS BY VEHICLE RESULT", results.pingsByVehicleResult);
printSection("9C. AVAILABLE VEHICLE COUNT", results.countAvailableResult);
printSection("9D. GEO + AVAILABILITY RESULT", results.geoPlusAvailabilityResult);
printSection("9E. REVIEWS BY VEHICLE RESULT", results.reviewsByVehicleResult);
printSection("9F. HIGH RATED REVIEWS RESULT", results.highRatedReviewsResult);
printSection("9G. REVIEW ANALYSIS RESULT", results.reviewAnalysisResult);
printSection("9H. VEHICLE METADATA RESULT", results.vehicleMetadataResult);
printSection("9I. RATINGS VS METADATA RESULT", results.ratingsVsMetadataResult);


// ============================================================
// 10. BUILD THE HUMAN-READABLE REPORT (mongo_output.txt)
//     Analysis-only: no raw ping/review/metadata dumps.
//     Order: Review Analysis first, then availability, then
//     nearest-vehicle summary, then ratings-vs-metadata.
// ============================================================

const now = new Date();

reportLine("#".repeat(60));
reportLine("RIDESYNC - MONGODB PERFORMANCE & ANALYSIS REPORT");
reportLine("Generated: " + now.toString());
reportLine("#".repeat(60));

// ---- 10A. Review Analysis (TOP PRIORITY SECTION) ----
reportHeading("Review Analysis Summary");

if (results.reviewAnalysisResult && results.reviewAnalysisResult.length > 0) {

    const analysis = results.reviewAnalysisResult[0];

    // Average rating + total reviews
    const avg = (analysis.averageRating && analysis.averageRating[0])
        ? analysis.averageRating[0]
        : { avgRating: "N/A", totalReviews: 0 };

    reportSubHeading("Overall Rating");
    reportLine(`Average Rating   : ${avg.avgRating} / 5`);
    reportLine(`Total Reviews    : ${avg.totalReviews}`);

    // Rating distribution
    reportSubHeading("Rating Distribution");
    if (analysis.ratingStats && analysis.ratingStats.length > 0) {
        analysis.ratingStats.forEach(stat => {
            const stars = "*".repeat(stat._id);
            reportLine(`  ${stat._id} star (${stars}) : ${stat.count} review(s)`);
        });
    } else {
        reportLine("  No rating data available.");
    }

    // Top feedback tags
    reportSubHeading("Top Feedback Tags");
    if (analysis.topFeedbackTags && analysis.topFeedbackTags.length > 0) {
        analysis.topFeedbackTags.forEach((tag, idx) => {
            reportLine(`  ${idx + 1}. ${tag._id} - ${tag.count} mention(s)`);
        });
    } else {
        reportLine("  No feedback tags available.");
    }

} else {
    reportLine("No review analysis data available.");
}

// ---- 10B. Vehicle Availability ----
reportHeading("Vehicle Availability");
reportLine(`Available Vehicles Right Now : ${results.countAvailableResult}`);

// ---- 10C. Nearest Available Vehicle ----
reportHeading("Nearest Available Vehicle");

if (results.geoNearResult && results.geoNearResult.length > 0) {

    const nearest = results.geoNearResult[0];
    const distanceKm = (nearest.distance_meters / 1000).toFixed(2);

    reportLine(`Vehicle ID     : ${nearest.vehicle_id}`);
    reportLine(`Distance       : ${nearest.distance_meters} meters (~${distanceKm} km)`);
    reportLine(`Availability   : ${nearest.is_available ? "Available" : "Not available"}`);

} else {
    reportLine("No available vehicle found within 5km.");
}

// ---- 10D. Top Rated Vehicles + Metadata ----
reportHeading("Top Rated Vehicles (with Metadata)");

if (results.ratingsVsMetadataResult && results.ratingsVsMetadataResult.length > 0) {
    results.ratingsVsMetadataResult.forEach((v, idx) => {
        const featureList = v.features ? Object.keys(v.features).join(", ") : "none recorded";
        const lastInspect = v.lastInspection ? new Date(v.lastInspection).toDateString() : "N/A";
        reportLine(`  ${idx + 1}. Vehicle ${v._id}`);
        reportLine(`     Avg Rating       : ${v.avgRating.toFixed(2)} (${v.reviewCount} review(s))`);
        reportLine(`     Features         : ${featureList}`);
        reportLine(`     Last Inspection  : ${lastInspect}`);
    });
} else {
    reportLine("No ratings-vs-metadata data available.");
}

// ---- Footer ----
reportLine("\n" + "#".repeat(60));
reportLine("END OF REPORT");
reportLine("#".repeat(60));

// ---- Stats file footer ----
statsLine("\n" + "#".repeat(60));
statsLine("END OF EXPLAIN STATS");
statsLine("#".repeat(60));


// ============================================================
// End
// ============================================================

print("\n");
print("=".repeat(70));
print("ALL MONGODB PERFORMANCE QUERIES COMPLETED");
print("Human-readable analysis report saved to: " + OUTPUT_FILE);
print("Execution stats (explain plans) saved to: " + STATS_FILE);
print("=".repeat(70));