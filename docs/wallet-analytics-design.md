# Wallet analytics: presentation and research

The page's task is to compare a wallet's perpetual trading activity with recorded
weekly points, then inspect the trading mix behind a difference. The interface
keeps Arcus's existing fonts, forest/sand palette, theme switch and navigation.

## Findings and implementation

The old layout separated the nickname from the wallet, placed a large holding
table before rewards, and required horizontal scrolling for its main comparison.
These made it difficult to answer the central question: what changed between
weeks when the points changed?

- Wallet and Arcus name now share the first lookup. Analyze loads both sources;
  points can also be loaded independently. The name is remembered across tools.
- A compact overview establishes the scan's volume, net fees and profile points.
  Account aggregates and custom-period calculations are secondary accordions.
- Week selectors compare volume and recorded points on separately labelled bars.
  Selecting a week reveals fees/point, volume/point, point changes, holding mix,
  maker share and market mix. Holding rows and markets include the prior week's
  shares, so users can compare without repeatedly switching back and forth.
- Mobile uses a two-column week grid, a two-by-two metric grid and vertically
  stacked breakdowns. The optional detailed table scrolls inside its container,
  with an explicit scroll hint and a sticky week column. Inputs use 16px text on
  small screens, and the main action has a 48px minimum height.

This follows NN/g's guidance to support adjacent comparison, let people narrow
the data shown, retain readable columns, and use grouping/accordions on mobile:
[Data Tables: Four Major User Tasks](https://www.nngroup.com/articles/data-tables/)
and [Mobile Tables](https://www.nngroup.com/articles/mobile-tables/).

## What the data can establish

[Introducing Arcus Points](https://arcus.xyz/blog/introducing-arcus-points) describes
weekly Wednesday 15:00 ET distributions and multiple reward factors, including
trading quality, market making, retained deposits, referrals, RWA trading, and
RWA trading outside extended US trading hours. The announcement does not publish
trade-level point attribution or a 12-hour holding multiplier.

The product therefore shows observed relationships rather than attributing a
specific reward to a trade. It does not classify RWA or boosted trading hours
from ticker names alone, estimate unpublished weights, or suggest causation from
three observations. Spot, deposits and referrals can contribute to profile points
but are outside this perpetual fills scan. Wallet/name matching is user-supplied.

The snapshot registry in `lib/leaderboard.ts` explicitly identifies distribution
weeks. File download dates can be later than the distribution and are retained
as separate provenance. Weekly points are differences of consecutive cumulative
snapshots, using a Season 1 baseline of zero for Week 1. Missing/hidden history
stays unknown; a negative change is an adjustment. Fees/point and volume/point
require a complete scan, all subaccounts, a whole completed distribution-aligned
week and positive recorded points. These analysis windows are not a confirmed
activity earning cutoff.

Market volume and fees use the existing exact quote-quantum arithmetic. Executed
entry and exit volume stay in their own week. Holding time remains FIFO, with
open entries classified at that week's cutoff. The raw trade-history table stays
removed; the report download retains its source fills and the points history.

## Validation

Unit checks cover weekly gains, missing and hidden baselines, adjustments,
ineligible efficiency comparisons, exact market totals and week boundaries.
Browser checks use the supplied test wallet and a separately entered Arcus name,
switch weeks, inspect both themes, and check 1280px, 390px and 320px viewports.
At 320px, the document stays within the viewport while the optional 670px table
scrolls inside its container.
