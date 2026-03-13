// TP MongoDB - FraudShield Banking
// Run in PowerShell with: mongosh "mongodb://127.0.0.1:27017/fraudshield_banking" --file queries.js

db = db.getSiblingDB("fraudshield_banking");

const section = (title) => {
  print("\n============================================================");
  print(title);
  print("============================================================");
};

const rawFields = [
  "Transaction_ID",
  "Customer_ID",
  "Transaction_Amount (in Million)",
  "Transaction_Time",
  "Transaction_Date",
  "Transaction_Type",
  "Merchant_ID",
  "Merchant_Category",
  "Transaction_Location",
  "Customer_Home_Location",
  "Distance_From_Home",
  "Device_ID",
  "IP_Address",
  "Card_Type",
  "Account_Balance (in Million)",
  "Daily_Transaction_Count",
  "Weekly_Transaction_Count",
  "Avg_Transaction_Amount (in Million)",
  "Max_Transaction_Last_24h (in Million)",
  "Is_International_Transaction",
  "Is_New_Merchant",
  "Failed_Transaction_Count",
  "Unusual_Time_Transaction",
  "Previous_Fraud_Count",
  "Fraud_Label"
];

const cleanFields = [
  "Transaction_ID",
  "Customer_ID",
  "Transaction_Amount",
  "Transaction_Time",
  "Transaction_Date",
  "Transaction_Type",
  "Merchant_ID",
  "Merchant_Category",
  "Transaction_Location",
  "Customer_Home_Location",
  "Distance_From_Home",
  "Device_ID",
  "IP_Address",
  "Card_Type",
  "Account_Balance",
  "Daily_Transaction_Count",
  "Weekly_Transaction_Count",
  "Avg_Transaction_Amount",
  "Max_Transaction_Last_24h",
  "Is_International_Transaction",
  "Is_New_Merchant",
  "Failed_Transaction_Count",
  "Unusual_Time_Transaction",
  "Previous_Fraud_Count",
  "Fraud_Label"
];

const typeProjection = (fields) => {
  const projection = { _id: { $type: "$_id" } };
  for (const field of fields) {
    projection[field] = { $type: `$${field}` };
  }
  return projection;
};

const toDouble = (fieldPath) => ({
  $convert: {
    input: fieldPath,
    to: "double",
    onError: null,
    onNull: null
  }
});

const toInt = (fieldPath) => ({
  $convert: {
    input: {
      $trunc: toDouble(fieldPath)
    },
    to: "int",
    onError: null,
    onNull: null
  }
});

const yesNoToBool = (fieldPath) => ({
  $switch: {
    branches: [
      // If the field is already a boolean (ex: after a previous run), keep it.
      { case: { $eq: [{ $type: fieldPath }, "bool"] }, then: fieldPath },
      { case: { $eq: [fieldPath, "Yes"] }, then: true },
      { case: { $eq: [fieldPath, "No"] }, then: false }
    ],
    default: null
  }
});

const toDate = (fieldPath) => ({
  $switch: {
    branches: [
      // If the field is already a BSON date (ex: after a previous run), keep it.
      { case: { $eq: [{ $type: fieldPath }, "date"] }, then: fieldPath },
      {
        case: { $eq: [{ $type: fieldPath }, "string"] },
        then: {
          $dateFromString: {
            dateString: fieldPath,
            format: "%Y-%m-%d",
            timezone: "UTC",
            onError: null,
            onNull: null
          }
        }
      }
    ],
    default: null
  }
});

const toHour = (fieldPath) => ({
  $convert: {
    input: {
      $arrayElemAt: [
        {
          $split: [
            { $ifNull: [fieldPath, ""] },
            ":"
          ]
        },
        0
      ]
    },
    to: "int",
    onError: null,
    onNull: null
  }
});

const findStageInPlan = (node, wanted) => {
  if (!node || typeof node !== "object") {
    return null;
  }

  if (typeof node.stage === "string" && wanted.includes(node.stage)) {
    return node.stage;
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findStageInPlan(item, wanted);
        if (found) {
          return found;
        }
      }
    } else if (value && typeof value === "object") {
      const found = findStageInPlan(value, wanted);
      if (found) {
        return found;
      }
    }
  }

  return null;
};

const explainSummary = (explainResult) => ({
  executionTimeMillis: explainResult.executionStats.executionTimeMillis,
  totalDocsExamined: explainResult.executionStats.totalDocsExamined,
  totalKeysExamined: explainResult.executionStats.totalKeysExamined,
  nReturned: explainResult.executionStats.nReturned,
  stage: findStageInPlan(explainResult.executionStats.executionStages, ["COLLSCAN", "IXSCAN"]) ||
    findStageInPlan(explainResult.queryPlanner.winningPlan, ["COLLSCAN", "IXSCAN"]) ||
    "UNKNOWN"
});

const compareExplain = (beforeStats, afterStats) => ({
  before: beforeStats,
  after: afterStats,
  docsExaminedReduction: beforeStats.totalDocsExamined - afterStats.totalDocsExamined,
  keysExaminedChange: afterStats.totalKeysExamined - beforeStats.totalKeysExamined,
  executionTimeDeltaMillis: beforeStats.executionTimeMillis - afterStats.executionTimeMillis
});

section("Partie 1 - Validation de l'import brut");


const importedCount = db.transactions.countDocuments();
print(`Q1.1.3 - Imported documents: ${importedCount}`);

// Just checking the raw types first.
const rawTypeMap = db.transactions.aggregate([
  { $limit: 1 },
  { $project: typeProjection(rawFields) }
]).toArray()[0];

print("Q1.1.3 - Field types immediately after import:");
printjson(rawTypeMap);

// Small backup before cleanup.
db.transactions.aggregate([
  { $match: {} },
  { $out: "transactions_raw_backup" }
]).toArray();

print(`Raw backup created: ${db.transactions_raw_backup.countDocuments()} documents in transactions_raw_backup`);

section("Partie 1 - Nettoyage et normalisation");

// These long headers are annoying, so I rename them first.
const renameResult = db.transactions.updateMany(
  {},
  {
    $rename: {
      "Transaction_Amount (in Million)": "Transaction_Amount",
      "Account_Balance (in Million)": "Account_Balance",
      "Avg_Transaction_Amount (in Million)": "Avg_Transaction_Amount",
      "Max_Transaction_Last_24h (in Million)": "Max_Transaction_Last_24h"
    }
  }
);

print("Field rename result:");
printjson(renameResult);

// Then I clean the main fields.
const conversionSet = {
  Transaction_ID: toInt("$Transaction_ID"),
  Customer_ID: toInt("$Customer_ID"),
  Transaction_Amount: toDouble("$Transaction_Amount"),
  Merchant_ID: toInt("$Merchant_ID"),
  Distance_From_Home: toDouble("$Distance_From_Home"),
  Device_ID: toInt("$Device_ID"),
  Account_Balance: toDouble("$Account_Balance"),
  Daily_Transaction_Count: toInt("$Daily_Transaction_Count"),
  Weekly_Transaction_Count: toInt("$Weekly_Transaction_Count"),
  Avg_Transaction_Amount: toDouble("$Avg_Transaction_Amount"),
  Max_Transaction_Last_24h: toDouble("$Max_Transaction_Last_24h"),
  Failed_Transaction_Count: toInt("$Failed_Transaction_Count"),
  Previous_Fraud_Count: toInt("$Previous_Fraud_Count"),
  Transaction_Date: toDate("$Transaction_Date"),
  Is_International_Transaction: yesNoToBool("$Is_International_Transaction"),
  Is_New_Merchant: yesNoToBool("$Is_New_Merchant"),
  Unusual_Time_Transaction: yesNoToBool("$Unusual_Time_Transaction")
};

