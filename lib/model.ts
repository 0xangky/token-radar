// Token Radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// What it ranks: every protocol in the snapshot that records no token (no market cap, no CoinGecko
// id, no symbol) and is not a wrapped, staked, bridged or versioned product of one that trades.
// The watchlist is a floor: every watchlist slug is scored and shown, and the board adds the
// pre-token protocols the house list leaves out.
//
// Implied value follows only from the snapshot's own figures, never from a name list:
//
//   benchmark = median market-cap / TVL multiple of the live-token protocols in the same category
//               (at least 5 peers), else the same median over every live-token protocol
//   growth    = 1 + clamp(change_7d, -50, +150) / 100 x GROWTH_WEIGHT
//   maturity  = MATURITY_FLOOR + min(age_days, MATURITY_CAP) / MATURITY_CAP x MATURITY_RANGE
//   implied   = max(1, round(tvl_usd x benchmark x growth x maturity))
//
// Age is the days since DefiLlama began tracking the protocol with no token recorded; the median
// pre-token age stands in when listed_at is null, and the row says so. The same function scores
// every protocol; no slug is special-cased.

/** One protocol entry, exactly the ten fields the sealed snapshot carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated on the dashboard's model sheet. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_cap_days: number;
  min_benchmark: number;
  max_benchmark: number;
  min_category_peers: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.4,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.65,
  maturity_range: 0.55,
  maturity_cap_days: 1460,
  min_benchmark: 0.05,
  max_benchmark: 2.5,
  min_category_peers: 5,
};

export const MODEL_VERSION = 'peer-1';

/** One farm step: what to do, what it costs, and how long it takes. */
export interface FarmStep {
  action: string;
  cost: string;
  time: string;
}

/** One benchmark peer shown in a row's detail view. */
export interface PeerExample {
  name: string;
  multiple: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number;
  age_known: boolean;
  on_watchlist: boolean;
  implied_value_usd: number;
  model: {
    benchmark_multiple: number;
    benchmark_category: string | null;
    benchmark_peers: number;
    benchmark_examples: PeerExample[];
    growth_pct: number;
    growth_multiplier: number;
    maturity_days: number;
    maturity_multiplier: number;
  };
  farm_steps: string[];
  farm_plan: FarmStep[];
}

