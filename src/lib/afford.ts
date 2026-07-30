import type {
  AffordOption,
  CliffProgress,
  HouseholdType,
  VacationPlan,
  VacationSuggestion,
  WantPreset,
  WorkerDemo,
} from './types'

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

export const AMOUNT_CHIPS = [15, 25, 45, 80, 150] as const

export const HOUSEHOLD_LABELS: Record<HouseholdType, string> = {
  family: 'Family',
  single: 'Single adult',
  couple: 'Couple · no kids',
}

/** Infer household from demo worker profile; user can override in UI. */
export function inferHousehold(worker: WorkerDemo): HouseholdType {
  const { dependents, household_size } = worker.profile
  if (dependents > 0) return 'family'
  if (household_size <= 1) return 'single'
  return 'couple'
}

const WANT_PRESETS: Record<HouseholdType, WantPreset[]> = {
  family: [
    { label: 'Kids treat', amount: 25 },
    { label: 'Birthday gift', amount: 45 },
    { label: 'Family day out', amount: 80 },
    { label: 'Haircut / self-care', amount: 35 },
    { label: 'Takeout treat', amount: 40 },
    { label: 'Sports / hobby gear', amount: 60 },
    { label: 'New phone accessory', amount: 45 },
    { label: 'Concert / tickets', amount: 75 },
    { label: 'Coffee run upgrade', amount: 15 },
    { label: 'Send family money', amount: 100 },
  ],
  single: [
    { label: 'Night out', amount: 45 },
    { label: 'Concert / tickets', amount: 75 },
    { label: 'Haircut / self-care', amount: 40 },
    { label: 'Coffee run upgrade', amount: 15 },
    { label: 'Takeout treat', amount: 30 },
    { label: 'New phone accessory', amount: 50 },
    { label: 'Sports / hobby gear', amount: 80 },
    { label: 'Streaming / game', amount: 15 },
    { label: 'Birthday gift', amount: 40 },
    { label: 'Date night', amount: 60 },
  ],
  couple: [
    { label: 'Date night', amount: 60 },
    { label: 'Anniversary treat', amount: 80 },
    { label: 'Concert / tickets', amount: 90 },
    { label: 'Takeout treat', amount: 45 },
    { label: 'Haircut / self-care', amount: 35 },
    { label: 'Coffee run upgrade', amount: 18 },
    { label: 'Birthday gift', amount: 50 },
    { label: 'Sports / hobby gear', amount: 70 },
    { label: 'New phone accessory', amount: 45 },
    { label: 'Night out', amount: 55 },
  ],
}

const VACATION_SUGGESTIONS: Record<HouseholdType, VacationSuggestion[]> = {
  family: [
    { label: 'Family day trip', amount: 180, weeksAway: 3 },
    { label: 'Long weekend Banff', amount: 450, weeksAway: 6 },
    { label: 'Visit family', amount: 320, weeksAway: 5 },
    { label: 'Summer family vacation', amount: 900, weeksAway: 12 },
  ],
  single: [
    { label: 'Solo long weekend', amount: 280, weeksAway: 4 },
    { label: 'Friends trip', amount: 450, weeksAway: 8 },
    { label: 'City break', amount: 350, weeksAway: 5 },
    { label: 'Visit family', amount: 250, weeksAway: 6 },
  ],
  couple: [
    { label: 'Couple getaway', amount: 400, weeksAway: 5 },
    { label: 'Anniversary weekend', amount: 520, weeksAway: 7 },
    { label: 'Long weekend Banff', amount: 480, weeksAway: 6 },
    { label: 'Visit family together', amount: 300, weeksAway: 4 },
  ],
}

export function wantPresetsFor(household: HouseholdType): WantPreset[] {
  return WANT_PRESETS[household]
}

export function vacationSuggestionsFor(household: HouseholdType): VacationSuggestion[] {
  return VACATION_SUGGESTIONS[household]
}

function householdFraming(household: HouseholdType): string {
  if (household === 'family') return 'family trip'
  if (household === 'couple') return 'couple getaway'
  return 'solo break'
}

function cliffProtectNote(cliff: { name: string; category: string }, household: HouseholdType): string {
  const name = cliff.name.toLowerCase()
  const cat = cliff.category.toLowerCase()
  if (household === 'family' && (cat.includes('child') || name.includes('child') || name.includes('care'))) {
    return 'Protect childcare / kids essentials before vacation sink.'
  }
  if (cat === 'housing' || name.includes('rent')) {
    return 'Never starve rent week to fund vacation.'
  }
  if (cat === 'utilities' || cat === 'phone') {
    return 'Keep this essential paid — sink only from flex after it clears.'
  }
  return 'Clear this cliff first; vacation money waits on good weeks.'
}

