# IM Valorant Tracker

Stats, match history and standings for a college intramural Valorant league.

- **Screenshot upload**: admins, captains or players upload the end-of-match scoreboard. Claude reads every player's agent, ACS, K/D/A, econ, first bloods, plants and defuses, plus the map and round score. The uploader checks the numbers on a review screen, then saves.
- **Player pages**: career totals, win rate, recent form, per-agent breakdown and full map-by-map history.
- **Teams**: standings (series, maps, round difference), rosters and match history.
- **Matches**: per-map scoreboards with a link to the original screenshot.
- **Challonge sync**: admins import teams and the bracket from Challonge. Run it again any time to pick up new matches and results.

Stack: Next.js 15 (App Router), Supabase (Postgres, email login, image storage), Claude API (`claude-opus-5-5`) for reading screenshots.

## One-time setup

### 1. Supabase (free tier)
1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste in all of [`supabase/schema.sql`](supabase/schema.sql), and run it.
3. Go to **Authentication → URL Configuration**. Set **Site URL** to your site's address (use `http://localhost:3000` while developing), and add `http://localhost:3000/auth/callback` plus your production `/auth/callback` URL under **Redirect URLs**.
4. From **Project Settings → API Keys**, copy the publishable key (used as `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and the secret key (used as `SUPABASE_SERVICE_ROLE_KEY`). The project URL is `https://<project-ref>.supabase.co`.
5. **Discord sign-in:** create an app at [discord.com/developers](https://discord.com/developers/applications). Under OAuth2 → Redirects, add `https://<project-ref>.supabase.co/auth/v1/callback`. Then paste the Client ID and Client Secret into Supabase under **Authentication → Sign In / Providers → Discord**.

> In the SQL Editor, make sure the source picker at the top right says **Database**, not Logs.

### 2. API keys
- **Anthropic**: create a key at [console.anthropic.com](https://console.anthropic.com) and add a few dollars of credit. Each screenshot costs about a cent.
- **Challonge**: go to Settings → Developer API on challonge.com. The account must own the tournament, or be an organizer on it.

### 3. Environment
```bash
cp .env.example .env.local
```
Fill in every value in `.env.local`.

### 4. Run it
```bash
npm install
npm run dev
```
Open http://localhost:3000.

### 5. Make yourself an admin
Sign in once, then run this in the Supabase SQL editor:
```sql
insert into profiles (user_id, email, is_admin)
select id, email, true from auth.users where email = 'you@school.edu'
on conflict (user_id) do update set is_admin = true;
```

## Bulk import from a folder of screenshots
```bash
npm run bulk-import -- "path/to/folder"            # dry run: shows the plan, writes nothing
npm run bulk-import -- "path/to/folder" --commit   # import
```
The script works out the teams from roster names, groups maps between the same two teams within 2 days into one series, and skips subs (players not on that team's roster). It also lists likely renamed players. Each screenshot is read only once and cached in `.import-cache/`. Running `--commit` on a folder that was already imported adds those maps again, so only include new screenshots.

## Running a season
1. **Admin → Sync from Challonge**: paste the tournament URL. This creates the teams and matches.
2. **Add players**: on the Admin page, enter each Riot ID (`Name#TAG`) and pick a team, and mark captains. Players you skip here can also be added while reviewing an upload.
3. **Players sign in** and pick their Riot ID on the Account page. Anyone linked to a player can upload results.
4. **After each map**, open Upload result, pick the match, choose the map number and upload the scoreboard. Check the numbers and save. Tick "last map of the series" on the final map so the match is marked complete and the winner is recorded.

Mistakes: an admin can delete a map from the match page and re-upload it.

## Testing the screenshot reader
Test the reader on a single image without setting up Supabase. This only needs `ANTHROPIC_API_KEY` in `.env.local`:
```bash
npm run test:scoreboard -- path/to/scoreboard.png scripts/fixtures/sunset-13-4.expected.json
```
The second argument is optional. It's a JSON file of the correct values, and the script reports how many fields Claude got right.

**Which screen to capture:** the Match Details screen in the client's match history shows K/D/A, first bloods, plants and defuses, but **not ACS or econ**. To track ACS and econ, take the screenshot from the in-game Tab scoreboard on the final round.

## Deploying (Vercel)
1. Push the repo to GitHub and import it at [vercel.com](https://vercel.com).
2. Add the same environment variables from `.env.local`.
3. Add `https://your-app.vercel.app/auth/callback` to Supabase's Redirect URLs.

## Notes and next steps
- **Riot API**: Valorant match data requires a Riot production key and player opt-in (Riot Sign-On). Use this app as the working prototype in the application. Screenshot upload keeps working either way.
- **start.gg**: only Challonge sync is built so far. start.gg uses a GraphQL API and could be added in the same way.
- **Seasons**: everything is currently one league. To keep semesters separate, add a `season` column to `matches` and filter by it.
- **Charts**: player pages show tables only. An ACS-over-time chart would be a good next addition.
