# FraudShield Banking

This repo is for my MongoDB TP.


## What I used

- Docker Desktop
- MongoDB Compass
- `mongosh`
- `mongoimport`

I used Docker for MongoDB because it was already working on the PC and it made the setup easier.

## Files

- `queries.js` -> main script for Part 1, Part 2, Part 3, Part 4, Part 5, and Part 6
- `screenshots/` -> screenshot guide and captures


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
- runs the Part 5 aggregation, lookup, and materialized-view queries
- runs the Part 6 expert queries, optimized lookups, and secure views
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
- Q2.2.3 with `Electronics`, `Jewelry`, `Luxury Goods`: `8216` rows
- Q2.3.1:
  - exact TP filter used: `Customer_ID = "CUST0012345"` and `Transaction_Date = 2024-01-15`
  - result -> `0` matched and `0` modified on this dataset
- Q2.3.3 anonymization of transactions older than 2 years -> `0` matched and `0` modified on this dataset
- Q2.4.1 with `Failed_Transaction_Count >= 3` -> `0` archived and `0` deleted from `transactions_lab`

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

### Part 5

- Q5.1.1 stats by card type:
  - `Debit` -> `25106` transactions, total amount `125167`, average `4.9865`
  - `Credit` -> `24891` transactions, total amount `124769`, average `5.0134`
- Q5.1.2 merchant categories with fraud rate above 10%:
  - none after excluding malformed blank categories
- Q5.1.3 top 20 customers by account balance:
  - the maximum observed balance is `39`
  - several customers share that same top value, so the ranking is mostly a tie list
- Q5.2.1 weekly fraud analysis:
  - highest fraud count appears in week `2` and week `6` with `154` frauds each
  - the highest weekly fraud amount is week `8` with `796`
- Q5.2.2 fraud-history groups:
  - `Group 1 - clean` -> `4.7415%`
  - `Group 2 - moderate risk` -> `4.951%`
  - `Group 3 - high risk` -> `0` matching rows in this dataset
- Q5.2.3 peak fraud hours by ratio:
  - `21h` is the riskiest hour with `5.7702%`
  - then `13h` with `5.4781%`
- Q5.3.1 merchants lookup:
  - created `10` fictive merchants
  - joined `20` fraudulent transactions with merchant details
  - total fraud amount in the joined sample set: `94`
- Q5.3.2 customer risk profiles:
  - created `20` fictive customers
  - highest profile score: customer `43223` with score `22`
  - then customer `28195` with score `21`
- Q5.4.1 top 50 suspicion scores:
  - top 50 transactions average score: `14`
  - real frauds inside the top 50: `3`
  - fraud rate in top 50: `6%`
- Q5.4.2 materialized daily fraud stats:
  - created collection `daily_fraud_stats`
  - document count: `121`
  - the collection can be refreshed by rerunning the pipeline daily

### Part 6

- Q6.1.1 serial frauds in a 7-day window:
  - no customer matched the rule `at least 3 fraudulent transactions in 7 days`
- Q6.1.2 potential money-laundering sequences:
  - no sequence matched all 4 conditions in this dataset
- Q6.2.1 maximum optimization of the realtime fraud query:
  - real customer used: `41045`
  - date range adjusted to `2025` because the dataset does not contain `2024`
  - created index: `{ Customer_ID: 1, Fraud_Label: 1, Transaction_Amount: -1, Transaction_Date: 1 }`
  - docs examined dropped from `2423` to `3`
  - execution time dropped from `2 ms` to `0 ms`
- Q6.2.2 fast yes/no fraud history check:
  - created index: `{ Customer_ID: 1, Fraud_Label: 1 }`
  - result for customer `41045`: `true`
  - target under `10 ms`: reached
  - docs examined dropped from `887` to `0`
- Q6.3.1 secure public view:
  - created view `public_transactions`
  - sensitive fields hidden:
    - `IP_Address`
    - `Device_ID`
    - `Customer_Home_Location`
  - visible documents: `12872`
  - to keep the view useful with this dataset, the 30-day filter uses the latest date in the file (`2025-05-01`) as reference
- Q6.3.2 merchant-category summary view:
  - created view `fraud_summary_by_merchant_category`
  - document count: `6`
  - highest fraud-rate category in the view: `Restaurant` with `5.0336%`

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


