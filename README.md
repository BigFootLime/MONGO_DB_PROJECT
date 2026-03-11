# FraudShield Banking

This repo is for my MongoDB TP.

Right now it covers Part 1, Part 2, Part 3, and Part 4.

## What I used

- Docker Desktop
- MongoDB Compass
- `mongosh`
- `mongoimport`

I used Docker for MongoDB because it was already working on the PC and it made the setup easier.

## Files

- `queries.js` -> main script for Part 1, Part 2, Part 3, and Part 4
- `screenshots/` -> screenshot guide and captures
- `worklog.md` -> personal notes while doing the lab

## Start the database

Open PowerShell in the project folder:

```powershell
cd "C:\Users\RESPONSABLE-IT\Documents\GitHub\MONGO_DB_PROJECT"
```

If the container does not exist yet:

```powershell
docker run -d --name fraudshield-mongodb -p 127.0.0.1:27017:27017 -v fraudshield_mongo_data:/data/db mongo:8.0
```

If it already exists:

```powershell
docker start fraudshield-mongodb
```

## Import the CSV

Still in PowerShell:

```powershell
& "C:\Program Files\MongoDB\Tools\100\bin\mongoimport.exe" --uri "mongodb://127.0.0.1:27017" --db "fraudshield_banking" --collection "transactions" --type csv --headerline --file "C:\Users\RESPONSABLE-IT\Documents\GitHub\MONGO_DB_PROJECT\FraudShield_Banking_Data.csv" --drop
```

Expected message:

```text
50000 document(s) imported successfully. 0 document(s) failed to import.
```

## Run the script

After the import:

```powershell
mongosh "mongodb://127.0.0.1:27017/fraudshield_banking" --file "C:\Users\RESPONSABLE-IT\Documents\GitHub\MONGO_DB_PROJECT\queries.js"
```

## What the script does

It just runs the work in one place so I can redo everything after a fresh import.

- checks the raw import
- keeps a backup in `transactions_raw_backup`
- renames the long CSV headers
- converts important fields to better types
- creates `transactions_lab` for update/delete questions
- runs the Part 2 queries
- runs the Part 3 analysis queries
- runs the Part 4 index and performance checks
- archives matching rows in `archive_transactions`

## Results I got on this dataset

### Part 1

- imported rows: `50000`
- blank IDs found in the CSV:
  - `null_transaction_ids: 3`
  - `null_customer_ids: 10`
- converted these Yes/No fields to booleans:
  - `Is_International_Transaction`
  - `Is_New_Merchant`
  - `Unusual_Time_Transaction`

### Part 2

- total transactions: `50000`
- total frauds: `2423`
- fraud rate: `4.846%`
- highest amount: `9`
- highest transaction id: `100156`
- label of the highest transaction: `Normal`
- Q2.2.3 with `Clothing`, `Electronics`, `Restaurant`: `24980` rows
- Q2.3.1:
  - asked pair `24239` on `2025-01-15` -> `0` match
  - real fallback pair used in the update -> `67961` on `2025-03-24`
  - result -> `1` matched and `1` modified
- Q2.3.3 January 2025 anonymization -> `12691` matched and `12691` modified
- Q2.4.1 with `Failed_Transaction_Count >= 2` -> `772` archived and `772` deleted from `transactions_lab`

### Part 3

- Q3.1.1 fraud hours:
  - highest hour: `21h` with `118` frauds
  - then `13h` with `114`
  - then `7h` with `113`
- Q3.1.2 more than 10 transactions in one day with at least one fraud:
  - no matching customer/day in this dataset
- Q3.2.1 top 5 locations by fraud rate:
  - `Singapore` -> `5.0945%`
  - `Bangkok` -> `5.0742%`
  - `London` -> `4.9224%`
  - `Faisalabad` -> `4.9033%`
  - `Kuala Lumpur` -> `4.8708%`
- Q3.2.2 different location + more than 200 km from home:
  - matching transactions: `30027`
  - frauds in that subset: `1426`
  - fraud rate: `4.7491%`
- Q3.3.1 top merchants by total fraudulent amount:
  - best result was `Merchant_ID 15527` and `Merchant_ID 86181`, both with total fraud amount `17`
- Q3.3.2 credit/debit preference by category:
  - `Grocery` is the only category with a slight credit advantage (`1.0132`)
  - the other categories are slightly debit-heavy
- Q3.4.1 amount more than 300% above the average:
  - matching transactions: `6763`
  - frauds: `337`
  - fraud rate: `4.983%`
- Q3.4.2 new merchant + international:
  - matching transactions: `12598`
  - frauds: `804`
  - fraud rate: `6.382%`
  - this is above the global rate `4.846%`
- Q3.4.3 suspicious transactions with at least 3 criteria:
  - matching transactions: `32814`
  - frauds: `1814`
  - fraud rate: `5.5281%`
  - score distribution:
    - score 3 -> `16751`
  - score 4 -> `11413`
  - score 5 -> `4090`
  - score 6 -> `560`

### Part 4

- Q4.1.1 main fraud query without index:
  - `executionTimeMillis: 19`
  - `totalDocsExamined: 50000`
  - `nReturned: 679`
  - stage: `COLLSCAN`
- Q4.1.2 three frequent queries without index:
  - all 3 were using `COLLSCAN`
  - each one examined `50000` documents
- Q4.2.1 index on `Fraud_Label`:
  - stage changed from `COLLSCAN` to `IXSCAN`
  - `totalDocsExamined` dropped from `50000` to `2423`
  - `executionTimeMillis` dropped from `19` to `4`
- Q4.2.2 ESR compound index:
  - I used existing `Customer_ID 10985` instead of the fake `CUST0012345`
  - created index: `{ Customer_ID: 1, Transaction_Date: -1, Transaction_Amount: 1 }`
  - `totalDocsExamined` dropped from `50000` to `6`
  - stage: `IXSCAN`
- Q4.2.3 index on location + merchant category:
  - created index: `{ Transaction_Location: 1, Merchant_Category: 1 }`
  - `totalDocsExamined` dropped from `50000` to `837`
  - `executionTimeMillis` dropped from `18` to `1`
- Q4.2.4 unique index on `IP_Address`:
  - creation failed with `DuplicateKey`
  - reason: there is one duplicate group where `IP_Address` is an empty string `""`
  - this is a good example of what happens when duplicates exist before creating a unique index
- Q4.3.1 partial index for fraudulent transactions over 1 million:
  - created partial index on `Fraud_Label` + `Transaction_Amount`
  - `totalDocsExamined` dropped from `2423` to `2152`
- Q4.3.2 sparse index on `Previous_Fraud_Count`:
  - missing documents: `0`
  - null documents: `3`
  - in this dataset, the field is almost always present, so the sparse index is more of a syntax/example answer than a strong optimization
- Q4.3.3 index list and cleanup:
  - weakest cleanup candidate: `idx_sparse_previous_fraud_count`
  - note: `$indexStats` can still show `0` accesses here because most checks were done with `explain()` during the lab
- Q4.4.1 covered query:
  - I reused the ESR index from Q4.2.2 instead of creating a redundant extra index
  - `totalDocsExamined: 0`
  - `totalKeysExamined: 6`
  - stage: `IXSCAN`

## MongoDB Compass

Connect to:

```text
mongodb://127.0.0.1:27017
```

Then open `fraudshield_banking` and check:

- `transactions`
- `transactions_raw_backup`
- `transactions_lab`
- `archive_transactions`

## Screenshots

All screenshots are in the screenshots folder at the root of the repo.

## Scope reminder

Only Part 1, Part 2, Part 3, and Part 4 are done here.
