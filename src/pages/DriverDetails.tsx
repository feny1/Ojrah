import { Link, useParams } from "react-router-dom";
import { useState, useEffect } from "react";

export default function DriverDetails() {
  const { id } = useParams();
  const [driver, setDriver] = useState<any>(null);

  const [financialForm, setFinancialForm] = useState({
    type: 'سند قبض',
    payment_method: 'كاش',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: ''
  });

  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: "",
    phone: "",
    national_id: "",
    hire_date: "",
  });

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`http://localhost:3001/api/drivers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFormData)
      });
      if (response.ok) {
        alert("تم تحديث بيانات السائق بنجاح!");
        setShowEditModal(false);
        loadDriver();
      } else {
        const err = await response.json();
        alert("فشل التحديث: " + (err.error || "خطأ غير معروف"));
      }
    } catch (error) {
      console.error("Error updating driver:", error);
      alert("حدث خطأ أثناء الاتصال بالخادم");
    }
  };

  const loadDriver = () => {
    fetch(`http://localhost:3001/api/drivers/${id}`)
      .then(res => res.json())
      .then(data => setDriver(data))
      .catch(err => console.error("Error loading driver:", err));
  };

  const handleConvertToInvoice = async (voucherId: number) => {
    try {
      const response = await fetch(`http://localhost:3001/api/vouchers/${voucherId}/convert-to-invoice`, {
        method: "POST"
      });
      if (response.ok) {
        alert("تم تحويل السند المالي إلى فاتورة ضريبية مبسطة بنجاح!");
        loadDriver();
      } else {
        const err = await response.json();
        alert("فشل التحويل: " + (err.error || "خطأ غير معروف"));
      }
    } catch (error) {
      console.error("Error converting voucher:", error);
      alert("حدث خطأ أثناء الاتصال بالخادم");
    }
  };

  useEffect(() => {
    loadDriver();
  }, [id]);

  const handleDeleteStatement = async (statementId: number, category: string) => {
    if (window.confirm("هل أنت متأكد من حذف هذه الحركة؟ سيتم حذف السجل المرتبط بها بالكامل من النظام.")) {
      let endpoint = "";
      if (category === "contract") endpoint = "contracts";
      else if (category === "violation") endpoint = "violations";
      else if (category === "maintenance") endpoint = "maintenance";
      else if (category === "cash" || category === "network") endpoint = "vouchers";
      
      if (endpoint) {
        try {
          await fetch(`http://localhost:3001/api/${endpoint}/${statementId}`, { method: "DELETE" });
          loadDriver();
        } catch (error) {
          console.error("Error deleting statement:", error);
        }
      }
    }
  };

  const handleFinancialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!financialForm.amount || parseFloat(financialForm.amount) <= 0) return;
    
    try {
      await fetch("http://localhost:3001/api/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voucher_type: financialForm.type,
          voucher_date: financialForm.date,
          amount: parseFloat(financialForm.amount),
          related_driver_id: driver.id,
          description: financialForm.description || (financialForm.type === 'سند قبض' ? 'دفعة من السائق' : 'سلفة للسائق'),
          payment_method: financialForm.payment_method
        })
      });
      alert("تم تسجيل العملية بنجاح!");
      setFinancialForm({ ...financialForm, amount: '', description: '' });
      loadDriver();
    } catch (error) {
      console.error("Error submitting financial op:", error);
    }
  };

  if (!driver) return <div className="p-8 text-center text-slate-500 text-xl font-bold">جاري التحميل...</div>;

  let totalContract = 0, totalAdvance = 0, totalCash = 0, totalNetwork = 0, totalMaintenance = 0, totalViolation = 0;
  if (driver?.statements) {
    driver.statements.forEach((s: any) => {
      if (s.category === 'contract') totalContract += s.debit || 0;
      if (s.category === 'advance') totalAdvance += s.debit || 0;
      if (s.category === 'cash') totalCash += (s.credit || s.debit) || 0;
      if (s.category === 'network') totalNetwork += (s.credit || s.debit) || 0;
      if (s.category === 'maintenance') totalMaintenance += (s.debit || s.credit) || 0;
      if (s.category === 'violation') totalViolation += s.debit || 0;
    });
  }

  const FR = ({ lbl, val }: { lbl: string; val: string }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 11 }}>
      <span style={{ fontWeight: 700, whiteSpace: "nowrap", minWidth: 120, fontSize: 10, color: "#333" }}>{lbl}:</span>
      <span style={{ borderBottom: "1px dashed #000", flex: 1, fontWeight: 700, paddingBottom: 1, textAlign: "center" }}>
        {val || "___________"}
      </span>
    </div>
  );

  return (
    <>
      {/* Screen Layout (Hidden during printing) */}
      <div className="p-8 max-w-5xl mx-auto space-y-8 mt-10 print:hidden">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-green-500">كشف حساب السائق الشامل</h1>
            <p className="text-gray-500 mt-2">بيانات السائق، العقود، وكل الحركات المالية</p>
          </div>
          <div className="space-x-4 space-x-reverse flex">
            <button onClick={() => {
              setEditFormData({
                name: driver.name,
                phone: driver.phone,
                national_id: driver.national_id,
                hire_date: driver.hire_date
              });
              setShowEditModal(true);
            }} className="bg-yellow-600 text-white px-6 py-3 rounded-xl hover:bg-yellow-700 shadow-lg font-bold">
              تعديل بيانات السائق
            </button>
            <button onClick={() => window.print()} className="bg-green-600 text-white px-6 py-3 rounded-xl hover:bg-green-700 shadow-lg font-bold">
              طباعة الكشف
            </button>
            <Link to={`/drivers/print-vouchers/${driver.id}`} className="bg-sky-600 text-white px-6 py-3 rounded-xl hover:bg-sky-700 shadow-lg font-bold">
              طباعة كافة السندات (A4)
            </Link>
            <Link to="/drivers" className="bg-slate-800 text-white px-6 py-3 rounded-xl hover:bg-slate-700 shadow-lg">
              العودة
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-xl font-bold text-green-600 mb-4 border-b pb-2">بيانات السائق الأساسية</h2>
            <ul className="space-y-3 text-slate-700">
              <li><span className="text-gray-500 w-24 inline-block">الاسم:</span> <span className="font-bold">{driver.name}</span></li>
              <li><span className="text-gray-500 w-24 inline-block">رقم الجوال:</span> {driver.phone}</li>
              <li><span className="text-gray-500 w-24 inline-block">الهوية/الإقامة:</span> {driver.national_id}</li>
              <li><span className="text-gray-500 w-24 inline-block">تاريخ التعيين:</span> {driver.hire_date}</li>
            </ul>
          </div>
          
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-xl font-bold text-blue-500 mb-4 border-b pb-2">العقد الحالي</h2>
            <ul className="space-y-3 text-slate-700">
              {driver.contracts && driver.contracts.length > 0 ? (
                <>
                  <li><span className="text-gray-500 w-28 inline-block">المركبة الحالية:</span> المركبة #{driver.contracts[driver.contracts.length - 1].car_id}</li>
                  <li><span className="text-gray-500 w-28 inline-block">تاريخ الاستلام:</span> {driver.contracts[driver.contracts.length - 1].start_date}</li>
                  <li><span className="text-gray-500 w-28 inline-block">قيمة العقد الأسبوعية:</span> {driver.contracts[driver.contracts.length - 1].weekly_required} ريال</li>
                  <li><span className="text-gray-500 w-28 inline-block">إجمالي المطلوب:</span> {driver.contracts[driver.contracts.length - 1].total_required} ريال</li>
                  
                  <li className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="font-bold text-lg text-slate-800">المطلوب سداده الآن:</span>
                    <span className={`text-2xl font-black px-4 py-2 rounded-lg ${driver.current_week_required > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                      {driver.current_week_required} ريال
                    </span>
                  </li>
                </>
              ) : (
                <li className="text-gray-500 italic">لا يوجد عقد نشط حالياً</li>
              )}
            </ul>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">تسجيل عملية مالية (سداد / سلفة)</h2>
          <form onSubmit={handleFinancialSubmit} className="bg-slate-50 p-6 rounded-xl border border-slate-100 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <select 
                className="border p-3 rounded-lg bg-white font-bold" 
                value={financialForm.type} 
                onChange={(e) => setFinancialForm({...financialForm, type: e.target.value})}
              >
                <option value="سند قبض" className="text-green-600">سند قبض (دفعة من السائق)</option>
                <option value="سلفة" className="text-purple-600">سند صرف (سلفة للسائق)</option>
              </select>
              
              {financialForm.type === 'سند قبض' ? (
                <select 
                  className="border p-3 rounded-lg bg-white" 
                  value={financialForm.payment_method} 
                  onChange={(e) => setFinancialForm({...financialForm, payment_method: e.target.value})}
                >
                  <option value="كاش">كاش</option>
                  <option value="شبكة">شبكة</option>
                </select>
              ) : (
                <div className="border p-3 rounded-lg bg-gray-100 text-gray-500 text-center font-bold flex items-center justify-center">كاش/تحويل</div>
              )}
              
              <input type="number" step="0.01" required placeholder="المبلغ" className="border p-3 rounded-lg font-bold text-center" value={financialForm.amount} onChange={(e) => setFinancialForm({...financialForm, amount: e.target.value})} />
              
              <input type="text" placeholder="البيان / ملاحظات" className="border p-3 rounded-lg md:col-span-2" value={financialForm.description} onChange={(e) => setFinancialForm({...financialForm, description: e.target.value})} />
            </div>
            
            <div className="flex justify-between items-center mt-4">
              <input type="date" required className="border p-3 rounded-lg text-gray-500" value={financialForm.date} onChange={(e) => setFinancialForm({...financialForm, date: e.target.value})} />
              <button type="submit" className={`${financialForm.type === 'سند قبض' ? 'bg-green-600 hover:bg-green-700' : 'bg-purple-600 hover:bg-purple-700'} text-white px-8 py-3 rounded-lg font-bold shadow-lg`}>
                تسجيل {financialForm.type} +
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-6">كشف الحساب المالي (مدين / دائن)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-3 border">التاريخ</th>
                  <th className="p-3 border">البيان</th>
                  <th className="p-3 border text-slate-700">مطلوب للعقد</th>
                  <th className="p-3 border text-purple-500">سلفة</th>
                  <th className="p-3 border text-green-500">كاش</th>
                  <th className="p-3 border text-green-500">شبكة</th>
                  <th className="p-3 border text-orange-500">صيانة</th>
                  <th className="p-3 border text-red-500">مخالفة</th>
                  <th className="p-3 border">الرصيد المتبقي</th>
                  <th className="p-3 border">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {driver.statements && driver.statements.length > 0 ? (
                  driver.statements.map((s: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 text-center">
                      <td className="p-3 border text-right">{s.date}</td>
                      <td className="p-3 border text-right">{s.description}</td>
                      <td className="p-3 border font-bold text-slate-700">{s.category === 'contract' ? s.debit : ''}</td>
                      <td className="p-3 border font-bold text-purple-500">{s.category === 'advance' ? s.debit : ''}</td>
                      <td className="p-3 border font-bold text-green-500">{s.category === 'cash' ? (s.credit || s.debit) : ''}</td>
                      <td className="p-3 border font-bold text-green-500">{s.category === 'network' ? (s.credit || s.debit) : ''}</td>
                      <td className="p-3 border font-bold text-orange-500">{s.category === 'maintenance' ? (s.debit || s.credit) : ''}</td>
                      <td className="p-3 border font-bold text-red-500">{s.category === 'violation' ? s.debit : ''}</td>
                      <td className={`p-3 border font-bold ${s.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>{s.balance}</td>
                      <td className="p-3 border flex items-center justify-center gap-2">
                        {s.id && (s.category === 'cash' || s.category === 'network') && (
                          s.invoice_id ? (
                            <Link to={`/invoices/print/${s.invoice_id}`} className="bg-amber-50 hover:bg-amber-100 text-amber-700 px-2 py-0.5 rounded border border-amber-200 text-xs font-bold transition-all">
                              عرض الفاتورة
                            </Link>
                          ) : (
                            <button
                              onClick={() => handleConvertToInvoice(s.id)}
                              className="bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-0.5 rounded text-xs font-bold transition-all cursor-pointer"
                            >
                              تحويل لفاتورة
                            </button>
                          )
                        )}
                        <button onClick={() => s.id && handleDeleteStatement(s.id, s.category)} className="text-red-500 hover:text-red-700 font-bold" title="حذف هذه الحركة">
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="p-4 text-center text-gray-500 italic border">لا توجد حركات مالية مسجلة</td>
                  </tr>
                )}
              </tbody>
              {driver.statements && driver.statements.length > 0 && (
                <tfoot className="bg-slate-100 font-black text-lg border-t-4 border-slate-300">
                  <tr className="text-center">
                    <td className="p-4 border text-left" colSpan={2}>الإجمالي العام</td>
                    <td className="p-4 border text-slate-800">{totalContract > 0 ? totalContract : ''}</td>
                    <td className="p-4 border text-purple-700">{totalAdvance > 0 ? totalAdvance : ''}</td>
                    <td className="p-4 border text-green-700">{totalCash > 0 ? totalCash : ''}</td>
                    <td className="p-4 border text-green-700">{totalNetwork > 0 ? totalNetwork : ''}</td>
                    <td className="p-4 border text-orange-600">{totalMaintenance > 0 ? totalMaintenance : ''}</td>
                    <td className="p-4 border text-red-600">{totalViolation > 0 ? totalViolation : ''}</td>
                    <td className="p-4 border text-gray-500 text-sm">--</td>
                    <td className="p-4 border text-gray-500 text-sm">--</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Formal Print Report Section (Visible only when printing) */}
      <div className="hidden print:block" dir="rtl" style={{
        fontFamily: "'Cairo', 'Arial', sans-serif",
        width: "210mm",
        height: "297mm",
        margin: "0 auto",
        padding: "12mm 14mm",
        background: "white",
        color: "#000",
        lineHeight: 1.5,
        boxSizing: "border-box",
      }}>
        <div style={{ border: "3px solid #000", height: "100%", padding: "10px 14px", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
          <div style={{ border: "1px solid #000", flex: 1, padding: "8px 12px", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
            
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #000", paddingBottom: 8, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>مؤسسة أجرة لتقنية المعلومات</div>
                <div style={{ fontSize: 10, color: "#444" }}>إدارة أسطول المركبات — المملكة العربية السعودية</div>
              </div>
              <div style={{ border: "2px solid #000", padding: "4px 16px", fontSize: 18, fontWeight: 900, letterSpacing: 1 }}>كشف حساب سائق رسمي</div>
            </div>

            {/* Meta Row */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 11 }}>
              <div><b>تاريخ كشف الحساب:</b> <span style={{ borderBottom: "1px solid #000", paddingBottom: 1 }}>{new Date().toLocaleDateString('ar-SA')}</span></div>
              <div><b>الحالة المالية للرصيد:</b> <span style={{ borderBottom: "1px solid #000", paddingBottom: 1, fontWeight: "bold" }}>{(driver.current_week_required || 0) > 0 ? "مطالب بالسداد" : "مستقر"}</span></div>
            </div>

            {/* Section 1: Basic Driver Details */}
            <div style={{ border: "1px solid #000", padding: "8px 12px", marginBottom: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 12, borderBottom: "1px solid #000", marginBottom: 8, paddingBottom: 2 }}>أولاً: بيانات السائق الأساسية</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
                <FR lbl="اسم السائق الكامل" val={driver.name} />
                <FR lbl="رقم الجوال" val={driver.phone} />
                <FR lbl="رقم الهوية الوطنية / الإقامة" val={driver.national_id} />
                <FR lbl="تاريخ التعيين والتعاقد" val={driver.hire_date} />
              </div>
            </div>

            {/* Section 2: Active Contract Details */}
            <div style={{ border: "1px solid #000", padding: "8px 12px", marginBottom: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 12, borderBottom: "1px solid #000", marginBottom: 8, paddingBottom: 2 }}>ثانياً: بيانات العقد والتشغيل النشط</div>
              {driver.contracts && driver.contracts.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
                  <FR lbl="المركبة المستلمة حالياً" val={`مركبة رقم #${driver.contracts[driver.contracts.length - 1].car_id}`} />
                  <FR lbl="تاريخ استلام المركبة" val={driver.contracts[driver.contracts.length - 1].start_date} />
                  <FR lbl="قيمة الإيجار الأسبوعي" val={`${driver.contracts[driver.contracts.length - 1].weekly_required} ريال`} />
                  <FR lbl="إجمالي الذمم المطلوبة للعقد" val={`${driver.contracts[driver.contracts.length - 1].total_required} ريال`} />
                </div>
              ) : (
                <div style={{ fontSize: 11, fontStyle: "italic", color: "#666" }}>لا يوجد عقد نشط مسجل حالياً.</div>
              )}
            </div>

            {/* Section 3: Summary of Totals */}
            <div style={{ border: "1px solid #000", padding: "8px 12px", marginBottom: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 12, borderBottom: "1px solid #000", marginBottom: 8, paddingBottom: 2 }}>ثالثاً: ملخص الذمم والمدفوعات الإجمالي</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 12px" }}>
                <FR lbl="إجمالي مطلوب العقد" val={`${totalContract} ر.س`} />
                <FR lbl="إجمالي السلف" val={`${totalAdvance} ر.س`} />
                <FR lbl="إجمالي الصيانة" val={`${totalMaintenance} ر.س`} />
                <FR lbl="إجمالي مخالفات المرور" val={`${totalViolation} ر.س`} />
                <FR lbl="إجمالي سداد كاش" val={`${totalCash} ر.س`} />
                <FR lbl="إجمالي سداد شبكة" val={`${totalNetwork} ر.س`} />
              </div>
              <div style={{ borderTop: "1px solid #000", marginTop: 8, paddingTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 900, fontSize: 12 }}>الرصيد المتبقي الكلي المطالب به السائق حالياً:</span>
                <span style={{ fontWeight: 900, fontSize: 16, borderBottom: "2px solid #000", paddingBottom: 1 }}>{driver.current_week_required} ريال سعودي</span>
              </div>
            </div>

            {/* Section 4: Transaction Ledger Table */}
            <div style={{ border: "1px solid #000", padding: "6px 8px", display: "flex", flexDirection: "column", flex: 1, marginBottom: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 11, borderBottom: "1px solid #000", marginBottom: 6, paddingBottom: 2 }}>رابعاً: كشف العمليات المالي المفصل (العمليات الأخيرة)</div>
              <table style={{ width: "100%", fontSize: 9, textAlign: "right", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #000", fontWeight: "bold" }}>
                    <th style={{ paddingBottom: 4 }}>التاريخ</th>
                    <th style={{ paddingBottom: 4 }}>البيان</th>
                    <th style={{ paddingBottom: 4, textAlign: "center" }}>مطلوب عقد</th>
                    <th style={{ paddingBottom: 4, textAlign: "center" }}>سلفة</th>
                    <th style={{ paddingBottom: 4, textAlign: "center" }}>سداد (كاش/شبكة)</th>
                    <th style={{ paddingBottom: 4, textAlign: "center" }}>صيانة/مخالفة</th>
                    <th style={{ paddingBottom: 4, textAlign: "center" }}>الرصيد الجاري</th>
                  </tr>
                </thead>
                <tbody>
                  {driver.statements && driver.statements.length > 0 ? (
                    driver.statements.slice(0, 12).map((s: any, idx: number) => {
                      let payment = "";
                      if (s.category === 'cash' || s.category === 'network') {
                        payment = `${s.credit || s.debit} (${s.category === 'cash' ? 'كاش' : 'شبكة'})`;
                      }
                      let maintViol = "";
                      if (s.category === 'maintenance' || s.category === 'violation') {
                        maintViol = `${s.debit || s.credit} (${s.category === 'maintenance' ? 'صيانة' : 'مخالفة'})`;
                      }
                      return (
                        <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                          <td>{s.date}</td>
                          <td>{s.description}</td>
                          <td style={{ textAlign: "center", fontWeight: "bold" }}>{s.category === 'contract' ? `${s.debit} ر.س` : ''}</td>
                          <td style={{ textAlign: "center" }}>{s.category === 'advance' ? `${s.debit} ر.س` : ''}</td>
                          <td style={{ textAlign: "center", color: "green", fontWeight: "bold" }}>{payment ? `${payment} ر.س` : ''}</td>
                          <td style={{ textAlign: "center", color: "red" }}>{maintViol ? `${maintViol} ر.س` : ''}</td>
                          <td style={{ textAlign: "center", fontWeight: "bold" }}>{s.balance} ر.س</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ fontStyle: "italic", color: "#666", textAlign: "center", paddingTop: 8 }}>لا توجد حركات مالية مسجلة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Signature Block */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginTop: "auto", paddingTop: 10 }}>
              {["توقيع السائق المستعلم", "المحاسب المسؤول"].map((lbl, i) => (
                <div key={i} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 11 }}>{lbl}</div>
                  <div style={{ borderBottom: "1px solid #000", marginTop: 24, marginBottom: 2 }} />
                  <div style={{ fontSize: 10, color: "#666" }}>التوقيع والختم</div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ borderTop: "1px solid #ccc", marginTop: 6, paddingTop: 4, display: "flex", justifyContent: "space-between", fontSize: 9, color: "#666" }}>
              <span>هذه الوثيقة تعتبر كشف حساب رسمي معتمد وصادر إلكترونياً</span>
              <span>أجرة © {new Date().getFullYear()}</span>
            </div>

          </div>
        </div>
      </div>

      {/* Edit Driver Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 relative" dir="rtl">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-2">تعديل بيانات السائق</h2>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-sm font-bold text-slate-700 mb-1">الاسم رباعي</label>
                  <input type="text" required className="border p-3 rounded-lg" value={editFormData.name} onChange={(e) => setEditFormData({...editFormData, name: e.target.value})} />
                </div>
                <div className="flex flex-col">
                  <label className="text-sm font-bold text-slate-700 mb-1">رقم الجوال</label>
                  <input type="text" required className="border p-3 rounded-lg" value={editFormData.phone} onChange={(e) => setEditFormData({...editFormData, phone: e.target.value})} />
                </div>
                <div className="flex flex-col">
                  <label className="text-sm font-bold text-slate-700 mb-1">رقم الهوية الوطنية / الإقامة</label>
                  <input type="text" required className="border p-3 rounded-lg" value={editFormData.national_id} onChange={(e) => setEditFormData({...editFormData, national_id: e.target.value})} />
                </div>
                <div className="flex flex-col">
                  <label className="text-sm font-bold text-slate-700 mb-1">تاريخ التعيين</label>
                  <input type="date" required className="border p-3 rounded-lg text-slate-700" value={editFormData.hire_date} onChange={(e) => setEditFormData({...editFormData, hire_date: e.target.value})} />
                </div>
              </div>
              <div className="flex gap-4 mt-6 border-t pt-4">
                <button type="submit" className="bg-green-600 text-white px-6 py-3 rounded-xl hover:bg-green-700 font-bold shadow-lg flex-1">حفظ التغييرات</button>
                <button type="button" onClick={() => setShowEditModal(false)} className="bg-slate-200 text-slate-800 px-6 py-3 rounded-xl hover:bg-slate-300 font-bold flex-1">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
