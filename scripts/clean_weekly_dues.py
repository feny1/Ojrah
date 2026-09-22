#!/usr/bin/env python3
"""
Clean Weekly Dues & Historical Backfill Script (الاستحقاق الأسبوعي)
==================================================================
Idempotent data migration and cleanup script for contracts and weekly dues.

Business Rules:
1. Purge Invalid Records: Delete any weekly due record where due_date < contract.start_date (pickup_date),
   specifically purging any record dated 2023-01-31.
2. Align to Fridays: All weekly dues strictly fall on Friday (Carbon::FRIDAY / day_of_week == 4 in Python).
   - If contract starts on 2023-02-01 (Wednesday), the first Friday is 2023-02-03.
   - Subsequent weeks are spaced every 7 days (Fridays).
3. Renumber Weeks & Recalculate Totals:
   - Re-index week labels sequentially starting from Week 1 (الأسبوع 1).
   - Recalculate running balance (الرصيد التراكمي) and grand totals.
4. Constraints:
   - Zero-Data-Loss: Never delete manual payment vouchers (سندات القبض) or unrelated customer data.
   - Transactional safety: All modifications execute atomically with full rollback capability.
"""

import sys
import json
import datetime
from copy import deepcopy

def get_first_friday_on_or_after(date_str: str) -> str:
    """Return the YYYY-MM-DD string of the first Friday on or after date_str."""
    dt = datetime.date.fromisoformat(date_str)
    # Python: Monday=0, Tuesday=1, Wednesday=2, Thursday=3, Friday=4, Saturday=5, Sunday=6
    days_until_friday = (4 - dt.weekday() + 7) % 7
    first_friday = dt + datetime.timedelta(days=days_until_friday)
    return first_friday.isoformat()

def is_friday(date_str: str) -> bool:
    """Check if date_str falls on a Friday."""
    dt = datetime.date.fromisoformat(date_str)
    return dt.weekday() == 4

def get_contract_friday_dates(start_date: str, weeks_count: int) -> list:
    """Generate exact list of Friday dates on or after start_date."""
    if not start_date or weeks_count <= 0:
        return []
    first_friday_str = get_first_friday_on_or_after(start_date)
    first_friday = datetime.date.fromisoformat(first_friday_str)
    dates = []
    for i in range(weeks_count):
        f_date = first_friday + datetime.timedelta(days=i * 7)
        f_date_str = f_date.isoformat()
        if f_date_str >= start_date and is_friday(f_date_str):
            dates.append(f_date_str)
    return dates

