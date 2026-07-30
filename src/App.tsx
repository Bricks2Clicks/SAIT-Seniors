import { useEffect, useMemo, useState } from 'react'
import { buildAffordOptions, cycleInsight, money, moneyExact } from './lib/afford'
import type { AffordOption, DemoData, OptionKind, WorkerDemo } from './lib/types'
import './App.css'

const KIND_LABEL: Record<OptionKind, string> = {
  flex: 'Spend now',
  delay: 'Wait',
  earn: 'Earn it',
  swap: 'Trade',
  sink: 'Save toward',
  wait: 'Protect',
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

export default function App() {
  const [data, setData] = useState<DemoData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [workerId, setWorkerId] = useState<string>('')
  const [wantLabel, setWantLabel] = useState('Night out')
  const [amount, setAmount] = useState(45)
  const [amountInput, setAmountInput] = useState('45')
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [hasAsked, setHasAsked] = useState(false)

  useEffect(() => {
    fetch('/data/demo.json')
      .then((r) => {
        if (!r.ok) throw new Error('Could not load demo data')
        return r.json()
      })
      .then((json: DemoData) => {
        setData(json)
        setWorkerId(json.workers[0]?.worker_id ?? '')
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const worker: WorkerDemo | undefined = useMemo(
    () => data?.workers.find((w) => w.worker_id === workerId),
    [data, workerId],
  )

  const options = useMemo(() => {
    if (!worker || !hasAsked) return []
    return buildAffordOptions(worker, wantLabel.trim() || 'this', amount)
  }, [worker, wantLabel, amount, hasAsked])

  useEffect(() => {
    if (!options.length) {
      setSelectedOptionId(null)
      return
    }
    const best = options.find((o) => o.recommended) ?? options[0]
    setSelectedOptionId(best.id)
  }, [options])

  const selected = options.find((o) => o.id === selectedOptionId) ?? null
  const insight = worker ? cycleInsight(worker) : ''
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
              setHasAsked(false)
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

      <main className="layout">
        <section className="hero-panel">
          <p className="eyebrow">As of {worker.as_of}</p>
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

          <div className="presets" aria-label="Quick wants">
            {worker.want_presets.map((p) => (
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
              {worker.profile.pay_type} pay · rent burden {worker.profile.rent_burden_band} · ~
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
