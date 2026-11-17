# Points distributions and snapshot audit — 17 November 2026

All timestamps below use UTC. An activity cutoff, a distribution announcement,
an exported leaderboard and a final airdrop eligibility snapshot are different
events. Future dates are schedule projections, not confirmation of credit.
Public-project announcements do not prove that a particular wallet received points.

## Findings

| Project | Latest evidence | Site coverage and calculation | Next cutoff / distribution |
| --- | --- | --- | --- |
| Arcus | Season 1 Week 6, 250,000 points; announced 11 Nov | All six cumulative files are present. Integer-hundredth totals are 250k, 500k, 750k, 1M, 1.25M and 1.5M. Weekly wallet gains are consecutive cumulative differences. No missing completed distribution found. | Distribution 18 Nov 20:00. The actual activity earning cutoff is unpublished; analysis uses distribution-aligned windows. |
| TxFlow | Season 1 Epoch 5, 1,250,000 trader points; announced 17 Nov | S0 and E1–E5 are configured; E6 remains separate current activity. Monday cutoffs and Tuesday distributions agree with documentation. Manual points are compared with matching epoch trades. | E6 closes 23 Nov 00:00; drop 24 Nov, hour unpublished. |
| RISEx | Week 17, 200,000 points across 6,147 accounts; announced 17 Nov | Missing W17 was fixed in f4f285b. Started weeks now continue dynamically. W17 activity is included in awarded totals, W18 is separate. | W18 closes 23 Nov 00:00 in the normalized analysis calendar; drop 24 Nov 14:00. |
| Variational | Omni Week 48, 150,000 points across 30,237 accounts; announced 13 Nov | Calculator and manual comparison only; no automatic weekly wallet history. Editable 10M total is an assumption, not a live issued-points total. Official Genesis allocation remains 32%. | W49 activity cutoff 19 Nov 00:00; distribution 20 Nov 00:00. |
| BULK | 14 Nov official AURA DAY / Challenger announcement; completed AURA credit not explicitly verified | Local trading calendar has T1–T10 ended and T11 current. T10 is 7–14 Nov; Challenger Week 5 uses those dates under a separate week numbering. Saturday 13:00 is approximate. No missing local window found; stale session reports could hide rollover and are now rejected. | Next local window ends 21 Nov approximately 13:00. Exact exchange snapshot/credit hour unknown. |
| Extended | All 70M points distributed by 5 Nov; final snapshot 6 Nov 00:00 | Existing 300M XTEN / 70M points conversion is mathematically consistent with the official pool and supply. Final date and ended status added to the calculator. No continuing weekly distributions. | Program ended. |
| Jumper | xPerps: 1M distributed 9 Nov, 2.4M cumulative; no qualifying 16 Nov confirmation found | Site calculates Loyalty Pass XP, not xPerps. Local community eligibility histogram is dated 6 Oct 18:35:29; upstream still serves that same snapshot. It must not be presented as current or as an official eligibility snapshot. Clarified on page. | xPerps fourth activity window closed 16 Nov 00:00; fifth closes 23 Nov 00:00. Credit hour unpublished. XP/airdrop final snapshot unconfirmed. |
| Entropy | Official documentation accessible; no points schedule established from the sources checked | Wallet analytics only, no point conversion or assumed snapshot dates. Conflicting third-party claims are insufficient evidence. | Unknown. |

## Snapshot and distribution dates

### Arcus

The earning cutoff has not been verified. The Wednesday timestamps below are
distribution times and analysis boundaries. America/New_York DST is applied:
19:00 UTC in October, 20:00 UTC after the November transition.

| Season 1 week | Distribution | Local leaderboard downloaded | Cumulative pool |
| --- | --- | --- | ---: |
| 1 | 7 Oct 19:00 | 9 Oct 11:13:42 | 250,000 |
| 2 | 14 Oct 19:00 | 15 Oct 09:13:59 | 500,000 |
| 3 | 21 Oct 19:00 | 22 Oct 09:24:25 | 750,000 |
| 4 | 28 Oct 19:00 | 28 Oct 20:01:13 | 1,000,000 |
| 5 | 4 Nov 20:00 | 5 Nov 11:56:30 | 1,250,000 |
| 6 | 11 Nov 20:00 | 12 Nov 09:36:21 | 1,500,000 |
| 7 | 18 Nov 20:00, scheduled | Not yet due at audit | — |

