import json
from datetime import datetime, timedelta
from pathlib import Path
import pandas as pd
import numpy as np

root = Path(r"c:\Users\Edwin Olaez\unstuck\public\data")
w = pd.read_csv(root / "workers.csv")
e = pd.read_csv(root / "daily_earnings.csv", parse_dates=["work_date"])
t = pd.read_csv(root / "transactions.csv", parse_dates=["txn_ts"])
o = pd.read_csv(root / "recurring_obligations.csv")
a = pd.read_csv(root / "earned_wage_advances.csv", parse_dates=["requested_at", "repaid_at"])
wk = pd.read_csv(root / "weekly_cashflow_summary.csv", parse_dates=["week_start"])

# Pick interesting demo workers: severe rent + advances + varied pay types
cand = w.merge(
    a.groupby("worker_id").agg(advances=("advance_id","count"), fees=("fee_cad","sum")).reset_index(),
    on="worker_id", how="left"
).fillna({"advances":0,"fees":0})
cand = cand.merge(
    wk.groupby("worker_id").agg(neg_weeks=("negative_balance_flag","sum"), min_buffer=("buffer_days_estimate","min")).reset_index(),
    on="worker_id", how="left"
)

# Prefer Calgary, mix of occupations, has advances, severe/high rent
picks = []
for band, ptype in [("severe","daily"),("high","gig"),("severe","hourly"),("moderate","daily"),("high","hourly")]:
    sub = cand[(cand.rent_burden_band==band)&(cand.pay_type==ptype)&(cand.advances>=2)].sort_values(["fees","advances"], ascending=False)
    if len(sub)==0:
        sub = cand[(cand.rent_burden_band==band)&(cand.advances>=1)].sort_values("fees", ascending=False)
    if len(sub):
        wid = sub.iloc[0].worker_id
        if wid not in picks:
            picks.append(wid)
while len(picks) < 5:
    for wid in cand.sort_values("fees", ascending=False).worker_id:
        if wid not in picks:
            picks.append(wid)
            break

# Always include W-0001 if present
if "W-0001" in set(w.worker_id) and "W-0001" not in picks:
    picks = ["W-0001"] + picks[:4]
else:
    picks = picks[:5]

print("Demo workers:", picks)

# Reference "today" = mid dataset for drama: around a rent cliff
# Find a good as_of date per worker near rent week with low buffer
as_of_global = pd.Timestamp("2026-04-28")  # after late-April rent-ish stress for many

