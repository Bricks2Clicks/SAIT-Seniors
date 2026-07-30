import type { AffordOption, WorkerDemo } from './types'

const money = (n: number) =>
  n.toLocaleString('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  })

const moneyExact = (n: number) =>
  n.toLocaleString('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

function daysLabel(n: number) {
  if (n <= 0) return 'today'
  if (n === 1) return 'tomorrow'
  return `in ${n} days`
}

/**
 * Hero engine: turn a discretionary want into ranked safe paths.
 * Protects essentials, next cliff, and a ~3-day buffer before saying yes.
 */
export function buildAffordOptions(
  worker: WorkerDemo,
  wantLabel: string,
  amount: number,
): AffordOption[] {
  if (!Number.isFinite(amount) || amount <= 0) return []

  const { snapshot, next_cliff: cliff, recent_weeks } = worker
  const options: AffordOption[] = []
  const advanceFeeEstimate = 2.99
  const wouldNeedAdvance =
    snapshot.balance < amount + snapshot.buffer_floor * 0.25 ||
    snapshot.buffer_days < 2

  // 1) Spend from flex now
  if (snapshot.flex_now >= amount && snapshot.buffer_days >= 3) {
    options.push({
      id: 'flex',
      kind: 'flex',
      title: 'Spend from flex — you’re clear',
      summary: `You have ${money(snapshot.flex_now)} flex after essentials and your buffer.`,
      detail: `${wantLabel} at ${moneyExact(amount)} fits today without touching rent, bills, or your 3-day safety floor.`,
      safe: true,
      recommended: true,
      meta: { flex: snapshot.flex_now, amount },
    })
  } else if (snapshot.flex_now >= amount && snapshot.buffer_days < 3) {
    options.push({
      id: 'flex-tight',
      kind: 'flex',
      title: 'Technically possible — buffer is thin',
      summary: `Flex covers it, but you only have ${snapshot.buffer_days.toFixed(1)} safe days.`,
      detail: `Buying now keeps you above essentials on paper, but leaves little room if a shift falls through. Prefer delay or earn if you can.`,
      safe: false,
      recommended: false,
      meta: { buffer_days: snapshot.buffer_days },
    })
  }

  // 2) Delay until after cliff
  if (cliff && cliff.days_until >= 0 && cliff.days_until <= 21) {
    const afterDate = cliff.due_date
    const forecastFlex = Math.max(
      0,
      snapshot.balance +
        snapshot.shift_net_after_commute * Math.max(1, Math.ceil(cliff.days_until / 2)) -
        cliff.amount -
        snapshot.buffer_floor,
    )
    const likely = forecastFlex >= amount || snapshot.flex_now + snapshot.avg_shift_net >= amount
    options.push({
      id: 'delay',
      kind: 'delay',
      title: `Wait until after ${cliff.name}`,
      summary: `${cliff.name} is due ${daysLabel(cliff.days_until)} (${money(cliff.amount)}).`,
      detail: likely
        ? `Hold off on ${wantLabel}. After ${cliff.name} clears on ${afterDate}, you’ll likely have room without stressing the month.`
        : `Protect ${cliff.name} first. Revisit ${wantLabel} once that cliff is paid — wants are easier when the pressure drops.`,
      safe: true,
      recommended: snapshot.flex_now < amount && snapshot.buffer_days < 7,
      meta: {
        cliff: cliff.name,
        days_until: cliff.days_until,
        due_date: afterDate,
      },
    })
  }

  // 3) Earn it with shifts
  const netPerShift = Math.max(40, snapshot.shift_net_after_commute)
  // After a shift, we still want to keep topping buffer / cliff — assume ~35% can become flex toward the want
  const flexPerShift = Math.max(15, netPerShift * 0.35)
  const shiftsNeeded = Math.max(1, Math.ceil(amount / flexPerShift))
  const earnDays = shiftsNeeded
  options.push({
    id: 'earn',
    kind: 'earn',
    title:
      shiftsNeeded === 1
        ? 'Earn it with one shift'
        : `Earn it across ${shiftsNeeded} shifts`,
    summary: `About ${money(netPerShift)} take-home after commute per shift.`,
    detail: `Work ${shiftsNeeded} ${shiftsNeeded === 1 ? 'shift' : 'shifts'} and park ~${money(flexPerShift)} each toward ${wantLabel}. Roughly ${earnDays} workday${earnDays === 1 ? '' : 's'} to unlock a guilt-free yes.`,
    safe: true,
    recommended: snapshot.flex_now < amount,
    meta: {
      shifts: shiftsNeeded,
      net_per_shift: Math.round(netPerShift),
      flex_per_shift: Math.round(flexPerShift),
    },
  })

  // 4) Swap / trade discretionary
  const foodAvg = Math.max(12, snapshot.food_out_avg)
  const swapsNeeded = Math.max(1, Math.ceil(amount / foodAvg))
  if (snapshot.food_out_count_28d >= 1 || amount <= foodAvg * 4) {
    options.push({
      id: 'swap',
      kind: 'swap',
      title:
        swapsNeeded === 1
          ? 'Trade one food-out for this'
          : `Skip food-out ${swapsNeeded}×`,
      summary: `Your recent food-out average is ${moneyExact(foodAvg)}.`,
      detail: `Swap ${swapsNeeded} eating-out trip${swapsNeeded === 1 ? '' : 's'} into a “want” jar. Same monthly spend shape — just pointed at ${wantLabel} instead.`,
      safe: true,
      recommended: snapshot.flex_now < amount && swapsNeeded <= 3,
      meta: { swaps: swapsNeeded, food_out_avg: foodAvg },
    })
  }

  // 5) Sink $N/day
  const dailySink = Math.min(25, Math.max(5, Math.round(amount / 7)))
  const sinkDays = Math.ceil(amount / dailySink)
  options.push({
    id: 'sink',
    kind: 'sink',
    title: `Park ${money(dailySink)}/day until it’s covered`,
    summary: `Ready in about ${sinkDays} day${sinkDays === 1 ? '' : 's'} if you stick the sink.`,
    detail: `From good days only — never from money earmarked for ${cliff?.name ?? 'essentials'}. When the jar hits ${moneyExact(amount)}, ${wantLabel} is yours.`,
    safe: true,
    recommended: amount >= 40 && snapshot.buffer_days < 10,
    meta: { daily_sink: dailySink, sink_days: sinkDays },
  })

  // 6) Not now / advance trap
  if (wouldNeedAdvance || snapshot.buffer_days < 3) {
    const feesMonth = snapshot.advance_fees_month
    options.push({
      id: 'wait',
      kind: 'wait',
      title: 'Not this week — protect the cycle break',
      summary: `Buying now risks an advance (~${moneyExact(advanceFeeEstimate)} fee) or dropping under 3 buffer days.`,
      detail:
        feesMonth > 0
          ? `You’ve already paid ${moneyExact(feesMonth)} in advance fees this month. ${wantLabel} can wait for a clearer window — that’s how you get unstuck, not deprived.`
          : `A forced yes today usually means a harder week tomorrow. Pick earn, delay, or sink instead — same want, no new trap.`,
      safe: true,
      recommended: false,
      meta: { advance_fee: advanceFeeEstimate, fees_month: feesMonth },
    })
  }

  // Insight ranking: recommended first, then safe, prefer actionable paths
  const rank: Record<string, number> = {
    flex: 0,
    delay: 1,
    earn: 2,
    swap: 3,
    sink: 4,
    'flex-tight': 5,
    wait: 6,
  }

  // Ensure only one primary recommended if multiple flagged
  const recommended = options.filter((o) => o.recommended)
  if (recommended.length > 1) {
    const best =
      recommended.find((o) => o.kind === 'flex') ??
      recommended.find((o) => o.kind === 'earn') ??
      recommended.find((o) => o.kind === 'delay') ??
      recommended[0]
    for (const o of options) {
      o.recommended = o.id === best.id
    }
  }

  // Cycle insight string attached via recent weeks (used by UI separately)
  void recent_weeks

  return options.sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1
    return (rank[a.id] ?? 9) - (rank[b.id] ?? 9)
  })
}

