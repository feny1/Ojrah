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
  const TABLES = ['cars', 'drivers', 'contracts', 'violations', 'maintenance', 'vouchers', 'car_documents', 'settings', 'invoices', 'purchases'];
  
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
    localStorage.setItem('db_settings', JSON.stringify({ vat_number: '310123456700003', weekly_due_day: 0 }));
    
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
    }

    const current_cycle_payments = cash_collected + network_collected + reimbursements;
    let accumulated_debt = net_balance - weekly_target + current_cycle_payments;
    
    return {
      net_balance,
      weekly_target,
      cash_collected,
      network_collected,
      reimbursements,
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
          
          const actualResult = vouchers.filter(v => v.voucher_type === 'سند قبض')
                                       .reduce((sum, v) => sum + parseFloat(v.amount || 0), 0);
          
          let expected_revenue = 0;
          const drivers_due = [];
          const cars = getTable('cars');
          const settings = JSON.parse(localStorage.getItem('db_settings') || '{"vat_number":"310123456700003","weekly_due_day":0}');
          
          const todayDay = new Date().getDay();
          const dueDay = parseInt(settings.weekly_due_day || 0);
          const isDueOrPast = todayDay >= dueDay;

          drivers.forEach(d => {
            const financials = getDriverFinancials(d, contracts, vouchers, violations, maintenance, purchases);
            const payments = financials.cash_collected + financials.network_collected + financials.reimbursements;
            
            // Expected revenue contribution
            expected_revenue += (financials.weekly_target + financials.accumulated_debt);

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
            drivers_due
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
          localStorage.setItem('db_settings', JSON.stringify({ vat_number: '310123456700003', weekly_due_day: 0 }));
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
                  const startDate = new Date(c.start_date + 'T00:00:00');
                  for (let i = 0; i < weeksCount; i++) {
                    const cycleDate = new Date(startDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
                    const isCurrent = (i === weeksCount - 1);
                    statements.push({
                      id: `${c.id}-rent-${i}`,
                      date: cycleDate.toISOString().split('T')[0],
                      description: `استحقاق أجرة أسبوعية تلقائي - الأسبوع ${i + 1}${isCurrent ? ' (الدورة الحالية)' : ' (دورة سابقة مغلقة)'}`,
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
          const drivers = getTable('drivers');
          const cars = getTable('cars');
          responseData = purchases.map(p => {
            const driver = drivers.find(d => d.id == p.driver_id);
            const car = cars.find(c => c.id == p.car_id);
            return {
              ...p,
              driver_name: driver ? driver.name : 'غير معروف',
              plate_number: car ? car.plate_number : 'غير معروف'
            };
          }).reverse();
        }
        
        // POST /api/purchases
        else if (path === '/api/purchases' && method === 'POST') {
          const purchases = getTable('purchases');
          const nextId = purchases.length > 0 ? Math.max(...purchases.map(p => p.id)) + 1 : 1;
          const newPurchase = {
            id: nextId,
            driver_id: parseInt(body.driver_id),
            car_id: parseInt(body.car_id),
            invoice_date: body.invoice_date,
            product_name: body.product_name,
            total_amount: parseFloat(body.total_amount || 0),
            driver_paid_amount: parseFloat(body.driver_paid_amount || 0),
            reimbursement_amount: parseFloat(body.reimbursement_amount || 0),
            debt_charge_amount: parseFloat(body.debt_charge_amount || 0)
          };
          
          if ((newPurchase.driver_paid_amount + newPurchase.debt_charge_amount) > newPurchase.total_amount) {
            status = 400;
            responseData = { error: 'مجموع (المبلغ المدفوع من السائق + الدين المقيد) لا يمكن أن يكون أكبر من المبلغ الكلي للفاتورة.' };
          } else if (newPurchase.reimbursement_amount > newPurchase.driver_paid_amount) {
            status = 400;
            responseData = { error: 'لا يمكن أن يكون مبلغ التعويض أكبر من المبلغ الفعلي الذي دفعه السائق.' };
          } else {
            purchases.push(newPurchase);
            setTable('purchases', purchases);
            responseData = { message: 'تم تسجيل المشتريات بنجاح', id: nextId };
          }
        }
        
        // PUT /api/purchases/:id
        else if (path.startsWith('/api/purchases/') && method === 'PUT') {
          const id = parseInt(path.split('/')[3]);
          const purchases = getTable('purchases');
          const index = purchases.findIndex(p => p.id === id);
          if (index === -1) {
            status = 404;
            responseData = { error: 'السجل غير موجود' };
          } else {
            const updatedPurchase = {
              id: id,
              driver_id: parseInt(body.driver_id),
              car_id: parseInt(body.car_id),
              invoice_date: body.invoice_date,
              product_name: body.product_name,
              total_amount: parseFloat(body.total_amount || 0),
              driver_paid_amount: parseFloat(body.driver_paid_amount || 0),
              reimbursement_amount: parseFloat(body.reimbursement_amount || 0),
              debt_charge_amount: parseFloat(body.debt_charge_amount || 0)
            };
            
            if ((updatedPurchase.driver_paid_amount + updatedPurchase.debt_charge_amount) > updatedPurchase.total_amount) {
              status = 400;
              responseData = { error: 'مجموع (المبلغ المدفوع من السائق + الدين المقيد) لا يمكن أن يكون أكبر من المبلغ الكلي للفاتورة.' };
            } else if (updatedPurchase.reimbursement_amount > updatedPurchase.driver_paid_amount) {
              status = 400;
              responseData = { error: 'لا يمكن أن يكون مبلغ التعويض أكبر من المبلغ الفعلي الذي دفعه السائق.' };
            } else {
              purchases[index] = updatedPurchase;
              setTable('purchases', purchases);
              responseData = { message: 'تم تحديث المشتريات بنجاح' };
            }
          }
        }
        
        // DELETE /api/purchases/:id
        else if (path.startsWith('/api/purchases/') && method === 'DELETE') {
          const id = parseInt(path.split('/')[3]);
          const purchases = getTable('purchases');
          const index = purchases.findIndex(p => p.id === id);
          if (index !== -1) {
            purchases.splice(index, 1);
            setTable('purchases', purchases);
            responseData = { message: 'تم الحذف بنجاح' };
          } else {
            status = 404;
            responseData = { error: 'السجل غير موجود' };
          }
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