/** The compact row the dashboard's data.js carries. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number;
  age_known: boolean;
  on_watchlist: boolean;
  implied_value_usd: number;
  model: BoardRow['model'];
  farm_plan: FarmStep[];
}

/** A live-token protocol: the market's own value, kept out of the ranked board. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
  change_7d: number | null;
}

/** The benchmark the model used for a category or the whole market. */
export interface Benchmark {
  category: string | null;
  multiple: number;
  peers: number;
  examples: PeerExample[];
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  watchlist_covered: number;
  early_size: number;
  live_size: number;
  global_benchmark: Benchmark;
  category_benchmarks: Benchmark[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** A snapshot the model cannot score. */
export class SnapshotError extends Error {}

/** Names that mark a wrapped, staked or versioned product of another protocol. */
const PRODUCT_NAME = /(^|\s)(wrapped|staked|staking)(\s|$)/i;
const VERSIONED_NAME = /\s(v\d+(\.\d+)?|\d+\.\d+)$/i;
const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;

/** Categories whose pre-token entries are products of a token that already trades. */
const PRODUCT_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** True when the protocol records no token of its own. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** True when a pre-token protocol is a product of a live token rather than a future launch. */
function isProduct(p: SnapshotProtocol): boolean {
  return (
    (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) ||
    PRODUCT_NAME.test(p.name) ||
    VERSIONED_NAME.test(p.name) ||
    EXCHANGE_PREFIX.test(p.name)
  );
}

/** Days from one UTC date to another, or null when either is not a date. */
function daysBetween(from: string | null, to: string): number | null {
  if (from === null || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Market-cap / TVL for a live-token protocol, or null when it has no usable pair. */
function tvlMultiple(p: SnapshotProtocol): number | null {
  if (p.mcap_usd === null || p.tvl_usd <= 0) return null;
  const value = p.mcap_usd / p.tvl_usd;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Three live peers whose multiple sits closest to the median: the observations behind it, not outliers. */
function representative(peers: SnapshotProtocol[], middle: number): PeerExample[] {
  return peers
    .slice()
    .sort((a, b) => Math.abs(tvlMultiple(a)! - middle) - Math.abs(tvlMultiple(b)! - middle) || a.slug.localeCompare(b.slug))
    .slice(0, 3)
    .sort((a, b) => tvlMultiple(a)! - tvlMultiple(b)!)
    .map((p) => ({ name: p.name, multiple: tvlMultiple(p)! }));
}

/** The benchmark for one category from its live peers, or null when it has too few. */
function categoryBenchmark(live: SnapshotProtocol[], category: string, minPeers: number): Benchmark | null {
  const peers = live.filter((p) => p.category === category && tvlMultiple(p) !== null);
  if (peers.length < minPeers) return null;
  const middle = median(peers.map((p) => tvlMultiple(p)!));
  return { category, multiple: middle, peers: peers.length, examples: representative(peers, middle) };
}

/** The benchmark from every live-token protocol in the snapshot. */
function globalBenchmark(live: SnapshotProtocol[]): Benchmark {
  const peers = live.filter((p) => tvlMultiple(p) !== null);
  const middle = peers.length === 0 ? 0.2 : median(peers.map((p) => tvlMultiple(p)!));
  return { category: null, multiple: middle, peers: peers.length, examples: representative(peers, middle) };
}

/** Clamp a benchmark into the range the model states. */
function clampBenchmark(value: number): number {
  return Math.min(MODEL.max_benchmark, Math.max(MODEL.min_benchmark, value));
}

/** The three model factors for one pre-token protocol. */
function factors(p: SnapshotProtocol, benchmark: Benchmark, model: ModelConstants): BoardRow['model'] {
  const growth = Math.min(model.growth_cap, Math.max(model.growth_floor, p.change_7d ?? 0));
  const growthMultiplier = 1 + (growth / 100) * model.growth_weight;
  return {
    benchmark_multiple: clampBenchmark(benchmark.multiple),
    benchmark_category: benchmark.category,
    benchmark_peers: benchmark.peers,
    benchmark_examples: benchmark.examples,
    growth_pct: p.change_7d,
    growth_multiplier: growthMultiplier,
    maturity_days: 0, // filled by the caller, which knows the snapshot date
    maturity_multiplier: 1,
  };
}

/** A five-step farm plan whose every step names its cost and its time. */
function farmPlan(p: SnapshotProtocol, implied: number, asOf: string): FarmStep[] {
  const category = (p.category ?? '').toLowerCase();
  const chain = p.chains.length > 0 ? p.chains[0]! : 'the protocol’s main chain';
  const tvl = usdShort(p.tvl_usd);
  const steps: FarmStep[] = [];

  steps.push({
    action: `Create a fresh wallet on ${chain} for ${p.name} only, and fund it with enough for one position plus gas; keep it apart from wallets used for live tokens.`,
    cost: '$35–$80 in gas and bridge fees',
    time: '20 minutes',
  });

  if (category.includes('lending') || category.includes('cdp')) {
    steps.push({
      action: `Supply $750–$2,000 of USDC to ${p.name}, then borrow 25–30% of it in a second asset so the position is active in both directions without approaching liquidation.`,
      cost: '$8–$20 in gas for both actions',
      time: '25 minutes',
    });
    steps.push({
      action: `Keep the health factor above 1.6, repay and re-supply once a month, and add a small repay-and-borrow cycle so the wallet records steady use rather than one deposit.`,
      cost: '$10–$25 in gas a month',
      time: '15 minutes a month',
    });
  } else if (category.includes('dex')) {
    steps.push({
      action: `Provide $500–$1,500 of a blue-chip pair to the deepest ${p.name} pool on ${chain}; if the pool is concentrated, set a range around the current price instead of full range.`,
      cost: '$10–$25 in gas plus the position',
      time: '25 minutes',
    });
    steps.push({
      action: `Rebalance the range or rebalance the pair once a week and claim fees only after they cover gas; a weekly touch records repeat use.`,
      cost: '$8–$18 in gas a week',
      time: '15 minutes a week',
    });
  } else if (category.includes('liquid staking') || category.includes('restak')) {
    steps.push({
      action: `Stake $750–$1,500 of ETH or the chain’s native asset through ${p.name} and keep the receipt token in the same wallet instead of selling it.`,
      cost: '$10–$30 in gas',
      time: '20 minutes',
    });
    steps.push({
      action: `Use the receipt token once in a second ${p.name} market, then hold both for at least a month; this shows the wallet uses the full product, not only the stake.`,
      cost: '$8–$20 in gas',
      time: '15 minutes',
    });
  } else if (category.includes('rwa')) {
    steps.push({
      action: `Subscribe to the smallest tranche or vault ${p.name} offers, $250–$1,000, after checking its redemption window and whether the position needs an allowlisted wallet.`,
      cost: '$15–$40 in fees and gas',
      time: '30 minutes',
    });
    steps.push({
      action: `Reinvest one distribution or roll the position once a month, and keep the statements in one folder so the wallet’s history shows a real holding rather than a test.`,
      cost: '$5–$15 a month in fees',
      time: '20 minutes a month',
    });
  } else if (category.includes('bridge')) {
    steps.push({
      action: `Move $500–$1,000 across ${p.name} in both directions, leaving it in the destination chain for a day before moving it back so both sides settle.`,
      cost: '$10–$30 in bridge fees and gas',
      time: '30 minutes',
    });
    steps.push({
      action: `Repeat the round trip once a month with a smaller amount and keep the transfer receipts; a bridge used once and abandoned looks like a test.`,
      cost: '$8–$20 a month',
      time: '15 minutes a month',
    });
  } else if (category.includes('yield') || category.includes('allocator') || category.includes('basis') || category.includes('curator')) {
    steps.push({
      action: `Deposit $750–$2,000 of USDC into ${p.name}’s most conservative vault, read its fee and lock terms first, and leave the position for at least two full weeks.`,
      cost: '$10–$30 in gas and deposit fees',
      time: '25 minutes',
    });
    steps.push({
      action: `Add to or rebalance the vault position once a month and claim rewards only when they exceed gas; the recurring deposit is what a points program can score.`,
      cost: '$8–$20 a month',
      time: '15 minutes a month',
    });
  } else if (category.includes('derivative') || category.includes('perp') || category.includes('option')) {
    steps.push({
      action: `Open and close one small $200–$500 position a week on ${p.name}, always with a stop loss, so the wallet shows repeat trading rather than a single test.`,
      cost: '$10–$30 a week in fees and funding',
      time: '20 minutes a week',
    });
    steps.push({
      action: `Keep a written position cap of 5% of your budget and withdraw profit monthly; a farm wallet that blows up cannot collect a launch reward.`,
      cost: '$5–$15 a month in withdrawal fees',
      time: '10 minutes a month',
    });
  } else if (category.includes('index')) {
    steps.push({
      action: `Buy $500–$1,000 of ${p.name}’s index token or mint the basket directly, then hold it while you rebalance a small second position monthly.`,
      cost: '$10–$30 in gas and mint fees',
      time: '25 minutes',
    });
    steps.push({
      action: `Rebalance or add to the basket once a month and keep the transaction hashes; steady additions over months are the farmable behaviour.`,
      cost: '$8–$20 a month',
      time: '15 minutes a month',
    });
  } else if (category.includes('insurance')) {
    steps.push({
      action: `Buy $250–$1,000 of cover from ${p.name} on a position you already hold, and keep the policy active for a full month.`,
      cost: '$10–$30 in premium and gas',
      time: '20 minutes',
    });
    steps.push({
      action: `Renew the cover monthly and add one new policy for a second position; a single purchase does not show the wallet uses the product.`,
      cost: '$10–$25 a month',
      time: '15 minutes a month',
    });
  } else {
    steps.push({
      action: `Use ${p.name} once with $500–$1,000 on ${chain}: the smallest action its docs call a real position, not a zero-value test transaction.`,
      cost: '$10–$30 in gas and fees',
      time: '25 minutes',
    });
    steps.push({
      action: `Repeat that action once a month and keep the receipts, so the wallet records a habit while the protocol’s TVL of ${tvl} grows.`,
      cost: '$8–$20 a month',
      time: '15 minutes a month',
    });
  }

  steps.push({
    action: `Watch ${p.name}’s docs and governance forum for a token or points announcement; record what the snapshot date ${asOf} says so you notice a change in the record.`,
    cost: '$0',
    time: '10 minutes a month',
  });
  steps.push({
    action: `Cap the position at 10% of your farming budget and unwind if ${p.name}’s TVL falls more than 25% from today’s ${tvl}; keep the implied value of ${usdShort(implied)} as the upside case, not a promise.`,
    cost: '$5–$15 to unwind',
    time: '10 minutes',
  });

  return steps;
}

/** A short dollar label: $7.9B, $103.5M, $5.0M. */
function usdShort(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${Math.round(value)}`;
}

/** Build the ranked board: every eligible pre-token protocol, best implied value first. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.category !== 'CEX');
  const global = globalBenchmark(live);
  const categories = new Map<string, Benchmark | null>();
  const ages = snapshot.protocols
    .filter((p) => isPreToken(p) && !isProduct(p) && daysBetween(p.listed_at, snapshot.as_of) !== null)
    .map((p) => daysBetween(p.listed_at, snapshot.as_of)!)
    .sort((a, b) => a - b);
  const fallbackAge = ages.length > 0 ? ages[Math.floor(ages.length / 2)]! : 365;

  const rows = snapshot.protocols
    .filter((p) => isPreToken(p) && !isProduct(p))
    .map((p) => {
      if (p.category !== null && !categories.has(p.category)) {
        categories.set(p.category, categoryBenchmark(live, p.category, model.min_category_peers));
      }
      const benchmark = (p.category !== null ? categories.get(p.category) : null) ?? global;
      const m = factors(p, benchmark, model);
      const knownAge = daysBetween(p.listed_at, snapshot.as_of);
      const ageDays = knownAge ?? fallbackAge;
      m.maturity_days = ageDays;
      m.maturity_multiplier =
        model.maturity_floor + (Math.min(ageDays, model.maturity_cap_days) / model.maturity_cap_days) * model.maturity_range;
      const implied = Math.max(
        1,
        Math.round(p.tvl_usd * m.benchmark_multiple * m.growth_multiplier * m.maturity_multiplier),
      );
      const plan = farmPlan(p, implied, snapshot.as_of);
      const row: BoardRow = {
        rank: 0,
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        change_7d: p.change_7d,
        mcap_usd: p.mcap_usd,
        listed_at: p.listed_at,
        age_days: ageDays,
        age_known: knownAge !== null,
        on_watchlist: snapshot.watchlist.includes(p.slug),
        implied_value_usd: implied,
        model: m,
        farm_steps: plan.map((s) => `${s.action} Cost ${s.cost}. Time ${s.time}.`),
        farm_plan: plan,
      };
      return row;
    })
    .sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug));

  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  return rows;
}

/** The live-token protocols, by market cap: the market's own benchmarks. */
export function liveRows(snapshot: Snapshot, limit = 60): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, limit)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      multiple: p.tvl_usd > 0 ? p.mcap_usd! / p.tvl_usd : 0,
      change_7d: p.change_7d,
    }));
}

function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    age_known: row.age_known,
    on_watchlist: row.on_watchlist,
    implied_value_usd: row.implied_value_usd,
    model: row.model,
    farm_plan: row.farm_plan,
  };
}

/** Everything the dashboard needs: the board, the live set and the benchmarks behind it. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const liveAll = snapshot.protocols.filter((p) => !isPreToken(p) && p.category !== 'CEX');
  const global = globalBenchmark(liveAll);
  const seen = new Set<string>();
  const categoryBenchmarks: Benchmark[] = [];
  for (const row of board) {
    if (row.category === null || seen.has(row.category)) continue;
    seen.add(row.category);
    const benchmark = categoryBenchmark(liveAll, row.category, model.min_category_peers);
    if (benchmark !== null) categoryBenchmarks.push(benchmark);
  }
  categoryBenchmarks.sort((a, b) => b.peers - a.peers || (a.category ?? '').localeCompare(b.category ?? ''));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    watchlist_covered: snapshot.watchlist.filter((slug) => board.some((r) => r.slug === slug)).length,
    early_size: board.filter((r) => !r.on_watchlist).length,
    live_size: live.length,
    global_benchmark: global,
    category_benchmarks: categoryBenchmarks,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared value, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value past the gate's cap`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
