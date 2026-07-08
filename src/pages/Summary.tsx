import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

interface DriverDue {
  driver_id: number;
  driver_name: string;
  vehicle: string;
  car_id: number;
  due_amount: number;
}

interface DashboardSummary {
  actual_revenue: number;
  expected_revenue: number;
  drivers_due: DriverDue[];
}

export default function Summary() {
  const [summary, setSummary] = useState<DashboardSummary>({
    actual_revenue: 0,
    expected_revenue: 0,
    drivers_due: []
  });
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(new Date());

  // Quick Payment Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<DriverDue | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("كاش");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentDesc, setPaymentDesc] = useState("سداد مختصر من لوحة التحكم");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live timer for system date/time
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const response = await fetch("http://localhost:3001/api/dashboard/summary");
      const data = await response.json();
      setSummary(data);
    } catch (error) {
      console.error("Error loading dashboard summary:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const handleOpenModal = (driver: DriverDue) => {
    setSelectedDriver(driver);
    setPaymentAmount(Math.max(0, driver.due_amount).toString());
    setPaymentMethod("كاش");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentDesc(`سداد مختصر من لوحة التحكم - ${driver.driver_name}`);
    setShowModal(true);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDriver) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("يرجى إدخال مبلغ صحيح أكبر من الصفر");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("http://localhost:3001/api/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voucher_type: "سند قبض",
          voucher_date: paymentDate,
          amount: amount,
          related_driver_id: selectedDriver.driver_id,
          related_car_id: selectedDriver.car_id || null,
          description: paymentDesc,
          payment_method: paymentMethod
        })
      });

      if (response.ok) {
        alert("تم تسجيل عملية السداد بنجاح!");
        setShowModal(false);
        loadSummary();
      } else {
        const errorData = await response.json();
        alert("حدث خطأ أثناء حفظ السند: " + (errorData.error || "خطأ غير معروف"));
      }
    } catch (error) {
      console.error("Error creating quick payment:", error);
      alert("فشل الاتصال بالخادم");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formattedDate = time.toLocaleDateString("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formattedTime = time.toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 mt-10" dir="rtl">
      {/* Top Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-4xl font-extrabold text-purple-600">لوحة المراقبة والإحصائيات الكلية</h1>
          <p className="text-gray-500 mt-2">الإيرادات الحالية، المطلوب من السائقين، والمدفوعات الفورية</p>
        </div>
        <div className="flex flex-col items-end bg-purple-50 p-4 rounded-xl border border-purple-100 text-right">
          <span className="text-lg font-black text-purple-700">{formattedDate}</span>
          <span className="text-sm font-bold text-purple-500 mt-1">{formattedTime}</span>
        </div>
      </div>

      {/* Navigation & Actions */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">الملخص المالي</h2>
        <Link to="/" className="bg-slate-800 text-white px-6 py-3 rounded-xl hover:bg-slate-700 shadow-lg font-bold">
          العودة للرئيسية
        </Link>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Expected Revenue */}
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-8 rounded-3xl text-white shadow-xl shadow-indigo-500/10 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
          <h3 className="text-indigo-100 text-lg font-bold">الإيراد المتوقع (إجمالي المطالبات والالتزمات)</h3>
          <p className="text-5xl font-black mt-4 flex items-baseline gap-2">
            {loading ? (
              <span className="animate-pulse">...</span>
            ) : (
              summary.expected_revenue.toLocaleString()
            )}
            <span className="text-sm text-indigo-200">ريال سعودي</span>
          </p>
          <div className="mt-4 text-xs text-indigo-200 font-medium">
            * يشمل إيجار العقود الأسبوعي النشط، جميع المخالفات، تكاليف الصيانة على السائق، والسلف
          </div>
        </div>

        {/* Card 2: Actual Revenue */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-8 rounded-3xl text-white shadow-xl shadow-emerald-500/10 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
          <h3 className="text-emerald-100 text-lg font-bold">الإيراد الفعلي (المبالغ المحصلة)</h3>
          <p className="text-5xl font-black mt-4 flex items-baseline gap-2">
            {loading ? (
              <span className="animate-pulse">...</span>
            ) : (
              summary.actual_revenue.toLocaleString()
            )}
            <span className="text-sm text-emerald-200">ريال سعودي</span>
          </p>
          <div className="mt-4 text-xs text-emerald-200 font-medium">
            * يشمل جميع المبالغ المقبوضة التي تم تسجيلها كسندات قبض في النظام بنجاح
          </div>
        </div>
      </div>

      {/* Drivers Due Summary Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">مستحقات السائقين الجارية</h2>
            <p className="text-sm text-gray-400 mt-1">قائمة السائقين المطالبين بالسداد وتفاصيل مديونياتهم الحالية</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
              <tr>
                <th className="p-4 rounded-tr-xl">سائق (اسم السائق)</th>
                <th className="p-4">المركبة</th>
                <th className="p-4">المطلوب الحالي</th>
                <th className="p-4 rounded-tl-xl text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center p-8 text-slate-400 font-bold">جاري تحميل البيانات...</td>
                </tr>
              ) : summary.drivers_due.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center p-8 text-slate-400 italic">لا يوجد سائقون بعقود نشطة حالياً</td>
                </tr>
              ) : (
                summary.drivers_due.map((d) => (
                  <tr key={d.driver_id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-bold text-slate-800">{d.driver_name}</td>
                    <td className="p-4 text-slate-600 font-medium">{d.vehicle}</td>
                    <td className={`p-4 font-black ${d.due_amount > 0 ? "text-red-500" : "text-green-600"}`}>
                      {d.due_amount.toLocaleString()} ريال
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center gap-3">
                        <button
                          onClick={() => handleOpenModal(d)}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:shadow-emerald-500/10 transition-all cursor-pointer"
                        >
                          سداد مختصر
                        </button>
                        <Link
                          to={`/drivers/${d.driver_id}`}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                        >
                          كشف تفصيلي
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lightweight Quick Payment Modal */}
      {showModal && selectedDriver && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl border border-slate-100 flex flex-col space-y-6 relative overflow-hidden" dir="rtl">
            {/* Emerald Accent bar */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 to-teal-600" />
            
            {/* Close Button */}
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 left-4 text-gray-400 hover:text-gray-600 font-bold text-xl cursor-pointer"
            >
              ✕
            </button>

            <div>
              <h3 className="text-2xl font-black text-slate-800">سداد مختصر للذمة المالية</h3>
              <p className="text-gray-500 mt-2 text-sm">
                تسجيل دفعة نقدية سريعة للسائق <span className="font-bold text-slate-800">{selectedDriver.driver_name}</span> دون مغادرة اللوحة.
              </p>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">المطلوب الحالي للسائق:</label>
                  <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-center font-black text-lg text-red-500">
                    {selectedDriver.due_amount.toLocaleString()} ريال
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">مبلغ السداد المدفوع:</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="المبلغ"
                    className="w-full border border-slate-200 rounded-xl p-3 text-center font-black text-lg text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">طريقة الدفع:</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-3 font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  >
                    <option value="كاش">كاش</option>
                    <option value="شبكة">شبكة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">التاريخ:</label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-3 font-bold text-center text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">البيان / الوصف:</label>
                <input
                  type="text"
                  required
                  value={paymentDesc}
                  onChange={(e) => setPaymentDesc(e.target.value)}
                  placeholder="الوصف"
                  className="w-full border border-slate-200 rounded-xl p-3 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg hover:shadow-emerald-500/10 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? "جاري تسجيل الدفعة..." : "تأكيد السداد +"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3.5 rounded-xl font-bold transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