const conversionResult = db.transactions.updateMany(
  {},
  [
    {
      $set: conversionSet
    }
  ]
);

print("Type conversion result:");
printjson(conversionResult);

const cleanedTypeMap = db.transactions.aggregate([
  { $limit: 1 },
  { $project: typeProjection(cleanFields) }
]).toArray()[0];

print("Q1.1.3 - Field types after normalization:");
printjson(cleanedTypeMap);

const idIssues = {
  null_transaction_ids: db.transactions.countDocuments({ Transaction_ID: null }),
  null_customer_ids: db.transactions.countDocuments({ Customer_ID: null })
};

print("Data quality check after normalization:");
printjson(idIssues);

const boolNulls = {
  null_international: db.transactions.countDocuments({ Is_International_Transaction: null }),
  null_new_merchant: db.transactions.countDocuments({ Is_New_Merchant: null }),
  null_unusual_time: db.transactions.countDocuments({ Unusual_Time_Transaction: null })
};

// If these are huge (ex: 50k), it usually means the script was rerun without reimporting.
if (Math.max(boolNulls.null_international, boolNulls.null_new_merchant, boolNulls.null_unusual_time) > 1000) {
  print("WARNING: too many nulls in boolean flags. Reimport the CSV with --drop, then rerun queries.js.");
}

// A few rows have empty IDs, so I keep a tiny sample.
const badIdSampleIds = db.transactions.find(
  {
    $or: [
      { Transaction_ID: null },
      { Customer_ID: null }
    ]
  },
  { _id: 1 }
).limit(3).toArray().map((doc) => doc._id);

if (badIdSampleIds.length > 0) {
  print("Raw sample for rows with malformed IDs:");
  printjson(
    db.transactions_raw_backup.find(
      { _id: { $in: badIdSampleIds } },
      {
        _id: 1,
        Transaction_ID: 1,
        Customer_ID: 1,
        Transaction_Date: 1,
        Merchant_Category: 1,
        Fraud_Label: 1
      }
    ).toArray()
  );
}

// First 5 docs after cleanup.
const firstFive = db.transactions.find({ Transaction_ID: { $ne: null } }).sort({ _id: 1 }).limit(5).toArray();
print("Q1.2.1 - First 5 transactions after cleaning:");
printjson(firstFive);

// Quick check for the boolean conversion.
const booleanSample = db.transactions.find(
  { Transaction_ID: { $ne: null } },
  {
    _id: 0,
    Transaction_ID: 1,
    Is_International_Transaction: 1,
    Is_New_Merchant: 1,
    Unusual_Time_Transaction: 1
  }
).sort({ Transaction_ID: 1 }).limit(5).toArray();

print("Q1.2.2 - Boolean conversion sample:");
printjson(booleanSample);

section("Partie 2 - Preparation du bac a sable CRUD");

// I do the update/delete questions on a copy so the main collection stays untouched.
db.transactions.aggregate([
  { $match: {} },
  { $out: "transactions_lab" }
]).toArray();

print(`transactions_lab ready with ${db.transactions_lab.countDocuments()} documents`);

section("Partie 2 - 2.1 Operations de lecture basiques");

// Basic fraud numbers.
const totalTransactions = db.transactions.countDocuments();
const totalFrauds = db.transactions.countDocuments({ Fraud_Label: "Fraud" });
const fraudRate = totalTransactions === 0 ? 0 : (totalFrauds / totalTransactions) * 100;

printjson({
  question: "Q2.1.1",
  total_transactions: totalTransactions,
  total_frauds: totalFrauds,
  fraud_rate_percent: Number(fraudRate.toFixed(4))
});

// Biggest amount in the dataset.
const highestTransaction = db.transactions.find({}).sort({ Transaction_Amount: -1, Transaction_ID: 1 }).limit(1).toArray()[0];
print("Q2.1.2 - Highest transaction:");
printjson(highestTransaction);

// Top 10 customers by number of transactions.
const topCustomers = db.transactions.aggregate([
  {
    $match: {
      Customer_ID: { $ne: null }
    }
  },
  {
    $group: {
      _id: "$Customer_ID",
      transaction_count: { $sum: 1 }
    }
  },
  { $sort: { transaction_count: -1, _id: 1 } },
  { $limit: 10 },
  {
    $project: {
      _id: 0,
      Customer_ID: "$_id",
      transaction_count: 1
    }
  }
]).toArray();

print("Q2.1.3 - Top 10 customers:");
printjson(topCustomers);

section("Partie 2 - 2.2 Filtrage avance");

// Slightly stricter filter.
const advancedFilter = {
  Transaction_Amount: { $gt: 5 },
  Is_International_Transaction: true,
  Card_Type: "Credit",
  Previous_Fraud_Count: { $gt: 0 }
};

const advancedFilterTotal = db.transactions.countDocuments(advancedFilter);
const advancedFilterFrauds = db.transactions.countDocuments({
  ...advancedFilter,
  Fraud_Label: "Fraud"
});

printjson({
  question: "Q2.2.1",
  matching_transactions: advancedFilterTotal,
  matching_frauds: advancedFilterFrauds,
  fraud_rate_percent: advancedFilterTotal === 0 ? 0 : Number(((advancedFilterFrauds / advancedFilterTotal) * 100).toFixed(4))
});

// Weird time + far from home.
const unusualAndFarFilter = {
  Unusual_Time_Transaction: true,
  Distance_From_Home: { $gt: 100 }
};

printjson({
  question: "Q2.2.2",
  matching_transactions: db.transactions.countDocuments(unusualAndFarFilter),
  fraudulent_transactions: db.transactions.countDocuments({
    ...unusualAndFarFilter,
    Fraud_Label: "Fraud"
  })
});

// Categories used in Q2.2.3.
const selectedCategoryFilter = {
  Merchant_Category: {
    $in: ["Clothing", "Electronics", "Restaurant"]
  }
};

const categorySampleFilter = {
  ...selectedCategoryFilter,
  Transaction_ID: { $ne: null }
};

const categorySample = db.transactions.find(
  categorySampleFilter,
  {
    _id: 0,
    Transaction_ID: 1,
    Transaction_Amount: 1,
    Merchant_Category: 1,
    Fraud_Label: 1
  }
).sort({ Transaction_ID: 1 }).limit(20).toArray();

print("Q2.2.3 - Transactions in Clothing, Electronics, Restaurant:");
printjson({
  matching_transactions: db.transactions.countDocuments(selectedCategoryFilter),
  sample_results: categorySample
});

section("Partie 2 - 2.3 Operations de mise a jour");


const askedCorrection = {
  Customer_ID: 24239,
  Transaction_Date: ISODate("2025-01-15T00:00:00.000Z"),
  Fraud_Label: "Fraud"
};

const realCorrection = {
  Customer_ID: 67961,
  Transaction_Date: ISODate("2025-03-24T00:00:00.000Z"),
  Fraud_Label: "Fraud"
};

const askedCorrectionCount = db.transactions_lab.countDocuments(askedCorrection);
const correctionToRun = askedCorrectionCount > 0
  ? askedCorrection
  : realCorrection;

const correctionResult = db.transactions_lab.updateMany(
  correctionToRun,
  {
    $set: {
      Fraud_Label: "Normal"
    }
  }
);

