import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

export default function Settings() {
  const [showModal, setShowModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [vatNumber, setVatNumber] = useState("");
  const [isSavingVat, setIsSavingVat] = useState(false);

  useEffect(() => {
    fetch("http://localhost:3001/api/settings")
      .then(res => res.json())
      .then(data => {
        if (data.vat_number) setVatNumber(data.vat_number);
      })
      .catch(err => console.error("Error fetching settings:", err));
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingVat(true);
    try {
      const response = await fetch("http://localhost:3001/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vat_number: vatNumber })
      });
      if (response.ok) {
        alert("تم حفظ الإعدادات بنجاح!");
      } else {
        alert("فشل حفظ الإعدادات");
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setIsSavingVat(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch("http://localhost:3001/api/clear-all", { method: "DELETE" });
      if (response.ok) {
        setDeleteSuccess(true);
      } else {
        const data = await response.json();
        alert("حدث خطأ أثناء حذف البيانات: " + (data.error || "خطأ غير معروف"));
      }
    } catch (error: any) {
      console.error("Error clearing data:", error);
      alert("حدث خطأ في الاتصال بالخادم: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 mt-10">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-600">الإعدادات</h1>
          <p className="text-gray-500 mt-2">إدارة النظام وقاعدة البيانات</p>
        </div>
        <Link to="/" className="bg-slate-800 text-white px-6 py-3 rounded-xl hover:bg-slate-700 shadow-lg">
          العودة للرئيسية
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 border-r-4 border-r-sky-500" dir="rtl">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">إعدادات المؤسسة والفواتير</h2>
        <form onSubmit={handleSaveSettings} className="space-y-4 max-w-lg">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-2">الرقم الضريبي للمؤسسة (VAT Registration Number):</label>
            <input
              type="text"
              value={vatNumber}
              onChange={(e) => setVatNumber(e.target.value)}
              placeholder="مثال: 310123456700003"
              className="w-full border border-slate-200 rounded-xl p-3 font-mono font-bold text-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={isSavingVat}
            className="bg-sky-500 hover:bg-sky-600 disabled:bg-slate-100 disabled:text-slate-400 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-md cursor-pointer"
          >
            {isSavingVat ? "جاري الحفظ..." : "حفظ الإعدادات"}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 border-r-4 border-r-red-500">
        <h2 className="text-2xl font-bold text-red-600 mb-4">منطقة الخطر</h2>
        <p className="text-gray-600 mb-6 font-medium">تحذير: الإجراءات التالية لا يمكن التراجع عنها. يرجى توخي الحذر عند استخدامها.</p>
        
        <button 
          onClick={() => setShowModal(true)} 
          className="bg-red-500 text-white px-6 py-3 rounded-xl hover:bg-red-600 shadow-md font-bold text-lg transition-colors cursor-pointer"
        >
          حذف جميع البيانات
        </button>
      </div>

      {/* Premium Deletion Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-red-100 flex flex-col items-center text-center space-y-6 relative overflow-hidden" dir="rtl">
            {/* Red Accent bar */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-red-500 to-rose-600" />
            
            {/* Close Button */}
            {!isDeleting && !deleteSuccess && (
              <button 
                onClick={() => { setShowModal(false); setConfirmText(""); }}
                className="absolute top-4 left-4 text-gray-400 hover:text-gray-600 font-bold text-xl cursor-pointer"
              >
                ✕
              </button>
            )}

            {deleteSuccess ? (
              <>
                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center text-green-500 animate-bounce">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-2xl font-black text-slate-800">تم المسح بنجاح</h3>
                <p className="text-gray-500">تم تفريغ كافة جداول قاعدة البيانات وإعادة ضبط المصنع للنظام بالكامل بنجاح.</p>
                <button
                  onClick={() => { setShowModal(false); setDeleteSuccess(false); setConfirmText(""); }}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg cursor-pointer"
                >
                  حسناً
                </button>
              </>
            ) : (
              <>
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-500 animate-pulse">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                
                <div>
                  <h3 className="text-2xl font-black text-slate-800">تأكيد مسح البيانات</h3>
                  <p className="text-gray-500 mt-2 text-sm leading-relaxed">
                    تحذير: هذا الإجراء سيقوم بحذف كافة السجلات بما في ذلك السائقين، المركبات، العقود، العمليات المالية، والتقارير نهائياً. لا يمكن التراجع عن هذا الإجراء!
                  </p>
                </div>

                <div className="w-full text-right space-y-2">
                  <label className="text-xs font-bold text-slate-500 block">اكتب كلمة <span className="text-red-600 font-black">"حذف"</span> للتأكيد:</label>
                  <input
                    type="text"
                    disabled={isDeleting}
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder='حذف'
                    className="w-full border border-slate-200 rounded-xl p-3 text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                  />
                </div>

                <div className="flex gap-3 w-full">
                  <button
                    disabled={confirmText !== "حذف" || isDeleting}
                    onClick={handleConfirmDelete}
                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-100 disabled:text-slate-400 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg hover:shadow-red-500/10 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isDeleting ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        جاري الحذف...
                      </>
                    ) : "مسح البيانات نهائياً"}
                  </button>
                  
                  {!isDeleting && (
                    <button
                      onClick={() => { setShowModal(false); setConfirmText(""); }}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3.5 rounded-xl font-bold transition-all cursor-pointer"
                    >
                      إلغاء
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
