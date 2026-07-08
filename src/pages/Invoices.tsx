import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

interface Invoice {
  id: number;
  invoice_number: string;
  vehicle_id?: number;
  amount: number;
  service_type: string;
  invoice_date: string;
  plate_number?: string;
  company?: string;
  model?: string;
  driver_name?: string;
  receipt_number?: string;
}

interface Car {
  id: number;
  plate_number: string;
  company: string;
  model: string;
}

interface Driver {
  id: number;
  name: string;
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [amount, setAmount] = useState("");
  const [serviceType, setServiceType] = useState("خدمة نقل ركاب بالسيارات الأجرة العامة");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [resInvoices, resCars, resDrivers] = await Promise.all([
        fetch("http://localhost:3001/api/invoices"),
        fetch("http://localhost:3001/api/cars"),
        fetch("http://localhost:3001/api/drivers")
      ]);
      
      const dataInvoices = await resInvoices.json();
      const dataCars = await resCars.json();
      const dataDrivers = await resDrivers.json();
      
      setInvoices(dataInvoices);
      setCars(dataCars);
      setDrivers(dataDrivers);
    } catch (error) {
      console.error("Error loading invoices data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert("يرجى إدخال مبلغ صحيح أكبر من الصفر");
      return;
    }
    if (!serviceType.trim()) {
      alert("نوع الخدمة مطلوب");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("http://localhost:3001/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: vehicleId ? parseInt(vehicleId) : null,
          driver_id: driverId ? parseInt(driverId) : null,
          amount: numAmount,
          service_type: serviceType,
          invoice_date: invoiceDate
        })
      });

      if (response.ok) {
        alert("تم إنشاء الفاتورة الضريبية المبسطة بنجاح!");
        setShowForm(false);
        setVehicleId("");
        setDriverId("");
        setAmount("");
        setServiceType("خدمة نقل ركاب بالسيارات الأجرة العامة");
        setInvoiceDate(new Date().toISOString().split("T")[0]);
        loadData();
      } else {
        const errorData = await response.json();
        alert("فشل إنشاء الفاتورة: " + (errorData.error || "خطأ غير معروف"));
      }
    } catch (error) {
      console.error("Error creating invoice:", error);
      alert("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 mt-10" dir="rtl">
      {/* Top Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-amber-500">الفواتير الضريبية المبسطة</h1>
          <p className="text-gray-500 mt-2">إصدار وإدارة الفواتير والامتثال الضريبي وضريبة القيمة المضافة (15%)</p>
        </div>
        <Link to="/" className="bg-slate-800 text-white px-6 py-3 rounded-xl hover:bg-slate-700 shadow-lg font-bold">
          العودة للرئيسية
        </Link>
      </div>

      {/* Invoice Creation Form */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">إنشاء فاتورة ضريبية مبسطة جديدة</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 mb-2 font-bold">المركبة (اختياري)</label>
                <select 
                  className="w-full border p-3 rounded-lg bg-white" 
                  value={vehicleId} 
                  onChange={(e) => setVehicleId(e.target.value)}
                >
                  <option value="">-- بدون تحديد مركبة --</option>
                  {cars.map(c => <option key={c.id} value={c.id}>{c.plate_number} - {c.company} {c.model}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 mb-2 font-bold">العميل / السائق (اختياري)</label>
                <select 
                  className="w-full border p-3 rounded-lg bg-white" 
                  value={driverId} 
                  onChange={(e) => setDriverId(e.target.value)}
                >
                  <option value="">-- بدون تحديد عميل --</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 mb-2 font-bold">المبلغ الإجمالي شامل الضريبة (ريال) *</label>
                <input 
                  type="number" 
                  step="0.01" 
                  required 
                  className="w-full border p-3 rounded-lg text-lg font-bold text-center" 
                  placeholder="مثال: 1500" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)} 
                />
              </div>

              <div>
                <label className="block text-gray-700 mb-2 font-bold">تاريخ الفاتورة *</label>
                <input 
                  type="date" 
                  required 
                  className="w-full border p-3 rounded-lg text-center" 
                  value={invoiceDate} 
                  onChange={(e) => setInvoiceDate(e.target.value)} 
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-700 mb-2 font-bold">نوع الخدمة / البيان *</label>
              <input 
                type="text" 
                required 
                className="w-full border p-3 rounded-lg" 
                placeholder="مثال: خدمة نقل ركاب بالسيارات الأجرة العامة" 
                value={serviceType} 
                onChange={(e) => setServiceType(e.target.value)} 
              />
              <div className="flex gap-2 mt-2 flex-wrap">
                {[
                  "خدمة نقل ركاب بالسيارات الأجرة العامة",
                  "خدمة تشغيل مركبة أجرة وذمم تعاقدية",
                  "تحميل قيمة صيانة دورية للمركبة"
                ].map((st, i) => (
                  <button 
                    key={i} 
                    type="button" 
                    onClick={() => setServiceType(st)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-3 py-1 rounded-full font-bold transition-all"
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2 rounded-lg font-bold shadow-md cursor-pointer"
              >
                {isSubmitting ? "جاري إنشاء الفاتورة..." : "اعتماد وإصدار الفاتورة"}
              </button>
              <button 
                type="button" 
                onClick={() => setShowForm(false)} 
                className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-300 font-bold"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Invoices List Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-slate-800 font-sans">سجل الفواتير الصادرة</h2>
          {!showForm && (
            <button 
              onClick={() => setShowForm(true)} 
              className="bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 font-bold shadow-md cursor-pointer"
            >
              إنشاء فاتورة جديدة +
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
              <tr>
                <th className="p-4 rounded-tr-xl">رقم الفاتورة</th>
                <th className="p-4">التاريخ</th>
                <th className="p-4">البيان / الخدمة</th>
                <th className="p-4">المركبة</th>
                <th className="p-4">العميل / السائق</th>
                <th className="p-4">المبلغ شامل الضريبة</th>
                <th className="p-4">سند قبض مرتبط</th>
                <th className="p-4 rounded-tl-xl text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center p-8 text-slate-400 font-bold">جاري تحميل الفواتير...</td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center p-8 text-slate-400 italic">لا توجد فواتير ضريبية صادرة بعد</td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-bold text-amber-600">{inv.invoice_number}</td>
                    <td className="p-4 text-slate-600">{inv.invoice_date}</td>
                    <td className="p-4 text-slate-800 font-medium">{inv.service_type}</td>
                    <td className="p-4 text-slate-600">
                      {inv.plate_number ? (
                        <span className="bg-slate-100 text-slate-800 px-2.5 py-1 rounded-md font-mono font-bold text-xs">
                          {inv.plate_number}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">--</span>
                      )}
                    </td>
                    <td className="p-4 text-slate-700 font-medium">{inv.driver_name || <span className="text-slate-400 italic">--</span>}</td>
                    <td className="p-4 font-black text-slate-800">{inv.amount.toLocaleString()} ريال</td>
                    <td className="p-4">
                      {inv.receipt_number ? (
                        <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs font-bold border border-green-200">
                          {inv.receipt_number}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">يدوي</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <Link 
                        to={`/invoices/print/${inv.id}`} 
                        className="bg-slate-800 hover:bg-slate-700 text-white px-4.5 py-2 rounded-xl text-sm font-bold shadow-md transition-all cursor-pointer"
                      >
                        طباعة الفاتورة A4
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
