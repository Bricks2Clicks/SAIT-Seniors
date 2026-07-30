export type Cliff = {
  id: string
  name: string
  category: string
  amount: number
  due_date: string
  days_until: number
  essential: boolean
  autopay: boolean
}

export type HouseholdType = 'family' | 'single' | 'couple'

export type WorkerDemo = {
  worker_id: string
  as_of: string
  profile: {
    city: string
    occupation: string
    pay_type: string
    typical_daily_net: number
    income_volatility: number
    household_size: number
    dependents: number
    commute_mode: string
    rent_burden_band: string
    has_side_gig: boolean
    has_bank_account: boolean
  }
  snapshot: {
    balance: number
    buffer_days: number
    buffer_capped: boolean
    flex_now: number
    buffer_floor: number
    essential_due_14d: number
    avg_shift_net: number
    commute_per_day: number
    shift_net_after_commute: number
    food_out_avg: number
    food_out_count_28d: number
    work_days_28d: number
    advance_count_month: number
    advance_fees_month: number
    advance_reasons: Record<string, number>
  }
  next_cliff: Cliff | null
  cliffs: Cliff[]
  recent_weeks: Array<{
    week_start: string
    income: number
    expense: number
    essential_expense: number
    net: number
    buffer_days: number | null
    advances: number
    advance_fees: number
  }>
  want_presets: Array<{ label: string; amount: number }>
}

export type DemoData = {
  app: string
  as_of: string
  currency: string
  workers: WorkerDemo[]
  picker: Array<{
    worker_id: string
    label: string
    pay_type: string
    rent_burden_band: string
    buffer_days: number
  }>
}

export type OptionKind =
  | 'flex'
  | 'delay'
  | 'earn'
  | 'swap'
  | 'sink'
  | 'wait'

export type AffordOption = {
  id: string
  kind: OptionKind
  title: string
  summary: string
  detail: string
  safe: boolean
  recommended: boolean
  meta: Record<string, string | number | boolean>
}

export type WantPreset = {
  label: string
  amount: number
}

export type VacationSuggestion = {
  label: string
  amount: number
  weeksAway: number
}

export type CliffProgress = {
  name: string
  amount: number
  due_date: string
  days_until: number
  essential: boolean
  note: string
  status: 'protect' | 'clear' | 'after'
}

export type VacationPlan = {
  label: string
  targetAmount: number
  targetDate: string
  daysUntil: number
  weeksUntil: number
  dailySink: number
  weeklySink: number
  shiftsNeeded: number
  netPerShift: number
  safeContributionDaily: number
  safeContributionWeekly: number
  readyByDate: string
  timelineCopy: string
  framing: string
  household: HouseholdType
  cliffWarning: boolean
  cliffWarningDetail: string | null
  cliffs: CliffProgress[]
  bufferHealthy: boolean
  bufferNote: string
}