print("Q2.3.1 - Correction result on transactions_lab:");
printjson({
  requested_filter: askedCorrection,
  requested_filter_matches: askedCorrectionCount,
  executed_filter: correctionToRun,
  result: correctionResult
});


const riskLowResult = db.transactions_lab.updateMany(
  {},
  { $set: { risk_level: "LOW" } }
);

const riskMediumResult = db.transactions_lab.updateMany(
  {
    $or: [
      { Transaction_Amount: { $gt: 5 } },
      { Is_International_Transaction: true },
      { Failed_Transaction_Count: { $gt: 3 } }
    ]
  },
  { $set: { risk_level: "MEDIUM" } }
);

const riskHighResult = db.transactions_lab.updateMany(
  {
    $or: [
      { Transaction_Amount: { $gt: 10 } },
      { Previous_Fraud_Count: { $gt: 2 } },
      { Distance_From_Home: { $gt: 500 } }
    ]
  },
  { $set: { risk_level: "HIGH" } }
);

print("Q2.3.2 - risk_level update results:");
printjson({
  low_step: riskLowResult,
  medium_step: riskMediumResult,
  high_step: riskHighResult
});

print("Q2.3.2 - risk_level distribution:");
printjson(
  db.transactions_lab.aggregate([
    {
      $group: {
        _id: "$risk_level",
        transaction_count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]).toArray()
);

// January 2025 only, like in the corrected question.
const january2025Start = ISODate("2025-01-01T00:00:00.000Z");
const february2025Start = ISODate("2025-02-01T00:00:00.000Z");

const anonymizeResult = db.transactions_lab.updateMany(
  {
    Transaction_Date: {
      $gte: january2025Start,
      $lt: february2025Start
    }
  },
  {
    $set: {
      IP_Address: "ANONYMIZED"
    }
  }
);

print("Q2.3.3 - IP anonymization result:");
printjson({
  date_window: {
    start_inclusive: january2025Start,
    end_exclusive: february2025Start
  },
  result: anonymizeResult
});

section("Partie 2 - 2.4 Operations de suppression");

// Archive first, delete after. Safer this way.
if (db.getCollectionNames().includes("archive_transactions")) {
  db.archive_transactions.drop();
}

const archiveRule = {
  Fraud_Label: "Fraud",
  Failed_Transaction_Count: { $gte: 2 }
};

printjson({
  archive_candidates_before_copy: db.transactions_lab.countDocuments(archiveRule)
});

db.transactions_lab.aggregate([
  { $match: archiveRule },
  { $out: "archive_transactions" }
]).toArray();

const archivedCount = db.archive_transactions.countDocuments();
const deleteResult = db.transactions_lab.deleteMany(archiveRule);
const remainingArchivedCandidates = db.transactions_lab.countDocuments(archiveRule);

print("Q2.4.1 - Archive and delete result:");
printjson({
  archived_documents: archivedCount,
  delete_result: deleteResult,
  remaining_matching_documents_in_transactions_lab: remainingArchivedCandidates
});

section("Partie 3 - Requetes Avancees - Patterns de Fraude");

section("Partie 3 - 3.1 Analyse des patterns temporels");

// Hours with the most frauds.
const fraudsByHour = db.transactions.aggregate([
  { $match: { Fraud_Label: "Fraud", Transaction_Time: { $type: "string" } } },
  {
    $project: {
      fraud_hour: {
        $let: {
          vars: {
            parsedHour: toHour("$Transaction_Time")
          },
          in: "$$parsedHour"
        }
      }
    }
  },
  { $match: { fraud_hour: { $ne: null } } },
  {
    $group: {
      _id: "$fraud_hour",
      fraud_count: { $sum: 1 }
    }
  },
  { $sort: { fraud_count: -1, _id: 1 } },
  {
    $project: {
      _id: 0,
      hour: "$_id",
      fraud_count: 1
    }
  }
]).toArray();

print("Q3.1.1 - Fraud count by hour:");
printjson(fraudsByHour);

// More than 10 transactions in one day and at least one fraud.
const busyFraudDays = db.transactions.aggregate([
  {
    $match: {
      Customer_ID: { $ne: null },
      Transaction_Date: { $ne: null }
    }
  },
  {
    $group: {
      _id: {
        Customer_ID: "$Customer_ID",
        day: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$Transaction_Date",
            timezone: "UTC"
          }
        }
      },
      total_transactions: { $sum: 1 },
      fraud_transactions: {
        $sum: {
          $cond: [
            { $eq: ["$Fraud_Label", "Fraud"] },
            1,
            0
          ]
        }
      }
    }
  },
  {
    $match: {
      total_transactions: { $gt: 10 },
      fraud_transactions: { $gt: 0 }
    }
  },
  { $sort: { total_transactions: -1, "_id.Customer_ID": 1, "_id.day": 1 } },
  {
    $project: {
      _id: 0,
      Customer_ID: "$_id.Customer_ID",
      Transaction_Date: "$_id.day",
      total_transactions: 1,
      fraud_transactions: 1
    }
  }
]).toArray();

print("Q3.1.2 - Customers with more than 10 transactions in one day and at least one fraud:");
printjson(busyFraudDays);

section("Partie 3 - 3.2 Analyse geographique");

const topFraudLocations = db.transactions.aggregate([
  {
    $group: {
      _id: "$Transaction_Location",
      total_transactions: { $sum: 1 },
      fraud_transactions: {
        $sum: {
          $cond: [
            { $eq: ["$Fraud_Label", "Fraud"] },
            1,
            0
          ]
        }
      }
    }
  },
  {
    $project: {
      _id: 0,
      Transaction_Location: "$_id",
      total_transactions: 1,
      fraud_transactions: 1,
      fraud_rate_percent: {
        $round: [
          {
            $cond: [
              { $eq: ["$total_transactions", 0] },
              0,
              {
                $multiply: [
                  { $divide: ["$fraud_transactions", "$total_transactions"] },
                  100
                ]
              }
            ]
          },
          4
        ]
      }
    }
  },
  { $sort: { fraud_rate_percent: -1, fraud_transactions: -1, total_transactions: -1, Transaction_Location: 1 } },
  { $limit: 5 }
]).toArray();

print("Q3.2.1 - Top 5 locations by fraud rate:");
printjson(topFraudLocations);