def run_cleanup_and_backfill(db: dict) -> dict:
    """
    Execute transactional cleanup and backfill over database dictionary.
    Rolls back automatically on any exception.
    """
    snapshot = deepcopy(db)
    audit_logs = db.setdefault("audit_logs", [])
    contracts = db.get("contracts", [])
    weekly_deliveries = db.get("weekly_deliveries", [])
    vouchers = db.get("vouchers", [])

    purged_deliveries_count = 0
    purged_vouchers_count = 0
    realigned_count = 0

    try:
        # Step 1: Purge Invalid Pre-Contract Records from weekly_deliveries
        valid_deliveries = []
        for deliv in weekly_deliveries:
            c_id = deliv.get("contract_id")
            contract = next((c for c in contracts if c.get("id") == c_id), None)
            d_date = deliv.get("delivery_date") or deliv.get("due_date")

            if contract and contract.get("start_date") and d_date < contract.get("start_date"):
                # Purge invalid record
                audit_logs.append({
                    "action": "PURGE_PRE_CONTRACT_WEEKLY_DUE",
                    "target_table": "weekly_deliveries",
                    "record_id": deliv.get("id"),
                    "contract_id": contract.get("id"),
                    "invalid_date": d_date,
                    "contract_start_date": contract.get("start_date"),
                    "reason": f"Purged pre-contract weekly due ({d_date} strictly before {contract.get('start_date')})"
                })
                purged_deliveries_count += 1
            else:
                valid_deliveries.append(deliv)

        # Step 2: Purge any pre-contract auto-generated rent voucher in vouchers
        clean_vouchers = []
        for v in vouchers:
            v_type = v.get("voucher_type")
            is_rent_voucher = v_type in ["استحقاق أسبوعي تلقائي", "استحقاق أسبوعي"]
            d_id = v.get("related_driver_id")
            if is_rent_voucher and d_id:
                contract = next((c for c in contracts if c.get("driver_id") == d_id), None)
                v_date = v.get("voucher_date")
                if contract and contract.get("start_date") and v_date < contract.get("start_date"):
                    audit_logs.append({
                        "action": "PURGE_PRE_CONTRACT_WEEKLY_VOUCHER",
                        "target_table": "vouchers",
                        "record_id": v.get("id"),
                        "invalid_date": v_date,
                        "reason": f"Purged pre-contract rent voucher ({v_date} < {contract.get('start_date')})"
                    })
                    purged_vouchers_count += 1
                    continue
            # All other vouchers (including valid manual سند قبض) strictly preserved
            clean_vouchers.append(v)
        db["vouchers"] = clean_vouchers

        # Step 3: Align all weekly dues strictly to Fridays & renumber sequentially starting from Week 1
        aligned_deliveries = []
        next_del_id = 1

        for c in contracts:
            c_start = c.get("start_date")
            weekly_amt = float(c.get("weekly_required") or 0)
            
            # Determine weeks count: count existing valid records or calculate from contract
            existing_for_contract = [d for d in valid_deliveries if d.get("contract_id") == c.get("id")]
            existing_for_contract.sort(key=lambda x: x.get("delivery_date") or x.get("due_date") or "")

            weeks_count = max(len(existing_for_contract), 1)
            friday_dates = get_contract_friday_dates(c_start, weeks_count)

            for idx, f_date in enumerate(friday_dates):
                week_num = idx + 1
                existing = existing_for_contract[idx] if idx < len(existing_for_contract) else None

                if existing:
                    old_date = existing.get("delivery_date") or existing.get("due_date")
                    if old_date != f_date or existing.get("week_number") != week_num or not is_friday(old_date):
                        realigned_count += 1
                    
                    item = dict(existing)
                    item["id"] = item.get("id") or next_del_id
                    item["delivery_date"] = f_date
                    item["due_date"] = f_date
                    item["week_number"] = week_num
                    item["amount_due"] = float(item.get("amount_due") or weekly_amt)
                    item["notes"] = f"استحقاق توريد أسبوعي إلزامي ليوم الجمعة (الأسبوع {week_num})"
                    aligned_deliveries.append(item)
                else:
                    aligned_deliveries.append({
                        "id": next_del_id,
                        "contract_id": c.get("id"),
                        "driver_id": c.get("driver_id"),
                        "car_id": c.get("car_id"),
                        "delivery_date": f_date,
                        "due_date": f_date,
                        "week_number": week_num,
                        "amount_due": weekly_amt,
                        "amount_paid": 0.0,
                        "status": "مستحق",
                        "notes": f"استحقاق توريد أسبوعي إلزامي ليوم الجمعة (الأسبوع {week_num})",
                        "created_at": c_start
                    })
                    realigned_count += 1
                next_del_id += 1

        # Preserve deliveries for contracts not in contracts table
        for d in valid_deliveries:
            if not any(c.get("id") == d.get("contract_id") for c in contracts):
                aligned_deliveries.append(d)

        # Normalize IDs
        for idx, d in enumerate(aligned_deliveries, 1):
            d["id"] = idx

        db["weekly_deliveries"] = aligned_deliveries

        # Step 4: Recalculate Financial Statement Balances
        driver_statements = {}
        for c in contracts:
            d_id = c.get("driver_id")
            stmts = []
            c_start = c.get("start_date")
            weekly_amt = float(c.get("weekly_required") or 0)
            
            # Friday dues
            c_dues = [d for d in aligned_deliveries if d.get("contract_id") == c.get("id")]
            for d in c_dues:
                stmts.append({
                    "date": d.get("delivery_date"),
                    "description": f"استحقاق توريد أسبوعي إلزامي (يوم الجمعة) - الأسبوع {d.get('week_number')}",
                    "debit": float(d.get("amount_due") or weekly_amt),
                    "credit": 0.0,
                    "category": "contract",
                    "week_index": d.get("week_number")
                })

            # Receipts / vouchers
            for v in db.get("vouchers", []):
                if v.get("related_driver_id") == d_id:
                    v_type = v.get("voucher_type")
                    is_credit = v_type in ["سند قبض", "سند تسديد مخالفة", "سند تأمين (قبض)"]
                    amt = float(v.get("amount") or 0)
                    if is_credit and amt > 0:
                        stmts.append({
                            "date": v.get("voucher_date"),
                            "description": v.get("description") or v_type,
                            "debit": 0.0,
                            "credit": amt,
                            "category": "cash"
                        })

            # Sort chronologically by date
            stmts.sort(key=lambda s: s.get("date") or "")
            running_balance = 0.0
            for s in stmts:
                running_balance += (s["debit"] - s["credit"])
                s["balance"] = round(running_balance, 2)
            
            driver_statements[d_id] = {
                "statements": stmts,
                "cumulative_balance": round(running_balance, 2),
                "total_debits": sum(s["debit"] for s in stmts),
                "total_credits": sum(s["credit"] for s in stmts)
            }

        return {
            "success": True,
            "purged_deliveries_count": purged_deliveries_count,
            "purged_vouchers_count": purged_vouchers_count,
            "realigned_count": realigned_count,
            "total_weekly_deliveries": len(aligned_deliveries),
            "driver_financials": driver_statements
        }

    except Exception as e:
        # Full rollback to snapshot
        db.clear()
        db.update(snapshot)
        return {
            "success": False,
            "error": str(e)
        }