export function cycleInsight(worker: WorkerDemo): string {
  const weeks = worker.recent_weeks
  if (!weeks.length) {
    return 'Your month isn’t one average — some weeks carry the bills, others look fine.'
  }
  const heavy = weeks.filter((w) => w.essential_expense > 800 || w.net < -200)
  const calm = weeks.filter((w) => w.net > 100 && w.essential_expense < 500)
  const fees = worker.snapshot.advance_fees_month
  const cliff = worker.next_cliff

  if (heavy.length && calm.length && cliff) {
    return `Pattern: ${heavy.length} heavy week${heavy.length === 1 ? '' : 's'} vs ${calm.length} calmer one${calm.length === 1 ? '' : 's'}. ${cliff.name} in ${cliff.days_until} day${cliff.days_until === 1 ? '' : 's'} is the real pressure — not “bad spending.”`
  }
  if (fees > 0) {
    return `You’ve paid ${moneyExact(fees)} in advance fees this month. Affording wants by planning beats borrowing $40–$100 for groceries and bills.`
  }
  if (cliff) {
    return `Next pressure point: ${cliff.name} (${money(cliff.amount)}) ${daysLabel(cliff.days_until)}. We’ll protect that while finding a path to your want.`
  }
  return 'We’ll keep essentials and buffer days safe, then show honest paths to afford what you want.'
}

export { money, moneyExact }
