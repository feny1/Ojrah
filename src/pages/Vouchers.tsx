import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
// Removed Tauri invoke import

interface Voucher {
  id: number;
  voucher_number: string;
  voucher_type: string;
  auto_generated: boolean;
  voucher_date: string;
  amount: number;
  related_driver_id?: number;
  related_car_id?: number;
  description: string;
  invoice_id?: number;
}

export default function Vouchers() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);

  const loadVouchers = async () => {
    try {
      const response = await fetch("http://localhost:3001/api/vouchers");
      const data = await response.json();
      setVouchers(data);
    } catch (error) {
      console.error("Error loading vouchers:", error);
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm("هل أنت متأكد من حذف هذا السند؟")) {
      try {
        await fetch(`http://localhost:3001/api/vouchers/${id}`, { method: "DELETE" });
        loadVouchers();
      } catch (error) {
        console.error("Error deleting voucher:", error);
      }
    }
  };

  const handleConvertToInvoice = async (id: number) => {
    try {
      const response = await fetch(`http://localhost:3001/api/vouchers/${id}/convert-to-invoice`, {
        method: "POST"
      });
      if (response.ok) {
        alert("تم تحويل السند المالي إلى فاتورة ضريبية مبسطة بنجاح!");
        loadVouchers();
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
    loadVouchers();
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 mt-10">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-sky-400">السندات</h1>
          <p className="text-gray-500 mt-2">عرض وطباعة السندات (التلقائية واليدوية)</p>
        </div>
        <Link to="/" className="bg-slate-800 text-white px-6 py-3 rounded-xl hover:bg-slate-700 shadow-lg">
          العودة للرئيسية
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-800">قائمة السندات</h2>
          <button className="bg-sky-400 text-white px-4 py-2 rounded-lg hover:bg-sky-500">إنشاء سند يدوي</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-4 rounded-tr-lg">رقم السند</th>
                <th className="p-4">النوع</th>
                <th className="p-4">المبلغ</th>
                <th className="p-4">البيان</th>
                <th className="p-4">الآلية</th>
                <th className="p-4 rounded-tl-lg">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.length === 0 ? (
                <tr><td colSpan={6} className="text-center p-4 text-gray-500">لا توجد سندات مسجلة</td></tr>
              ) : (
                vouchers.map(v => (
                  <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="p-4 font-bold text-sky-500">{v.voucher_number}</td>
                    <td className="p-4">{v.voucher_type}</td>
                    <td className="p-4 font-bold">{v.amount.toLocaleString()} ريال</td>
                    <td className="p-4">{v.description}</td>
                    <td className="p-4">
                      {v.auto_generated ? (
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">تلقائي</span>
                      ) : (
                        <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm">يدوي</span>
                      )}
                    </td>
                    <td className="p-4 flex items-center gap-3">
                      <Link to={`/vouchers/print/${v.id}`} className="text-sky-500 hover:underline font-bold">طباعة</Link>
                      {v.voucher_type === "سند قبض" && (
                        v.invoice_id ? (
                          <Link to={`/invoices/print/${v.invoice_id}`} className="text-amber-600 hover:underline font-bold bg-amber-50 px-2 py-1.5 rounded border border-amber-200 text-xs">
                            عرض الفاتورة
                          </Link>
                        ) : (
                          <button 
                            onClick={() => handleConvertToInvoice(v.id)} 
                            className="text-white bg-emerald-500 hover:bg-emerald-600 px-2.5 py-1.5 rounded text-xs font-bold transition-colors cursor-pointer"
                          >
                            تحويل إلى فاتورة
                          </button>
                        )
                      )}
                      <button onClick={() => v.id && handleDelete(v.id)} className="text-red-500 hover:underline">حذف</button>
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