/**
 * Hero engine: turn a discretionary want into ranked safe paths.
 * Protects essentials, next cliff, and a ~3-day buffer before saying yes.
 */
export function buildAffordOptions(
  worker: WorkerDemo,
  wantLabel: string,
  amount: number,
  household: HouseholdType = inferHousehold(worker),
): AffordOption[] {
  if (!Number.isFinite(amount) || amount <= 0) return []

  const { snapshot, next_cliff: cliff, recent_weeks } = worker
  const options: AffordOption[] = []
  const advanceFeeEstimate = 2.99
  const wouldNeedAdvance =
    snapshot.balance < amount + snapshot.buffer_floor * 0.25 ||
    snapshot.buffer_days < 2

  const familyProtect =
    household === 'family'
      ? ' Kids treats and family days only come from flex — never from rent, groceries buffer, or childcare cliffs.'
      : ''

  // 1) Spend from flex now
  if (snapshot.flex_now >= amount && snapshot.buffer_days >= 3) {
    options.push({
      id: 'flex',
      kind: 'flex',
      title: 'Spend from flex — you’re clear',
      summary: `You have ${money(snapshot.flex_now)} flex after essentials and your buffer.`,
      detail: `${wantLabel} at ${moneyExact(amount)} fits today without touching rent, bills, or your 3-day safety floor.${familyProtect}`,
      safe: true,
      recommended: true,
      meta: { flex: snapshot.flex_now, amount, household },
    })
  } else if (snapshot.flex_now >= amount && snapshot.buffer_days < 3) {
    options.push({
      id: 'flex-tight',
      kind: 'flex',
      title: 'Technically possible — buffer is thin',
      summary: `Flex covers it, but you only have ${snapshot.buffer_days.toFixed(1)} safe days.`,
      detail: `Buying now keeps you above essentials on paper, but leaves little room if a shift falls through. Prefer delay or earn if you can.${familyProtect}`,
      safe: false,
      recommended: false,
      meta: { buffer_days: snapshot.buffer_days, household },
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
    const cliffNote =
      household === 'family' &&
      (cliff.category.includes('child') || cliff.name.toLowerCase().includes('child'))
        ? ` Protect ${cliff.name} for the household first.`
        : ''
    options.push({
      id: 'delay',
      kind: 'delay',
      title: `Wait until after ${cliff.name}`,
      summary: `${cliff.name} is due ${daysLabel(cliff.days_until)} (${money(cliff.amount)}).`,
      detail: likely
        ? `Hold off on ${wantLabel}. After ${cliff.name} clears on ${afterDate}, you’ll likely have room without stressing the month.${cliffNote}`
        : `Protect ${cliff.name} first. Revisit ${wantLabel} once that cliff is paid — wants are easier when the pressure drops.${cliffNote}`,
      safe: true,
      recommended: snapshot.flex_now < amount && snapshot.buffer_days < 7,
      meta: {
        cliff: cliff.name,
        days_until: cliff.days_until,
        due_date: afterDate,
        household,
      },
    })
  }

  // 3) Earn it with shifts
  const netPerShift = Math.max(40, snapshot.shift_net_after_commute)
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
      household,
    },
  })

  // 4) Swap / trade discretionary
  const foodAvg = Math.max(12, snapshot.food_out_avg)
  const swapsNeeded = Math.max(1, Math.ceil(amount / foodAvg))
  if (snapshot.food_out_count_28d >= 1 || amount <= foodAvg * 4) {
    const swapFraming =
      household === 'couple'
        ? `Swap ${swapsNeeded} food-out${swapsNeeded === 1 ? '' : 's'} into a shared “want” jar for ${wantLabel}.`
        : household === 'family'
          ? `Skip ${swapsNeeded} takeout run${swapsNeeded === 1 ? '' : 's'} and point that money at ${wantLabel} instead — same spend shape, kids still fed at home.`
          : `Swap ${swapsNeeded} eating-out trip${swapsNeeded === 1 ? '' : 's'} into a “want” jar for ${wantLabel}.`
    options.push({
      id: 'swap',
      kind: 'swap',
      title:
        swapsNeeded === 1
          ? 'Trade one food-out for this'
          : `Skip food-out ${swapsNeeded}×`,
      summary: `Your recent food-out average is ${moneyExact(foodAvg)}.`,
      detail: `${swapFraming} Same monthly flex — just pointed at the want.`,
      safe: true,
      recommended: snapshot.flex_now < amount && swapsNeeded <= 3,
      meta: { swaps: swapsNeeded, food_out_avg: foodAvg, household },
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
    detail: `From good days only — never from money earmarked for ${cliff?.name ?? 'essentials'} or your buffer floor. When the jar hits ${moneyExact(amount)}, ${wantLabel} is yours.`,
    safe: true,
    recommended: amount >= 40 && snapshot.buffer_days < 10,
    meta: { daily_sink: dailySink, sink_days: sinkDays, household },
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
      meta: { advance_fee: advanceFeeEstimate, fees_month: feesMonth, household },
    })
  }

  const rank: Record<string, number> = {
    flex: 0,
    delay: 1,
    earn: 2,
    swap: 3,
    sink: 4,
    'flex-tight': 5,
    wait: 6,
  }

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

  void recent_weeks

  return options.sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1
    return (rank[a.id] ?? 9) - (rank[b.id] ?? 9)
  })
}

