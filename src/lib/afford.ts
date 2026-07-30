import type {
  AffordOption,
  ChildrenCount,
  CliffProgress,
  HouseholdDetails,
  HouseholdType,
  IncomeSource,
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

export const CHILDREN_OPTIONS: ChildrenCount[] = [0, 1, 2, 3, 4]

export function childrenLabel(n: ChildrenCount): string {
  return n >= 4 ? '4+' : String(n)
}

/** Income source labels — wording shifts for solo vs couple/family. */
export function incomeSourceLabel(
  source: IncomeSource,
  type: HouseholdType,
): string {
  if (type === 'single') {
    if (source === 'side_gig') return 'Income + side gig'
    return 'One income'
  }
  if (source === 'both') return 'Both working'
  if (source === 'side_gig') return 'Primary + side gig'
  return 'Single income'
}

export function incomeSourcesFor(type: HouseholdType): IncomeSource[] {
  if (type === 'single') return ['one', 'side_gig']
  return ['one', 'both', 'side_gig']
}

export function partySize(details: HouseholdDetails): number {
  return details.adults + details.children
}

export function householdSummary(details: HouseholdDetails): string {
  const kids =
    details.children === 0
      ? 'no kids'
      : details.children >= 4
        ? '4+ kids'
        : `${details.children} kid${details.children === 1 ? '' : 's'}`
  const income = incomeSourceLabel(details.incomeSource, details.type)
  if (details.type === 'single' && details.children > 0) {
    return `Single parent · ${kids} · ${income}`
  }
  if (details.type === 'family') {
    return `${HOUSEHOLD_LABELS.family} · ${kids} · ${income}`
  }
  if (details.type === 'couple') {
    return `${HOUSEHOLD_LABELS.couple} · ${income}`
  }
  return `${HOUSEHOLD_LABELS.single} · ${income}`
}

/** Infer household type from demo worker profile; user can override in UI. */
export function inferHousehold(worker: WorkerDemo): HouseholdType {
  const { dependents, household_size } = worker.profile
  if (dependents > 0) return 'family'
  if (household_size <= 1) return 'single'
  return 'couple'
}

function clampChildren(n: number): ChildrenCount {
  if (n <= 0) return 0
  if (n === 1) return 1
  if (n === 2) return 2
  if (n === 3) return 3
  return 4
}

/** Default session household details from the demo worker profile. */
export function inferHouseholdDetails(worker: WorkerDemo): HouseholdDetails {
  const type = inferHousehold(worker)
  const { dependents, household_size, has_side_gig } = worker.profile
  const children = clampChildren(dependents)
  const adultsRaw = Math.max(1, household_size - dependents)
  const adults: 1 | 2 = adultsRaw >= 2 ? 2 : 1

  let incomeSource: IncomeSource
  if (has_side_gig) {
    incomeSource = 'side_gig'
  } else if (type === 'single') {
    incomeSource = 'one'
  } else {
    // Couple / family without a side gig: assume dual income when two adults.
    incomeSource = adults === 2 ? 'both' : 'one'
  }

  if (type === 'couple') {
    return { type: 'couple', adults: 2, children: 0, incomeSource }
  }
  if (type === 'single') {
    return { type: 'single', adults: 1, children: 0, incomeSource }
  }
  return {
    type: 'family',
    adults,
    children: children > 0 ? children : 1,
    incomeSource,
  }
}

/**
 * Apply a household-type change while keeping income/kids coherent.
 * Couple locks kids at 0; Family keeps or seeds kids; Single clears kids.
 */
export function applyHouseholdType(
  prev: HouseholdDetails,
  nextType: HouseholdType,
): HouseholdDetails {
  const sources = incomeSourcesFor(nextType)
  const incomeSource = sources.includes(prev.incomeSource)
    ? prev.incomeSource
    : sources[0]

  if (nextType === 'couple') {
    return { type: 'couple', adults: 2, children: 0, incomeSource }
  }
  if (nextType === 'single') {
    return {
      type: 'single',
      adults: 1,
      children: 0,
      incomeSource: incomeSource === 'both' ? 'one' : incomeSource,
    }
  }
  return {
    type: 'family',
    adults: prev.adults,
    children: prev.children > 0 ? prev.children : 1,
    incomeSource,
  }
}

/**
 * Changing kids can promote Couple → Family, or Single → Family (single parent).
 * Family with 0 kids demotes to Couple (2 adults) or Single (1 adult).
 */
export function applyChildrenCount(
  prev: HouseholdDetails,
  children: ChildrenCount,
): HouseholdDetails {
  if (children > 0) {
    if (prev.type === 'couple') {
      return { ...prev, type: 'family', adults: 2, children }
    }
    if (prev.type === 'single') {
      return {
        ...prev,
        type: 'family',
        adults: 1,
        children,
        incomeSource: prev.incomeSource === 'both' ? 'one' : prev.incomeSource,
      }
    }
    return { ...prev, type: 'family', children }
  }

  // Zero kids
  if (prev.type === 'family') {
    if (prev.adults === 1) {
      return {
        type: 'single',
        adults: 1,
        children: 0,
        incomeSource: prev.incomeSource === 'both' ? 'one' : prev.incomeSource,
      }
    }
    return {
      type: 'couple',
      adults: 2,
      children: 0,
      incomeSource: prev.incomeSource,
    }
  }
  return { ...prev, children: 0 }
}

export function applyIncomeSource(
  prev: HouseholdDetails,
  incomeSource: IncomeSource,
): HouseholdDetails {
  const allowed = incomeSourcesFor(prev.type)
  if (!allowed.includes(incomeSource)) return prev
  return { ...prev, incomeSource }
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

function scaleAmount(amount: number, factor: number): number {
  return Math.max(10, Math.round((amount * factor) / 5) * 5)
}

/** Want presets shaped by household type, kids count, and income source. */
export function wantPresetsFor(
  household: HouseholdType | HouseholdDetails,
): WantPreset[] {
  const details: HouseholdDetails =
    typeof household === 'string'
      ? { type: household, adults: household === 'single' ? 1 : 2, children: household === 'family' ? 2 : 0, incomeSource: 'one' }
      : household

  const base = WANT_PRESETS[details.type].map((p) => ({ ...p }))

  if (details.type === 'family') {
    const kidFactor =
      details.children >= 4 ? 1.35 : details.children === 3 ? 1.25 : details.children === 2 ? 1.15 : 1
    for (const p of base) {
      if (/kids|family day|birthday|sports/i.test(p.label)) {
        p.amount = scaleAmount(p.amount, kidFactor)
      }
    }
    if (details.children >= 2) {
      const dayOut = base.find((p) => p.label === 'Family day out')
      if (dayOut) dayOut.label = `Family day out (${details.children >= 4 ? '4+' : details.children} kids)`
    }
    if (details.adults === 1) {
      base.unshift({ label: 'Solo recharge hour', amount: 30 })
    }
  }

  if (details.type === 'couple' && details.incomeSource === 'both') {
    const date = base.find((p) => p.label === 'Date night')
    if (date) {
      date.label = 'Dual-income date night'
      date.amount = scaleAmount(date.amount, 1.15)
    }
  }

  if (details.incomeSource === 'side_gig') {
    const already = base.some((p) => /side.?gig/i.test(p.label))
    if (!already) {
      base.splice(1, 0, {
        label: details.type === 'single' ? 'Side-gig treat' : 'Primary + gig treat',
        amount: details.type === 'family' ? 55 : 40,
      })
    }
  }

  if (details.incomeSource === 'both' && details.type === 'family') {
    const concert = base.find((p) => /concert/i.test(p.label))
    if (concert) concert.amount = scaleAmount(concert.amount, 1.1)
  }

  return base.slice(0, 10)
}

/** Vacation ideas shaped by household, party size, and income. */
export function vacationSuggestionsFor(
  household: HouseholdType | HouseholdDetails,
): VacationSuggestion[] {
  const details: HouseholdDetails =
    typeof household === 'string'
      ? { type: household, adults: household === 'single' ? 1 : 2, children: household === 'family' ? 2 : 0, incomeSource: 'one' }
      : household

  const base = VACATION_SUGGESTIONS[details.type].map((v) => ({ ...v }))
  const size = partySize(details)

  if (details.type === 'family') {
    const sizeFactor =
      size >= 6 ? 1.45 : size === 5 ? 1.3 : size === 4 ? 1.15 : size === 3 ? 1.05 : 1
    for (const v of base) {
      v.amount = scaleAmount(v.amount, sizeFactor)
    }
    if (base[0]) {
      base[0].label =
        details.adults === 1
          ? `Single-parent day trip (party of ${size})`
          : `Family of ${size} day trip`
    }
    if (base[3]) {
      base[3].label =
        details.adults === 1
          ? `Summer break for ${size}`
          : `Summer family of ${size} vacation`
    }
  }

  if (details.type === 'couple' && details.incomeSource === 'both') {
    if (base[0]) {
      base[0].label = 'Dual-income couple getaway'
      base[0].amount = scaleAmount(base[0].amount, 1.1)
    }
  }

  if (details.incomeSource === 'side_gig' && details.type !== 'family') {
    base.splice(1, 0, {
      label: 'Side-gig funded long weekend',
      amount: details.type === 'couple' ? 420 : 300,
      weeksAway: 5,
    })
    return base.slice(0, 4)
  }

  return base
}

export function householdFraming(details: HouseholdDetails): string {
  const size = partySize(details)
  if (details.children > 0) {
    if (details.adults === 1) return `single-parent family of ${size} trip`
    return `family of ${size} trip`
  }
  if (details.type === 'couple' || details.adults === 2) return 'couple getaway'
  return 'solo break'
}

function cliffProtectNote(
  cliff: { name: string; category: string },
  details: HouseholdDetails,
): string {
  const name = cliff.name.toLowerCase()
  const cat = cliff.category.toLowerCase()
  if (
    details.children > 0 &&
    (cat.includes('child') || name.includes('child') || name.includes('care'))
  ) {
    return details.children >= 3
      ? 'Protect childcare / kids essentials harder — more dependents raise the floor before vacation sink.'
      : 'Protect childcare / kids essentials before vacation sink.'
  }
  if (cat === 'housing' || name.includes('rent')) {
    return 'Never starve rent week to fund vacation.'
  }
  if (cat === 'utilities' || cat === 'phone') {
    return 'Keep this essential paid — sink only from flex after it clears.'
  }
  return 'Clear this cliff first; vacation money waits on good weeks.'
}

function resolveDetails(
  worker: WorkerDemo,
  household?: HouseholdType | HouseholdDetails,
): HouseholdDetails {
  if (!household) return inferHouseholdDetails(worker)
  if (typeof household === 'string') {
    return applyHouseholdType(inferHouseholdDetails(worker), household)
  }
  return household
}

/**
 * Hero engine: turn a discretionary want into ranked safe paths.
 * Protects essentials, next cliff, and a ~3-day buffer before saying yes.
 */
export function buildAffordOptions(
  worker: WorkerDemo,
  wantLabel: string,
  amount: number,
  household: HouseholdType | HouseholdDetails = inferHousehold(worker),
): AffordOption[] {
  if (!Number.isFinite(amount) || amount <= 0) return []

  const details = resolveDetails(worker, household)
  const { snapshot, next_cliff: cliff, recent_weeks } = worker
  const options: AffordOption[] = []
  const advanceFeeEstimate = 2.99
  const wouldNeedAdvance =
    snapshot.balance < amount + snapshot.buffer_floor * 0.25 ||
    snapshot.buffer_days < 2

  const kidsProtect =
    details.children > 0
      ? details.children >= 3
        ? ` With ${childrenLabel(details.children)} kids, treats only come from flex — never from rent, groceries buffer, or childcare cliffs.`
        : ' Kids treats and family days only come from flex — never from rent, groceries buffer, or childcare cliffs.'
      : ''

  const incomeNote =
    details.incomeSource === 'both'
      ? ' Dual income helps — still park wants after shared cliffs clear.'
      : details.incomeSource === 'side_gig'
        ? ' Side-gig cash is great for wants once essentials and buffer are covered.'
        : ''

  // 1) Spend from flex now
  if (snapshot.flex_now >= amount && snapshot.buffer_days >= 3) {
    options.push({
      id: 'flex',
      kind: 'flex',
      title: 'Spend from flex — you’re clear',
      summary: `You have ${money(snapshot.flex_now)} flex after essentials and your buffer.`,
      detail: `${wantLabel} at ${moneyExact(amount)} fits today without touching rent, bills, or your 3-day safety floor.${kidsProtect}${incomeNote}`,
      safe: true,
      recommended: true,
      meta: {
        flex: snapshot.flex_now,
        amount,
        household: details.type,
        children: details.children,
        incomeSource: details.incomeSource,
      },
    })
  } else if (snapshot.flex_now >= amount && snapshot.buffer_days < 3) {
    options.push({
      id: 'flex-tight',
      kind: 'flex',
      title: 'Technically possible — buffer is thin',
      summary: `Flex covers it, but you only have ${snapshot.buffer_days.toFixed(1)} safe days.`,
      detail: `Buying now keeps you above essentials on paper, but leaves little room if a shift falls through. Prefer delay or earn if you can.${kidsProtect}`,
      safe: false,
      recommended: false,
      meta: {
        buffer_days: snapshot.buffer_days,
        household: details.type,
        children: details.children,
      },
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
      details.children > 0 &&
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
        household: details.type,
      },
    })
  }

  // 3) Earn it with shifts
  const netPerShift = Math.max(40, snapshot.shift_net_after_commute)
  const flexPerShift = Math.max(15, netPerShift * 0.35)
  const shiftsNeeded = Math.max(1, Math.ceil(amount / flexPerShift))
  const earnDays = shiftsNeeded
  const earnExtra =
    details.incomeSource === 'side_gig'
      ? ' A side-gig day can accelerate the same jar without touching rent week.'
      : details.incomeSource === 'both'
        ? ' Two earners can split the park-toward-want if you both agree on the cliff order.'
        : ''
  options.push({
    id: 'earn',
    kind: 'earn',
    title:
      shiftsNeeded === 1
        ? 'Earn it with one shift'
        : `Earn it across ${shiftsNeeded} shifts`,
    summary: `About ${money(netPerShift)} take-home after commute per shift.`,
    detail: `Work ${shiftsNeeded} ${shiftsNeeded === 1 ? 'shift' : 'shifts'} and park ~${money(flexPerShift)} each toward ${wantLabel}. Roughly ${earnDays} workday${earnDays === 1 ? '' : 's'} to unlock a guilt-free yes.${earnExtra}`,
    safe: true,
    recommended: snapshot.flex_now < amount,
    meta: {
      shifts: shiftsNeeded,
      net_per_shift: Math.round(netPerShift),
      flex_per_shift: Math.round(flexPerShift),
      household: details.type,
      incomeSource: details.incomeSource,
    },
  })

  // 4) Swap / trade discretionary
  const foodAvg = Math.max(12, snapshot.food_out_avg)
  const swapsNeeded = Math.max(1, Math.ceil(amount / foodAvg))
  if (snapshot.food_out_count_28d >= 1 || amount <= foodAvg * 4) {
    const swapFraming =
      details.type === 'couple'
        ? `Swap ${swapsNeeded} food-out${swapsNeeded === 1 ? '' : 's'} into a shared “want” jar for ${wantLabel}.`
        : details.children > 0
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
      meta: { swaps: swapsNeeded, food_out_avg: foodAvg, household: details.type },
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
    meta: { daily_sink: dailySink, sink_days: sinkDays, household: details.type },
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
      meta: { advance_fee: advanceFeeEstimate, fees_month: feesMonth, household: details.type },
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
  household: HouseholdType | HouseholdDetails = inferHousehold(worker),
): VacationPlan | null {
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) return null

  const details = resolveDetails(worker, household)
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
  const framing = householdFraming(details)
  const tripLabel = label.trim() || framing
  const size = partySize(details)

  const timelineCopy =
    daysAtSafe <= daysUntil
      ? `You’ll be ready by ${readyByDate} if you stick to ${money(safeContributionDaily)}/day from good weeks — ahead of your ${formatISODate(targetDate)} target for this ${framing}.`
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
      note: cliffProtectNote(c, details),
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
    ? `Buffer at ${snapshot.buffer_days.toFixed(1)} days — safe contribution keeps that floor intact${details.children >= 3 ? ' while kids’ essentials stay first' : ''}.`
    : `Buffer is only ${snapshot.buffer_days.toFixed(1)} days. Safe contribution is dialed down so vacation never eats the floor.`

  void size

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
    household: details.type,
    children: details.children,
    incomeSource: details.incomeSource,
    partySize: size,
    cliffWarning,
    cliffWarningDetail,
    cliffs: cliffProgress,
    bufferHealthy,
    bufferNote,
  }
}

