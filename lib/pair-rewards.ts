import type { PairProject } from "./pair-analytics";
import { atomsUsd, decimalAtoms } from "./wallet-analytics";
import { ASSUMED_TOTAL_POINTS, FDV_PRESETS } from "./estimator";
import { TXFLOW_DEFAULTS, TXFLOW_FDV_PRESETS, TXFLOW_POOL_PRESETS } from "./txflow-estimator";
import { VARIATIONAL_ALLOCATION, VARIATIONAL_DEFAULTS, VARIATIONAL_FDV_PRESETS } from "./variational-estimator";

export type PairRewardInput = { points: string; pool: string; allocation: string; fdv: string };
export type PairRewardInputs = PairRewardInput[];
export const PAIR_REWARD_MODELS = {
  arcus: { pool: String(ASSUMED_TOTAL_POINTS), allocation: "10", fdv: "500000000", presets: FDV_PRESETS },
  txflow: { pool: String(TXFLOW_POOL_PRESETS.basic), allocation: String(TXFLOW_DEFAULTS.allocation), fdv: String(TXFLOW_DEFAULTS.fdv), presets: TXFLOW_FDV_PRESETS },
  risex: { pool: "10000000", allocation: "20", fdv: "500000000", presets: [250e6, 300e6, 500e6, 800e6, 1e9] },
  entropy: null,
  variational: { pool: VARIATIONAL_DEFAULTS.totalInput, allocation: String(VARIATIONAL_ALLOCATION), fdv: VARIATIONAL_DEFAULTS.fdvInput, presets: VARIATIONAL_FDV_PRESETS },
} as const;
const scale = BigInt(1_000_000_000), zero = BigInt(0), hundred = BigInt(100);
const maximum = decimalAtoms("1000000000000000");
export function pairRewardDefaults(project: PairProject): PairRewardInput {
  const model = PAIR_REWARD_MODELS[project];
  return { points: "", pool: model?.pool ?? "", allocation: model?.allocation ?? "", fdv: model?.fdv ?? "" };
}
export function parsePairRewardInputs(value: unknown, projects: readonly PairProject[]): PairRewardInputs {
  const inputs = projects.map((project, index) => {
    const defaults = pairRewardDefaults(project), saved = Array.isArray(value) ? value[index] : null;
    for (const key of Object.keys(defaults) as (keyof PairRewardInput)[]) {
      if (typeof saved?.[key] === "string" && saved[key].length <= 100) defaults[key] = saved[key];
    }
    return defaults;
  }) as PairRewardInputs;
  const first = new Map<PairProject, PairRewardInput>();
  projects.forEach((project, index) => {
    const shared = first.get(project);
    if (shared) inputs[index] = { ...inputs[index], pool: shared.pool, allocation: shared.allocation, fdv: shared.fdv };
    else first.set(project, inputs[index]);
  });
  return inputs;
}
function amount(input: string) {
  try { const value = decimalAtoms(input.trim()); return value >= zero && value <= maximum ? value : null; }
  catch { return null; }
}
function rounded(numerator: bigint, denominator: bigint) { return (numerator + denominator / BigInt(2)) / denominator; }
export type PairRewardLeg = { included: boolean; value: string | null; error: string | null };
export function pairRewardLeg(project: PairProject, input: PairRewardInput): PairRewardLeg {
  if (!PAIR_REWARD_MODELS[project] || input.points.trim() === "") return { included: false, value: "0", error: null };
  const points = amount(input.points), pool = amount(input.pool), allocation = amount(input.allocation), fdv = amount(input.fdv);
  if (points === null) return { included: true, value: null, error: "Enter points from 0 to 1 quadrillion using a decimal point." };
  if (pool === null || pool === zero) return { included: true, value: null, error: "Enter a positive total points pool, up to 1 quadrillion." };
  if (points > pool) return { included: true, value: null, error: "Wallet points cannot exceed the total points pool." };
  if (allocation === null || allocation === zero || allocation > hundred * scale) return { included: true, value: null, error: "Enter an allocation greater than 0 and no more than 100%." };
  if (fdv === null || fdv === zero) return { included: true, value: null, error: "Enter a positive FDV, up to $1 quadrillion." };
  const value = rounded(fdv * allocation * points, hundred * scale * pool);
  return { included: true, value: atomsUsd(value), error: null };
}
export type PairRewardScenario = {
  legs: PairRewardLeg[]; rewardValue: string | null; netResult: string | null;
  lossToCover: string | null; coveragePercent: string | null; status: "above" | "break-even" | "below" | "unknown";
  error: string | null;
};
export function pairRewardScenario(projects: readonly PairProject[], inputs: PairRewardInputs, pnl: string | null): PairRewardScenario {
  const matched = projects.length === inputs.length && projects.every(project => project in PAIR_REWARD_MODELS);
  const legs = matched ? inputs.map((input, index) => pairRewardLeg(projects[index], input)) : [];
  let error = matched ? legs.find(leg => leg.error)?.error ?? null : "Reward inputs do not match the selected projects.";
  for (const project of new Set(projects)) {
    const indices = projects.flatMap((id, i) => id === project && legs[i]?.included && !legs[i].error ? [i] : []);
    if (indices.length < 2) continue;
    const first = inputs[indices[0]];
    if (indices.some(i => ["pool", "allocation", "fdv"].some(key => inputs[i][key as keyof PairRewardInput] !== first[key as keyof PairRewardInput]))) error = "Wallets on the same project must use the same pool, allocation and FDV.";
    else if (indices.reduce((sum, i) => sum + decimalAtoms(inputs[i].points.trim()), zero) > decimalAtoms(first.pool.trim())) error = "Combined wallet points exceed this project's total pool.";
  }
  const rewardAtoms = legs.some(leg => leg.included) && !error ? legs.reduce((sum, leg) => sum + decimalAtoms(leg.value!), zero) : null;
  const pnlAtoms = pnl === null ? null : decimalAtoms(pnl);
  const loss = pnlAtoms === null ? null : pnlAtoms < zero ? -pnlAtoms : zero;
  const result = pnlAtoms !== null && rewardAtoms !== null ? pnlAtoms + rewardAtoms : null;
  return { legs, rewardValue: rewardAtoms === null ? null : atomsUsd(rewardAtoms), netResult: result === null ? null : atomsUsd(result),
    lossToCover: loss === null ? null : atomsUsd(loss), coveragePercent: loss !== null && loss > zero && rewardAtoms !== null ? atomsUsd(rounded(rewardAtoms * hundred * scale, loss)) : null,
    status: result === null ? "unknown" : result > zero ? "above" : result === zero ? "break-even" : "below", error };
}
/** FDV needed on one project while the other project's selected FDV stays fixed. */
export function pairBreakEvenFdv(projects: readonly PairProject[], inputs: PairRewardInputs, pnl: string | null, index: number): string | null {
  const scenario = pairRewardScenario(projects, inputs, pnl);
  if (scenario.error || pnl === null || !scenario.legs[index]?.included) return null;
  const own = inputs[index], points = amount(own.points), pool = amount(own.pool), allocation = amount(own.allocation);
  if (points === null || !pool || !allocation) return null;
  const otherRewards = scenario.legs.reduce((sum, leg, i) => sum + (projects[i] !== projects[index] ? decimalAtoms(leg.value!) : zero), zero);
  const needed = -decimalAtoms(pnl) - otherRewards;
  if (needed <= zero) return "0";
  const eligible = inputs.reduce((sum, input, i) => sum + (projects[i] === projects[index] && scenario.legs[i].included ? amount(input.points)! : zero), zero);
  if (eligible === zero) return null;
  // Round the threshold up to a cent, so displaying it never understates the required FDV.
  const numerator = needed * hundred * scale * pool, denominator = allocation * eligible;
  const cent = scale / hundred;
  return atomsUsd(((numerator + denominator * cent - BigInt(1)) / (denominator * cent)) * cent);
}