function parseAsOf(asOf: string): Date {
  const d = new Date(`${asOf}T12:00:00`)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

function formatISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * Calm holiday/vacation plan: sink only from flex, protect cliffs & buffer.
 */
export function buildVacationPlan(
  worker: WorkerDemo,
  label: string,
  targetAmount: number,
  targetDateOrWeeks: { targetDate?: string; weeksAway?: number },
  household: HouseholdType = inferHousehold(worker),
): VacationPlan | null {
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) return null

  const asOf = parseAsOf(worker.as_of)
  let targetDate: Date
  if (targetDateOrWeeks.targetDate) {
    targetDate = parseAsOf(targetDateOrWeeks.targetDate)
  } else {
    const weeks = Math.max(1, targetDateOrWeeks.weeksAway ?? 6)
    targetDate = addDays(asOf, weeks * 7)
  }

  const msPerDay = 86400000
  const daysUntil = Math.max(0, Math.ceil((targetDate.getTime() - asOf.getTime()) / msPerDay))
  const weeksUntil = Math.max(1, Math.ceil(daysUntil / 7) || 1)

  const { snapshot, cliffs, next_cliff: cliff } = worker
  const netPerShift = Math.max(40, snapshot.shift_net_after_commute)
  // Flex share of a shift after commute — never claim rent/essentials/buffer
  const flexShare = 0.28
  const rawFlexPerShift = Math.max(12, netPerShift * flexShare)

  // Safe daily contribution: keep ~3 buffer days; scale down when buffer is thin
  const bufferFactor =
    snapshot.buffer_days >= 7 ? 1 : snapshot.buffer_days >= 3 ? 0.7 : snapshot.buffer_days >= 1.5 ? 0.4 : 0.2
  const workDaysPerWeek = Math.min(5, Math.max(2, Math.round(snapshot.work_days_28d / 4) || 3))
  const theoreticalDaily = (rawFlexPerShift * workDaysPerWeek) / 7
  const safeContributionDaily = Math.max(
    3,
    Math.round(Math.min(theoreticalDaily * bufferFactor, snapshot.flex_now > 0 ? snapshot.flex_now / 7 + theoreticalDaily : theoreticalDaily) * 2) / 2,
  )
  const safeContributionWeekly = Math.round(safeContributionDaily * 7)

  // Plan sink: enough to hit target by date, but never above safe contribution
  const neededDaily = daysUntil > 0 ? targetAmount / daysUntil : targetAmount
  const dailySink = Math.min(
    safeContributionDaily,
    Math.max(5, Math.round(neededDaily * 2) / 2),
  )
  const weeklySink = Math.round(dailySink * 7)

  const shiftsNeeded = Math.max(1, Math.ceil(targetAmount / rawFlexPerShift))

  // Ready-by if sticking to safe daily from good weeks
  const daysAtSafe = Math.ceil(targetAmount / Math.max(safeContributionDaily, 1))
  const readyByDate = formatISODate(addDays(asOf, daysAtSafe))
  const framing = householdFraming(household)
  const tripLabel = label.trim() || framing

  const timelineCopy =
    daysAtSafe <= daysUntil
      ? `You’ll be ready by ${readyByDate} if you stick to ${money(safeContributionDaily)}/day from good weeks — ahead of your ${formatISODate(targetDate)} target.`
      : `At a safe ${money(safeContributionDaily)}/day from flex only, you’d hit ${money(targetAmount)} around ${readyByDate}. Your ${formatISODate(targetDate)} date is tighter — stretch the date or pick up a few extra shifts.`

  // Cliffs progress — major essentials before target
  const relevantCliffs = (cliffs.length ? cliffs : cliff ? [cliff] : [])
    .filter((c) => c.days_until >= 0 && c.days_until <= Math.max(daysUntil, 21))
    .slice(0, 5)

  const cliffProgress: CliffProgress[] = relevantCliffs.map((c) => {
    let status: CliffProgress['status'] = 'protect'
    if (c.days_until > daysUntil) status = 'after'
    else if (c.days_until <= 0) status = 'clear'
    return {
      name: c.name,
      amount: c.amount,
      due_date: c.due_date,
      days_until: c.days_until,
      essential: c.essential,
      note: cliffProtectNote(c, household),
      status,
    }
  })

  // Warning: target before a major cliff would force advances
  const majorBeforeTarget = relevantCliffs.filter(
    (c) =>
      c.essential &&
      c.days_until < daysUntil &&
      c.amount >= Math.max(200, snapshot.buffer_floor * 0.5),
  )
  const shortfallRisk =
    snapshot.buffer_days < 3 &&
    majorBeforeTarget.length > 0 &&
    dailySink * Math.min(daysUntil, majorBeforeTarget[0].days_until) + snapshot.balance <
      majorBeforeTarget[0].amount + targetAmount * 0.3

  const cliffWarning =
    shortfallRisk ||
    (majorBeforeTarget.length > 0 &&
      snapshot.buffer_days < 5 &&
      neededDaily > safeContributionDaily * 1.15)

  const cliffWarningDetail = cliffWarning
    ? majorBeforeTarget[0]
      ? `Your ${tripLabel} target (${formatISODate(targetDate)}) lands while ${majorBeforeTarget[0].name} (${money(majorBeforeTarget[0].amount)}) is still ahead. Saving hard before that cliff risks advances. Protect ${majorBeforeTarget[0].name} first, then sink from flex on clearer weeks.`
      : `Hitting this vacation date while buffer days are thin could force an advance. Keep essentials and your safety floor first.`
    : null

  const bufferHealthy = snapshot.buffer_days >= 3
  const bufferNote = bufferHealthy
    ? `Buffer at ${snapshot.buffer_days.toFixed(1)} days — safe contribution keeps that floor intact.`
    : `Buffer is only ${snapshot.buffer_days.toFixed(1)} days. Safe contribution is dialed down so vacation never eats the floor.`

  return {
    label: tripLabel,
    targetAmount,
    targetDate: formatISODate(targetDate),
    daysUntil,
    weeksUntil,
    dailySink,
    weeklySink,
    shiftsNeeded,
    netPerShift: Math.round(netPerShift),
    safeContributionDaily,
    safeContributionWeekly,
    readyByDate,
    timelineCopy,
    framing,
    household,
    cliffWarning,
    cliffWarningDetail,
    cliffs: cliffProgress,
    bufferHealthy,
    bufferNote,
  }
}

