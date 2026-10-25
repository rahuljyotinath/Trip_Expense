# Waybill

Group trip expenses. One person opens a trip and names the people. Everyone else makes a profile, enters the join code, and claims their name. Spends store date, amount, reason, payer, and who was on the bill — one person or everyone.

The database is a JSON file: `data/store.json`. Locally it is a file on disk. On Vercel it is the same file, read and written through the GitHub Contents API on [rahuljyotinath/Trip_Expense](https://github.com/rahuljyotinath/Trip_Expense). No other database.

## Run

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43217](http://127.0.0.1:43217).

```bash
npm test
npm run build
```

## GitHub

Ledger file: [rahuljyotinath/Trip_Expense](https://github.com/rahuljyotinath/Trip_Expense) → `data/store.json`.

This Cursor repo lives on Origin. Push a copy so GitHub has the app and the ledger file:

```bash
git remote add github https://github.com/rahuljyotinath/Trip_Expense.git
git push -u github main
```

Create a fine-grained PAT with **Contents: Read and write** on `rahuljyotinath/Trip_Expense`. Locally copy `.env.example` to `.env.local` and set `GITHUB_TOKEN`.

## Vercel

1. Publish the project.
2. In Vercel → Environment Variables:

| Name | Example |
| --- | --- |
| `GITHUB_TOKEN` | `github_pat_…` |
| `GITHUB_REPO` | `rahuljyotinath/Trip_Expense` |
| `GITHUB_BRANCH` | `main` |

`GITHUB_REPO` defaults to `rahuljyotinath/Trip_Expense` if omitted. Without `GITHUB_TOKEN` the site still runs. Data stays in the browser on that device.

## How a trip works

1. Type your name. That is your profile. The browser remembers it.
2. **Open a trip**: name it, list everyone. You get a 6-letter code.
3. **Join**: enter the code, claim the name that is you.
4. Add a spend. Uncheck anyone who was not on that bill. Split equal or by percent.
5. Settle shows who pays whom. Mark a line **paid** when cash changes hands.
6. Wrong spend? Cross the line out. It stays on the page and drops out of the math.

One currency per trip (INR by default). Roster names are nicknames — two Rahuls need two different labels.
