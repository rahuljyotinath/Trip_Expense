# Waybill

Group trip expenses. One person opens a trip and names the people. Everyone else makes a profile, enters the join code, and claims their name. Spends store date, amount, reason, payer, and who was on the bill — one person or everyone.

The database is a JSON file: `data/store.json`. Locally it is a file on disk. On Vercel it is the same file on the `ledger` branch, read and written through the GitHub Contents API. No other database.

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

## Publish (Vercel + GitHub)

Repo: [rahuljyotinath/Trip_Expense](https://github.com/rahuljyotinath/Trip_Expense)

1. Vercel → Add New → Project → import `rahuljyotinath/Trip_Expense`.
2. Production branch: **main**. Do not deploy the `ledger` branch.
3. Environment Variables (Production + Preview):

| Name | Value |
| --- | --- |
| `GITHUB_TOKEN` | Fine-grained PAT, **Contents: Read and write** on this repo |
| `GITHUB_REPO` | `rahuljyotinath/Trip_Expense` |
| `GITHUB_BRANCH` | `ledger` |

4. Deploy. If the URL says “Protected by Vercel Authentication”, turn off Deployment Protection for Production (Vercel → Project → Settings → Deployment Protection).
5. Set `GITHUB_TOKEN` before the first production deploy, or the live site stays browser-only.

Ledger writes go to the `ledger` branch so expense saves do not rebuild the site.

Locally: copy `.env.example` to `.env.local` and set `GITHUB_TOKEN`.

## How a trip works

1. Type your name. That is your profile. The browser remembers it.
2. **Open a trip**: name it, list everyone. You get a 6-letter code.
3. **Join**: enter the code, claim the name that is you.
4. Add a spend. Uncheck anyone who was not on that bill. Split equal or by percent.
5. Settle shows who pays whom. Mark a line **paid** when cash changes hands.
6. Wrong spend? Cross the line out. It stays on the page and drops out of the math.

One currency per trip (INR by default). Roster names are nicknames — two Rahuls need two different labels.