Sources: [official-author Week 6 announcement](https://teapawt.net/arcus_xyz/status/2120623353656754488),
[official-author current timeline](https://teapawt.net/arcus_xyz).
The official blog was inaccessible during this audit. Download dates and totals
were independently read from all six repository files; each total sums integer
hundredths, avoiding floating-point noise.

### TxFlow

The cutoff is exclusive: trades at Monday 00:00 belong to the next epoch.
All start/end timestamps in this table are 00:00.

| Period | Activity starts | Activity cutoff | Distribution date |
| --- | --- | --- | --- |
| S0 | Before S1 | 12 Oct | 27 Oct |
| S1 E1 | 12 Oct | 19 Oct | 20 Oct |
| S1 E2 | 19 Oct | 26 Oct | 27 Oct |
| S1 E3 | 26 Oct | 2 Nov | 3 Nov |
| S1 E4 | 2 Nov | 9 Nov | 10 Nov |
| S1 E5 | 9 Nov | 16 Nov | 17 Nov |
| S1 E6, current | 16 Nov | 23 Nov | 24 Nov, scheduled |

Sources: [weekly rules](https://docs.txflow.com/points/how-points-work),
[S0 credit](https://docs.txflow.com/points/season-0-points),
[latest official-author timeline](https://teapawt.net/TxFlow_L1).
The exact Tuesday credit hour is unpublished. The site's date-based eligibility
switch at 00:00 is a calendar convention, not proof that a drop occurred then.
Unconfigured future drops are not automatically marked awarded.

### RISEx

Season 1 starts 20 July 2026 at 00:00. Every weekly analysis cutoff is Monday
00:00; every scheduled drop below is Tuesday 14:00. Earlier dates are generated
from the published weekly schedule, not individual historical credit verification.

| Week | Activity cutoff, 00:00 | Scheduled drop, 14:00 |
| --- | --- | --- |
| 1 | 27 Jul | 28 Jul |
| 2 | 3 Aug | 4 Aug |
| 3 | 10 Aug | 11 Aug |
| 4 | 17 Aug | 18 Aug |
| 5 | 24 Aug | 25 Aug |
| 6 | 31 Aug | 1 Sep |
| 7 | 7 Sep | 8 Sep |
| 8 | 14 Sep | 15 Sep |
| 9 | 21 Sep | 22 Sep |
| 10 | 28 Sep | 29 Sep |
| 11 | 5 Oct | 6 Oct |
| 12 | 12 Oct | 13 Oct |
| 13 | 19 Oct | 20 Oct |
| 14 | 26 Oct | 27 Oct |
| 15 | 2 Nov | 3 Nov |
| 16 | 9 Nov | 10 Nov |
| 17 | 16 Nov | 17 Nov, credit confirmed |
| 18, current | 23 Nov | 24 Nov, scheduled |

Genesis / pre-season cutoff: 20 Jul 00:00; announced retro drop: 23 Jul 14:00.
Sources: [program announcement](https://blog.risechain.com/rise-points-season-1-ignite-everything-you-need-to-know/),
[official-author current timeline](https://teapawt.net/risextrade),
[live current-epoch API](https://api.rise.trade/v1/points/epoch/current).
The API was read directly during this audit: Week 18, starts_at 1794787200,
ends_at 1795391940, distribution_at 1795528800. Its Sunday 23:59 endpoint
is normalized to the following Monday 00:00 for contiguous half-open windows.
Status after the scheduled drop is a calendar classification; users supply
their actually received points. The estimator's 10M pool is hypothetical.

### Variational

Latest completed week 48 activity: **5 Nov 00:00 ≤ time < 12 Nov 00:00**;
distribution: **13 Nov 00:00**, announcement timestamp 00:11.
Next week 49 activity: **12 Nov 00:00 ≤ time < 19 Nov 00:00**;
scheduled distribution: **20 Nov 00:00**. These activity windows are derived
from the official Thursday cutoff / Friday distribution rule.

Initial retroactive activity cutoff: 11 December 2025; program launch and
3M retroactive distribution: 17 December 2025. No final airdrop snapshot date
was verified. Sources: [points schedule](https://help.variational.io/en/articles/14766791-points-on-omni),
[Week 48 official-author announcement](https://teapawt.net/variational_io/status/2121033205801513026),
[token allocation](https://docs.variational.io/token/usdvar).

### BULK

These are **local approximate trading windows**, not verified exchange snapshot
timestamps or evidence that points were paid. Each boundary is Saturday
approximately 13:00. Pre-deposit local period: 1 Jun 00:00–5 Sep 13:00.

| Local trading week | Starts | Ends |
| --- | --- | --- |
| T1 | 5 Sep | 12 Sep |
| T2 | 12 Sep | 19 Sep |
| T3 | 19 Sep | 26 Sep |
| T4 | 26 Sep | 3 Oct |
| T5 | 3 Oct | 10 Oct |
| T6 | 10 Oct | 17 Oct |
| T7 | 17 Oct | 24 Oct |
| T8 | 24 Oct | 31 Oct |
| T9 | 31 Oct | 7 Nov |
| T10 | 7 Nov | 14 Nov |
| T11, current | 14 Nov | 21 Nov |

The official Challenger Series starts 10 Oct and ends its regular season
5 Dec. Its week numbers differ from the local trading calendar. Gauntlet AURA
comes out of the 1M weekly AURA pool; League Cash is USDC and must not be counted
as another points distribution. Sources: [Challenger rules](https://docs.bulk.trade/bulk-exchange/aura),
[14 Nov official AURA DAY repost](https://teapawt.net/bulktraders/status/2121589148498923699).

### Jumper

xPerps activity cutoffs, Monday 00:00: **26 Oct, 2 Nov, 9 Nov, 16 Nov**.
The program begins 19 Oct. The current fifth activity window ends **23 Nov
00:00**. Credit time is not specified by the weekly activity boundary.
The 9 Nov post confirms 2.4M cumulative xPerps; no qualifying completed
16 Nov points-credit statement was found. Sources: [official-author program](https://teapawt.net/jumperapp/article/2114755548596023692),
[official-author dated posts](https://teapawt.net/jumperapp?filter=posts).
Ondo USDC incentive payouts, referral fees, mission XP and xPerps are distinct.

Loyalty Pass XP histogram: **6 Oct 2026 18:35:29**, 2,814,996 wallets,
248,363,823 reported XP. [Its upstream community tool](https://jumperxp.vercel.app/)
still serves those exact figures and date. No newer histogram was available
there. Wallet lookup retrieval time does not establish the underlying
leaderboard's snapshot date. No exact recurring XP credit schedule or final
eligibility snapshot was verified; do not invent monthly dates.

### Extended and Entropy

Extended final snapshot: **6 Nov 2026 00:00**, distributions ended.
70M final points, 300M community XTEN and 1B genesis supply imply
**4.285714285714286 XTEN per Xpoint** before eligibility adjustments.
Sources: [points program](https://docs.extended.exchange/extended-resources/points-program),
[distribution](https://docs.extended.exchange/extended-resources/xten/airdrop-distribution),
[tokenomics](https://docs.extended.exchange/extended-resources/xten/tokenomics).

Entropy: no verified point snapshot or distribution dates. The
[official documentation](https://docs.entropy.io/) and documentation index were
checked; the pro app and official X mirror could not be fully inspected.
Absence of a verified schedule is not proof that no private/new program exists.

## Calculation validation and limits

- Arcus: all six local cumulative totals reconcile exactly in hundredths;
  per-wallet weekly differences retain missing/hidden history as unknown.
  Distribution-aligned trading ratios do not prove the unpublished earning cutoff.
- TxFlow/RISEx/BULK: half-open completed activity windows avoid double counting
  boundary trades. Current activity stays outside completed/awarded aggregates.
  Regression tests cover W17→W18, E5→E6 and BULK T10→T11.
- BULK and TxFlow now reject stale cached epoch calendars. Manual point inputs
  remain in browser storage. RISEx already gained equivalent validation in f4f285b.
- FDV calculations use FDV × allocation × user points / points pool. Pools for
  Arcus, TxFlow, RISEx, Variational, BULK and Jumper scenarios remain assumptions;
  the audit does not replace them with cumulative issued points.
- Variational's official point-scoring formula, RISEx's changing weekly weights
  and TxFlow's quality weights are not public. The site describes observed
  volume/fees per entered point; it cannot reproduce an official award formula.
- This was a public-source and implementation audit, not a scan of every user's
  private credited balance. Partial trade history and approximate BULK boundaries
  remain material limits on any per-point trading comparison.