const distantTransactions = db.transactions.aggregate([
  {
    $match: {
      $expr: {
        $and: [
          { $ne: ["$Transaction_Location", "$Customer_Home_Location"] },
          { $gt: ["$Distance_From_Home", 200] }
        ]
      }
    }
  },
  {
    $facet: {
      summary: [
        {
          $group: {
            _id: null,
            total_transactions: { $sum: 1 },
            fraud_transactions: {
              $sum: {
                $cond: [
                  { $eq: ["$Fraud_Label", "Fraud"] },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            total_transactions: 1,
            fraud_transactions: 1,
            fraud_rate_percent: {
              $round: [
                {
                  $cond: [
                    { $eq: ["$total_transactions", 0] },
                    0,
                    {
                      $multiply: [
                        { $divide: ["$fraud_transactions", "$total_transactions"] },
                        100
                      ]
                    }
                  ]
                },
                4
              ]
            }
          }
        }
      ],
      sample: [
        {
          $project: {
            _id: 0,
            Transaction_ID: 1,
            Customer_ID: 1,
            Transaction_Location: 1,
            Customer_Home_Location: 1,
            Distance_From_Home: 1,
            Fraud_Label: 1
          }
        },
        { $sort: { Distance_From_Home: -1, Transaction_ID: 1 } },
        { $limit: 10 }
      ]
    }
  }
]).toArray()[0];

print("Q3.2.2 - Transactions far from home and in a different location:");
printjson(distantTransactions);

section("Partie 3 - 3.3 Analyse des marchands");

const topFraudMerchants = db.transactions.aggregate([
  {
    $match: {
      Fraud_Label: "Fraud",
      Merchant_ID: { $ne: null }
    }
  },
  {
    $group: {
      _id: "$Merchant_ID",
      fraud_total_amount: { $sum: "$Transaction_Amount" },
      fraud_count: { $sum: 1 },
      avg_amount_per_fraud: { $avg: "$Transaction_Amount" }
    }
  },
  {
    $project: {
      _id: 0,
      Merchant_ID: "$_id",
      fraud_total_amount: { $round: ["$fraud_total_amount", 4] },
      fraud_count: 1,
      avg_amount_per_fraud: { $round: ["$avg_amount_per_fraud", 4] }
    }
  },
  { $sort: { fraud_total_amount: -1, fraud_count: -1, Merchant_ID: 1 } },
  { $limit: 10 }
]).toArray();

print("Q3.3.1 - Top 10 merchants by total fraudulent amount:");
printjson(topFraudMerchants);

const cardPreferenceByCategory = db.transactions.aggregate([
  {
    $match: {
      Merchant_Category: { $ne: "" }
    }
  },
  {
    $group: {
      _id: "$Merchant_Category",
      total_transactions: { $sum: 1 },
      credit_count: {
        $sum: {
          $cond: [
            { $eq: ["$Card_Type", "Credit"] },
            1,
            0
          ]
        }
      },
      debit_count: {
        $sum: {
          $cond: [
            { $eq: ["$Card_Type", "Debit"] },
            1,
            0
          ]
        }
      }
    }
  },
  {
    $project: {
      _id: 0,
      Merchant_Category: "$_id",
      total_transactions: 1,
      credit_count: 1,
      debit_count: 1,
      preferred_card: {
        $cond: [
          { $gt: ["$credit_count", "$debit_count"] },
          "Credit",
          {
            $cond: [
              { $lt: ["$credit_count", "$debit_count"] },
              "Debit",
              "Equal"
            ]
          }
        ]
      },
      credit_debit_ratio: {
        $cond: [
          { $eq: ["$debit_count", 0] },
          null,
          { $round: [{ $divide: ["$credit_count", "$debit_count"] }, 4] }
        ]
      }
    }
  },
  { $sort: { credit_debit_ratio: -1, credit_count: -1, Merchant_Category: 1 } }
]).toArray();

print("Q3.3.2 - Credit vs debit ratio by merchant category:");
printjson(cardPreferenceByCategory);

section("Partie 3 - 3.4 Analyse comportementale");

// Here I interpret "more than 300% above the average" as more than 4x the average.
const exceptionalTransactions = db.transactions.aggregate([
  {
    $match: {
      $expr: {
        $gt: [
          "$Transaction_Amount",
          { $multiply: ["$Avg_Transaction_Amount", 4] }
        ]
      }
    }
  },
  {
    $group: {
      _id: null,
      matching_transactions: { $sum: 1 },
      fraud_transactions: {
        $sum: {
          $cond: [
            { $eq: ["$Fraud_Label", "Fraud"] },
            1,
            0
          ]
        }
      }
    }
  },
  {
    $project: {
      _id: 0,
      matching_transactions: 1,
      fraud_transactions: 1,
      fraud_rate_percent: {
        $round: [
          {
            $cond: [
              { $eq: ["$matching_transactions", 0] },
              0,
              {
                $multiply: [
                  { $divide: ["$fraud_transactions", "$matching_transactions"] },
                  100
                ]
              }
            ]
          },
          4
        ]
      }
    }
  }
]).toArray()[0] || {
  matching_transactions: 0,
  fraud_transactions: 0,
  fraud_rate_percent: 0
};

print("Q3.4.1 - Transactions more than 300% above the average amount:");
printjson(exceptionalTransactions);

const newMerchantInternational = db.transactions.aggregate([
  {
    $match: {
      Is_New_Merchant: true,
      Is_International_Transaction: true
    }
  },
  {
    $group: {
      _id: null,
      matching_transactions: { $sum: 1 },
      fraud_transactions: {
        $sum: {
          $cond: [
            { $eq: ["$Fraud_Label", "Fraud"] },
            1,
            0
          ]
        }
      }
    }
  },
  {
    $project: {
      _id: 0,
      matching_transactions: 1,
      fraud_transactions: 1,
      fraud_rate_percent: {
        $round: [
          {
            $cond: [
              { $eq: ["$matching_transactions", 0] },
              0,
              {
                $multiply: [
                  { $divide: ["$fraud_transactions", "$matching_transactions"] },
                  100
                ]
              }
            ]
          },
          4
        ]
      }
    }
  }
]).toArray()[0] || {
  matching_transactions: 0,
  fraud_transactions: 0,
  fraud_rate_percent: 0
};

print("Q3.4.2 - New merchant + international transactions:");
printjson({
  matching_transactions: newMerchantInternational.matching_transactions,
  fraud_transactions: newMerchantInternational.fraud_transactions,
  fraud_rate_percent: newMerchantInternational.fraud_rate_percent,
  global_fraud_rate_percent: Number(fraudRate.toFixed(4))
});

const suspiciousTransactions = db.transactions.aggregate([
  {
    $addFields: {
      suspicious_score: {
        $add: [
          {
            $cond: [
              {
                $gt: [
                  "$Transaction_Amount",
                  { $multiply: ["$Avg_Transaction_Amount", 2] }
                ]
              },
              1,
              0
            ]
          },
          { $cond: ["$Unusual_Time_Transaction", 1, 0] },
          { $cond: ["$Is_New_Merchant", 1, 0] },
          { $cond: ["$Is_International_Transaction", 1, 0] },
          { $cond: [{ $gt: ["$Distance_From_Home", 100] }, 1, 0] },
          { $cond: [{ $gt: ["$Daily_Transaction_Count", 5] }, 1, 0] }
        ]
      }
    }
  },
  { $match: { suspicious_score: { $gte: 3 } } },
  {
    $facet: {
      summary: [
        {
          $group: {
            _id: null,
            matching_transactions: { $sum: 1 },
            fraud_transactions: {
              $sum: {
                $cond: [
                  { $eq: ["$Fraud_Label", "Fraud"] },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            matching_transactions: 1,
            fraud_transactions: 1,
            fraud_rate_percent: {
              $round: [
                {
                  $cond: [
                    { $eq: ["$matching_transactions", 0] },
                    0,
                    {
                      $multiply: [
                        { $divide: ["$fraud_transactions", "$matching_transactions"] },
                        100
                      ]
                    }
                  ]
                },
                4
              ]
            }
          }
        }
      ],
      score_distribution: [
        {
          $group: {
            _id: "$suspicious_score",
            transaction_count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ],
      sample: [
        {
          $project: {
            _id: 0,
            Transaction_ID: 1,
            Customer_ID: 1,
            suspicious_score: 1,
            Transaction_Amount: 1,
            Avg_Transaction_Amount: 1,
            Unusual_Time_Transaction: 1,
            Is_New_Merchant: 1,
            Is_International_Transaction: 1,
            Distance_From_Home: 1,
            Daily_Transaction_Count: 1,
            Fraud_Label: 1
          }
        },
        { $sort: { suspicious_score: -1, Transaction_Amount: -1, Transaction_ID: 1 } },
        { $limit: 10 }
      ]
    }
  }
]).toArray()[0];

print("Q3.4.3 - Suspicious transactions with at least 3 criteria:");
printjson(suspiciousTransactions);

section("Partie 4 - Indexation et Performance");

const existingSecondaryIndexes = db.transactions.getIndexes()
  .filter((index) => index.name !== "_id_")
  .map((index) => index.name);

if (existingSecondaryIndexes.length > 0) {
  db.transactions.dropIndexes();
}

print("Indexes at the start of Part 4:");
printjson(db.transactions.getIndexes());

section("Partie 4 - 4.1 Analyse des performances sans index");

const q411Query = {
  Transaction_Amount: { $gt: 5 },
  Fraud_Label: "Fraud",
  Is_International_Transaction: true
};

const q411BeforeSummary = explainSummary(
  db.transactions.find(q411Query).explain("executionStats")
);

print("Q4.1.1 - Performance without index for the main fraud query:");
printjson({
  query_used: q411Query,
  metrics: q411BeforeSummary
});

const realtimeCustomerId = 10985;

const realtimeQueries = [
  {
    label: "customer_recent_history",
    cursor: () => db.transactions.find({ Customer_ID: realtimeCustomerId }).sort({ Transaction_Date: -1 })
  },
  {
    label: "high_amount_new_international",
    cursor: () => db.transactions.find({
      Transaction_Amount: { $gt: 5 },
      Is_International_Transaction: true,
      Is_New_Merchant: true
    })
  },
  {
    label: "location_and_category_lookup",
    cursor: () => db.transactions.find({
      Transaction_Location: "Singapore",
      Merchant_Category: "Electronics"
    })
  }
];

const realtimePerformance = realtimeQueries.map((item) => ({
  label: item.label,
  metrics: explainSummary(item.cursor().explain("executionStats"))
}));

print("Q4.1.2 - Three frequent queries without index:");
printjson({
  note: "These are realistic realtime fraud-detection lookups on the normalized dataset.",
  queries: realtimePerformance
});

section("Partie 4 - 4.2 Strategie d'indexation");

const fraudLabelIndexName = db.transactions.createIndex(
  { Fraud_Label: 1 },
  { name: "idx_fraud_label" }
);

const q421AfterSummary = explainSummary(
  db.transactions.find(q411Query).explain("executionStats")
);

print("Q4.2.1 - Fraud_Label index and comparison:");
printjson({
  created_index: fraudLabelIndexName,
  comparison: compareExplain(q411BeforeSummary, q421AfterSummary)
});

const q422CustomerId = realtimeCustomerId;
const q422Query = {
  Customer_ID: q422CustomerId,
  Transaction_Amount: { $gte: 1, $lte: 10 }
};
const q422Sort = { Transaction_Date: -1 };

const q422BeforeSummary = explainSummary(
  db.transactions.find(q422Query).sort(q422Sort).explain("executionStats")
);

const q422IndexName = db.transactions.createIndex(
  {
    Customer_ID: 1,
    Transaction_Date: -1,
    Transaction_Amount: 1
  },
  { name: "idx_customer_date_amount_esr" }
);

const q422AfterSummary = explainSummary(
  db.transactions.find(q422Query).sort(q422Sort).explain("executionStats")
);

print("Q4.2.2 - ESR compound index:");
printjson({
  query_used: {
    filter: q422Query,
    sort: q422Sort
  },
  created_index: q422IndexName,
  order_justification: [
    "Equality first: Customer_ID",
    "Sort second: Transaction_Date",
    "Range last: Transaction_Amount"
  ],
  comparison: compareExplain(q422BeforeSummary, q422AfterSummary)
});

const q423Query = {
  Transaction_Location: "Singapore",
  Merchant_Category: "Electronics"
};

const q423BeforeSummary = explainSummary(
  db.transactions.find(q423Query).explain("executionStats")
);

const q423IndexName = db.transactions.createIndex(
  {
    Transaction_Location: 1,
    Merchant_Category: 1
  },
  { name: "idx_location_category" }
);

const q423AfterSummary = explainSummary(
  db.transactions.find(q423Query).explain("executionStats")
);

print("Q4.2.3 - Location + merchant category index:");
printjson({
  query_used: q423Query,
  created_index: q423IndexName,
  comparison: compareExplain(q423BeforeSummary, q423AfterSummary)
});

const duplicateIpGroups = db.transactions.aggregate([
  { $group: { _id: "$IP_Address", count: { $sum: 1 } } },
  { $match: { _id: { $ne: null }, count: { $gt: 1 } } },
  { $sort: { count: -1, _id: 1 } }
]).toArray();

let uniqueIpIndexResult;

try {
  uniqueIpIndexResult = {
    status: "created",
    name: db.transactions.createIndex(
      { IP_Address: 1 },
      { name: "uniq_ip_address", unique: true }
    )
  };
} catch (error) {
  uniqueIpIndexResult = {
    status: "failed",
    code: error.code,
    codeName: error.codeName,
    message: error.message
  };
}

print("Q4.2.4 - Unique index on IP_Address:");
printjson({
  duplicate_ip_groups: duplicateIpGroups.length,
  duplicate_ip_sample: duplicateIpGroups.slice(0, 5),
  unique_index_result: uniqueIpIndexResult,
  note: "If duplicates exist, MongoDB rejects the unique index with a duplicate key error. The fix is to find duplicates, clean them, then retry."
});

section("Partie 4 - 4.3 Index avances");

const q431Query = {
  Fraud_Label: "Fraud",
  Transaction_Amount: { $gt: 1 }
};

const q431BeforeSummary = explainSummary(
  db.transactions.find(q431Query).explain("executionStats")
);

const q431IndexName = db.transactions.createIndex(
  {
    Fraud_Label: 1,
    Transaction_Amount: 1
  },
  {
    name: "idx_partial_fraud_amount_gt1",
    partialFilterExpression: {
      Fraud_Label: "Fraud",
      Transaction_Amount: { $gt: 1 }
    }
  }
);

const q431AfterSummary = explainSummary(
  db.transactions.find(q431Query).explain("executionStats")
);

print("Q4.3.1 - Partial index for fraudulent transactions over 1 million:");
printjson({
  query_used: q431Query,
  created_index: q431IndexName,
  comparison: compareExplain(q431BeforeSummary, q431AfterSummary),
  why_useful: "The index stays smaller because it only stores the risky subset used by this query."
});

const missingPreviousFraudCount = db.transactions.countDocuments({ Previous_Fraud_Count: { $exists: false } });
const nullPreviousFraudCount = db.transactions.countDocuments({ Previous_Fraud_Count: null });

const q432IndexName = db.transactions.createIndex(
  { Previous_Fraud_Count: 1 },
  { name: "idx_sparse_previous_fraud_count", sparse: true }
);

print("Q4.3.2 - Sparse index on Previous_Fraud_Count:");
printjson({
  created_index: q432IndexName,
  missing_documents: missingPreviousFraudCount,
  null_documents: nullPreviousFraudCount,
  difference_with_normal_index: "A sparse index skips documents where the field is missing, while a normal index keeps an entry for them."
});

const indexSizes = db.transactions.stats().indexSizes;
const indexUsage = db.transactions.aggregate([{ $indexStats: {} }]).toArray();

const allIndexes = db.transactions.getIndexes().map((index) => {
  const usage = indexUsage.find((item) => item.name === index.name);

  return {
    name: index.name,
    key: index.key,
    unique: index.unique === true,
    sparse: index.sparse === true,
    partial: !!index.partialFilterExpression,
    size_bytes: indexSizes[index.name] || 0,
    accesses_ops: usage ? usage.accesses.ops : 0
  };
});

const cleanupCandidates = allIndexes
  .filter((index) => index.name !== "_id_")
  .filter((index) => !["uniq_ip_address"].includes(index.name))
  .filter((index) => index.accesses_ops === 0 || (index.name === "idx_sparse_previous_fraud_count" && missingPreviousFraudCount === 0))
  .map((index) => index.name);

print("Q4.3.3 - Index list, sizes, and possible cleanup:");
printjson({
  indexes: allIndexes,
  cleanup_candidates: cleanupCandidates,
  cleanup_note: cleanupCandidates.length === 0
    ? "No obvious unused or redundant index in the tested workload."
    : "These indexes are the weakest candidates based on current usage and dataset shape.",
  stats_note: "Most tests in this TP use explain(), so $indexStats can still show 0 accesses even when an index clearly helps the query plan."
});

section("Partie 4 - 4.4 Index couvrants");

const q441Query = { Customer_ID: q422CustomerId };
const q441Projection = {
  Customer_ID: 1,
  Transaction_Amount: 1,
  Transaction_Date: 1,
  _id: 0
};

const q441Summary = explainSummary(
  db.transactions.find(q441Query, q441Projection)
    .hint("idx_customer_date_amount_esr")
    .explain("executionStats")
);

print("Q4.4.1 - Covered query check:");
printjson({
  query_used: {
    filter: q441Query,
    projection: q441Projection,
    hint: "idx_customer_date_amount_esr"
  },
  note: "I reused the ESR index from Q4.2.2 because it already contains the filter field and all projected fields.",
  metrics: q441Summary
});

section("Partie 5 - Agregation et Analyse Avancee");

section("Partie 5 - 5.1 Pipelines d'agregation basiques");

const q511CardTypeStats = db.transactions.aggregate([
  {
    $match: {
      Card_Type: { $nin: [null, ""] }
    }
  },
  {
    $group: {
      _id: "$Card_Type",
      total_transaction_amount: { $sum: "$Transaction_Amount" },
      average_transaction_amount: { $avg: "$Transaction_Amount" },
      transaction_count: { $sum: 1 }
    }
  },
  {
    $project: {
      _id: 0,
      Card_Type: "$_id",
      total_transaction_amount: { $round: ["$total_transaction_amount", 4] },
      average_transaction_amount: { $round: ["$average_transaction_amount", 4] },
      transaction_count: 1
    }
  },
  { $sort: { total_transaction_amount: -1, Card_Type: 1 } }
]).toArray();

print("Q5.1.1 - Stats by card type:");
printjson(q511CardTypeStats);

const q512MerchantFraudStats = db.transactions.aggregate([
  {
    $match: {
      Merchant_Category: { $nin: [null, ""] }
    }
  },
  {
    $group: {
      _id: "$Merchant_Category",
      total_transactions: { $sum: 1 },
      fraud_count: {
        $sum: {
          $cond: [
            { $eq: ["$Fraud_Label", "Fraud"] },
            1,
            0
          ]
        }
      },
      average_fraud_amount_raw: {
        $avg: {
          $cond: [
            { $eq: ["$Fraud_Label", "Fraud"] },
            "$Transaction_Amount",
            null
          ]
        }
      }
    }
  },
  {
    $project: {
      _id: 0,
      Merchant_Category: "$_id",
      total_transactions: 1,
      fraud_count: 1,
      fraud_rate_percent: {
        $round: [
          {
            $cond: [
              { $eq: ["$total_transactions", 0] },
              0,
              {
                $multiply: [
                  { $divide: ["$fraud_count", "$total_transactions"] },
                  100
                ]
              }
            ]
          },
          4
        ]
      },
      average_fraud_amount: { $round: [{ $ifNull: ["$average_fraud_amount_raw", 0] }, 4] }
    }
  },
  { $match: { fraud_rate_percent: { $gt: 10 } } },
  { $sort: { fraud_rate_percent: -1, Merchant_Category: 1 } }
]).toArray();

print("Q5.1.2 - Merchant categories with fraud rate above 10%:");
printjson(q512MerchantFraudStats);

const q513TopBalances = db.transactions.aggregate([
  {
    $match: {
      Customer_ID: { $ne: null },
      Account_Balance: { $ne: null }
    }
  },
  {
    $group: {
      _id: "$Customer_ID",
      highest_account_balance: { $max: "$Account_Balance" },
      total_transactions: { $sum: 1 }
    }
  },
  {
    $project: {
      _id: 0,
      Customer_ID: "$_id",
      Account_Balance: "$highest_account_balance",
      total_transactions: 1
    }
  },
  { $sort: { Account_Balance: -1, Customer_ID: 1 } },
  { $limit: 20 }
]).toArray();

print("Q5.1.3 - Top 20 customers by account balance:");
printjson(q513TopBalances);

section("Partie 5 - 5.2 Groupements et calculs complexes");

const q521WeeklyFraudAnalysis = db.transactions.aggregate([
  {
    $match: {
      Transaction_Date: { $ne: null }
    }
  },
  {
    $group: {
      _id: {
        isoWeekYear: { $isoWeekYear: "$Transaction_Date" },
        isoWeek: { $isoWeek: "$Transaction_Date" }
      },
      total_transactions: { $sum: 1 },
      fraud_count: {
        $sum: {
          $cond: [
            { $eq: ["$Fraud_Label", "Fraud"] },
            1,
            0
          ]
        }
      },
      total_fraud_amount: {
        $sum: {
          $cond: [
            { $eq: ["$Fraud_Label", "Fraud"] },
            "$Transaction_Amount",
            0
          ]
        }
      },
      average_fraud_amount_raw: {
        $avg: {
          $cond: [
            { $eq: ["$Fraud_Label", "Fraud"] },
            "$Transaction_Amount",
            null
          ]
        }
      }
    }
  },
  {
    $project: {
      _id: 0,
      iso_week_year: "$_id.isoWeekYear",
      iso_week: "$_id.isoWeek",
      total_transactions: 1,
      fraud_count: 1,
      total_fraud_amount: { $round: ["$total_fraud_amount", 4] },
      average_fraud_amount: { $round: [{ $ifNull: ["$average_fraud_amount_raw", 0] }, 4] }
    }
  },
  { $sort: { iso_week_year: 1, iso_week: 1 } }
]).toArray();

print("Q5.2.1 - Weekly fraud analysis:");
printjson(q521WeeklyFraudAnalysis);

const q522FraudHistoryGroupsRaw = db.transactions.aggregate([
  {
    $match: {
      Previous_Fraud_Count: { $ne: null }
    }
  },
  {
    $addFields: {
      history_group: {
        $switch: {
          branches: [
            { case: { $eq: ["$Previous_Fraud_Count", 0] }, then: "Group 1 - clean" },
            {
              case: {
                $and: [
                  { $gte: ["$Previous_Fraud_Count", 1] },
                  { $lte: ["$Previous_Fraud_Count", 2] }
                ]
              },
              then: "Group 2 - moderate risk"
            },
            { case: { $gt: ["$Previous_Fraud_Count", 2] }, then: "Group 3 - high risk" }
          ],
          default: null
        }
      }
    }
  },
  {
    $match: {
      history_group: { $ne: null }
    }
  },
  {
    $group: {
      _id: "$history_group",
      total_transactions: { $sum: 1 },
      current_fraud_count: {
        $sum: {
          $cond: [
            { $eq: ["$Fraud_Label", "Fraud"] },
            1,
            0
          ]
        }
      },
      average_transaction_amount: { $avg: "$Transaction_Amount" }
    }
  },
  {
    $project: {
      _id: 0,
      history_group: "$_id",
      total_transactions: 1,
      current_fraud_count: 1,
      current_fraud_rate_percent: {
        $round: [
          {
            $cond: [
              { $eq: ["$total_transactions", 0] },
              0,
              {
                $multiply: [
                  { $divide: ["$current_fraud_count", "$total_transactions"] },
                  100
                ]
              }
            ]
          },
          4
        ]
      },
      average_transaction_amount: { $round: ["$average_transaction_amount", 4] }
    }
  },
  { $sort: { history_group: 1 } }
]).toArray();

const q522FraudHistoryGroups = [
  {
    history_group: "Group 1 - clean",
    total_transactions: 0,
    current_fraud_count: 0,
    current_fraud_rate_percent: 0,
    average_transaction_amount: 0
  },
  {
    history_group: "Group 2 - moderate risk",
    total_transactions: 0,
    current_fraud_count: 0,
    current_fraud_rate_percent: 0,
    average_transaction_amount: 0
  },
  {
    history_group: "Group 3 - high risk",
    total_transactions: 0,
    current_fraud_count: 0,
    current_fraud_rate_percent: 0,
    average_transaction_amount: 0
  }
].map((groupTemplate) => {
  const found = q522FraudHistoryGroupsRaw.find((item) => item.history_group === groupTemplate.history_group);
  return found || groupTemplate;
});

print("Q5.2.2 - Behaviour by previous fraud history:");
printjson(q522FraudHistoryGroups);

const q523FraudPeakHours = db.transactions.aggregate([
  {
    $project: {
      hour: {
        $let: {
          vars: {
            parsedHour: toHour("$Transaction_Time")
          },
          in: "$$parsedHour"
        }
      },
      Fraud_Label: 1
    }
  },
  { $match: { hour: { $ne: null } } },
  {
    $group: {
      _id: "$hour",
      total_transactions: { $sum: 1 },
      fraud_count: {
        $sum: {
          $cond: [
            { $eq: ["$Fraud_Label", "Fraud"] },
            1,
            0
          ]
        }
      }
    }
  },
  {
    $project: {
      _id: 0,
      hour: "$_id",
      total_transactions: 1,
      fraud_count: 1,
      fraud_ratio_percent: {
        $round: [
          {
            $cond: [
              { $eq: ["$total_transactions", 0] },
              0,
              {
                $multiply: [
                  { $divide: ["$fraud_count", "$total_transactions"] },
                  100
                ]
              }
            ]
          },
          4
        ]
      }
    }
  },
  { $sort: { fraud_ratio_percent: -1, fraud_count: -1, hour: 1 } },
  { $limit: 5 }
]).toArray();

print("Q5.2.3 - Top 5 fraud peak hours by ratio:");
printjson(q523FraudPeakHours);

section("Partie 5 - 5.3 Lookups et jointures");

if (db.getCollectionNames().includes("merchants")) {
  db.merchants.drop();
}

const merchantBaseRows = db.transactions.aggregate([
  {
    $match: {
      Fraud_Label: "Fraud",
      Merchant_ID: { $ne: null },
      Merchant_Category: { $ne: null }
    }
  },
  {
    $group: {
      _id: "$Merchant_ID",
      fraud_count: { $sum: 1 },
      Merchant_Category: { $first: "$Merchant_Category" },
      Transaction_Location: { $first: "$Transaction_Location" }
    }
  },
  { $sort: { fraud_count: -1, _id: 1 } },
  { $limit: 10 }
]).toArray();

const merchantSeedDocs = merchantBaseRows.map((merchant, index) => ({
  Merchant_ID: merchant._id,
  Merchant_Name: `Merchant ${merchant._id}`,
  Merchant_Address: `${120 + index} ${merchant.Transaction_Location} Business Street`,
  Merchant_Category: merchant.Merchant_Category,
  Opening_Date: new Date(Date.UTC(2016 + (index % 6), (index * 2) % 12, 5 + index))
}));

if (merchantSeedDocs.length > 0) {
  db.merchants.insertMany(merchantSeedDocs);
}

const q531FraudMerchantReport = db.transactions.aggregate([
  { $match: { Fraud_Label: "Fraud" } },
  {
    $lookup: {
      from: "merchants",
      localField: "Merchant_ID",
      foreignField: "Merchant_ID",
      as: "merchant_info"
    }
  },
  { $unwind: "$merchant_info" },
  {
    $facet: {
      summary: [
        {
          $group: {
            _id: null,
            joined_fraud_transactions: { $sum: 1 },
            total_fraud_amount: { $sum: "$Transaction_Amount" }
          }
        },
        {
          $project: {
            _id: 0,
            joined_fraud_transactions: 1,
            total_fraud_amount: { $round: ["$total_fraud_amount", 4] }
          }
        }
      ],
      report_sample: [
        {
          $project: {
            _id: 0,
            Transaction_ID: 1,
            Customer_ID: 1,
            Merchant_ID: 1,
            Transaction_Amount: 1,
            Transaction_Date: 1,
            Fraud_Label: 1,
            Merchant_Name: "$merchant_info.Merchant_Name",
            Merchant_Address: "$merchant_info.Merchant_Address",
            Merchant_Category: "$merchant_info.Merchant_Category",
            Opening_Date: "$merchant_info.Opening_Date"
          }
        },
        { $sort: { Transaction_Date: -1, Transaction_ID: 1 } },
        { $limit: 20 }
      ]
    }
  }
]).toArray()[0];

print("Q5.3.1 - Fraud transactions joined with merchants:");
printjson({
  merchants_created: db.merchants.countDocuments(),
  summary: q531FraudMerchantReport.summary,
  report_sample: q531FraudMerchantReport.report_sample
});

if (db.getCollectionNames().includes("customers")) {
  db.customers.drop();
}

const customerBaseRows = db.transactions.aggregate([
  {
    $match: {
      Customer_ID: { $ne: null },
      Customer_Home_Location: { $ne: null }
    }
  },
  {
    $group: {
      _id: "$Customer_ID",
      Customer_Home_Location: { $first: "$Customer_Home_Location" },
      total_transactions: { $sum: 1 }
    }
  },
  { $sort: { total_transactions: -1, _id: 1 } },
  { $limit: 20 }
]).toArray();

const accountTypes = ["Checking", "Savings", "Premium"];
const customerSeedDocs = customerBaseRows.map((customer, index) => ({
  Customer_ID: customer._id,
  Customer_Name: `Client ${customer._id}`,
  City: customer.Customer_Home_Location,
  Account_Type: accountTypes[index % accountTypes.length],
  Join_Date: new Date(Date.UTC(2018 + (index % 5), index % 12, 3 + index))
}));

if (customerSeedDocs.length > 0) {
  db.customers.insertMany(customerSeedDocs);
}

const q532CustomerRiskProfiles = db.customers.aggregate([
  {
    $lookup: {
      from: "transactions",
      localField: "Customer_ID",
      foreignField: "Customer_ID",
      as: "transactions"
    }
  },
  {
    $addFields: {
      total_transactions: { $size: "$transactions" },
      current_fraud_count: {
        $size: {
          $filter: {
            input: "$transactions",
            as: "tx",
            cond: { $eq: ["$$tx.Fraud_Label", "Fraud"] }
          }
        }
      },
      historical_fraud_count: { $ifNull: [{ $max: "$transactions.Previous_Fraud_Count" }, 0] },
      average_transaction_amount: { $round: [{ $ifNull: [{ $avg: "$transactions.Transaction_Amount" }, 0] }, 4] },
      international_transactions: {
        $size: {
          $filter: {
            input: "$transactions",
            as: "tx",
            cond: { $eq: ["$$tx.Is_International_Transaction", true] }
          }
        }
      },
      unusual_transactions: {
        $size: {
          $filter: {
            input: "$transactions",
            as: "tx",
            cond: { $eq: ["$$tx.Unusual_Time_Transaction", true] }
          }
        }
      }
    }
  },
  {
    $addFields: {
      risk_score: {
        $add: [
          { $multiply: ["$current_fraud_count", 10] },
          { $multiply: ["$historical_fraud_count", 5] },
          "$international_transactions",
          "$unusual_transactions"
        ]
      }
    }
  },
  {
    $project: {
      _id: 0,
      Customer_ID: 1,
      Customer_Name: 1,
      City: 1,
      Account_Type: 1,
      Join_Date: 1,
      total_transactions: 1,
      historical_fraud_count: 1,
      current_fraud_count: 1,
      average_transaction_amount: 1,
      risk_score: 1
    }
  },
  { $sort: { risk_score: -1, total_transactions: -1, Customer_ID: 1 } }
]).toArray();

print("Q5.3.2 - Customer risk profiles:");
printjson({
  customers_created: db.customers.countDocuments(),
  risk_score_rule: "current fraud count * 10 + historical fraud count * 5 + international transactions + unusual-time transactions",
  profiles: q532CustomerRiskProfiles
});

section("Partie 5 - 5.4 Analyses predictives");

const q541SuspicionAnalysis = db.transactions.aggregate([
  {
    $addFields: {
      suspicion_score: {
        $add: [
          { $cond: ["$Is_International_Transaction", 3, 0] },
          { $cond: ["$Is_New_Merchant", 2, 0] },
          { $cond: ["$Unusual_Time_Transaction", 2, 0] },
          { $cond: [{ $gt: ["$Distance_From_Home", 100] }, 2, 0] },
          {
            $cond: [
              {
                $gt: [
                  "$Transaction_Amount",
                  { $multiply: ["$Avg_Transaction_Amount", 2] }
                ]
              },
              3,
              0
            ]
          },
          {
            $cond: [
              { $gt: ["$Failed_Transaction_Count", 0] },
              "$Failed_Transaction_Count",
              0
            ]
          }
        ]
      }
    }
  },
  { $sort: { suspicion_score: -1, Failed_Transaction_Count: -1, Transaction_Amount: -1, Transaction_ID: 1 } },
  { $limit: 50 },
  {
    $facet: {
      summary: [
        {
          $group: {
            _id: null,
            top50_transactions: { $sum: 1 },
            real_frauds: {
              $sum: {
                $cond: [
                  { $eq: ["$Fraud_Label", "Fraud"] },
                  1,
                  0
                ]
              }
            },
            average_score: { $avg: "$suspicion_score" }
          }
        },
        {
          $project: {
            _id: 0,
            top50_transactions: 1,
            real_frauds: 1,
            average_score: { $round: ["$average_score", 4] },
            fraud_rate_percent: {
              $round: [
                {
                  $cond: [
                    { $eq: ["$top50_transactions", 0] },
                    0,
                    {
                      $multiply: [
                        { $divide: ["$real_frauds", "$top50_transactions"] },
                        100
                      ]
                    }
                  ]
                },
                4
              ]
            }
          }
        }
      ],
      top50: [
        {
          $project: {
            _id: 0,
            Transaction_ID: 1,
            Customer_ID: 1,
            Transaction_Amount: 1,
            Avg_Transaction_Amount: 1,
            Distance_From_Home: 1,
            Failed_Transaction_Count: 1,
            Is_International_Transaction: 1,
            Is_New_Merchant: 1,
            Unusual_Time_Transaction: 1,
            Fraud_Label: 1,
            suspicion_score: 1
          }
        }
      ]
    }
  }
]).toArray()[0];

print("Q5.4.1 - Top 50 transactions with the highest suspicion score:");
printjson(q541SuspicionAnalysis);

if (db.getCollectionNames().includes("daily_fraud_top_categories_tmp")) {
  db.daily_fraud_top_categories_tmp.drop();
}

db.transactions.aggregate([
  {
    $match: {
      Fraud_Label: "Fraud",
      Transaction_Date: { $ne: null },
      Merchant_Category: { $nin: [null, ""] }
    }
  },
  {
    $group: {
      _id: {
        date: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$Transaction_Date",
            timezone: "UTC"
          }
        },
        Merchant_Category: "$Merchant_Category"
      },
      fraud_count: { $sum: 1 }
    }
  },
  { $sort: { "_id.date": 1, fraud_count: -1, "_id.Merchant_Category": 1 } },
  {
    $group: {
      _id: "$_id.date",
      top_fraud_categories: {
        $push: {
          Merchant_Category: "$_id.Merchant_Category",
          fraud_count: "$fraud_count"
        }
      }
    }
  },
  {
    $project: {
      _id: 0,
      date: "$_id",
      top_fraud_categories: { $slice: ["$top_fraud_categories", 3] }
    }
  },
  { $out: "daily_fraud_top_categories_tmp" }
]).toArray();

db.transactions.aggregate([
  {
    $match: {
      Transaction_Date: { $ne: null }
    }
  },
  {
    $group: {
      _id: {
        $dateToString: {
          format: "%Y-%m-%d",
          date: "$Transaction_Date",
          timezone: "UTC"
        }
      },
      total_transactions: { $sum: 1 },
      fraud_transactions: {
        $sum: {
          $cond: [
            { $eq: ["$Fraud_Label", "Fraud"] },
            1,
            0
          ]
        }
      },
      total_fraud_amount: {
        $sum: {
          $cond: [
            { $eq: ["$Fraud_Label", "Fraud"] },
            "$Transaction_Amount",
            0
          ]
        }
      }
    }
  },
  {
    $project: {
      _id: 0,
      date: "$_id",
      total_transactions: 1,
      fraud_transactions: 1,
      total_fraud_amount: { $round: ["$total_fraud_amount", 4] },
      fraud_rate_percent: {
        $round: [
          {
            $cond: [
              { $eq: ["$total_transactions", 0] },
              0,
              {
                $multiply: [
                  { $divide: ["$fraud_transactions", "$total_transactions"] },
                  100
                ]
              }
            ]
          },
          4
        ]
      }
    }
  },
  {
    $lookup: {
      from: "daily_fraud_top_categories_tmp",
      localField: "date",
      foreignField: "date",
      as: "top_categories_lookup"
    }
  },
  {
    $set: {
      top_fraud_categories: {
        $ifNull: [
          { $arrayElemAt: ["$top_categories_lookup.top_fraud_categories", 0] },
          []
        ]
      }
    }
  },
  { $unset: "top_categories_lookup" },
  { $sort: { date: 1 } },
  { $out: "daily_fraud_stats" }
]).toArray();

if (db.getCollectionNames().includes("daily_fraud_top_categories_tmp")) {
  db.daily_fraud_top_categories_tmp.drop();
}

const q542DailyFraudStatsSample = db.daily_fraud_stats.find({}, { _id: 0 }).sort({ date: 1 }).limit(10).toArray();

print("Q5.4.2 - Materialized daily fraud stats:");
printjson({
  collection_name: "daily_fraud_stats",
  update_note: "To refresh this materialized view, rerun the pipeline each day.",
  document_count: db.daily_fraud_stats.countDocuments(),
  sample: q542DailyFraudStatsSample
});