def build_worker(wid, as_of):
    worker = w[w.worker_id==wid].iloc[0].to_dict()
    earns = e[e.worker_id==wid].sort_values("work_date")
    txns = t[t.worker_id==wid].sort_values("txn_ts")
    obs = o[o.worker_id==wid].sort_values("due_day_of_month")
    advs = a[a.worker_id==wid].sort_values("requested_at")
    weeks = wk[wk.worker_id==wid].sort_values("week_start")

    # Balance as of date: last running_balance on or before as_of
    past = txns[txns.txn_ts <= as_of + pd.Timedelta(days=1)]
    balance = float(past.iloc[-1].running_balance_cad) if len(past) else 0.0

    # Recent earnings stats (last 28 days before as_of)
    recent = earns[(earns.work_date >= as_of - pd.Timedelta(days=28)) & (earns.work_date <= as_of)]
    typical_net = float(worker["typical_daily_net_cad"])
    avg_recent_net = float(recent.net_pay_cad.mean()) if len(recent) else typical_net
    work_days_28 = int(recent.work_date.nunique())
    avg_hours = float(recent.hours_worked.mean()) if len(recent) else 8.0

    # Commute cost proxy from recent transit spend / work days
    transit = txns[(txns.direction=="debit") & (txns.category=="transit") & (txns.txn_ts >= as_of - pd.Timedelta(days=28)) & (txns.txn_ts <= as_of)]
    commute_per_day = float(transit.amount_cad.sum() / max(work_days_28,1))

    # Food out average for swap option
    food = txns[(txns.direction=="debit") & (txns.category=="food_out") & (txns.txn_ts >= as_of - pd.Timedelta(days=28)) & (txns.txn_ts <= as_of)]
    food_out_avg = float(food.amount_cad.mean()) if len(food) else 18.0
    food_out_count = int(len(food))

    # Next cliff: next obligation due from as_of day-of-month forward
    day = as_of.day
    month = as_of.month
    year = as_of.year
    cliffs = []
    for _, row in obs.iterrows():
        due = int(row.due_day_of_month)
        # next occurrence
        if due >= day:
            due_date = pd.Timestamp(year=year, month=month, day=min(due, 28 if month==2 else 30 if month in [4,6,9,11] else 31))
            try:
                due_date = pd.Timestamp(year=year, month=month, day=due)
            except Exception:
                due_date = pd.Timestamp(year=year, month=month, day=28)
        else:
            nm = month + 1 if month < 12 else 1
            ny = year if month < 12 else year + 1
            try:
                due_date = pd.Timestamp(year=ny, month=nm, day=due)
            except Exception:
                due_date = pd.Timestamp(year=ny, month=nm, day=28)
        cliffs.append({
            "id": row.obligation_id,
            "name": str(row["name"]),
            "category": row.category,
            "amount": float(row.amount_cad),
            "due_date": due_date.strftime("%Y-%m-%d"),
            "days_until": int((due_date.normalize() - as_of.normalize()).days),
            "essential": bool(row.essential),
            "autopay": bool(row.autopay),
        })
    cliffs.sort(key=lambda x: x["days_until"])
    next_cliff = cliffs[0] if cliffs else None

    # Money still needed for next essential cliff
    essential_upcoming = [c for c in cliffs if c["essential"] and c["days_until"] <= 14]
    cliff_total_14 = sum(c["amount"] for c in essential_upcoming)

    # Flex estimate: balance - essential obligations due in 14d - buffer floor
    buffer_floor = typical_net * 3  # keep ~3 days
    flex_now = max(0.0, balance - cliff_total_14 - buffer_floor)

    # Buffer days from latest week on/before as_of
    week_past = weeks[weeks.week_start <= as_of]
    if len(week_past):
        last_week = week_past.iloc[-1]
        buffer_days = float(last_week.buffer_days_estimate) if pd.notna(last_week.buffer_days_estimate) else (balance / max(typical_net*0.6, 1))
        ending_balance_week = float(last_week.ending_balance_cad)
    else:
        buffer_days = balance / max(typical_net * 0.6, 1)
        ending_balance_week = balance

    # Cap absurd buffer days for UX
    if buffer_days > 60:
        buffer_days_display = 60.0
        buffer_capped = True
    elif buffer_days < 0:
        buffer_days_display = 0.0
        buffer_capped = False
    else:
        buffer_days_display = buffer_days
        buffer_capped = False

    # Advances this month
    month_start = as_of.replace(day=1)
    month_adv = advs[(advs.requested_at >= month_start) & (advs.requested_at <= as_of)]
    advance_fees_month = float(month_adv.fee_cad.sum())
    advance_count_month = int(len(month_adv))
    advance_reasons = month_adv.reason_code.value_counts().to_dict() if len(month_adv) else {}

    # Recent weeks summary for insight
    recent_weeks = []
    for _, row in weeks[(weeks.week_start >= as_of - pd.Timedelta(days=45)) & (weeks.week_start <= as_of)].iterrows():
        recent_weeks.append({
            "week_start": row.week_start.strftime("%Y-%m-%d"),
            "income": round(float(row.income_cad),2),
            "expense": round(float(row.expense_cad),2),
            "essential_expense": round(float(row.essential_expense_cad),2),
            "net": round(float(row.net_cashflow_cad),2),
            "buffer_days": None if pd.isna(row.buffer_days_estimate) else round(float(row.buffer_days_estimate),1),
            "advances": int(row.advances_count),
            "advance_fees": round(float(row.advance_fees_cad),2),
        })

    # Shift value after commute
    shift_net_after_commute = max(0.0, avg_recent_net - commute_per_day)

    return {
        "worker_id": wid,
        "as_of": as_of.strftime("%Y-%m-%d"),
        "profile": {
            "city": worker["city"],
            "occupation": worker["occupation"],
            "pay_type": worker["pay_type"],
            "typical_daily_net": round(typical_net,2),
            "income_volatility": float(worker["income_volatility"]),
            "household_size": int(worker["household_size"]),
            "dependents": int(worker["dependents"]),
            "commute_mode": worker["commute_mode"],
            "rent_burden_band": worker["rent_burden_band"],
            "has_side_gig": bool(worker["has_side_gig"]),
            "has_bank_account": bool(worker["has_bank_account"]),
        },
        "snapshot": {
            "balance": round(balance,2),
            "buffer_days": round(buffer_days_display,1),
            "buffer_capped": buffer_capped,
            "flex_now": round(flex_now,2),
            "buffer_floor": round(buffer_floor,2),
            "essential_due_14d": round(cliff_total_14,2),
            "avg_shift_net": round(avg_recent_net,2),
            "commute_per_day": round(commute_per_day,2),
            "shift_net_after_commute": round(shift_net_after_commute,2),
            "food_out_avg": round(food_out_avg,2),
            "food_out_count_28d": food_out_count,
            "work_days_28d": work_days_28,
            "advance_count_month": advance_count_month,
            "advance_fees_month": round(advance_fees_month,2),
            "advance_reasons": {str(k): int(v) for k,v in advance_reasons.items()},
        },
        "next_cliff": next_cliff,
        "cliffs": cliffs[:6],
        "recent_weeks": recent_weeks,
        "want_presets": [
            {"label": "Night out", "amount": 45},
            {"label": "New shoes", "amount": 80},
            {"label": "Kids treat", "amount": 25},
            {"label": "Send family money", "amount": 100},
            {"label": "Streaming / game", "amount": 15},
        ],
    }

demos = [build_worker(wid, as_of_global) for wid in picks]

# Also build a light worker list for picker
picker = []
for d in demos:
    p = d["profile"]
    picker.append({
        "worker_id": d["worker_id"],
        "label": f"{p['occupation']} · {p['city']}",
        "pay_type": p["pay_type"],
        "rent_burden_band": p["rent_burden_band"],
        "buffer_days": d["snapshot"]["buffer_days"],
    })

out = {
    "app": "Unstuck",
    "as_of": as_of_global.strftime("%Y-%m-%d"),
    "currency": "CAD",
    "workers": demos,
    "picker": picker,
}
out_path = root / "demo.json"
out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
print("Wrote", out_path, "bytes", out_path.stat().st_size)
for d in demos:
    print(d["worker_id"], d["profile"]["occupation"], "bal", d["snapshot"]["buffer_days"], "flex", d["snapshot"]["flex_now"], "cliff", d["next_cliff"]["name"] if d["next_cliff"] else None, d["next_cliff"]["days_until"] if d["next_cliff"] else None)
