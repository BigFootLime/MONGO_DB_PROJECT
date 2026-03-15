# Partie 7 - Rapport d'Analyse et Recommandations

## 7.1 Analyse finale

### Executive Summary - 5 insights les plus importants

1. Le taux de fraude global est de **4.846%** sur **50000** transactions.
2. Le sous-groupe **new merchant + international** est le plus risqué avec **6.382%** de fraude.
3. Les heures qui ressortent le plus sont **21h**, **13h** et **7h**.
4. Les indexes reduisent fortement le nombre de documents examines, surtout dans les Parties 4 et 6.
5. Les vues et les agregations pre-calculees sont les meilleurs supports pour un dashboard metier rapide.

### Patterns de fraude identifies

Les transactions frauduleuses ont surtout des caracteristiques comportementales plutot que purement geographiques. La combinaison **nouveau marchand + internationale** est le signal le plus clair. Sur le plan temporel, les pics apparaissent surtout a **21h**, **13h** et **7h**. Sur le plan geographique, les localisations qui ressortent le plus dans ce dataset sont **Singapore**, **Bangkok**, **London**, **Faisalabad** et **Kuala Lumpur**.

**[Inserer ici le Tableau 1 - Sous-groupes comportementaux]**


**[Inserer ici le Graphique 1 - Heures avec le plus de fraudes]**


**[Inserer ici le Graphique 2 - Top localisations par taux de fraude]**

### Recommandations techniques

- Garder en production les indexes sur `Fraud_Label`, `Customer_ID + Transaction_Date + Transaction_Amount`, et `Customer_ID + Fraud_Label`.
- Pre-calculer `daily_fraud_stats` et `fraud_summary_by_merchant_category` pour le dashboard.
- Eviter les scans complets sur les requetes temps reel et verifier les gains avec `explain("executionStats")`.

### Recommandations business

- Ne pas bloquer une transaction sur un seul signal faible.
- Donner plus de poids aux combinaisons de signaux : nouveau marchand, international, heure inhabituelle, distance forte.
- Distinguer plusieurs niveaux d'alerte pour reduire les faux positifs.
- Surveiller en priorite les clients au score critique et les categories de marchands les plus risquées.

## 7.2 Dashboard temps reel

Je proposerais un dashboard organise autour de 5 cartes principales :

1. nombre de transactions frauduleuses sur les dernieres 24h
2. top 5 des categories de marchands a risque cette semaine
3. liste des clients avec score de risque critique
4. montant total des fraudes detectees aujourd'hui vs hier
5. taux de fraude glissant sur 1h

| Metrique | Objectif | Requete MongoDB |
|---|---|---|
| Nombre de transactions frauduleuses dans les dernieres 24h | suivre le volume recent de fraude | `countDocuments({ Fraud_Label: "Fraud", Transaction_Date: { $gte: last24h, $lte: now } })` |
| Top 5 des categories de marchands a risque (cette semaine) | identifier les categories les plus exposees | `aggregate([... $group par Merchant_Category ... $sort ... $limit: 5])` |
| Liste des clients avec score de risque critique | reperer les clients a surveiller en priorite | `aggregate([... $group par Customer_ID ... risk_score ... $match: { risk_score: { $gte: 15 } }])` |
| Montant total des fraudes detectees (aujourd'hui vs hier) | comparer l'evolution du cout de la fraude | `aggregate([... $project period: today/yesterday ... $group ...])` |
| Taux de fraude en temps reel (glissant sur 1h) | suivre une alerte instantanee | `aggregate([... fenetre 1h ... total_transactions ... fraud_rate_percent ...])` |


```text
+-----------------------------------------------------------+
| Dashboard Risk Management                                 |
+-----------------------------------------------------------+
| Fraudes 24h | Taux fraude 1h | Montant today vs yesterday |
+-----------------------------------------------------------+
| Top 5 categories a risque | Clients score critique        |
+-----------------------------------------------------------+
| Tendances : evolution horaire et quotidienne              |
+-----------------------------------------------------------+
```

### Requetes MongoDB correspondantes

**1. Nombre de transactions frauduleuses dans les dernieres 24h**

```javascript
const now = new Date();
const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

db.transactions.countDocuments({
  Fraud_Label: "Fraud",
  Transaction_Date: { $gte: last24h, $lte: now }
});
```

**2. Top 5 des categories de marchands a risque (cette semaine)**

```javascript
const now = new Date();
const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

db.transactions.aggregate([
  { $match: { Transaction_Date: { $gte: weekStart, $lte: now }, Merchant_Category: { $nin: [null, ""] } } },
  { $group: { _id: "$Merchant_Category", total_transactions: { $sum: 1 }, fraud_transactions: { $sum: { $cond: [{ $eq: ["$Fraud_Label", "Fraud"] }, 1, 0] } } } },
  { $project: { _id: 0, Merchant_Category: "$_id", total_transactions: 1, fraud_transactions: 1, fraud_rate_percent: { $round: [{ $multiply: [{ $divide: ["$fraud_transactions", "$total_transactions"] }, 100] }, 4] } } },
  { $sort: { fraud_rate_percent: -1, fraud_transactions: -1 } },
  { $limit: 5 }
]);
```

**3. Liste des clients avec score de risque critique**

```javascript
db.transactions.aggregate([
  { $match: { Customer_ID: { $ne: null } } },
  { $group: { _id: "$Customer_ID", current_fraud_count: { $sum: { $cond: [{ $eq: ["$Fraud_Label", "Fraud"] }, 1, 0] } }, international_transactions: { $sum: { $cond: [{ $eq: ["$Is_International_Transaction", true] }, 1, 0] } }, unusual_transactions: { $sum: { $cond: [{ $eq: ["$Unusual_Time_Transaction", true] }, 1, 0] } }, historical_fraud_count: { $max: "$Previous_Fraud_Count" } } },
  { $addFields: { risk_score: { $add: [{ $multiply: ["$current_fraud_count", 10] }, { $multiply: ["$historical_fraud_count", 5] }, "$international_transactions", "$unusual_transactions"] } } },
  { $match: { risk_score: { $gte: 15 } } },
  { $sort: { risk_score: -1, _id: 1 } }
]);
```

**4. Montant total des fraudes detectees (aujourd'hui vs hier)**

```javascript
const now = new Date();
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

db.transactions.aggregate([
  { $match: { Fraud_Label: "Fraud", Transaction_Date: { $gte: yesterdayStart, $lte: now } } },
  { $project: { period: { $cond: [{ $gte: ["$Transaction_Date", todayStart] }, "today", "yesterday"] }, Transaction_Amount: 1 } },
  { $group: { _id: "$period", total_fraud_amount: { $sum: "$Transaction_Amount" }, fraud_count: { $sum: 1 } } }
]);
```

**5. Taux de fraude en temps reel (glissant sur 1h)**

```javascript
const now = new Date();
const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

db.transactions.aggregate([
  { $match: { Transaction_Date: { $gte: lastHour, $lte: now } } },
  { $group: { _id: null, total_transactions: { $sum: 1 }, fraud_transactions: { $sum: { $cond: [{ $eq: ["$Fraud_Label", "Fraud"] }, 1, 0] } } } },
  { $project: { _id: 0, total_transactions: 1, fraud_transactions: 1, fraud_rate_percent: { $round: [{ $multiply: [{ $divide: ["$fraud_transactions", "$total_transactions"] }, 100] }, 4] } } }
]);
```
