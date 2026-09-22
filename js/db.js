(function() {
  // Inject manifest and register service worker for offline support
  if (typeof document !== 'undefined') {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = 'manifest.json';
      document.head.appendChild(link);
    }
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
          .then(reg => {
            console.log('Service Worker registered:', reg.scope);
            reg.update();
          })
          .catch(err => console.error('Service Worker registration failed:', err));
      });
    }
  }

  // 1. Initialize localStorage tables if not present
  const TABLES = [
    'cars', 'drivers', 'contracts', 'violations', 'maintenance',
    'vouchers', 'car_documents', 'settings', 'invoices', 'purchases',
    'downtimes', 'purchase_items', 'invoice_items', 'general_settlements',
    'weekly_deliveries', 'audit_logs'
  ];
  
  function getTable(name) {
    const data = localStorage.getItem('db_' + name);
    return data ? JSON.parse(data) : [];
  }
  
  function setTable(name, arr) {
    localStorage.setItem('db_' + name, JSON.stringify(arr));
  }
  
  // Seed if settings table is empty
  const currentSettings = localStorage.getItem('db_settings');
  if (!currentSettings) {
    localStorage.setItem('db_settings', JSON.stringify({ vat_number: '310123456700003', weekly_due_day: 5 }));
    
    // Seed some mock cars
    setTable('cars', [
      { id: 1, company: 'تويوتا', model: 'كامري', year: 2023, purchase_date: '2023-01-15', plate_number: 'أ ب ج 1234', color: 'أبيض', purchase_cost: 95000, depreciation_method: 'قسط ثابت' },
      { id: 2, company: 'هيونداي', model: 'إلنترا', year: 2022, purchase_date: '2022-05-20', plate_number: 'د هـ و 5678', color: 'فضي', purchase_cost: 80000, depreciation_method: 'قسط ثابت' }
    ]);
    
    // Seed some mock drivers
    setTable('drivers', [
      { id: 1, name: 'أحمد محمد العتيبي', phone: '0501234567', national_id: '1023456789', hire_date: '2023-02-01' },
      { id: 2, name: 'خالد عبد الله الحربي', phone: '0559876543', national_id: '1098765432', hire_date: '2023-06-15' }
    ]);

    // Seed contracts
    setTable('contracts', [
      { id: 1, driver_id: 1, car_id: 1, start_date: '2023-02-01', weekly_required: 700, total_required: 36400, rollover_count: 0, last_rollover_date: '2023-02-01' }
    ]);

    // Seed vouchers
    setTable('vouchers', [
      { id: 1, voucher_number: 'V-1688123456789', voucher_type: 'سند تسليم مركبة', auto_generated: 1, voucher_date: '2023-02-01', amount: 0, related_driver_id: 1, related_car_id: 1, description: 'سند تسليم مركبة تلقائي لتوقيع العقد', cash_amount: 0, network_amount: 0 },
      { id: 2, voucher_number: 'V-1688234567890', voucher_type: 'سند قبض', auto_generated: 0, voucher_date: '2023-02-08', amount: 700, related_driver_id: 1, related_car_id: 1, description: 'سداد أجرة الأسبوع الأول', cash_amount: 700, network_amount: 0 }
    ]);
  }

  // Transaction simulation runner (ACID guarantee for localStorage operations)
  function runInTransaction(operationFn) {
    const snapshot = {};
    TABLES.forEach(t => {
      snapshot[t] = localStorage.getItem('db_' + t);
    });
    try {
      const result = operationFn();
      return { success: true, data: result };
    } catch (error) {
      // Rollback on any failure
      Object.keys(snapshot).forEach(t => {
        if (snapshot[t] !== null) {
          localStorage.setItem('db_' + t, snapshot[t]);
        } else {
          localStorage.removeItem('db_' + t);
        }
      });
      console.error('[Transaction Rollback]:', error);
      return { success: false, error: error.message || error };
    }
  }

  // Date indexing & fast lookup helpers
  function inDateRange(dateStr, from, to) {
    if (!dateStr) return false;
    // Normalize date format if timestamp
    const d = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }

  // Strict Friday Schedule Helpers (dayOfWeek === 5)
  function isFriday(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr + 'T00:00:00');
    return d.getDay() === 5;
  }

  function getFirstFridayOnOrAfter(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
    const daysUntilFriday = (5 - day + 7) % 7;
    d.setDate(d.getDate() + daysUntilFriday);
    return d.toISOString().split('T')[0];
  }

  function getContractFridayDates(c, weeksCount) {
    if (!c || !c.start_date) return [];
    const dates = [];
    const firstFridayStr = getFirstFridayOnOrAfter(c.start_date);
    const firstFriday = new Date(firstFridayStr + 'T00:00:00');
    for (let i = 0; i < weeksCount; i++) {
      const d = new Date(firstFriday.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }

  // Non-Destructive Migrations & Backfill (Zero Data Loss)
  function runZeroDataLossMigrations() {
    try {
      // 1. Multi-Item Purchase Invoices Backfill (100% historical data preservation)
      const purchases = getTable('purchases');
      let purchaseItems = getTable('purchase_items');
      let purchasesBackfilled = 0;

      purchases.forEach(p => {
        const existing = purchaseItems.filter(it => it.purchase_id === p.id || it.invoice_id === p.id);
        if (existing.length === 0) {
          const nextItemId = purchaseItems.length > 0 ? Math.max(...purchaseItems.map(it => it.id)) + 1 : 1;
          const totalVal = parseFloat(p.total_amount || p.grand_total || 0);
          purchaseItems.push({
            id: nextItemId,
            purchase_id: p.id,
            invoice_id: p.id,
            description: p.product_name || 'بند مشتريات أساسي',
            quantity: 1,
            unit_price: totalVal,
            line_total: totalVal,
            created_at: p.invoice_date || new Date().toISOString().split('T')[0]
          });
          purchasesBackfilled++;
        }
      });
      if (purchasesBackfilled > 0) {
        setTable('purchase_items', purchaseItems);
        console.log(`[Zero Data Loss] Backfilled ${purchasesBackfilled} historical purchase invoices into purchase_items.`);
      }

      // 2. Sales/Tax Invoices Backfill into invoice_items
      const invoices = getTable('invoices');
      let invoiceItems = getTable('invoice_items');
      let invoicesBackfilled = 0;

      invoices.forEach(inv => {
        const existing = invoiceItems.filter(it => it.invoice_id === inv.id);
        if (existing.length === 0) {
          const nextItemId = invoiceItems.length > 0 ? Math.max(...invoiceItems.map(it => it.id)) + 1 : 1;
          const amtVal = parseFloat(inv.amount || 0);
          invoiceItems.push({
            id: nextItemId,
            invoice_id: inv.id,
            description: inv.service_type || 'خدمة نقل ركاب بالسيارات الأجرة العامة',
            quantity: 1,
            unit_price: amtVal,
            line_total: amtVal,
            created_at: inv.invoice_date || new Date().toISOString().split('T')[0]
          });
          invoicesBackfilled++;
        }
      });
      if (invoicesBackfilled > 0) {
        setTable('invoice_items', invoiceItems);
        console.log(`[Zero Data Loss] Backfilled ${invoicesBackfilled} tax invoices into invoice_items.`);
      }

      // 3. Weekly Delivery Sanitization Scope: Prune ONLY records prior to contract date
      const contracts = getTable('contracts');
      let deliveries = getTable('weekly_deliveries');
      let auditLogs = getTable('audit_logs');
      let prunedCount = 0;

      const validDeliveries = [];
      deliveries.forEach(del => {
        const contract = contracts.find(c => c.id == del.contract_id);
        if (contract && del.delivery_date < contract.start_date) {
          // Out of bounds delivery prior to contract start date: log for auditability and prune
          auditLogs.push({
            id: Date.now() + Math.random(),
            action: 'PRUNE_OUT_OF_BOUNDS_DELIVERY',
            target_table: 'weekly_deliveries',
            record_id: del.id,
            contract_id: contract.id,
            contract_start_date: contract.start_date,
            invalid_delivery_date: del.delivery_date,
            details: `تم استبعاد سجل التوريد الأسبوعي المؤرخ بـ ${del.delivery_date} لأنه يسبق تاريخ بدء العقد ${contract.start_date}`,
            original_record: del,
            pruned_at: new Date().toISOString()
          });
          prunedCount++;
        } else {
          validDeliveries.push(del);
        }
      });

      if (prunedCount > 0) {
        setTable('weekly_deliveries', validDeliveries);
        setTable('audit_logs', auditLogs);
        console.log(`[Weekly Delivery Sanitization] Pruned ${prunedCount} out-of-bounds delivery records. Logged to audit_logs.`);
      }

      // 4. Ensure Friday schedule alignment for active contract deliveries
      let currentDeliveries = [...getTable('weekly_deliveries')];
      let generatedSlots = 0;
      contracts.forEach(c => {
        const weeksCount = getContractWeeksCount(c);
        const fridayDates = getContractFridayDates(c, weeksCount);
        fridayDates.forEach((fDate, idx) => {
          const exists = currentDeliveries.some(d => d.contract_id == c.id && (d.delivery_date === fDate || d.week_number === idx + 1));
          if (!exists) {
            const nextDId = currentDeliveries.length > 0 ? Math.max(...currentDeliveries.map(d => d.id)) + 1 : 1;
            currentDeliveries.push({
              id: nextDId,
              contract_id: c.id,
              driver_id: c.driver_id,
              car_id: c.car_id,
              delivery_date: fDate,
              week_number: idx + 1,
              amount_due: parseFloat(c.weekly_required || 0),
              amount_paid: 0,
              status: fDate <= new Date().toISOString().split('T')[0] ? 'مستحق' : 'مجدول',
              notes: `استحقاق توريد أسبوعي إلزامي ليوم الجمعة (الأسبوع ${idx + 1})`,
              created_at: c.start_date
            });
            generatedSlots++;
          }
        });
      });
      if (generatedSlots > 0) {
        setTable('weekly_deliveries', currentDeliveries);
        console.log(`[Weekly Delivery Auto-Scheduler] Generated ${generatedSlots} Friday delivery slots.`);
      }

      // 5. Update settings default weekly due day strictly to Friday (5)
      const settings = JSON.parse(localStorage.getItem('db_settings') || '{}');
      if (settings.weekly_due_day !== 5) {
        settings.weekly_due_day = 5;
        localStorage.setItem('db_settings', JSON.stringify(settings));
      }
    } catch (e) {
      console.error('[Migration Error]:', e);
    }
  }

  // Execute non-destructive migration on startup
  runZeroDataLossMigrations();

  // Helper to compute weeks count for a contract based on auto recurring calculation & manual rollover
  function getContractWeeksCount(c) {
    if (!c || !c.start_date) return 1;
    const startDate = new Date(c.start_date + 'T00:00:00');
    const today = new Date();
    startDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    let autoWeeks = 0;
    if (today >= startDate) {
      const diffTime = Math.abs(today - startDate);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      autoWeeks = Math.floor(diffDays / 7);
    }
    const manualRollover = parseInt(c.rollover_count || 0);
    return Math.max(1, autoWeeks + 1, manualRollover + 1);
  }

  // 2. Helper to compute driver financials with Netting & Recurring Billing
  function getDriverFinancials(d, contracts, vouchers, violations, maintenance, purchases) {
    const driverContracts = contracts.filter(c => c.driver_id == d.id);
    const activeContract = driverContracts.length > 0 ? driverContracts[driverContracts.length - 1] : null;

    let total_debits = 0;
    let total_credits = 0;

    // Contracts rent (recurring weekly entitlement)
    driverContracts.forEach(c => {
      const weeksCount = getContractWeeksCount(c);
      total_debits += weeksCount * parseFloat(c.weekly_required || 0);
    });

    // Violations
    const vils = violations.filter(v => {
      return driverContracts.some(c => c.id == v.contract_id);
    });
    vils.forEach(v => {
      total_debits += parseFloat(v.amount || 0);
    });

    // Maintenance (Netting & driver charges)
    const maints = maintenance.filter(m => {
      return driverContracts.some(c => c.car_id == m.car_id);
    });
    maints.forEach(m => {
      total_debits += parseFloat(m.amount_from_driver || 0);
      total_credits += parseFloat(m.deducted_from_weekly || 0);
    });

    // Purchases (Netting reimbursements & debt charges)
    const driverPurchases = purchases.filter(p => p.driver_id == d.id);
    driverPurchases.forEach(p => {
      total_credits += parseFloat(p.reimbursement_amount || 0);
      total_debits += parseFloat(p.debt_charge_amount || 0);
    });

    // Downtimes (Vehicle idle deductions from driver's required amount)
    const downtimes = getTable('downtimes');
    const driverDowntimes = downtimes.filter(dt => dt.driver_id == d.id);
    driverDowntimes.forEach(dt => {
      total_credits += parseFloat(dt.total_deduction || 0);
    });

    // General Settlements (Netting reimbursements & debt charges)
    const settlements = getTable('general_settlements');
    const driverSettlements = settlements.filter(s => s.driver_id == d.id && s.status !== 'ملغاة');
    driverSettlements.forEach(s => {
      const amt = parseFloat(s.amount || 0);
      if (s.driver_impact === 'credit' || s.settlement_type === 'تعويض' || s.settlement_type === 'خصم خاص' || s.settlement_type === 'مكافأة') {
        total_credits += amt;
      } else if (s.driver_impact === 'debit' || s.settlement_type === 'مديونية' || s.settlement_type === 'غرامة') {
        total_debits += amt;
      }
    });

    // Vouchers (receipts, advances)
    const driverVouchers = vouchers.filter(v => v.related_driver_id == d.id);
    driverVouchers.forEach(v => {
      const isCredit = v.voucher_type === 'سند قبض' || v.voucher_type === 'سند تسديد مخالفة' || v.voucher_type === 'سند تأمين (قبض)';
      const isDebit = v.voucher_type === 'سلفة' || v.voucher_type === 'سند تأمين (مديونية)';
      
      if (isCredit) {
        total_credits += parseFloat(v.amount || 0);
      } else if (isDebit || (v.voucher_type !== 'سند تسليم مركبة' && parseFloat(v.amount || 0) > 0)) {
        total_debits += parseFloat(v.amount || 0);
      }
    });

    const net_balance = total_debits - total_credits;

    // Current Cycle Calculations & Netting
    let weekly_target = 0;
    let cash_collected = 0;
    let network_collected = 0;
    let reimbursements = 0;
    let downtime_deductions = 0;
    let last_rollover_date = '';
    let current_week_index = 1;

    if (activeContract) {
      const weeksCount = getContractWeeksCount(activeContract);
      current_week_index = weeksCount;
      weekly_target = parseFloat(activeContract.weekly_required || 0);

      const currentCycleIndex = weeksCount - 1;
      const startDateObj = new Date(activeContract.start_date + 'T00:00:00');
      const currentCycleDate = new Date(startDateObj.getTime() + currentCycleIndex * 7 * 24 * 60 * 60 * 1000);
      last_rollover_date = activeContract.last_rollover_date || currentCycleDate.toISOString().split('T')[0];

      const rolloverTime = new Date(last_rollover_date + 'T00:00:00').getTime();

      // Vouchers since current cycle rollover
      driverVouchers.forEach(v => {
        const isCredit = v.voucher_type === 'سند قبض' || v.voucher_type === 'سند تسديد مخالفة' || v.voucher_type === 'سند تأمين (قبض)';
        if (isCredit) {
          const vTime = new Date(v.voucher_date + 'T00:00:00').getTime();
          if (vTime >= rolloverTime) {
            cash_collected += parseFloat(v.cash_amount || 0);
            network_collected += parseFloat(v.network_amount || 0);
          }
        }
      });

      // Maintenance deductions in current cycle
      maints.forEach(m => {
        const mTime = new Date((m.maintenance_date || activeContract.start_date) + 'T00:00:00').getTime();
        if (mTime >= rolloverTime) {
          reimbursements += parseFloat(m.deducted_from_weekly || 0);
        }
      });

      // Purchases reimbursements since current cycle rollover
      driverPurchases.forEach(p => {
        const pTime = new Date(p.invoice_date + 'T00:00:00').getTime();
        if (pTime >= rolloverTime) {
          reimbursements += parseFloat(p.reimbursement_amount || 0);
        }
      });

      // General settlements reimbursements since current cycle rollover
      driverSettlements.forEach(s => {
        const sTime = new Date(s.settlement_date + 'T00:00:00').getTime();
        if (sTime >= rolloverTime) {
          const amt = parseFloat(s.amount || 0);
          if (s.driver_impact === 'credit' || s.settlement_type === 'تعويض' || s.settlement_type === 'خصم خاص' || s.settlement_type === 'مكافأة') {
            reimbursements += amt;
          }
        }
      });

      // Downtime deductions in current cycle
      driverDowntimes.forEach(dt => {
        const dtTime = new Date(dt.start_date + 'T00:00:00').getTime();
        if (dtTime >= rolloverTime) {
          downtime_deductions += parseFloat(dt.total_deduction || 0);
        }
      });
      reimbursements += downtime_deductions;
    }

    const current_cycle_payments = cash_collected + network_collected + reimbursements;
    let accumulated_debt = net_balance - weekly_target + current_cycle_payments;
    
    return {
      net_balance,
      weekly_target,
      cash_collected,
      network_collected,
      reimbursements,
      downtime_deductions,
      accumulated_debt,
      last_rollover_date,
      current_week_index,
      active_contract_id: activeContract ? activeContract.id : null,
      active_car_id: activeContract ? activeContract.car_id : null
    };
  }

  // 3. Intercept window.fetch
  const originalFetch = window.fetch;
  
  window.fetch = async function(url, options = {}) {
    const urlString = typeof url === 'string' ? url : url.url;
    
    // Check if it's an API call
    if (urlString.includes('/api/')) {
      try {
        let base = window.location.origin;
        if (!base || base === 'null') {
          base = 'http://localhost';
        }
        const parsedUrl = new URL(urlString, base);
        let path = parsedUrl.pathname;
        
        // Remove trailing slash if present
        if (path.endsWith('/') && path.length > 1) {
          path = path.slice(0, -1);
        }
        
        const method = (options.method || 'GET').toUpperCase();
        let body = {};
        if (options.body) {
          if (typeof options.body === 'string') {
            try {
              body = JSON.parse(options.body);
            } catch (e) {
              body = {};
            }
          } else {
            body = options.body;
          }
        }
        
        let responseData = null;
        let status = 200;
        
        // --- ROUTING HANDLERS ---
        
        // GET /api/dashboard/summary
        if (path === '/api/dashboard/summary' && method === 'GET') {
          const vouchers = getTable('vouchers');
          const drivers = getTable('drivers');
          const contracts = getTable('contracts');
          const violations = getTable('violations');
          const maintenance = getTable('maintenance');
          const purchases = getTable('purchases');
          const settlements = getTable('general_settlements');
          const deliveries = getTable('weekly_deliveries');
          const cars = getTable('cars');
          const settings = JSON.parse(localStorage.getItem('db_settings') || '{"vat_number":"310123456700003","weekly_due_day":5}');

          // Parse query date range parameters
          let fromDate = parsedUrl.searchParams.get('from');
          let toDate = parsedUrl.searchParams.get('to');
          const isAllTime = parsedUrl.searchParams.get('all') === '1' || parsedUrl.searchParams.get('all') === 'true';

          // Sensible default fallback: Current month if no explicit range set
          if (!fromDate && !toDate && !isAllTime) {
            const now = new Date();
            fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
          }

          // 1. Filtered Actual Revenue (Receipts in date range)
          const filteredVouchers = (fromDate || toDate)
            ? vouchers.filter(v => inDateRange(v.voucher_date, fromDate, toDate))
            : vouchers;
          const actualResult = filteredVouchers
            .filter(v => v.voucher_type === 'سند قبض' || v.voucher_type === 'سند تسديد مخالفة' || v.voucher_type === 'سند تأمين (قبض)')
            .reduce((sum, v) => sum + parseFloat(v.amount || 0), 0);

          // 2. Filtered Weekly Deliveries (Strict Friday scheduled deliveries in date range)
          const filteredDeliveries = (fromDate || toDate)
            ? deliveries.filter(d => inDateRange(d.delivery_date, fromDate, toDate))
            : deliveries;
          const weeklyDeliveryScheduled = filteredDeliveries.length;
          const weeklyDeliveryExpectedAmt = filteredDeliveries.reduce((sum, d) => sum + parseFloat(d.amount_due || 0), 0);
          const weeklyDeliveryFulfilled = filteredDeliveries.filter(d => d.status === 'مسدد' || parseFloat(d.amount_paid || 0) >= parseFloat(d.amount_due || 0)).length;
          const weeklyDeliveryPending = Math.max(0, weeklyDeliveryScheduled - weeklyDeliveryFulfilled);

          // 3. Filtered Violations & Expected Revenue in Range
          const filteredViolations = (fromDate || toDate)
            ? violations.filter(v => inDateRange(v.violation_date, fromDate, toDate))
            : violations;
          const violationsAmt = filteredViolations.reduce((sum, v) => sum + parseFloat(v.amount || 0), 0);

          let expected_revenue = 0;
          if (fromDate || toDate) {
            expected_revenue = weeklyDeliveryExpectedAmt + violationsAmt;
          } else {
            drivers.forEach(d => {
              const financials = getDriverFinancials(d, contracts, vouchers, violations, maintenance, purchases);
              expected_revenue += (financials.weekly_target + financials.accumulated_debt);
            });
          }

          // 4. Purchases & Settlements in Range
          const filteredPurchases = (fromDate || toDate)
            ? purchases.filter(p => inDateRange(p.invoice_date, fromDate, toDate))
            : purchases;
          const purchasesTotal = filteredPurchases.reduce((sum, p) => sum + parseFloat(p.total_amount || p.grand_total || 0), 0);

          const filteredSettlements = (fromDate || toDate)
            ? settlements.filter(s => inDateRange(s.settlement_date, fromDate, toDate) && s.status !== 'ملغاة')
            : settlements.filter(s => s.status !== 'ملغاة');
          const settlementsTotal = filteredSettlements.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);

          const collectionRate = expected_revenue > 0 ? Math.min(100, Math.round((actualResult / expected_revenue) * 100)) : 100;

          // 5. Build Trend Chart Data
          const chartMap = {};
          filteredVouchers.forEach(v => {
            if (v.voucher_type === 'سند قبض' || v.voucher_type === 'سند تسديد مخالفة' || v.voucher_type === 'سند تأمين (قبض)') {
              const dStr = v.voucher_date;
              if (dStr) {
                if (!chartMap[dStr]) chartMap[dStr] = { date: dStr, actual: 0, expected: 0, deliveries: 0 };
                chartMap[dStr].actual += parseFloat(v.amount || 0);
              }
            }
          });
          filteredDeliveries.forEach(del => {
            const dStr = del.delivery_date;
            if (dStr) {
              if (!chartMap[dStr]) chartMap[dStr] = { date: dStr, actual: 0, expected: 0, deliveries: 0 };
              chartMap[dStr].expected += parseFloat(del.amount_due || 0);
              chartMap[dStr].deliveries += 1;
            }
          });
          const chartData = Object.keys(chartMap).sort().map(k => ({
            ...chartMap[k],
            actual: parseFloat(chartMap[k].actual.toFixed(2)),
            expected: parseFloat(chartMap[k].expected.toFixed(2))
          }));

          // 6. Drivers Due List
          const drivers_due = [];
          const todayDay = new Date().getDay();
          const dueDay = parseInt(settings.weekly_due_day || 5);
          const isDueOrPast = todayDay >= dueDay;

          drivers.forEach(d => {
            const financials = getDriverFinancials(d, contracts, vouchers, violations, maintenance, purchases);
            const payments = financials.cash_collected + financials.network_collected + financials.reimbursements;

            if (financials.active_contract_id) {
              const car = cars.find(c => c.id == financials.active_car_id);
              const is_warning = isDueOrPast && (payments < financials.weekly_target);

              drivers_due.push({
                driver_id: d.id,
                driver_name: d.name,
                vehicle: car ? `${car.plate_number} - ${car.company} ${car.model}` : 'غير معروفة',
                car_id: financials.active_car_id,
                weekly_target: financials.weekly_target,
                cash_collected: financials.cash_collected,
                network_collected: financials.network_collected,
                reimbursements: financials.reimbursements,
                accumulated_debt: financials.accumulated_debt,
                net_balance: financials.net_balance,
                is_warning,
                contract_id: financials.active_contract_id,
                last_rollover_date: financials.last_rollover_date
              });
            }
          });
          
          drivers_due.sort((a, b) => b.net_balance - a.net_balance);
          
          responseData = {
            actual_revenue: actualResult,
            expected_revenue,
            weekly_deliveries: {
              scheduled: weeklyDeliveryScheduled,
              fulfilled: weeklyDeliveryFulfilled,
              pending: weeklyDeliveryPending,
              expected_amount: weeklyDeliveryExpectedAmt
            },
            purchases_total: purchasesTotal,
            settlements_total: settlementsTotal,
            collection_rate: collectionRate,
            chart_data: chartData,
            drivers_due,
            date_range: {
              from: fromDate || null,
              to: toDate || null,
              is_all_time: isAllTime
            }
          };
        }
        
        // GET /api/debts
        else if (path === '/api/debts' && method === 'GET') {
          const vouchers = getTable('vouchers');
          const drivers = getTable('drivers');
          const contracts = getTable('contracts');
          const violations = getTable('violations');
          const maintenance = getTable('maintenance');
          const purchases = getTable('purchases');
          
          let all_debts = [];
          drivers.forEach(d => {
            const financials = getDriverFinancials(d, contracts, vouchers, violations, maintenance, purchases);
            if (financials.net_balance > 0 || financials.accumulated_debt > 0) {
              all_debts.push({
                driver_id: d.id,
                driver_name: d.name,
                net_balance: financials.net_balance,
                accumulated_debt: financials.accumulated_debt,
                active_contract: financials.active_contract_id ? true : false
              });
            }
          });
          
          all_debts.sort((a, b) => b.net_balance - a.net_balance);
          responseData = all_debts;
        }
        
        // GET /api/summary
        else if (path === '/api/summary' && method === 'GET') {
          const cars = getTable('cars');
          const drivers = getTable('drivers');
          responseData = {
            total_cars: cars.length,
            active_cars: 0,
            total_expected_income: 0,
            total_actual_income: 0,
            document_alerts: []
          };
        }
        
        // GET /api/settings
        else if (path === '/api/settings' && method === 'GET') {
          const settings = JSON.parse(localStorage.getItem('db_settings') || '{"vat_number":"310123456700003","weekly_due_day":0,"auto_recurring_enabled":1}');
          responseData = settings;
        }
        
        // POST /api/settings
        else if (path === '/api/settings' && method === 'POST') {
          localStorage.setItem('db_settings', JSON.stringify({ 
            vat_number: body.vat_number, 
            weekly_due_day: parseInt(body.weekly_due_day || 0),
            auto_recurring_enabled: body.auto_recurring_enabled !== undefined ? parseInt(body.auto_recurring_enabled) : 1
          }));
          responseData = { message: 'تم حفظ الإعدادات بنجاح' };
        }
        
        // DELETE /api/clear-all
        else if (path === '/api/clear-all' && method === 'DELETE') {
          TABLES.forEach(table => {
            localStorage.setItem('db_' + table, '[]');
          });
          localStorage.setItem('db_settings', JSON.stringify({ vat_number: '310123456700003', weekly_due_day: 6 }));
          responseData = { message: 'All data cleared successfully' };
        }
        
        // GET /api/cars
        else if (path === '/api/cars' && method === 'GET') {
          responseData = getTable('cars');
        }
        
        // POST /api/cars
        else if (path === '/api/cars' && method === 'POST') {
          const cars = getTable('cars');
          const nextId = cars.length > 0 ? Math.max(...cars.map(c => c.id)) + 1 : 1;
          const newCar = { id: nextId, ...body };
          cars.push(newCar);
          setTable('cars', cars);
          responseData = { message: 'Car added successfully', id: nextId };
        }
        
        // GET /api/cars/:id or PUT /api/cars/:id
        else if (path.startsWith('/api/cars/')) {
          const id = parseInt(path.split('/')[3]);
          const cars = getTable('cars');
          const carIndex = cars.findIndex(c => c.id === id);
          
          if (method === 'GET') {
            if (carIndex === -1) {
              status = 404;
              responseData = { error: 'Car not found' };
            } else {
              const car = cars[carIndex];
              const maintenance = getTable('maintenance').filter(m => m.car_id === id);
              const documents = getTable('car_documents').filter(d => d.car_id === id);
              const contracts = getTable('contracts').filter(c => c.car_id === id);
              
              let current_driver = null;
              if (contracts.length > 0) {
                const latest = contracts[contracts.length - 1];
                const driver = getTable('drivers').find(d => d.id === latest.driver_id);
                if (driver) {
                  current_driver = {
                    name: driver.name,
                    start_date: latest.start_date
                  };
                }
              }
              responseData = { ...car, maintenance, documents, current_driver, timeline: [] };
            }
          } else if (method === 'PUT') {
            if (carIndex === -1) {
              status = 404;
              responseData = { error: 'Car not found' };
            } else {
              cars[carIndex] = { id, ...body };
              setTable('cars', cars);
              responseData = { message: 'Car updated successfully' };
            }
          } else if (method === 'DELETE') {
            if (carIndex === -1) {
              status = 404;
              responseData = { error: 'Car not found' };
            } else {
              cars.splice(carIndex, 1);
              setTable('cars', cars);
              responseData = { message: 'Deleted successfully' };
            }
          }
        }
        
        // GET /api/drivers
        else if (path === '/api/drivers' && method === 'GET') {
          responseData = getTable('drivers');
        }
        
        // POST /api/drivers
        else if (path === '/api/drivers' && method === 'POST') {
          const drivers = getTable('drivers');
          const nextId = drivers.length > 0 ? Math.max(...drivers.map(d => d.id)) + 1 : 1;
          const newDriver = { id: nextId, ...body };
          drivers.push(newDriver);
          setTable('drivers', drivers);
          responseData = { message: 'Driver added successfully', id: nextId };
        }
        
        // GET /api/drivers/:id or PUT /api/drivers/:id or DELETE /api/drivers/:id
        else if (path.startsWith('/api/drivers/')) {
          const id = parseInt(path.split('/')[3]);
          const drivers = getTable('drivers');
          const driverIndex = drivers.findIndex(d => d.id === id);
          if (method === 'GET') {
            if (driverIndex === -1) {
              status = 404;
              responseData = { error: 'Driver not found' };
            } else {
              const driver = drivers[driverIndex];
              const contracts = getTable('contracts').filter(c => c.driver_id === id);
              let current_week_required = 0;
              let statements = [];
              
              if (contracts.length > 0) {
                // Rent debits (Recurring Weekly Entitlements)
                contracts.forEach(c => {
                  const weeksCount = getContractWeeksCount(c);
                  const fridayDates = getContractFridayDates(c, weeksCount);
                  for (let i = 0; i < weeksCount; i++) {
                    const cycleDate = fridayDates[i] || new Date(new Date(c.start_date).getTime() + i * 7 * 86400000).toISOString().split('T')[0];
                    const isCurrent = (i === weeksCount - 1);
                    statements.push({
                      id: `${c.id}-rent-${i}`,
                      date: cycleDate,
                      description: `استحقاق توريد أسبوعي إلزامي (يوم الجمعة) - الأسبوع ${i + 1}${isCurrent ? ' (الدورة الحالية)' : ' (دورة سابقة مغلقة)'}`,
                      debit: parseFloat(c.weekly_required || 0),
                      credit: 0,
                      category: 'contract',
                      week_index: i + 1,
                      is_current_cycle: isCurrent,
                      is_auto_recurring: true
                    });
                  }
                });
                
                const violations = getTable('violations').filter(v => {
                  return contracts.some(c => c.id === v.contract_id);
                });
                violations.forEach(v => {
                  statements.push({
                    id: `violation-${v.id}`,
                    date: v.violation_date,
                    description: "مخالفة: " + v.reason,
                    debit: parseFloat(v.amount || 0),
                    credit: 0,
                    category: 'violation'
                  });
                  current_week_required += parseFloat(v.amount || 0);
                });
                
                const maintenance = getTable('maintenance').filter(m => {
                  return contracts.some(c => c.car_id === m.car_id);
                });
                maintenance.forEach(m => {
                  if (parseFloat(m.amount_from_driver || 0) > 0) {
                    statements.push({
                      id: `maint-driver-${m.id}`,
                      date: m.maintenance_date || m.invoice_date || contracts[0].start_date,
                      description: `تحمل تكلفة صيانة (${m.description || ''}) - أجرة الصيانة: ${m.labor_cost || 0}`,
                      debit: parseFloat(m.amount_from_driver || 0),
                      credit: 0,
                      category: 'maintenance'
                    });
                    current_week_required += parseFloat(m.amount_from_driver || 0);
                  }
                  if (parseFloat(m.deducted_from_weekly || 0) > 0) {
                    statements.push({
                      id: `maint-deduct-${m.id}`,
                      date: m.maintenance_date || m.invoice_date || contracts[0].start_date,
                      description: `خصم تعويض صيانة من المطلوب (${m.description || ''})`,
                      debit: 0,
                      credit: parseFloat(m.deducted_from_weekly || 0),
                      category: 'maintenance'
                    });
                    current_week_required -= parseFloat(m.deducted_from_weekly || 0);
                  }
                });
              }

              // Downtime records for this driver
              const downtimes = getTable('downtimes').filter(dt => dt.driver_id === id);
              downtimes.forEach(dt => {
                const totalDed = parseFloat(dt.total_deduction || 0);
                if (totalDed > 0) {
                  const carInfo = getTable('cars').find(c => c.id == dt.car_id);
                  const carLabel = carInfo ? `${carInfo.plate_number}` : `سيارة #${dt.car_id}`;
                  statements.push({
                    id: `downtime-${dt.id}`,
                    date: dt.start_date,
                    description: `خصم وقوف ${dt.days_count} أيام للسيارة ${carLabel} (${dt.reason || 'بدون سبب'})`,
                    debit: 0,
                    credit: totalDed,
                    category: 'downtime'
                  });
                  current_week_required -= totalDed;
                }
              });
              
              const purchases = getTable('purchases').filter(p => p.driver_id === id);
              purchases.forEach(p => {
                if (parseFloat(p.reimbursement_amount || 0) > 0) {
                  statements.push({
                    id: `purchase-reimb-${p.id}`,
                    date: p.invoice_date,
                    description: `تعويض مشتريات: ${p.product_name}`,
                    debit: 0,
                    credit: parseFloat(p.reimbursement_amount || 0),
                    category: 'purchase'
                  });
                  current_week_required -= parseFloat(p.reimbursement_amount || 0);
                }
                if (parseFloat(p.debt_charge_amount || 0) > 0) {
                  statements.push({
                    id: `purchase-debt-${p.id}`,
                    date: p.invoice_date,
                    description: `تحميل مشتريات مديونية: ${p.product_name}`,
                    debit: parseFloat(p.debt_charge_amount || 0),
                    credit: 0,
                    category: 'purchase'
                  });
                  current_week_required += parseFloat(p.debt_charge_amount || 0);
                }
              });

              // General settlements records for this driver
              const driverSettlements = getTable('general_settlements').filter(s => s.driver_id === id && s.status !== 'ملغاة');
              driverSettlements.forEach(s => {
                const amt = parseFloat(s.amount || 0);
                const isCredit = (s.driver_impact === 'credit' || s.settlement_type === 'تعويض' || s.settlement_type === 'خصم خاص' || s.settlement_type === 'مكافأة');
                statements.push({
                  id: `settlement-${s.id}`,
                  date: s.settlement_date,
                  description: `تسوية عامة (${s.category || s.settlement_type}): ${s.description || ''}`,
                  debit: isCredit ? 0 : amt,
                  credit: isCredit ? amt : 0,
                  category: 'settlement'
                });
                if (isCredit) {
                  current_week_required -= amt;
                } else {
                  current_week_required += amt;
                }
              });
              
              const vouchers = getTable('vouchers').filter(v => v.related_driver_id === id);
              const invoices = getTable('invoices');
              
              vouchers.forEach(v => {
                const inv = invoices.find(i => i.voucher_id === v.id);
                const isCredit = v.voucher_type === 'سند قبض' || v.voucher_type === 'سند تسديد مخالفة' || v.voucher_type === 'سند تأمين (قبض)';
                const isDebit = v.voucher_type === 'سلفة' || v.voucher_type === 'سند تأمين (مديونية)';

                if (isCredit) {
                  const cash = parseFloat(v.cash_amount || 0);
                  const net = parseFloat(v.network_amount || 0);
                  let baseDesc = v.description + ` (${v.voucher_type})`;
                  
                  if (cash > 0) {
                    statements.push({
                      id: `voucher-cash-${v.id}`,
                      date: v.voucher_date,
                      description: baseDesc + ' (كاش)',
                      debit: 0,
                      credit: cash,
                      category: 'cash',
                      invoice_id: inv ? inv.id : null
                    });
                  }
                  if (net > 0) {
                    statements.push({
                      id: `voucher-net-${v.id}`,
                      date: v.voucher_date,
                      description: baseDesc + ' (شبكة)',
                      debit: 0,
                      credit: net,
                      category: 'network',
                      invoice_id: inv ? inv.id : null
                    });
                  }
                  current_week_required -= parseFloat(v.amount || 0);
                } else if (isDebit) {
                  statements.push({
                    id: `voucher-debit-${v.id}`,
                    date: v.voucher_date,
                    description: v.description + ` (${v.voucher_type})`,
                    debit: parseFloat(v.amount || 0),
                    credit: 0,
                    category: 'advance'
                  });
                  current_week_required += parseFloat(v.amount || 0);
                } else {
                  if (parseFloat(v.amount || 0) > 0) {
                    statements.push({
                      id: `voucher-misc-${v.id}`,
                      date: v.voucher_date,
                      description: v.description,
                      debit: parseFloat(v.amount || 0),
                      credit: 0,
                      category: 'advance'
                    });
                    current_week_required += parseFloat(v.amount || 0);
                  }
                }
              });
              
              if (statements.length > 0) {
                statements.sort((a, b) => {
                  const dateA = new Date(a.date).getTime();
                  const dateB = new Date(b.date).getTime();
                  if (dateA !== dateB) return dateA - dateB;
                  return String(a.id).localeCompare(String(b.id));
                });
                
                let runningBalance = 0;
                statements = statements.map(s => {
                  runningBalance += (s.debit - s.credit);
                  return { ...s, balance: runningBalance };
                });
                
                statements.reverse();
              }
              
              const financials = getDriverFinancials(driver, contracts, getTable('vouchers'), getTable('violations'), getTable('maintenance'), getTable('purchases'));
              responseData = { ...driver, contracts, statements, current_week_required: financials.net_balance, financials };
            }
          } else if (method === 'PUT') {
            if (driverIndex === -1) {
              status = 404;
              responseData = { error: 'Driver not found' };
            } else {
              drivers[driverIndex] = { id, ...body };
              setTable('drivers', drivers);
              responseData = { message: 'Driver updated successfully' };
            }
          } else if (method === 'DELETE') {
            if (driverIndex === -1) {
              status = 404;
              responseData = { error: 'Driver not found' };
            } else {
              drivers.splice(driverIndex, 1);
              setTable('drivers', drivers);
              responseData = { message: 'Deleted successfully' };
            }
          }
        }
        
        // GET /api/contracts
        else if (path === '/api/contracts' && method === 'GET') {
          const contracts = getTable('contracts');
          const drivers = getTable('drivers');
          const cars = getTable('cars');
          
          responseData = contracts.map(c => {
            const driver = drivers.find(d => d.id == c.driver_id);
            const car = cars.find(car => car.id == c.car_id);
            return {
              ...c,
              driver_name: driver ? driver.name : 'غير معروف',
              plate_number: car ? car.plate_number : 'غير معروف'
            };
          });
        }
        
        // POST /api/contracts
        else if (path === '/api/contracts' && method === 'POST') {
          const contracts = getTable('contracts');
          const nextId = contracts.length > 0 ? Math.max(...contracts.map(c => c.id)) + 1 : 1;
          const newContract = { 
            id: nextId, 
            ...body, 
            rollover_count: 0, 
            last_rollover_date: body.start_date 
          };
          contracts.push(newContract);
          setTable('contracts', contracts);
          
          // Auto generate voucher
          const vouchers = getTable('vouchers');
          const nextVId = vouchers.length > 0 ? Math.max(...vouchers.map(v => v.id)) + 1 : 1;
          const vNumber = "V-" + Date.now();
          
          vouchers.push({
            id: nextVId,
            voucher_number: vNumber,
            voucher_type: "سند تسليم مركبة",
            auto_generated: 1,
            voucher_date: body.start_date,
            amount: 0,
            related_driver_id: parseInt(body.driver_id),
            related_car_id: parseInt(body.car_id),
            description: "سند تسليم مركبة تلقائي لتوقيع العقد",
            cash_amount: 0,
            network_amount: 0
          });
          setTable('vouchers', vouchers);
          
          responseData = { message: 'Contract created and voucher auto-generated', id: nextId };
        }
        
        // DELETE /api/contracts/:id
        else if (path.startsWith('/api/contracts/') && method === 'DELETE') {
          const id = parseInt(path.split('/')[3]);
          const contracts = getTable('contracts');
          const index = contracts.findIndex(c => c.id === id);
          if (index !== -1) {
            contracts.splice(index, 1);
            setTable('contracts', contracts);
            responseData = { message: 'Deleted successfully' };
          } else {
            status = 404;
            responseData = { error: 'Record not found' };
          }
        }
        
        // GET /api/violations
        else if (path === '/api/violations' && method === 'GET') {
          responseData = getTable('violations').reverse();
        }
        
        // POST /api/violations
        else if (path === '/api/violations' && method === 'POST') {
          const violations = getTable('violations');
          const nextId = violations.length > 0 ? Math.max(...violations.map(v => v.id)) + 1 : 1;
          const newViolation = { id: nextId, ...body };
          violations.push(newViolation);
          setTable('violations', violations);
          responseData = { message: 'Violation added successfully', id: nextId };
        }
        
        // DELETE /api/violations/:id
        else if (path.startsWith('/api/violations/') && method === 'DELETE') {
          const id = parseInt(path.split('/')[3]);
          const violations = getTable('violations');
          const index = violations.findIndex(v => v.id === id);
          if (index !== -1) {
            violations.splice(index, 1);
            setTable('violations', violations);
            responseData = { message: 'Deleted successfully' };
          } else {
            status = 404;
            responseData = { error: 'Record not found' };
          }
        }
        
        // POST /api/maintenance
        else if (path === '/api/maintenance' && method === 'POST') {
          const maintenance = getTable('maintenance');
          const nextId = maintenance.length > 0 ? Math.max(...maintenance.map(m => m.id)) + 1 : 1;
          const newMaint = {
            id: nextId,
            car_id: parseInt(body.car_id),
            kilometers: parseInt(body.kilometers),
            oil_change: body.oil_change ? 1 : 0,
            filter_change: body.filter_change ? 1 : 0,
            cost: parseFloat(body.cost || 0),
            labor_cost: parseFloat(body.labor_cost || 0),
            amount_from_driver: parseFloat(body.amount_from_driver || 0),
            deducted_from_weekly: parseFloat(body.deducted_from_weekly || 0),
            description: body.description || '',
            maintenance_date: body.maintenance_date || new Date().toISOString().split('T')[0]
          };
          maintenance.push(newMaint);
          setTable('maintenance', maintenance);
          responseData = { message: 'Maintenance added successfully', id: nextId };
        }
        
        // DELETE /api/maintenance/:id
        else if (path.startsWith('/api/maintenance/') && method === 'DELETE') {
          const id = parseInt(path.split('/')[3]);
          const maintenance = getTable('maintenance');
          const index = maintenance.findIndex(m => m.id === id);
          if (index !== -1) {
            maintenance.splice(index, 1);
            setTable('maintenance', maintenance);
            responseData = { message: 'Deleted successfully' };
          } else {
            status = 404;
            responseData = { error: 'Record not found' };
          }
        }
        
        // POST /api/car_documents
        else if (path === '/api/car_documents' && method === 'POST') {
          const documents = getTable('car_documents');
          const nextId = documents.length > 0 ? Math.max(...documents.map(d => d.id)) + 1 : 1;
          const newDoc = { id: nextId, ...body };
          documents.push(newDoc);
          setTable('car_documents', documents);
          responseData = { id: nextId };
        }
        
        // DELETE /api/car_documents/:id
        else if (path.startsWith('/api/car_documents/') && method === 'DELETE') {
          const id = parseInt(path.split('/')[3]);
          const documents = getTable('car_documents');
          const index = documents.findIndex(d => d.id === id);
          if (index !== -1) {
            documents.splice(index, 1);
            setTable('car_documents', documents);
            responseData = { message: 'Deleted successfully' };
          } else {
            status = 404;
            responseData = { error: 'Record not found' };
          }
        }
        
        // GET /api/vouchers
        else if (path === '/api/vouchers' && method === 'GET') {
          const vouchers = getTable('vouchers');
          const invoices = getTable('invoices');
          
          responseData = vouchers.map(v => {
            const inv = invoices.find(i => i.voucher_id === v.id);
            return {
              ...v,
              invoice_id: inv ? inv.id : null
            };
          }).reverse();
        }
        
        // GET /api/vouchers/:id
        else if (path.startsWith('/api/vouchers/') && !path.endsWith('/convert-to-invoice') && method === 'GET') {
          const id = parseInt(path.split('/')[3]);
          const vouchers = getTable('vouchers');
          const voucher = vouchers.find(v => v.id === id);
          
          if (!voucher) {
            status = 404;
            responseData = { error: 'Voucher not found' };
          } else {
            const driver = getTable('drivers').find(d => d.id == voucher.related_driver_id);
            const car = getTable('cars').find(c => c.id == voucher.related_car_id);
            
            const detailedVoucher = {
              ...voucher,
              driver_name: driver ? driver.name : null,
              driver_national_id: driver ? driver.national_id : null,
              driver_phone: driver ? driver.phone : null,
              plate_number: car ? car.plate_number : null,
              car_company: car ? car.company : null,
              car_model: car ? car.model : null,
              car_year: car ? car.year : null,
              car_color: car ? car.color : null
            };
            
            if (voucher.voucher_type === 'سند تسليم مركبة' && voucher.related_driver_id && voucher.related_car_id) {
              const contract = getTable('contracts').find(c => c.driver_id == voucher.related_driver_id && c.car_id == voucher.related_car_id);
              if (contract) detailedVoucher.contract = contract;
            }
            responseData = detailedVoucher;
          }
        }
        
        // POST /api/vouchers
        else if (path === '/api/vouchers' && method === 'POST') {
          const vouchers = getTable('vouchers');
          const nextId = vouchers.length > 0 ? Math.max(...vouchers.map(v => v.id)) + 1 : 1;
          const vNumber = "V-" + Date.now();
          
          let cash_amount = parseFloat(body.cash_amount || 0);
          let network_amount = parseFloat(body.network_amount || 0);
          
          if (cash_amount === 0 && network_amount === 0 && body.amount) {
            const amt = parseFloat(body.amount || 0);
            if (body.payment_method === 'شبكة') {
              network_amount = amt;
            } else {
              cash_amount = amt;
            }
          }
          
          const totalAmount = cash_amount + network_amount;
          
          const newVoucher = {
            id: nextId,
            voucher_number: vNumber,
            voucher_type: body.voucher_type,
            auto_generated: 0,
            voucher_date: body.voucher_date,
            amount: totalAmount,
            related_driver_id: body.related_driver_id ? parseInt(body.related_driver_id) : null,
            related_car_id: body.related_car_id ? parseInt(body.related_car_id) : null,
            description: body.description || '',
            cash_amount,
            network_amount
          };
          vouchers.push(newVoucher);
          setTable('vouchers', vouchers);
          responseData = { id: nextId };
        }
        
        // POST /api/contracts/:id/rollover
        else if (path.startsWith('/api/contracts/') && path.endsWith('/rollover') && method === 'POST') {
          const contractId = parseInt(path.split('/')[3]);
          const contracts = getTable('contracts');
          const contractIndex = contracts.findIndex(c => c.id === contractId);
          if (contractIndex === -1) {
            status = 404;
            responseData = { error: 'العقد غير موجود' };
          } else {
            const contract = contracts[contractIndex];
            const currentWeeks = getContractWeeksCount(contract);
            contract.rollover_count = Math.max(parseInt(contract.rollover_count || 0), currentWeeks);
            contract.last_rollover_date = new Date().toISOString().split('T')[0];
            contracts[contractIndex] = contract;
            setTable('contracts', contracts);
            responseData = { message: 'تم ترحيل وفتح الدورة الأسبوعية الجديدة بنجاح', week_number: contract.rollover_count + 1 };
          }
        }

        // POST /api/recurring-billing/process
        else if (path === '/api/recurring-billing/process' && method === 'POST') {
          const contracts = getTable('contracts');
          let updatedCount = 0;
          contracts.forEach(c => {
            const autoWeeks = getContractWeeksCount(c);
            if (autoWeeks > (c.rollover_count || 0) + 1) {
              c.rollover_count = autoWeeks - 1;
              updatedCount++;
            }
          });
          setTable('contracts', contracts);
          responseData = { message: 'تم تحديث وأتمتة الاستحقاق الأسبوعي بنجاح', updated_contracts: updatedCount };
        }
        
        // GET /api/purchases
        else if (path === '/api/purchases' && method === 'GET') {
          const purchases = getTable('purchases');
          const purchaseItems = getTable('purchase_items');
          const drivers = getTable('drivers');
          const cars = getTable('cars');
          
          responseData = purchases.map(p => {
            const driver = drivers.find(d => d.id == p.driver_id);
            const car = cars.find(c => c.id == p.car_id);
            const items = purchaseItems.filter(it => it.purchase_id === p.id || it.invoice_id === p.id);
            const grandTotal = parseFloat(p.grand_total || p.total_amount || 0);

            return {
              ...p,
              grand_total: grandTotal,
              total_amount: grandTotal,
              items: items,
              items_count: items.length,
              driver_name: driver ? driver.name : 'غير معروف',
              plate_number: car ? car.plate_number : 'غير معروف'
            };
          }).reverse();
        }

        // GET /api/purchases/:id
        else if (path.startsWith('/api/purchases/') && method === 'GET' && !path.includes('/items')) {
          const id = parseInt(path.split('/')[3]);
          const purchases = getTable('purchases');
          const p = purchases.find(item => item.id === id);
          if (!p) {
            status = 404;
            responseData = { error: 'فاتورة المشتريات غير موجودة' };
          } else {
            const purchaseItems = getTable('purchase_items');
            const driver = getTable('drivers').find(d => d.id == p.driver_id);
            const car = getTable('cars').find(c => c.id == p.car_id);
            const items = purchaseItems.filter(it => it.purchase_id === id || it.invoice_id === id);
            responseData = {
              ...p,
              grand_total: parseFloat(p.grand_total || p.total_amount || 0),
              total_amount: parseFloat(p.grand_total || p.total_amount || 0),
              items,
              driver_name: driver ? driver.name : 'غير معروف',
              plate_number: car ? car.plate_number : 'غير معروف'
            };
          }
        }
        
        // POST /api/purchases (Multi-item transactional architecture)
        else if (path === '/api/purchases' && method === 'POST') {
          const txResult = runInTransaction(() => {
            const purchases = getTable('purchases');
            const purchaseItems = getTable('purchase_items');
            const nextId = purchases.length > 0 ? Math.max(...purchases.map(p => p.id)) + 1 : 1;

            let itemsList = Array.isArray(body.items) && body.items.length > 0 ? body.items : null;
            let grandTotal = 0;

            if (itemsList) {
              itemsList = itemsList.map(it => {
                const qty = parseFloat(it.quantity || 1);
                const price = parseFloat(it.unit_price || 0);
                const lineTotal = parseFloat((qty * price).toFixed(2));
                grandTotal += lineTotal;
                return {
                  description: (it.description || it.product_name || 'بند مشتريات').trim(),
                  quantity: qty,
                  unit_price: price,
                  line_total: lineTotal
                };
              });
              grandTotal = parseFloat(grandTotal.toFixed(2));
            } else {
              grandTotal = parseFloat(body.total_amount || body.grand_total || 0);
              itemsList = [{
                description: (body.product_name || 'بند مشتريات رئيسي').trim(),
                quantity: 1,
                unit_price: grandTotal,
                line_total: grandTotal
              }];
            }

            if (grandTotal <= 0) {
              throw new Error('يجب أن يكون إجمالي فاتورة المشتريات أكبر من الصفر.');
            }

            const driverPaid = parseFloat(body.driver_paid_amount || 0);
            const debtCharge = parseFloat(body.debt_charge_amount || 0);
            const reimbursement = parseFloat(body.reimbursement_amount || 0);

            if ((driverPaid + debtCharge) > grandTotal + 0.01) {
              throw new Error('مجموع (المبلغ المدفوع من السائق + الدين المقيد) لا يمكن أن يكون أكبر من المبلغ الكلي للفاتورة.');
            }
            if (reimbursement > driverPaid + 0.01) {
              throw new Error('لا يمكن أن يكون مبلغ التعويض أكبر من المبلغ الفعلي الذي دفعه السائق.');
            }

            const productSummary = itemsList.map(it => it.description).join('، ');

            const newPurchase = {
              id: nextId,
              invoice_number: body.invoice_number || ('PINV-' + Date.now()),
              vendor_name: body.vendor_name || 'مورد عام / محلي',
              vendor_id: body.vendor_id || null,
              driver_id: parseInt(body.driver_id),
              car_id: parseInt(body.car_id),
              invoice_date: body.invoice_date || new Date().toISOString().split('T')[0],
              product_name: productSummary || body.product_name,
              total_amount: grandTotal,
              grand_total: grandTotal,
              driver_paid_amount: driverPaid,
              reimbursement_amount: reimbursement,
              debt_charge_amount: debtCharge,
              settlement_type: body.settlement_type || (debtCharge > 0 ? 'debt' : 'reimbursement'),
              status: 'مكتملة',
              created_at: new Date().toISOString()
            };

            purchases.push(newPurchase);
            setTable('purchases', purchases);

            // Backfill and create child line-items in purchase_items
            let nextItemId = purchaseItems.length > 0 ? Math.max(...purchaseItems.map(it => it.id)) + 1 : 1;
            itemsList.forEach(it => {
              purchaseItems.push({
                id: nextItemId++,
                purchase_id: nextId,
                invoice_id: nextId,
                description: it.description,
                quantity: it.quantity,
                unit_price: it.unit_price,
                line_total: it.line_total,
                created_at: newPurchase.invoice_date
              });
            });
            setTable('purchase_items', purchaseItems);

            return { id: nextId, invoice_number: newPurchase.invoice_number, items_count: itemsList.length };
          });

          if (txResult.success) {
            responseData = { message: 'تم تسجيل فاتورة المشتريات متعددة البنود بنجاح', ...txResult.data };
          } else {
            status = 400;
            responseData = { error: txResult.error };
          }
        }
        
        // PUT /api/purchases/:id (Multi-item transactional update)
        else if (path.startsWith('/api/purchases/') && method === 'PUT') {
          const id = parseInt(path.split('/')[3]);
          const txResult = runInTransaction(() => {
            const purchases = getTable('purchases');
            const purchaseItems = getTable('purchase_items');
            const index = purchases.findIndex(p => p.id === id);
            if (index === -1) {
              throw new Error('فاتورة المشتريات غير موجودة');
            }

            let itemsList = Array.isArray(body.items) && body.items.length > 0 ? body.items : null;
            let grandTotal = 0;

            if (itemsList) {
              itemsList = itemsList.map(it => {
                const qty = parseFloat(it.quantity || 1);
                const price = parseFloat(it.unit_price || 0);
                const lineTotal = parseFloat((qty * price).toFixed(2));
                grandTotal += lineTotal;
                return {
                  description: (it.description || it.product_name || 'بند مشتريات').trim(),
                  quantity: qty,
                  unit_price: price,
                  line_total: lineTotal
                };
              });
              grandTotal = parseFloat(grandTotal.toFixed(2));
            } else {
              grandTotal = parseFloat(body.total_amount || body.grand_total || 0);
              itemsList = [{
                description: (body.product_name || 'بند مشتريات رئيسي').trim(),
                quantity: 1,
                unit_price: grandTotal,
                line_total: grandTotal
              }];
            }

            if (grandTotal <= 0) {
              throw new Error('يجب أن يكون إجمالي فاتورة المشتريات أكبر من الصفر.');
            }

            const driverPaid = parseFloat(body.driver_paid_amount || 0);
            const debtCharge = parseFloat(body.debt_charge_amount || 0);
            const reimbursement = parseFloat(body.reimbursement_amount || 0);

            if ((driverPaid + debtCharge) > grandTotal + 0.01) {
              throw new Error('مجموع (المبلغ المدفوع من السائق + الدين المقيد) لا يمكن أن يكون أكبر من المبلغ الكلي للفاتورة.');
            }
            if (reimbursement > driverPaid + 0.01) {
              throw new Error('لا يمكن أن يكون مبلغ التعويض أكبر من المبلغ الفعلي الذي دفعه السائق.');
            }

            const productSummary = itemsList.map(it => it.description).join('، ');

            const updatedPurchase = {
              ...purchases[index],
              invoice_number: body.invoice_number || purchases[index].invoice_number || ('PINV-' + id),
              vendor_name: body.vendor_name || purchases[index].vendor_name || 'مورد عام / محلي',
              vendor_id: body.vendor_id || purchases[index].vendor_id || null,
              driver_id: parseInt(body.driver_id),
              car_id: parseInt(body.car_id),
              invoice_date: body.invoice_date,
              product_name: productSummary || body.product_name,
              total_amount: grandTotal,
              grand_total: grandTotal,
              driver_paid_amount: driverPaid,
              reimbursement_amount: reimbursement,
              debt_charge_amount: debtCharge,
              settlement_type: body.settlement_type || (debtCharge > 0 ? 'debt' : 'reimbursement')
            };

            purchases[index] = updatedPurchase;
            setTable('purchases', purchases);

            // Re-sync items in purchase_items
            const remainingItems = purchaseItems.filter(it => it.purchase_id !== id && it.invoice_id !== id);
            let nextItemId = remainingItems.length > 0 ? Math.max(...remainingItems.map(it => it.id)) + 1 : 1;
            itemsList.forEach(it => {
              remainingItems.push({
                id: nextItemId++,
                purchase_id: id,
                invoice_id: id,
                description: it.description,
                quantity: it.quantity,
                unit_price: it.unit_price,
                line_total: it.line_total,
                created_at: updatedPurchase.invoice_date
              });
            });
            setTable('purchase_items', remainingItems);

            return { id, items_count: itemsList.length };
          });

          if (txResult.success) {
            responseData = { message: 'تم تحديث فاتورة المشتريات والبنود بنجاح' };
          } else {
            status = 400;
            responseData = { error: txResult.error };
          }
        }
        
        // DELETE /api/purchases/:id (Multi-item transactional delete)
        else if (path.startsWith('/api/purchases/') && method === 'DELETE') {
          const id = parseInt(path.split('/')[3]);
          const txResult = runInTransaction(() => {
            const purchases = getTable('purchases');
            const purchaseItems = getTable('purchase_items');
            const index = purchases.findIndex(p => p.id === id);
            if (index === -1) {
              throw new Error('السجل غير موجود');
            }
            purchases.splice(index, 1);
            setTable('purchases', purchases);

            const filteredItems = purchaseItems.filter(it => it.purchase_id !== id && it.invoice_id !== id);
            setTable('purchase_items', filteredItems);
            return { id };
          });

          if (txResult.success) {
            responseData = { message: 'تم حذف فاتورة المشتريات وكافة بنودها بنجاح' };
          } else {
            status = 404;
            responseData = { error: txResult.error };
          }
        }

        // ==========================================
        // GENERAL SETTLEMENTS (التسوية العامة) CRUD
        // ==========================================
        // GET /api/general-settlements
        else if (path === '/api/general-settlements' && method === 'GET') {
          const settlements = getTable('general_settlements');
          const drivers = getTable('drivers');
          const cars = getTable('cars');

          responseData = settlements.map(s => {
            const driver = drivers.find(d => d.id == s.driver_id);
            const car = cars.find(c => c.id == s.car_id);
            return {
              ...s,
              driver_name: driver ? driver.name : 'غير محدد',
              plate_number: car ? `${car.plate_number} - ${car.company} ${car.model}` : 'غير محددة'
            };
          }).reverse();
        }

        // GET /api/general-settlements/:id
        else if (path.startsWith('/api/general-settlements/') && method === 'GET') {
          const id = parseInt(path.split('/')[3]);
          const settlements = getTable('general_settlements');
          const s = settlements.find(item => item.id === id);
          if (!s) {
            status = 404;
            responseData = { error: 'سجل التسوية العامة غير موجود' };
          } else {
            const driver = getTable('drivers').find(d => d.id == s.driver_id);
            const car = getTable('cars').find(c => c.id == s.car_id);
            responseData = {
              ...s,
              driver_name: driver ? driver.name : 'غير محدد',
              plate_number: car ? car.plate_number : 'غير محددة'
            };
          }
        }

        // POST /api/general-settlements
        else if (path === '/api/general-settlements' && method === 'POST') {
          const txResult = runInTransaction(() => {
            const settlements = getTable('general_settlements');
            const nextId = settlements.length > 0 ? Math.max(...settlements.map(s => s.id)) + 1 : 1;

            const amount = parseFloat(body.amount || 0);
            if (isNaN(amount) || amount <= 0) {
              throw new Error('يرجى تحديد مبلغ تسوية صحيح أكبر من الصفر.');
            }
            if (!body.driver_id) {
              throw new Error('يرجى اختيار السائق المعني بالتسوية.');
            }
            if (!body.settlement_date) {
              throw new Error('يرجى تحديد تاريخ التسوية.');
            }

            const newSettlement = {
              id: nextId,
              settlement_number: 'SET-' + Date.now(),
              driver_id: parseInt(body.driver_id),
              car_id: body.car_id ? parseInt(body.car_id) : null,
              settlement_date: body.settlement_date,
              category: body.category || 'تسوية رصيد عامة',
              settlement_type: body.settlement_type || 'تعويض',
              driver_impact: body.driver_impact || 'credit', // 'credit' (دائن للسائق) or 'debit' (مدين على السائق)
              amount: amount,
              description: body.description || '',
              notes: body.notes || '',
              status: body.status || 'معتمدة',
              created_at: new Date().toISOString()
            };

            settlements.push(newSettlement);
            setTable('general_settlements', settlements);
            return newSettlement;
          });

          if (txResult.success) {
            responseData = { message: 'تم تسجيل التسوية العامة بنجاح', ...txResult.data };
          } else {
            status = 400;
            responseData = { error: txResult.error };
          }
        }

        // PUT /api/general-settlements/:id
        else if (path.startsWith('/api/general-settlements/') && method === 'PUT') {
          const id = parseInt(path.split('/')[3]);
          const txResult = runInTransaction(() => {
            const settlements = getTable('general_settlements');
            const index = settlements.findIndex(s => s.id === id);
            if (index === -1) {
              throw new Error('سجل التسوية العامة غير موجود');
            }

            const amount = parseFloat(body.amount || 0);
            if (isNaN(amount) || amount <= 0) {
              throw new Error('يرجى تحديد مبلغ تسوية صحيح أكبر من الصفر.');
            }

            settlements[index] = {
              ...settlements[index],
              driver_id: parseInt(body.driver_id),
              car_id: body.car_id ? parseInt(body.car_id) : null,
              settlement_date: body.settlement_date,
              category: body.category || settlements[index].category,
              settlement_type: body.settlement_type || settlements[index].settlement_type,
              driver_impact: body.driver_impact || settlements[index].driver_impact,
              amount: amount,
              description: body.description || settlements[index].description,
              notes: body.notes !== undefined ? body.notes : settlements[index].notes,
              status: body.status || settlements[index].status
            };

            setTable('general_settlements', settlements);
            return settlements[index];
          });

          if (txResult.success) {
            responseData = { message: 'تم تحديث التسوية العامة بنجاح', data: txResult.data };
          } else {
            status = 400;
            responseData = { error: txResult.error };
          }
        }

        // DELETE /api/general-settlements/:id
        else if (path.startsWith('/api/general-settlements/') && method === 'DELETE') {
          const id = parseInt(path.split('/')[3]);
          const settlements = getTable('general_settlements');
          const index = settlements.findIndex(s => s.id === id);
          if (index !== -1) {
            settlements.splice(index, 1);
            setTable('general_settlements', settlements);
            responseData = { message: 'تم حذف التسوية العامة بنجاح' };
          } else {
            status = 404;
            responseData = { error: 'سجل التسوية غير موجود' };
          }
        }

        // ==========================================
        // WEEKLY DELIVERIES (التوريد الأسبوعي)
        // ==========================================
        // GET /api/weekly-deliveries
        else if (path === '/api/weekly-deliveries' && method === 'GET') {
          const deliveries = getTable('weekly_deliveries');
          const drivers = getTable('drivers');
          const cars = getTable('cars');
          const contracts = getTable('contracts');

          let filtered = [...deliveries];
          const driverId = parsedUrl.searchParams.get('driver_id');
          const fromDate = parsedUrl.searchParams.get('from');
          const toDate = parsedUrl.searchParams.get('to');

          if (driverId) filtered = filtered.filter(d => d.driver_id == driverId);
          if (fromDate || toDate) filtered = filtered.filter(d => inDateRange(d.delivery_date, fromDate, toDate));

          responseData = filtered.map(del => {
            const driver = drivers.find(d => d.id == del.driver_id);
            const car = cars.find(c => c.id == del.car_id);
            const contract = contracts.find(c => c.id == del.contract_id);
            return {
              ...del,
              driver_name: driver ? driver.name : 'غير محدد',
              plate_number: car ? `${car.plate_number} - ${car.company} ${car.model}` : 'غير محددة',
              contract_start_date: contract ? contract.start_date : null
            };
          }).sort((a, b) => new Date(b.delivery_date) - new Date(a.delivery_date));
        }

        // POST /api/weekly-deliveries
        else if (path === '/api/weekly-deliveries' && method === 'POST') {
          const txResult = runInTransaction(() => {
            const deliveries = getTable('weekly_deliveries');
            const contracts = getTable('contracts');
            const nextId = deliveries.length > 0 ? Math.max(...deliveries.map(d => d.id)) + 1 : 1;

            const deliveryDate = body.delivery_date;
            if (!deliveryDate) {
              throw new Error('يرجى تحديد تاريخ التوريد الأسبوعي.');
            }

            // 1. Enforce strict Friday schedule (dayOfWeek === 5)
            if (!isFriday(deliveryDate)) {
              throw new Error('قاعدة التوريد الأسبوعي الصارمة: يجب أن يكون تاريخ التوريد يوم الجمعة حصراً.');
            }

            // 2. Enforce contract boundary: delivery_date >= contract_date
            const contract = contracts.find(c => c.id == body.contract_id);
            if (contract && deliveryDate < contract.start_date) {
              throw new Error(`خطأ: تاريخ التوريد (${deliveryDate}) لا يمكن أن يسبق تاريخ بدء العقد (${contract.start_date}).`);
            }

            const newDelivery = {
              id: nextId,
              contract_id: body.contract_id ? parseInt(body.contract_id) : null,
              driver_id: parseInt(body.driver_id),
              car_id: body.car_id ? parseInt(body.car_id) : null,
              delivery_date: deliveryDate,
              week_number: parseInt(body.week_number || 1),
              amount_due: parseFloat(body.amount_due || 0),
              amount_paid: parseFloat(body.amount_paid || 0),
              status: body.status || 'مستحق',
              notes: body.notes || 'توريد أسبوعي ليوم الجمعة',
              created_at: new Date().toISOString()
            };

            deliveries.push(newDelivery);
            setTable('weekly_deliveries', deliveries);
            return newDelivery;
          });

          if (txResult.success) {
            responseData = { message: 'تم تسجيل التوريد الأسبوعي بنجاح', ...txResult.data };
          } else {
            status = 400;
            responseData = { error: txResult.error };
          }
        }

        // POST /api/weekly-deliveries/sanitize
        else if (path === '/api/weekly-deliveries/sanitize' && method === 'POST') {
          const contracts = getTable('contracts');
          const deliveries = getTable('weekly_deliveries');
          const auditLogs = getTable('audit_logs');
          let pruned = 0;
          const valid = [];

          deliveries.forEach(del => {
            const contract = contracts.find(c => c.id == del.contract_id);
            if (contract && del.delivery_date < contract.start_date) {
              auditLogs.push({
                id: Date.now() + Math.random(),
                action: 'PRUNE_OUT_OF_BOUNDS_DELIVERY',
                target_table: 'weekly_deliveries',
                record_id: del.id,
                contract_id: contract.id,
                reason: `تاريخ التوريد ${del.delivery_date} يسبق تاريخ العقد ${contract.start_date}`,
                pruned_record: del,
                pruned_at: new Date().toISOString()
              });
              pruned++;
            } else {
              valid.push(del);
            }
          });

          setTable('weekly_deliveries', valid);
          setTable('audit_logs', auditLogs);
          responseData = { message: `تم فحص وتطهير التوريدات الأسبوعية بنجاح. تم استبعاد ${pruned} سجل غير صالح وأرشفتها في سجل التدقيق.`, pruned_count: pruned };
        }
        
        // POST /api/vouchers/:id/convert-to-invoice
        else if (path.startsWith('/api/vouchers/') && path.endsWith('/convert-to-invoice')) {
          const voucherId = parseInt(path.split('/')[3]);
          const vouchers = getTable('vouchers');
          const voucher = vouchers.find(v => v.id === voucherId);
          
          if (!voucher) {
            status = 404;
            responseData = { error: 'السند غير موجود' };
          } else if (voucher.voucher_type !== 'سند قبض') {
            status = 400;
            responseData = { error: 'يمكن فقط تحويل سندات القبض إلى فواتير' };
          } else {
            const invoices = getTable('invoices');
            const existing = invoices.find(i => i.voucher_id === voucherId);
            if (existing) {
              status = 400;
              responseData = { error: 'هذا السند تم تحويله بالفعل إلى فاتورة' };
            } else {
              const nextId = invoices.length > 0 ? Math.max(...invoices.map(i => i.id)) + 1 : 1;
              const invoice_number = 'INV-' + Date.now();
              const service_type = 'خدمة نقل ركاب بالسيارات الأجرة العامة';
              
              const newInvoice = {
                id: nextId,
                invoice_number,
                vehicle_id: voucher.related_car_id || null,
                amount: parseFloat(voucher.amount || 0),
                service_type,
                invoice_date: voucher.voucher_date,
                voucher_id: voucher.id,
                driver_id: voucher.related_driver_id || null
              };
              
              invoices.push(newInvoice);
              setTable('invoices', invoices);
              responseData = { id: nextId, invoice_number };
            }
          }
        }
        
        // DELETE /api/vouchers/:id
        else if (path.startsWith('/api/vouchers/') && method === 'DELETE') {
          const id = parseInt(path.split('/')[3]);
          const vouchers = getTable('vouchers');
          const index = vouchers.findIndex(v => v.id === id);
          if (index !== -1) {
            vouchers.splice(index, 1);
            setTable('vouchers', vouchers);
            responseData = { message: 'Deleted successfully' };
          } else {
            status = 404;
            responseData = { error: 'Record not found' };
          }
        }
        
        // GET /api/invoices
        else if (path === '/api/invoices' && method === 'GET') {
          const invoices = getTable('invoices');
          const cars = getTable('cars');
          const drivers = getTable('drivers');
          const vouchers = getTable('vouchers');
          
          responseData = invoices.map(inv => {
            const car = cars.find(c => c.id == inv.vehicle_id);
            const driver = drivers.find(d => d.id == inv.driver_id);
            const voucher = vouchers.find(v => v.id == inv.voucher_id);
            return {
              ...inv,
              plate_number: car ? car.plate_number : null,
              company: car ? car.company : null,
              model: car ? car.model : null,
              driver_name: driver ? driver.name : null,
              receipt_number: voucher ? voucher.voucher_number : null
            };
          }).reverse();
        }
        
        // GET /api/invoices/:id
        else if (path.startsWith('/api/invoices/') && method === 'GET') {
          const id = parseInt(path.split('/')[3]);
          const invoices = getTable('invoices');
          const invoice = invoices.find(i => i.id === id);
          
          if (!invoice) {
            status = 404;
            responseData = { error: 'Invoice not found' };
          } else {
            const car = getTable('cars').find(c => c.id == invoice.vehicle_id);
            const driver = getTable('drivers').find(d => d.id == invoice.driver_id);
            const voucher = getTable('vouchers').find(v => v.id == invoice.voucher_id);
            
            responseData = {
              ...invoice,
              plate_number: car ? car.plate_number : null,
              company: car ? car.company : null,
              model: car ? car.model : null,
              year: car ? car.year : null,
              color: car ? car.color : null,
              driver_name: driver ? driver.name : null,
              driver_national_id: driver ? driver.national_id : null,
              receipt_number: voucher ? voucher.voucher_number : null
            };
          }
        }
        
        // POST /api/invoices
        else if (path === '/api/invoices' && method === 'POST') {
          const invoices = getTable('invoices');
          const nextId = invoices.length > 0 ? Math.max(...invoices.map(i => i.id)) + 1 : 1;
          const invoice_number = 'INV-' + Date.now();
          const date = body.invoice_date || new Date().toISOString().split('T')[0];
          
          const newInvoice = {
            id: nextId,
            invoice_number,
            vehicle_id: body.vehicle_id || null,
            amount: parseFloat(body.amount || 0),
            service_type: body.service_type || 'خدمة نقل ركاب بالسيارات الأجرة العامة',
            invoice_date: date,
            voucher_id: body.voucher_id || null,
            driver_id: body.driver_id || null
          };
          invoices.push(newInvoice);
          setTable('invoices', invoices);
          
          responseData = { id: nextId, invoice_number };
        }
        
        // DELETE /api/:table/:id fallback
        else if (method === 'DELETE' && path.match(/^\/api\/([a-z_]+)\/(\d+)$/)) {
          const match = path.match(/^\/api\/([a-z_]+)\/(\d+)$/);
          const table = match[1];
          const id = parseInt(match[2]);
          const arr = getTable(table);
          const index = arr.findIndex(item => item.id === id);
          if (index !== -1) {
            arr.splice(index, 1);
            setTable(table, arr);
            responseData = { message: 'Deleted successfully' };
          } else {
            status = 404;
            responseData = { error: 'Record not found' };
          }
        }
        
        // GET /api/downtimes
        else if (path === '/api/downtimes' && method === 'GET') {
          const downtimes = getTable('downtimes');
          const drivers = getTable('drivers');
          const cars = getTable('cars');
          responseData = downtimes.map(dt => {
            const driver = drivers.find(d => d.id == dt.driver_id);
            const car = cars.find(c => c.id == dt.car_id);
            return {
              ...dt,
              driver_name: driver ? driver.name : 'غير معروف',
              plate_number: car ? car.plate_number : 'غير معروف',
              car_label: car ? `${car.plate_number} - ${car.company} ${car.model}` : 'غير معروف'
            };
          }).reverse();
        }

        // POST /api/downtimes
        else if (path === '/api/downtimes' && method === 'POST') {
          const downtimes = getTable('downtimes');
          const nextId = downtimes.length > 0 ? Math.max(...downtimes.map(d => d.id)) + 1 : 1;

          if (!body.car_id || !body.driver_id || !body.start_date || !body.end_date) {
            status = 400;
            responseData = { error: 'يرجى تعبئة جميع الحقول المطلوبة (السيارة، السائق، تاريخ البداية والنهاية)' };
          } else {
            const startD = new Date(body.start_date + 'T00:00:00');
            const endD = new Date(body.end_date + 'T00:00:00');
            if (endD < startD) {
              status = 400;
              responseData = { error: 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية' };
            } else {
              const diffMs = endD.getTime() - startD.getTime();
              const days_count = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);
              let daily_deduction = parseFloat(body.daily_deduction || 0);

              // Auto-calculate from contract if not provided
              if (daily_deduction <= 0) {
                const contracts = getTable('contracts');
                const driverContract = contracts.filter(c => c.driver_id == body.driver_id);
                if (driverContract.length > 0) {
                  const latestContract = driverContract[driverContract.length - 1];
                  daily_deduction = parseFloat(latestContract.weekly_required || 0) / 7;
                }
              }

              const total_deduction = Math.round(daily_deduction * days_count * 100) / 100;

              const newDowntime = {
                id: nextId,
                car_id: parseInt(body.car_id),
                driver_id: parseInt(body.driver_id),
                start_date: body.start_date,
                end_date: body.end_date,
                days_count,
                daily_deduction,
                total_deduction,
                reason: body.reason || '',
                created_at: new Date().toISOString().split('T')[0]
              };
              downtimes.push(newDowntime);
              setTable('downtimes', downtimes);
              responseData = { message: 'تم تسجيل وقوف السيارة بنجاح', id: nextId, total_deduction };
            }
          }
        }

        // DELETE /api/downtimes/:id
        else if (path.startsWith('/api/downtimes/') && method === 'DELETE') {
          const id = parseInt(path.split('/')[3]);
          const downtimes = getTable('downtimes');
          const index = downtimes.findIndex(d => d.id === id);
          if (index !== -1) {
            downtimes.splice(index, 1);
            setTable('downtimes', downtimes);
            responseData = { message: 'تم حذف سجل الوقوف بنجاح' };
          } else {
            status = 404;
            responseData = { error: 'سجل الوقوف غير موجود' };
          }
        }

        // POST /api/data-reset
        else if (path === '/api/data-reset' && method === 'POST') {
          const cutoffDate = body.cutoff_date || '2026-09-01';
          const cutoffTime = new Date(cutoffDate + 'T00:00:00').getTime();
          const report = {};

          const financialTables = [
            { name: 'vouchers', dateField: 'voucher_date' },
            { name: 'invoices', dateField: 'invoice_date' },
            { name: 'purchases', dateField: 'invoice_date' },
            { name: 'maintenance', dateField: 'maintenance_date' },
            { name: 'violations', dateField: 'violation_date' },
            { name: 'downtimes', dateField: 'start_date' }
          ];

          financialTables.forEach(({ name, dateField }) => {
            const data = getTable(name);
            const before = data.length;
            const filtered = data.filter(item => {
              const itemDate = item[dateField];
              if (!itemDate) return true;
              const itemTime = new Date(itemDate + 'T00:00:00').getTime();
              return itemTime >= cutoffTime;
            });
            setTable(name, filtered);
            report[name] = { before, after: filtered.length, deleted: before - filtered.length };
          });

          responseData = {
            message: `تم تنظيف السجلات المالية السابقة لتاريخ ${cutoffDate} بنجاح`,
            report,
            preserved: ['cars', 'drivers', 'contracts', 'settings', 'car_documents']
          };
        }

        // GET /api/treasury-report
        else if (path === '/api/treasury-report' && method === 'GET') {
          const fromDate = parsedUrl.searchParams.get('from') || '2000-01-01';
          const toDate = parsedUrl.searchParams.get('to') || '2099-12-31';
          const fromTime = new Date(fromDate + 'T00:00:00').getTime();
          const toTime = new Date(toDate + 'T23:59:59').getTime();

          const vouchers = getTable('vouchers');
          const purchases = getTable('purchases');
          const maintenance = getTable('maintenance');

          // INFLOW: receipts from drivers
          let inflow_vouchers = 0;
          let inflow_violations = 0;
          let inflow_insurance = 0;
          const inflowDetails = [];

          vouchers.forEach(v => {
            const vTime = new Date((v.voucher_date || '2000-01-01') + 'T00:00:00').getTime();
            if (vTime < fromTime || vTime > toTime) return;

            if (v.voucher_type === 'سند قبض') {
              inflow_vouchers += parseFloat(v.amount || 0);
              inflowDetails.push({ date: v.voucher_date, description: v.description || 'سند قبض', amount: parseFloat(v.amount || 0), type: 'سند قبض' });
            } else if (v.voucher_type === 'سند تسديد مخالفة') {
              inflow_violations += parseFloat(v.amount || 0);
              inflowDetails.push({ date: v.voucher_date, description: v.description || 'سند تسديد مخالفة', amount: parseFloat(v.amount || 0), type: 'سند تسديد مخالفة' });
            } else if (v.voucher_type === 'سند تأمين (قبض)') {
              inflow_insurance += parseFloat(v.amount || 0);
              inflowDetails.push({ date: v.voucher_date, description: v.description || 'سند تأمين', amount: parseFloat(v.amount || 0), type: 'سند تأمين (قبض)' });
            }
          });

          const totalInflow = inflow_vouchers + inflow_violations + inflow_insurance;

          // OUTFLOW: purchases, maintenance, advances
          let outflow_purchases = 0;
          let outflow_maintenance = 0;
          let outflow_advances = 0;
          const outflowDetails = [];

          purchases.forEach(p => {
            const pTime = new Date((p.invoice_date || '2000-01-01') + 'T00:00:00').getTime();
            if (pTime < fromTime || pTime > toTime) return;
            const amt = parseFloat(p.total_amount || 0) - parseFloat(p.driver_paid_amount || 0);
            if (amt > 0) {
              outflow_purchases += amt;
              outflowDetails.push({ date: p.invoice_date, description: `مشتريات: ${p.product_name || ''}`, amount: amt, type: 'مشتريات' });
            }
          });

          maintenance.forEach(m => {
            const mTime = new Date((m.maintenance_date || '2000-01-01') + 'T00:00:00').getTime();
            if (mTime < fromTime || mTime > toTime) return;
            const amt = parseFloat(m.cost || 0);
            if (amt > 0) {
              outflow_maintenance += amt;
              outflowDetails.push({ date: m.maintenance_date, description: `صيانة: ${m.description || ''}`, amount: amt, type: 'صيانة' });
            }
          });

          vouchers.forEach(v => {
            const vTime = new Date((v.voucher_date || '2000-01-01') + 'T00:00:00').getTime();
            if (vTime < fromTime || vTime > toTime) return;
            if (v.voucher_type === 'سلفة') {
              outflow_advances += parseFloat(v.amount || 0);
              outflowDetails.push({ date: v.voucher_date, description: v.description || 'سلفة', amount: parseFloat(v.amount || 0), type: 'سلفة' });
            }
          });

          const totalOutflow = outflow_purchases + outflow_maintenance + outflow_advances;

          responseData = {
            period: { from: fromDate, to: toDate },
            inflow: {
              total: Math.round(totalInflow * 100) / 100,
              vouchers_receipts: Math.round(inflow_vouchers * 100) / 100,
              violation_payments: Math.round(inflow_violations * 100) / 100,
              insurance_receipts: Math.round(inflow_insurance * 100) / 100,
              details: inflowDetails.sort((a, b) => new Date(a.date) - new Date(b.date))
            },
            outflow: {
              total: Math.round(totalOutflow * 100) / 100,
              purchases: Math.round(outflow_purchases * 100) / 100,
              maintenance: Math.round(outflow_maintenance * 100) / 100,
              advances: Math.round(outflow_advances * 100) / 100,
              details: outflowDetails.sort((a, b) => new Date(a.date) - new Date(b.date))
            },
            net_balance: Math.round((totalInflow - totalOutflow) * 100) / 100
          };
        }

        // Unknown route
        else {
          status = 404;
          responseData = { error: 'Route not found' };
        }
        
        // Return intercepted response
        return new Response(JSON.stringify(responseData), {
          status,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
        
      } catch (err) {
        console.error("API Mock Intercept Error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }
    
    // Pass-through standard fetch calls (e.g. locally hosted files)
    return originalFetch.apply(this, arguments);
  };
})();