export function cycleInsight(worker: WorkerDemo, household?: HouseholdType): string {
  const weeks = worker.recent_weeks
  const hh = household ?? inferHousehold(worker)
  if (!weeks.length) {
    return 'Your month isn’t one average — some weeks carry the bills, others look fine.'
  }
  const heavy = weeks.filter((w) => w.essential_expense > 800 || w.net < -200)
  const calm = weeks.filter((w) => w.net > 100 && w.essential_expense < 500)
  const fees = worker.snapshot.advance_fees_month
  const cliff = worker.next_cliff

  const householdHint =
    hh === 'family'
      ? ' Family wants and trips come after rent and kids’ essentials.'
      : hh === 'couple'
        ? ' Shared goals work best when both of you protect the same cliffs.'
        : ''

  if (heavy.length && calm.length && cliff) {
    return `Pattern: ${heavy.length} heavy week${heavy.length === 1 ? '' : 's'} vs ${calm.length} calmer one${calm.length === 1 ? '' : 's'}. ${cliff.name} in ${cliff.days_until} day${cliff.days_until === 1 ? '' : 's'} is the real pressure — not “bad spending.”${householdHint}`
  }
  if (fees > 0) {
    return `You’ve paid ${moneyExact(fees)} in advance fees this month. Affording wants by planning beats borrowing $40–$100 for groceries and bills.`
  }
  if (cliff) {
    return `Next pressure point: ${cliff.name} (${money(cliff.amount)}) ${daysLabel(cliff.days_until)}. We’ll protect that while finding a path to your want.${householdHint}`
  }
  return 'We’ll keep essentials and buffer days safe, then show honest paths to afford what you want.'
}

export { money, moneyExact }
