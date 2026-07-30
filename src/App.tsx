import { useEffect, useMemo, useState } from 'react'
import {
  AMOUNT_CHIPS,
  CHILDREN_OPTIONS,
  HOUSEHOLD_LABELS,
  applyChildrenCount,
  applyHouseholdType,
  applyIncomeSource,
  buildAffordOptions,
  buildVacationPlan,
  childrenLabel,
  cycleInsight,
  householdFraming,
  householdSummary,
  incomeSourceLabel,
  incomeSourcesFor,
  inferHouseholdDetails,
  money,
  moneyExact,
  vacationSuggestionsFor,
  wantPresetsFor,
} from './lib/afford'
import type {
  AffordOption,
  ChildrenCount,
  DemoData,
  HouseholdDetails,
  HouseholdType,
  IncomeSource,
  OptionKind,
  WorkerDemo,
} from './lib/types'
import './App.css'

type Mode = 'want' | 'vacation'

const KIND_LABEL: Record<OptionKind, string> = {
  flex: 'Spend now',
  delay: 'Wait',
  earn: 'Earn it',
  swap: 'Trade',
  sink: 'Save toward',
  wait: 'Protect',
}

const HOUSEHOLD_OPTIONS: HouseholdType[] = ['family', 'single', 'couple']

const DEFAULT_HOUSEHOLD: HouseholdDetails = {
  type: 'single',
  adults: 1,
  children: 0,
  incomeSource: 'one',
}

function bufferTone(days: number): 'ok' | 'watch' | 'tight' {
  if (days >= 7) return 'ok'
  if (days >= 3) return 'watch'
  return 'tight'
}

function OptionCard({
  option,
  selected,
  onSelect,
}: {
  option: AffordOption
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`option-card ${option.recommended ? 'is-recommended' : ''} ${selected ? 'is-selected' : ''} ${option.safe ? '' : 'is-caution'}`}
      onClick={onSelect}
    >
      <div className="option-card__top">
        <span className="option-kind">{KIND_LABEL[option.kind]}</span>
        {option.recommended && <span className="option-badge">Best fit</span>}
      </div>
      <h3>{option.title}</h3>
      <p className="option-summary">{option.summary}</p>
      <p className="option-detail">{option.detail}</p>
    </button>
  )
}

function syncPresetsForHousehold(
  next: HouseholdDetails,
  mode: Mode,
  setters: {
    setWantLabel: (v: string) => void
    setAmount: (v: number) => void
    setAmountInput: (v: string) => void
    setHasAsked: (v: boolean) => void
    setSelectedOptionId: (v: string | null) => void
    setVacLabel: (v: string) => void
    setVacAmountInput: (v: string) => void
    setVacWeeksInput: (v: string) => void
    setVacAsked: (v: boolean) => void
  },
) {
  const nextPresets = wantPresetsFor(next)
  if (nextPresets[0] && mode === 'want') {
    setters.setWantLabel(nextPresets[0].label)
    setters.setAmount(nextPresets[0].amount)
    setters.setAmountInput(String(nextPresets[0].amount))
    setters.setHasAsked(false)
    setters.setSelectedOptionId(null)
  }
  const vac = vacationSuggestionsFor(next)[0]
  if (vac && mode === 'vacation') {
    setters.setVacLabel(vac.label)
    setters.setVacAmountInput(String(vac.amount))
    setters.setVacWeeksInput(String(vac.weeksAway))
    setters.setVacAsked(false)
  }
}

