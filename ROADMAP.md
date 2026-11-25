# Roadmap

Ideas agreed on for later, roughly in priority order. Small UI fixes are being done first.

## Bigger features
1. **Deploy online (Vercel).** Give the league a real link so players can claim profiles and upload. Needs Vercel + GitHub connected and the `.env.local` keys added there; add the Vercel `/auth/callback` URL to Supabase redirect URLs and the Discord app.
2. ~~**Season roster import on the Admin page.**~~ Done. Upload the season sign-up sheet (same layout as the FA26 Player Directory), preview the changes (new players, moved players, new #tags/Discords), then confirm.
3. ~~**Seasons.**~~ Done (archive + start a new season from the sign-up sheet). Matches belong to a season (e.g. FA26); season picker on stats pages; career totals across seasons. Best added before the next season starts.
4. ~~**Group standings.**~~ Done (fill FA26 groups by re-importing its sheet with Riot ID updates off). Store Group A / Group B per team and split the standings table.
5. ~~**Leaderboards page.**~~ Done. Most first bloods, best K/D per agent, most plants/defuses, etc.
6. ~~**Player page charts.**~~ Done. K/D trend over matches, win rate by map.

## Smaller improvements
- ~~Rank badges in the Players list and team rosters.~~ Done.
- ~~Head-to-head record on match pages.~~ Done (meeting list appears once two teams have played more than once).
- Compact phone layout for scoreboards (agent, name, K/D/A).
- Alias system: remember every name a player has used so old names still match screenshots.

## Open data issues
- New #tags needed: Greentoilet2 (Ruination), ReinDuck (Imperium), 5ft2 300lb (Kuronami), Free Gaza (Rogue).
- Riot IDs not found: goofygooberuwu#bmw and furry femboy#owner (Bubblegum Deathwish).
- Primordial Black (Aeris) played on another account; name unknown until a screenshot shows it.
- Players can now fix their own Riot ID after claiming their profile (Account page).
