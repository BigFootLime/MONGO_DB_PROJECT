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
        $toInt: {
          $arrayElemAt: [
            { $split: ["$Transaction_Time", ":"] },
            0
          ]
        }
      }
    }
  },
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