export default function App() {
  const [data, setData] = useState<DemoData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [workerId, setWorkerId] = useState<string>('')
  const [mode, setMode] = useState<Mode>('want')
  const [household, setHousehold] = useState<HouseholdDetails>(DEFAULT_HOUSEHOLD)
  const [householdTouched, setHouseholdTouched] = useState(false)

  const [wantLabel, setWantLabel] = useState('Night out')
  const [amount, setAmount] = useState(45)
  const [amountInput, setAmountInput] = useState('45')
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [hasAsked, setHasAsked] = useState(false)

  const [vacLabel, setVacLabel] = useState('Long weekend Banff')
  const [vacAmountInput, setVacAmountInput] = useState('450')
  const [vacWeeksInput, setVacWeeksInput] = useState('6')
  const [vacDateInput, setVacDateInput] = useState('')
  const [vacUseDate, setVacUseDate] = useState(false)
  const [vacAsked, setVacAsked] = useState(false)

  useEffect(() => {
    fetch('/data/demo.json')
      .then((r) => {
        if (!r.ok) throw new Error('Could not load demo data')
        return r.json()
      })
      .then((json: DemoData) => {
        setData(json)
        const first = json.workers[0]
        setWorkerId(first?.worker_id ?? '')
        if (first) {
          const hh = inferHouseholdDetails(first)
          setHousehold(hh)
          const presets = wantPresetsFor(hh)
          if (presets[0]) {
            setWantLabel(presets[0].label)
            setAmount(presets[0].amount)
            setAmountInput(String(presets[0].amount))
          }
          const vac = vacationSuggestionsFor(hh)[0]
          if (vac) {
            setVacLabel(vac.label)
            setVacAmountInput(String(vac.amount))
            setVacWeeksInput(String(vac.weeksAway))
          }
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const worker: WorkerDemo | undefined = useMemo(
    () => data?.workers.find((w) => w.worker_id === workerId),
    [data, workerId],
  )

  useEffect(() => {
    if (!worker || householdTouched) return
    const hh = inferHouseholdDetails(worker)
    setHousehold(hh)
    const presets = wantPresetsFor(hh)
    if (presets[0] && !hasAsked) {
      setWantLabel(presets[0].label)
      setAmount(presets[0].amount)
      setAmountInput(String(presets[0].amount))
    }
    if (!vacAsked) {
      const vac = vacationSuggestionsFor(hh)[0]
      if (vac) {
        setVacLabel(vac.label)
        setVacAmountInput(String(vac.amount))
        setVacWeeksInput(String(vac.weeksAway))
      }
    }
  }, [worker, householdTouched, hasAsked, vacAsked])

  const presets = useMemo(() => wantPresetsFor(household), [household])
  const vacSuggestions = useMemo(() => vacationSuggestionsFor(household), [household])
  const framing = useMemo(() => householdFraming(household), [household])
  const incomeOptions = useMemo(
    () => incomeSourcesFor(household.type),
    [household.type],
  )

  const options = useMemo(() => {
    if (!worker || !hasAsked) return []
    return buildAffordOptions(worker, wantLabel.trim() || 'this', amount, household)
  }, [worker, wantLabel, amount, hasAsked, household])

  const vacationPlan = useMemo(() => {
    if (!worker || !vacAsked) return null
    const parsed = Number.parseFloat(vacAmountInput.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    const weeks = Number.parseInt(vacWeeksInput, 10)
    return buildVacationPlan(
      worker,
      vacLabel,
      parsed,
      vacUseDate && vacDateInput
        ? { targetDate: vacDateInput }
        : { weeksAway: Number.isFinite(weeks) && weeks > 0 ? weeks : 6 },
      household,
    )
  }, [
    worker,
    vacAsked,
    vacAmountInput,
    vacWeeksInput,
    vacUseDate,
    vacDateInput,
    vacLabel,
    household,
  ])

  useEffect(() => {
    if (!options.length) {
      setSelectedOptionId(null)
      return
    }
    const best = options.find((o) => o.recommended) ?? options[0]
    setSelectedOptionId(best.id)
  }, [options])

  const selected = options.find((o) => o.id === selectedOptionId) ?? null
  const insight = worker ? cycleInsight(worker, household) : ''
  const tone = worker ? bufferTone(worker.snapshot.buffer_days) : 'watch'

  function askAfford(e?: React.FormEvent) {
    e?.preventDefault()
    const parsed = Number.parseFloat(amountInput.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(parsed) || parsed <= 0) return
    setAmount(parsed)
    setHasAsked(true)
  }

  function applyPreset(label: string, value: number) {
    setWantLabel(label)
    setAmount(value)
    setAmountInput(String(value))
    setHasAsked(true)
  }

  function applyAmountChip(value: number) {
    setAmountInput(String(value))
    setAmount(value)
    if (hasAsked) setHasAsked(true)
  }

  function askVacation(e?: React.FormEvent) {
    e?.preventDefault()
    const parsed = Number.parseFloat(vacAmountInput.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(parsed) || parsed <= 0) return
    setVacAsked(true)
  }

  function applyVacSuggestion(label: string, amount: number, weeksAway: number) {
    setVacLabel(label)
    setVacAmountInput(String(amount))
    setVacWeeksInput(String(weeksAway))
    setVacUseDate(false)
    setVacAsked(true)
  }

  const presetSetters = {
    setWantLabel,
    setAmount,
    setAmountInput,
    setHasAsked,
    setSelectedOptionId,
    setVacLabel,
    setVacAmountInput,
    setVacWeeksInput,
    setVacAsked,
  }

  function onHouseholdChange(nextType: HouseholdType) {
    const next = applyHouseholdType(household, nextType)
    setHousehold(next)
    setHouseholdTouched(true)
    syncPresetsForHousehold(next, mode, presetSetters)
  }

  function onChildrenChange(nextKids: ChildrenCount) {
    const next = applyChildrenCount(household, nextKids)
    setHousehold(next)
    setHouseholdTouched(true)
    syncPresetsForHousehold(next, mode, presetSetters)
  }

  function onIncomeChange(nextIncome: IncomeSource) {
    const next = applyIncomeSource(household, nextIncome)
    setHousehold(next)
    setHouseholdTouched(true)
    syncPresetsForHousehold(next, mode, presetSetters)
  }

  if (error) {
    return (
      <div className="shell">
        <p className="error-state">{error}</p>
      </div>
    )
  }

  if (!data || !worker) {
    return (
      <div className="shell">
        <p className="loading-state">Loading Unstuck…</p>
      </div>
    )
  }

  const cliff = worker.next_cliff
  const snap = worker.snapshot
  const kidsLockedCouple = household.type === 'couple'

  return (
    <div className="shell">
      <div className="atmosphere" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Unstuck</span>
          <span className="brand-tag">Afford wants without the trap</span>
        </div>
        <label className="worker-picker">
          <span>Demo worker</span>
          <select
            value={workerId}
            onChange={(e) => {
              setWorkerId(e.target.value)
              setHouseholdTouched(false)
              setHasAsked(false)
              setVacAsked(false)
              setSelectedOptionId(null)
            }}
          >
            {data.picker.map((p) => (
              <option key={p.worker_id} value={p.worker_id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="controls-bar">
        <div className="segmented" role="tablist" aria-label="Planner mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'want'}
            className={mode === 'want' ? 'is-active' : ''}
            onClick={() => setMode('want')}
          >
            Afford a want
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'vacation'}
            className={mode === 'vacation' ? 'is-active' : ''}
            onClick={() => setMode('vacation')}
          >
            Holidays &amp; vacations
          </button>
        </div>

        <div className="household-block">
          <p className="household-label">Household</p>
          <div className="segmented segmented--compact" role="group" aria-label="Household type">
            {HOUSEHOLD_OPTIONS.map((h) => (
              <button
                key={h}
                type="button"
                className={household.type === h ? 'is-active' : ''}
                onClick={() => onHouseholdChange(h)}
              >
                {HOUSEHOLD_LABELS[h]}
              </button>
            ))}
          </div>

          <div className="household-details">
            <div className="household-detail">
              <p className="household-label">Children</p>
              <div
                className="segmented segmented--compact segmented--chips"
                role="group"
                aria-label="Number of children"
              >
                {CHILDREN_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={household.children === n ? 'is-active' : ''}
                    title={
                      kidsLockedCouple && n > 0
                        ? 'Adds kids and switches to Family'
                        : household.type === 'single' && n > 0
                          ? 'Adds kids as a single-parent Family'
                          : undefined
                    }
                    onClick={() => onChildrenChange(n)}
                  >
                    {childrenLabel(n)}
                  </button>
                ))}
              </div>
              {kidsLockedCouple && (
                <p className="household-hint">Couple stays at 0 — pick 1+ to switch to Family.</p>
              )}
              {household.type === 'single' && (
                <p className="household-hint">Add kids to plan as a single-parent family.</p>
              )}
              {household.type === 'family' && household.adults === 1 && (
                <p className="household-hint">Framed as single-parent family.</p>
              )}
            </div>

            <div className="household-detail">
              <p className="household-label">Source of income</p>
              <div
                className="segmented segmented--compact"
                role="group"
                aria-label="Source of income"
              >
                {incomeOptions.map((src) => (
                  <button
                    key={src}
                    type="button"
                    className={household.incomeSource === src ? 'is-active' : ''}
                    onClick={() => onIncomeChange(src)}
                  >
                    {incomeSourceLabel(src, household.type)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="layout">
        {mode === 'want' ? (
          <section className="hero-panel">
            <p className="eyebrow">
              As of {worker.as_of} · {householdSummary(household)}
            </p>
            <h1>
              How can I <em>afford</em> this?
            </h1>
            <p className="hero-lede">
              Tell Unstuck what you want. We’ll show honest paths that protect rent,
              essentials, and your safe days — so a yes doesn’t pull you back into the cycle.
            </p>

            <form className="want-form" onSubmit={askAfford}>
              <label className="field grow">
                <span>What do you want?</span>
                <input
                  value={wantLabel}
                  onChange={(e) => setWantLabel(e.target.value)}
                  placeholder="Night out, shoes, kids treat…"
                  required
                />
              </label>
              <label className="field amount">
                <span>Amount (CAD)</span>
                <input
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  aria-label="Amount in CAD"
                />
              </label>
              <button type="submit" className="cta">
                Show me paths
              </button>
            </form>

            <div className="amount-chips" aria-label="Quick amounts">
              {AMOUNT_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={`amount-chip ${Number(amountInput) === chip ? 'is-active' : ''}`}
                  onClick={() => applyAmountChip(chip)}
                >
                  {money(chip)}
                </button>
              ))}
            </div>

            <div className="presets" aria-label="Quick wants">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="preset"
                  onClick={() => applyPreset(p.label, p.amount)}
                >
                  {p.label}
                  <span>{money(p.amount)}</span>
                </button>
              ))}
            </div>

            {hasAsked && (
              <div className="results">
                <div className="results-head">
                  <h2>
                    Paths to afford <span>{wantLabel}</span> ({moneyExact(amount)})
                  </h2>
                  <p>Ranked for your buffer, next cliff, and advance risk.</p>
                </div>

                <div className="option-grid">
                  {options.map((opt) => (
                    <OptionCard
                      key={opt.id}
                      option={opt}
                      selected={selectedOptionId === opt.id}
                      onSelect={() => setSelectedOptionId(opt.id)}
                    />
                  ))}
                </div>

                {selected && (
                  <div className="path-focus" role="status">
                    <p className="path-focus__label">Your path</p>
                    <h3>{selected.title}</h3>
                    <p>{selected.detail}</p>
                    {selected.kind === 'wait' && snap.advance_count_month > 0 && (
                      <p className="path-focus__warn">
                        Advance alert: {snap.advance_count_month} advance
                        {snap.advance_count_month === 1 ? '' : 's'} this month ·{' '}
                        {moneyExact(snap.advance_fees_month)} in fees so far.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          <section className="hero-panel vacation-panel">
            <p className="eyebrow">
              Without feeling the pinch · {householdSummary(household)}
            </p>
            <h1>
              Plan a <em>holiday</em> that doesn’t hurt
            </h1>
            <p className="hero-lede">
              Holidays are allowed. Unstuck builds a calm sink from flex only — never from
              rent, essentials, or your buffer — so your {framing} doesn’t restart the advance cycle.
            </p>

            <form className="want-form vacation-form" onSubmit={askVacation}>
              <label className="field grow">
                <span>Destination / label</span>
                <input
                  value={vacLabel}
                  onChange={(e) => setVacLabel(e.target.value)}
                  placeholder="Long weekend Banff, visit family…"
                  required
                />
              </label>
              <label className="field amount">
                <span>Target (CAD)</span>
                <input
                  inputMode="decimal"
                  value={vacAmountInput}
                  onChange={(e) => setVacAmountInput(e.target.value)}
                  aria-label="Vacation target amount in CAD"
                />
              </label>
              {!vacUseDate ? (
                <label className="field amount">
                  <span>Weeks away</span>
                  <input
                    inputMode="numeric"
                    value={vacWeeksInput}
                    onChange={(e) => setVacWeeksInput(e.target.value)}
                    aria-label="Weeks until vacation"
                  />
                </label>
              ) : (
                <label className="field amount">
                  <span>Target date</span>
                  <input
                    type="date"
                    value={vacDateInput}
                    onChange={(e) => setVacDateInput(e.target.value)}
                    aria-label="Vacation target date"
                  />
                </label>
              )}
              <button type="submit" className="cta">
                Show calm plan
              </button>
            </form>

            <div className="date-toggle-row">
              <button
                type="button"
                className={`text-toggle ${!vacUseDate ? 'is-active' : ''}`}
                onClick={() => setVacUseDate(false)}
              >
                Weeks away
              </button>
              <button
                type="button"
                className={`text-toggle ${vacUseDate ? 'is-active' : ''}`}
                onClick={() => setVacUseDate(true)}
              >
                Exact date
              </button>
            </div>

            <div className="presets" aria-label="Vacation ideas">
              {vacSuggestions.map((v) => (
                <button
                  key={v.label}
                  type="button"
                  className="preset"
                  onClick={() => applyVacSuggestion(v.label, v.amount, v.weeksAway)}
                >
                  {v.label}
                  <span>
                    {money(v.amount)} · {v.weeksAway}w
                  </span>
                </button>
              ))}
            </div>

            {vacAsked && vacationPlan && (
              <div className="results vacation-results">
                <div className="results-head">
                  <h2>
                    No-pinch plan for <span>{vacationPlan.label}</span>
                  </h2>
                  <p>
                    {money(vacationPlan.targetAmount)} by {vacationPlan.targetDate} · a grounded{' '}
                    {vacationPlan.framing}
                  </p>
                </div>

                <div className="vac-metrics">
                  <article className="vac-metric">
                    <p className="context-label">Safe contribution</p>
                    <p className="vac-metric__value">
                      {money(vacationPlan.safeContributionDaily)}
                      <span>/day from flex</span>
                    </p>
                    <p className="context-note">{vacationPlan.bufferNote}</p>
                  </article>
                  <article className="vac-metric">
                    <p className="context-label">Daily / weekly sink</p>
                    <p className="vac-metric__value">
                      {money(vacationPlan.dailySink)}
                      <span>
                        /day · {money(vacationPlan.weeklySink)}/week
                      </span>
                    </p>
                    <p className="context-note">
                      From good weeks only — never rent, essentials, or buffer floor.
                    </p>
                  </article>
                  <article className="vac-metric">
                    <p className="context-label">Shifts at avg net</p>
                    <p className="vac-metric__value">
                      {vacationPlan.shiftsNeeded}
                      <span>
                        × ~{money(vacationPlan.netPerShift)} after commute
                      </span>
                    </p>
                    <p className="context-note">
                      Flex share of take-home parked toward the trip — not the whole cheque.
                    </p>
                  </article>
                </div>

                <div className="path-focus vac-timeline" role="status">
                  <p className="path-focus__label">Timeline</p>
                  <h3>
                    Ready by {vacationPlan.readyByDate}
                    {vacationPlan.daysUntil > 0
                      ? ` · target in ${vacationPlan.daysUntil} days`
                      : ''}
                  </h3>
                  <p>{vacationPlan.timelineCopy}</p>
                </div>

                {vacationPlan.cliffWarning && vacationPlan.cliffWarningDetail && (
                  <div className="vac-warning" role="alert">
                    <p className="vac-warning__label">Cliff warning</p>
                    <p>{vacationPlan.cliffWarningDetail}</p>
                  </div>
                )}

                {vacationPlan.cliffs.length > 0 && (
                  <div className="vac-cliffs">
                    <p className="context-label">Progress vs next cliffs</p>
                    <ul>
                      {vacationPlan.cliffs.map((c) => (
                        <li key={`${c.name}-${c.due_date}`} className={`vac-cliff vac-cliff--${c.status}`}>
                          <div>
                            <strong>{c.name}</strong>
                            <span>
                              {money(c.amount)} ·{' '}
                              {c.days_until <= 0
                                ? 'due'
                                : `in ${c.days_until}d`}
                              {c.essential ? ' · essential' : ''}
                            </span>
                          </div>
                          <p>{c.note}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <aside className="context-rail" aria-label="Supporting money context">
          <article className={`context-card buffer buffer--${tone}`}>
            <p className="context-label">Buffer days</p>
            <p className="context-value">
              {snap.buffer_days.toFixed(1)}
              <span>safe days</span>
            </p>
            <p className="context-note">
              {tone === 'ok' && 'Breathing room. Wants are easier from here.'}
              {tone === 'watch' && 'Okay for now — keep an eye on the next cliff.'}
              {tone === 'tight' && 'Thin cushion. Prefer earn, delay, or sink over spending now.'}
            </p>
          </article>

          <article className="context-card cliff">
            <p className="context-label">Next cliff</p>
            {cliff ? (
              <>
                <p className="context-value cliff-name">{cliff.name}</p>
                <p className="cliff-meta">
                  <strong>{money(cliff.amount)}</strong>
                  <span>
                    {cliff.days_until === 0
                      ? 'due today'
                      : cliff.days_until === 1
                        ? 'due tomorrow'
                        : `in ${cliff.days_until} days`}
                  </span>
                </p>
                <p className="context-note">
                  Due {cliff.due_date}
                  {cliff.essential ? ' · essential' : ''}
                </p>
              </>
            ) : (
              <p className="context-note">No upcoming obligation in view.</p>
            )}
          </article>

          <article className="context-card advances">
            <p className="context-label">Advance warning</p>
            <p className="context-value advances-value">
              {moneyExact(snap.advance_fees_month)}
              <span>fees this month</span>
            </p>
            <p className="context-note">
              {snap.advance_count_month === 0
                ? 'No advances logged this month — keep that streak.'
                : `${snap.advance_count_month} advance${snap.advance_count_month === 1 ? '' : 's'} · mostly ${
                    Object.entries(snap.advance_reasons).sort((a, b) => b[1] - a[1])[0]?.[0]?.replace(/_/g, ' ') ??
                    'day-to-day needs'
                  }.`}
            </p>
            {snap.buffer_days < 3 && (
              <p className="advance-flag">Paths that spend now may risk another advance.</p>
            )}
          </article>

          <article className="context-card insight">
            <p className="context-label">Cycle insight</p>
            <p className="insight-text">{insight}</p>
            <ul className="week-strip" aria-label="Recent weeks">
              {worker.recent_weeks.slice(-4).map((w) => {
                const heavy = w.essential_expense > 800 || w.net < -200
                return (
                  <li key={w.week_start} className={heavy ? 'heavy' : 'calm'}>
                    <span>{w.week_start.slice(5)}</span>
                    <strong>{money(w.net)}</strong>
                  </li>
                )
              })}
            </ul>
          </article>

          <article className="context-card profile">
            <p className="context-label">Worker snapshot</p>
            <p className="profile-line">
              {worker.profile.occupation} · {worker.profile.city}
            </p>
            <p className="context-note">
              {worker.profile.pay_type} pay · {householdSummary(household).toLowerCase()} ·
              demo size {worker.profile.household_size}
              {worker.profile.dependents > 0
                ? ` · profile ${worker.profile.dependents} dependent${worker.profile.dependents === 1 ? '' : 's'}`
                : ''}
              {worker.profile.has_side_gig ? ' · side gig on file' : ''} · rent burden{' '}
              {worker.profile.rent_burden_band} · ~
              {money(snap.avg_shift_net)} / shift after commute ~
              {moneyExact(snap.commute_per_day)}
            </p>
          </article>
        </aside>
      </main>

      <footer className="footer">
        <p>
          Unstuck · hackathon demo on Alberta daily-earner sample data · not financial advice
        </p>
      </footer>
    </div>
  )
}