export function cycleInsight(
  worker: WorkerDemo,
  household?: HouseholdType | HouseholdDetails,
): string {
  const weeks = worker.recent_weeks
  const details = resolveDetails(worker, household)
  if (!weeks.length) {
    return 'Your month isn’t one average — some weeks carry the bills, others look fine.'
  }
  const heavy = weeks.filter((w) => w.essential_expense > 800 || w.net < -200)
  const calm = weeks.filter((w) => w.net > 100 && w.essential_expense < 500)
  const fees = worker.snapshot.advance_fees_month
  const cliff = worker.next_cliff

  const incomeHint =
    details.incomeSource === 'both'
      ? ' Both working helps — still protect the same cliffs together.'
      : details.incomeSource === 'side_gig'
        ? ' Side-gig weeks are for buffer and wants after essentials clear.'
        : ''

  const householdHint =
    details.children >= 3
      ? ` With ${childrenLabel(details.children)} kids, protect essentials harder before wants or trips.`
      : details.children > 0
        ? details.adults === 1
          ? ' Single-parent wants and trips come after rent and kids’ essentials.'
          : ' Family wants and trips come after rent and kids’ essentials.'
        : details.type === 'couple'
          ? ` Shared goals work best when both of you protect the same cliffs.${incomeHint}`
          : incomeHint

  if (heavy.length && calm.length && cliff) {
    return `Pattern: ${heavy.length} heavy week${heavy.length === 1 ? '' : 's'} vs ${calm.length} calmer one${calm.length === 1 ? '' : 's'}. ${cliff.name} in ${cliff.days_until} day${cliff.days_until === 1 ? '' : 's'} is the real pressure — not “bad spending.”${householdHint}`
  }
  if (fees > 0) {
    return `You’ve paid ${moneyExact(fees)} in advance fees this month. Affording wants by planning beats borrowing $40–$100 for groceries and bills.${incomeHint}`
  }
  if (cliff) {
    return `Next pressure point: ${cliff.name} (${money(cliff.amount)}) ${daysLabel(cliff.days_until)}. We’ll protect that while finding a path to your want.${householdHint}`
  }
  return `We’ll keep essentials and buffer days safe, then show honest paths to afford what you want.${householdHint}`
}

export { money, moneyExact }
