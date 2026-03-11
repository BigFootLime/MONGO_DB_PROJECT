# FraudShield Banking

This repo is for my MongoDB TP.

Right now it only covers Part 1 and Part 2.

## What I used

- Docker Desktop
- MongoDB Compass
- `mongosh`
- `mongoimport`

I used Docker for MongoDB because it was already working on the PC and it made the setup easier.

## Files

- `queries.js` -> main script for Part 1 and Part 2
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

Only Part 1 and Part 2 are done here.