def run_tests():
    print("==================================================================")
    print("Running Weekly Due Logic Verification Tests")
    print("==================================================================")

    # Test 1: Date Calculations
    contract_start = "2023-02-01" # Wednesday
    first_friday = get_first_friday_on_or_after(contract_start)
    assert first_friday == "2023-02-03", f"Expected 2023-02-03, got {first_friday}"
    assert is_friday("2023-02-03") == True, "2023-02-03 must be Friday"
    assert is_friday("2023-01-31") == False, "2023-01-31 is Tuesday, not Friday"
    print("PASS: Date calculations: 2023-02-01 (Wed) -> First Friday is 2023-02-03 (Fri).")

    # Test 2: Friday sequence
    fridays = get_contract_friday_dates("2023-02-01", 4)
    expected_fridays = ["2023-02-03", "2023-02-10", "2023-02-17", "2023-02-24"]
    assert fridays == expected_fridays, f"Expected {expected_fridays}, got {fridays}"
    for f in fridays:
        assert f >= contract_start, f"Friday {f} must be >= contract start {contract_start}"
        assert is_friday(f), f"Date {f} must be a Friday"
    print(f"PASS: 4-week Friday sequence: {fridays}")

    # Test 3: Purging Pre-Contract Record (2023-01-31) and Realigning to Fridays
    mock_db = {
        "contracts": [
            {
                "id": 1,
                "driver_id": 1,
                "car_id": 1,
                "start_date": "2023-02-01",
                "weekly_required": 700.0
            }
        ],
        "weekly_deliveries": [
            # The buggy pre-contract Tuesday row
            {
                "id": 101,
                "contract_id": 1,
                "driver_id": 1,
                "delivery_date": "2023-01-31", # BUG: Tuesday before contract start
                "due_date": "2023-01-31",
                "week_number": 1,
                "amount_due": 700.0,
                "amount_paid": 0.0
            },
            # Buggy subsequent Tuesday rows
            {
                "id": 102,
                "contract_id": 1,
                "driver_id": 1,
                "delivery_date": "2023-02-07", # Tuesday
                "due_date": "2023-02-07",
                "week_number": 2,
                "amount_due": 700.0,
                "amount_paid": 0.0
            },
            {
                "id": 103,
                "contract_id": 1,
                "driver_id": 1,
                "delivery_date": "2023-02-14", # Tuesday
                "due_date": "2023-02-14",
                "week_number": 3,
                "amount_due": 700.0,
                "amount_paid": 0.0
            },
            {
                "id": 104,
                "contract_id": 1,
                "driver_id": 1,
                "delivery_date": "2023-02-21", # Tuesday
                "due_date": "2023-02-21",
                "week_number": 4,
                "amount_due": 700.0,
                "amount_paid": 0.0
            }
        ],
        "vouchers": [
            # Valid manual payment voucher
            {
                "id": 1,
                "voucher_type": "سند قبض",
                "voucher_date": "2023-02-05",
                "amount": 700.0,
                "related_driver_id": 1,
                "description": "سداد أجرة الأسبوع الأول"
            }
        ],
        "audit_logs": []
    }

    result = run_cleanup_and_backfill(mock_db)
    assert result["success"] == True
    assert result["purged_deliveries_count"] == 1, "Must purge exactly 1 invalid pre-contract record (2023-01-31)"
    
    # Check that remaining weekly deliveries are strictly Fridays and start >= 2023-02-01
    deliveries = mock_db["weekly_deliveries"]
    assert len(deliveries) == 3, f"Expected 3 remaining weekly deliveries, got {len(deliveries)}"
    
    dates = [d["delivery_date"] for d in deliveries]
    assert "2023-01-31" not in dates, "2023-01-31 must be purged"
    assert dates == ["2023-02-03", "2023-02-10", "2023-02-17"], f"Expected Fridays, got {dates}"
    
    # Check week numbers
    week_nums = [d["week_number"] for d in deliveries]
    assert week_nums == [1, 2, 3], f"Expected weeks [1, 2, 3], got {week_nums}"
    
    # Check that all remaining dates are Fridays
    for d in deliveries:
        assert is_friday(d["delivery_date"]), f"Date {d['delivery_date']} is not a Friday"
        assert d["delivery_date"] >= "2023-02-01", f"Date {d['delivery_date']} is before contract start"

    # Check financial statements & running balance
    driver_fin = result["driver_financials"][1]
    stmts = driver_fin["statements"]
    print(f"PASS: Cleaned statements count: {len(stmts)}")
    for s in stmts:
        print(f"   -> [{s['date']}] {s['description']} | Debit: {s['debit']} | Credit: {s['credit']} | Balance: {s['balance']}")
    
    # First statement must be Week 1 on 2023-02-03 (Debit 700, running balance 700)
    assert stmts[0]["date"] == "2023-02-03"
    assert stmts[0]["week_index"] == 1
    assert stmts[0]["balance"] == 700.0

    # Second statement is payment on 2023-02-05 (Credit 700, running balance 0)
    assert stmts[1]["date"] == "2023-02-05"
    assert stmts[1]["credit"] == 700.0
    assert stmts[1]["balance"] == 0.0

    # Third statement is Week 2 on 2023-02-10 (Debit 700, running balance 700)
    assert stmts[2]["date"] == "2023-02-10"
    assert stmts[2]["balance"] == 700.0

    # Fourth statement is Week 3 on 2023-02-17 (Debit 700, running balance 1400)
    assert stmts[3]["date"] == "2023-02-17"
    assert stmts[3]["balance"] == 1400.0

    # Test 4: Idempotency (Running backfill again must not change anything)
    result_second_run = run_cleanup_and_backfill(mock_db)
    assert result_second_run["purged_deliveries_count"] == 0, "Second run should purge 0 records"
    assert result_second_run["realigned_count"] == 0, "Second run should realign 0 records"
    assert len(mock_db["weekly_deliveries"]) == 3
    print("PASS: Idempotency test passed (zero modifications on repeated execution).")

    print("\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
