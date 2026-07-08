import { Link, useParams } from "react-router-dom";
import { useState, useEffect } from "react";

export default function CarDetails() {
  const { id } = useParams();
  const [car, setCar] = useState<any>(null);
  const [depreciationRate, setDepreciationRate] = useState(15); // Default 15%
  const [targetMileage, setTargetMileage] = useState(250000); // Default 250,000 km
  const [currentMileage, setCurrentMileage] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    company: "",
    model: "",
    year: new Date().getFullYear(),
    purchase_date: "",
    plate_number: "",
    color: "",
    purchase_cost: 0,
    depreciation_method: "سنوات",
  });
  
  const [docFormData, setDocFormData] = useState({
    document_type: "",
    document_number: "",
    expiry_date: "",
    notes: ""
  });

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`http://localhost:3001/api/cars/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFormData)
      });
      if (response.ok) {
        alert("تم تحديث بيانات المركبة بنجاح!");
        setShowEditModal(false);
        loadCar();
      } else {
        const err = await response.json();
        alert("فشل التحديث: " + (err.error || "خطأ غير معروف"));
      }
    } catch (error) {
      console.error("Error updating car:", error);
      alert("حدث خطأ أثناء الاتصال بالخادم");
    }
  };

  const loadCar = () => {
    fetch(`http://localhost:3001/api/cars/${id}`)
      .then(res => res.json())
      .then(data => {
        setCar(data);
        const maxKm = data.maintenance && data.maintenance.length > 0 
          ? Math.max(...data.maintenance.map((m: any) => m.kilometers)) 
          : 0;
        setCurrentMileage(maxKm);
      })
      .catch(err => console.error("Error loading car:", err));
  };

  useEffect(() => {
    loadCar();
  }, [id]);

  const getElapsedPeriod = (startDateStr: string) => {
    const start = new Date(startDateStr);
    const end = new Date();
    
    if (isNaN(start.getTime())) return { years: 0, months: 0, days: 0, totalYears: 0, text: "تاريخ غير صالح" };
    
    if (start > end) {
      return { years: 0, months: 0, days: 0, totalYears: 0, text: "تاريخ في المستقبل (لم تبدأ مدة الإهلاك بعد)" };
    }
    
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();
    
    if (days < 0) {
      months--;
      const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
      days += prevMonth.getDate();
    }
    
    if (months < 0) {
      years--;
      months += 12;
    }
    
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const totalYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    
    const parts = [];
    if (years > 0) {
      if (years === 1) parts.push("سنة واحدة");
      else if (years === 2) parts.push("سنتين");
      else if (years >= 3 && years <= 10) parts.push(`${years} سنوات`);
      else parts.push(`${years} سنة`);
    }
    if (months > 0) {
      if (months === 1) parts.push("شهر واحد");
      else if (months === 2) parts.push("شهرين");
      else if (months >= 3 && months <= 10) parts.push(`${months} أشهر`);
      else parts.push(`${months} شهر`);
    }
    if (days > 0 || parts.length === 0) {
      if (days === 1) parts.push("يوم واحد");
      else if (days === 2) parts.push("يومين");
      else if (days >= 3 && days <= 10) parts.push(`${days} أيام`);
      else parts.push(`${days} يوم`);
    }
    
    return {
      years,
      months,
      days,
      totalYears,
      text: parts.join(" و ")
    };
  };

  const handleDeleteMaintenance = async (maintenanceId: number) => {
    if (window.confirm("هل أنت متأكد من حذف سجل الصيانة هذا؟")) {
      try {
        await fetch(`http://localhost:3001/api/maintenance/${maintenanceId}`, { method: "DELETE" });
        loadCar();
      } catch (error) {
        console.error("Error deleting maintenance:", error);
      }
    }
  };

  const handleDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("http://localhost:3001/api/car_documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...docFormData, car_id: car.id })
      });
      alert("تمت إضافة المستند بنجاح!");
      setDocFormData({ document_type: "", document_number: "", expiry_date: "", notes: "" });
      loadCar();
    } catch (error) {
      console.error("Error adding document:", error);
    }
  };

  if (!car) return <div className="p-8 text-center text-slate-500 text-xl font-bold">جاري التحميل...</div>;

  // Depreciation & Current Value Calculations
  const cost = car.purchase_cost || 0;
  const elapsed = getElapsedPeriod(car.purchase_date);
  
  let straightLineVal = 0;
  let decliningVal = 0;
  let straightLineDepPercent = 0;
  let decliningDepPercent = 0;
  
  if (car.depreciation_method === "كيلومترات") {
    const ratio = targetMileage > 0 ? Math.min(1, currentMileage / targetMileage) : 0;
    straightLineDepPercent = ratio * 100;
    decliningDepPercent = ratio * 100;
    straightLineVal = cost * (1 - ratio);
    decliningVal = straightLineVal;
  } else {
    straightLineDepPercent = Math.min(100, elapsed.totalYears * depreciationRate);
    straightLineVal = cost * (1 - straightLineDepPercent / 100);
    
    decliningVal = cost * Math.pow(1 - depreciationRate / 100, elapsed.totalYears);
    decliningDepPercent = ((cost - decliningVal) / cost) * 100;
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
            <h1 className="text-4xl font-bold text-blue-600">صفحة المركبة الشاملة</h1>
            <p className="text-gray-500 mt-2">بيانات المركبة، السائقين، ونسبة التغطية وجدول السندات الزمني</p>
          </div>
          <div className="space-x-4 space-x-reverse flex">
            <button onClick={() => {
              setEditFormData({
                company: car.company,
                model: car.model,
                year: car.year,
                purchase_date: car.purchase_date,
                plate_number: car.plate_number,
                color: car.color,
                purchase_cost: car.purchase_cost,
                depreciation_method: car.depreciation_method
              });
              setShowEditModal(true);
            }} className="bg-yellow-600 text-white px-6 py-3 rounded-xl hover:bg-yellow-700 shadow-lg font-bold">
              تعديل بيانات المركبة
            </button>
            <button onClick={() => window.print()} className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 shadow-lg">
              طباعة التقرير
            </button>
            <Link to="/cars" className="bg-slate-800 text-white px-6 py-3 rounded-xl hover:bg-slate-700 shadow-lg">
              العودة
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-xl font-bold text-blue-600 mb-4 border-b pb-2">بيانات المركبة الأساسية</h2>
            <ul className="space-y-3 text-slate-700">
              <li><span className="text-gray-500 w-24 inline-block">النوع:</span> {car.company} {car.model}</li>
              <li><span className="text-gray-500 w-24 inline-block">اللوحة:</span> <span className="font-bold">{car.plate_number}</span></li>
              <li><span className="text-gray-500 w-24 inline-block">سنة الصنع:</span> {car.year}</li>
              <li><span className="text-gray-500 w-24 inline-block">سعر الشراء:</span> {car.purchase_cost} ريال</li>
              <li><span className="text-gray-500 w-24 inline-block">الإهلاك:</span> {car.depreciation_method}</li>
            </ul>
          </div>
          
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-xl font-bold text-orange-500 mb-4 border-b pb-2">السائق الحالي للمركبة</h2>
            <ul className="space-y-3 text-slate-700">
              {car.current_driver ? (
                <>
                  <li className="flex items-center space-x-4 space-x-reverse">
                    <span className="w-32 text-gray-500">اسم السائق:</span>
                    <span className="font-bold">{car.current_driver.name}</span>
                  </li>
                  <li className="flex items-center space-x-4 space-x-reverse">
                    <span className="w-32 text-gray-500">تاريخ التسليم:</span>
                    <span>{car.current_driver.start_date}</span>
                  </li>
                </>
              ) : (
                <li className="text-gray-500 italic">لا يوجد سائق مرتبط حالياً</li>
              )}
            </ul>
          </div>
        </div>

        {/* Depreciation & Current Value Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-3 border-b pb-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">حساب الإهلاك والقيمة الحالية للمركبة</h2>
              <p className="text-xs text-gray-500">حساب القيمة الحالية بناءً على نسبة الإهلاك وفترة الاستخدام</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Controls Column */}
            <div className="space-y-5 bg-slate-50 p-5 rounded-2xl border border-slate-100">
              <h3 className="font-bold text-slate-700 mb-2">إعدادات الحساب</h3>
              
              {car.depreciation_method === "سنوات" ? (
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-600 flex justify-between">
                    <span>نسبة الإهلاك السنوية:</span>
                    <span className="text-blue-600 font-bold">{depreciationRate}%</span>
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="40"
                    step="1"
                    value={depreciationRate}
                    onChange={(e) => setDepreciationRate(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <p className="text-[10px] text-gray-400">النسب الشائعة لسيارات الأجرة: 15% - 25% سنوياً</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-600 flex justify-between">
                      <span>العمر الافتراضي بالمسافة:</span>
                      <span className="text-blue-600 font-bold">{targetMileage.toLocaleString()} كم</span>
                    </label>
                    <input
                      type="range"
                      min="100000"
                      max="500000"
                      step="10000"
                      value={targetMileage}
                      onChange={(e) => setTargetMileage(parseInt(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-600 flex justify-between">
                      <span>قراءة العداد الحالية:</span>
                      <span className="text-blue-600 font-bold">{currentMileage.toLocaleString()} كم</span>
                    </label>
                    <input
                      type="number"
                      value={currentMileage}
                      onChange={(e) => setCurrentMileage(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full border p-2 rounded-lg bg-white text-sm"
                    />
                    <p className="text-[10px] text-gray-400">مستوحى تلقائياً من سجلات الصيانة</p>
                  </div>
                </>
              )}
            </div>

            {/* Details Column */}
            <div className="space-y-4">
              <h3 className="font-bold text-slate-700 border-b pb-2">تفاصيل الاستهلاك</h3>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex justify-between">
                  <span>تاريخ الشراء:</span>
                  <span className="font-semibold text-slate-800">{car.purchase_date}</span>
                </li>
                <li className="flex justify-between">
                  <span>سعر الشراء الأساسي:</span>
                  <span className="font-semibold text-slate-800">{car.purchase_cost.toLocaleString()} ريال</span>
                </li>
                <li className="flex justify-between">
                  <span>المدة المنقضية منذ الشراء:</span>
                  <span className="font-semibold text-slate-800">{elapsed.text}</span>
                </li>
                <li className="flex justify-between">
                  <span>طريقة الإهلاك المحددة:</span>
                  <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{car.depreciation_method}</span>
                </li>
              </ul>
            </div>

            {/* Results Column */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-700 border-b pb-2 mb-3">القيمة التقديرية المتبقية</h3>
                
                {car.depreciation_method === "سنوات" ? (
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs text-gray-500 block">الإهلاك بقسط ثابت ({straightLineDepPercent.toFixed(1)}%):</span>
                      <span className="text-2xl font-black text-blue-600">{Math.max(0, Math.round(straightLineVal)).toLocaleString()} <span className="text-xs font-normal text-slate-500">ريال</span></span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 block">الإهلاك برصيد متناقص ({decliningDepPercent.toFixed(1)}%):</span>
                      <span className="text-2xl font-black text-emerald-600">{Math.max(0, Math.round(decliningVal)).toLocaleString()} <span className="text-xs font-normal text-slate-500">ريال</span></span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs text-gray-500 block">استهلاك المسافة ({straightLineDepPercent.toFixed(1)}%):</span>
                      <span className="text-2xl font-black text-blue-600">{Math.max(0, Math.round(straightLineVal)).toLocaleString()} <span className="text-xs font-normal text-slate-500">ريال</span></span>
                    </div>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              <div className="mt-4">
                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                  <span>المستهلك: {straightLineDepPercent.toFixed(0)}%</span>
                  <span>المتبقي: {(100 - straightLineDepPercent).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden flex">
                  <div className="bg-red-500 h-full" style={{ width: `${straightLineDepPercent}%` }}></div>
                  <div className="bg-emerald-500 h-full flex-1"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-6">الجدول الزمني الموحد (Timeline)</h2>
          <div className="relative border-r-2 border-slate-200 pr-6 space-y-6">
            {car.maintenance && car.maintenance.length > 0 ? car.maintenance.map((m: any, i: number) => (
              <div key={i} className="relative">
                <span className="absolute -right-8 top-1 w-4 h-4 rounded-full bg-red-500 border-4 border-white shadow"></span>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-red-600">صيانة دورية</h3>
                    <span className="text-sm text-gray-500">مسافة: {m.kilometers} كم</span>
                    <button onClick={() => m.id && handleDeleteMaintenance(m.id)} className="text-red-500 hover:underline">حذف</button>
                  </div>
                  <p className="text-slate-600">التكلفة: {m.cost} ريال | تغيير زيت: {m.oil_change ? 'نعم' : 'لا'} | تغيير فلتر: {m.filter_change ? 'نعم' : 'لا'}</p>
                  {(m.amount_from_driver > 0 || m.deducted_from_weekly > 0) && (
                    <p className="text-sm text-gray-500 mt-2">
                      مطلوب من السائق: {m.amount_from_driver} ريال | محسوم من السائق: {m.deducted_from_weekly} ريال
                    </p>
                  )}
                </div>
              </div>
            )) : (
              <div className="text-gray-500 italic">لا توجد حركات صيانة مسجلة حتى الآن</div>
            )}
          </div>
        </div>

        {/* Car Documents Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mt-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">مستندات المركبة (استمارة، تأمين، فحص)</h2>
          
          <form onSubmit={handleDocSubmit} className="bg-slate-50 p-6 rounded-xl border border-slate-100 mb-8 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <select 
                className="border p-3 rounded-lg bg-white" 
                value={docFormData.document_type} 
                onChange={(e) => setDocFormData({...docFormData, document_type: e.target.value})} 
                required
              >
                <option value="">-- نوع المستند --</option>
                <option value="استمارة">استمارة سير</option>
                <option value="تأمين">وثيقة تأمين</option>
                <option value="فحص دوري">فحص دوري</option>
                <option value="كرت تشغيل">كرت تشغيل</option>
                <option value="أخرى">أخرى</option>
              </select>
              <input type="text" placeholder="رقم المستند" className="border p-3 rounded-lg" value={docFormData.document_number} onChange={(e) => setDocFormData({...docFormData, document_number: e.target.value})} />
              <input type="date" required className="border p-3 rounded-lg text-gray-500" title="تاريخ الانتهاء" value={docFormData.expiry_date} onChange={(e) => setDocFormData({...docFormData, expiry_date: e.target.value})} />
              <input type="text" placeholder="ملاحظات" className="border p-3 rounded-lg" value={docFormData.notes} onChange={(e) => setDocFormData({...docFormData, notes: e.target.value})} />
            </div>
            <button type="submit" className="bg-slate-800 text-white px-6 py-3 rounded-lg hover:bg-slate-700 w-full md:w-auto mt-4 font-bold">
              إضافة مستند +
            </button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-slate-50 text-slate-600 border-b-2 border-slate-200">
                <tr>
                  <th className="p-3 border">نوع المستند</th>
                  <th className="p-3 border">رقم المستند</th>
                  <th className="p-3 border">تاريخ الانتهاء</th>
                  <th className="p-3 border">ملاحظات</th>
                  <th className="p-3 border">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {car.documents && car.documents.length > 0 ? (
                  car.documents.map((d: any, i: number) => {
                    const isExpired = new Date(d.expiry_date) < new Date();
                    return (
                      <tr key={i} className="hover:bg-slate-50 text-center">
                        <td className="p-3 border font-bold text-slate-700">{d.document_type}</td>
                        <td className="p-3 border">{d.document_number || '-'}</td>
                        <td className={`p-3 border font-bold ${isExpired ? 'text-red-500 bg-red-50' : 'text-green-600'}`}>{d.expiry_date}</td>
                        <td className="p-3 border text-gray-500">{d.notes || '-'}</td>
                        <td className="p-3 border">
                          <button onClick={async () => {
                            if (window.confirm("حذف هذا المستند؟")) {
                              await fetch(`http://localhost:3001/api/car_documents/${d.id}`, { method: "DELETE" });
                              loadCar();
                            }
                          }} className="text-red-500 hover:underline font-bold">حذف</button>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-gray-500 italic border">لا يوجد مستندات مسجلة لهذه المركبة</td>
                  </tr>
                )}
              </tbody>
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
              <div style={{ border: "2px solid #000", padding: "4px 16px", fontSize: 18, fontWeight: 900, letterSpacing: 1 }}>تقرير مركبة شامل</div>
            </div>

            {/* Meta Row */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 11 }}>
              <div><b>تاريخ طباعة التقرير:</b> <span style={{ borderBottom: "1px solid #000", paddingBottom: 1 }}>{new Date().toLocaleDateString('ar-SA')}</span></div>
              <div><b>حالة المركبة:</b> <span style={{ borderBottom: "1px solid #000", paddingBottom: 1, color: "green", fontWeight: "bold" }}>نشط</span></div>
            </div>

            {/* Section 1: Basic Vehicle details */}
            <div style={{ border: "1px solid #000", padding: "8px 12px", marginBottom: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 12, borderBottom: "1px solid #000", marginBottom: 8, paddingBottom: 2 }}>أولاً: البيانات الأساسية للمركبة</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
                <FR lbl="النوع والموديل" val={`${car.company} ${car.model}`} />
                <FR lbl="رقم اللوحة" val={car.plate_number} />
                <FR lbl="سنة الصنع" val={String(car.year)} />
                <FR lbl="اللون" val={car.color || "-"} />
                <FR lbl="سعر الشراء" val={`${car.purchase_cost?.toLocaleString()} ريال`} />
                <FR lbl="تاريخ الشراء" val={car.purchase_date} />
                <FR lbl="طريقة الإهلاك" val={car.depreciation_method} />
                <FR lbl="المدة المنقضية" val={elapsed.text} />
              </div>
            </div>

            {/* Section 2: Current Driver details */}
            <div style={{ border: "1px solid #000", padding: "8px 12px", marginBottom: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 12, borderBottom: "1px solid #000", marginBottom: 8, paddingBottom: 2 }}>ثانياً: بيانات السائق والتشغيل الحالي</div>
              {car.current_driver ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
                  <FR lbl="اسم السائق" val={car.current_driver.name} />
                  <FR lbl="تاريخ استلام المركبة" val={car.current_driver.start_date} />
                </div>
              ) : (
                <div style={{ fontSize: 11, fontStyle: "italic", color: "#666" }}>لا يوجد سائق مرتبط حالياً بهذه المركبة.</div>
              )}
            </div>

            {/* Section 3: Depreciation Calculation details */}
            <div style={{ border: "1px solid #000", padding: "8px 12px", marginBottom: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 12, borderBottom: "1px solid #000", marginBottom: 8, paddingBottom: 2 }}>ثالثاً: حسابات القيمة الحالية والإهلاك التقديري</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
                {car.depreciation_method === "سنوات" ? (
                  <>
                    <FR lbl="نسبة الإهلاك المحددة" val={`${depreciationRate}% سنوياً`} />
                    <FR lbl="إجمالي الاستهلاك الثابت" val={`${straightLineDepPercent.toFixed(1)}%`} />
                    <FR lbl="القيمة المتبقية (قسط ثابت)" val={`${Math.max(0, Math.round(straightLineVal)).toLocaleString()} ريال`} />
                    <FR lbl="القيمة المتبقية (رصيد متناقص)" val={`${Math.max(0, Math.round(decliningVal)).toLocaleString()} ريال`} />
                  </>
                ) : (
                  <>
                    <FR lbl="العمر الافتراضي بالمسافة" val={`${targetMileage.toLocaleString()} كم`} />
                    <FR lbl="المسافة المقطوعة الحالية" val={`${currentMileage.toLocaleString()} كم`} />
                    <FR lbl="إجمالي استهلاك المسافة" val={`${straightLineDepPercent.toFixed(1)}%`} />
                    <FR lbl="القيمة المتبقية التقديرية" val={`${Math.max(0, Math.round(straightLineVal)).toLocaleString()} ريال`} />
                  </>
                )}
              </div>
            </div>

            {/* Section 4: Maintenance Records and Active Documents */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10, flex: 1 }}>
              {/* Maintenance Table */}
              <div style={{ border: "1px solid #000", padding: "6px 8px", display: "flex", flexDirection: "column" }}>
                <div style={{ fontWeight: 900, fontSize: 11, borderBottom: "1px solid #000", marginBottom: 4, paddingBottom: 2 }}>رابعاً: سجل الصيانة الأخير</div>
                <table style={{ width: "100%", fontSize: 9, textAlign: "right", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #000" }}>
                      <th>المسافة</th>
                      <th>التكلفة</th>
                      <th>التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {car.maintenance && car.maintenance.length > 0 ? (
                      car.maintenance.slice(0, 4).map((m: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                          <td>{m.kilometers?.toLocaleString()} كم</td>
                          <td>{m.cost} ريال</td>
                          <td>{m.oil_change ? 'تغيير زيت' : ''} {m.filter_change ? 'وفلتر' : ''}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} style={{ fontStyle: "italic", color: "#666", textAlign: "center", paddingTop: 8 }}>لا يوجد سجل صيانة</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Documents Table */}
              <div style={{ border: "1px solid #000", padding: "6px 8px", display: "flex", flexDirection: "column" }}>
                <div style={{ fontWeight: 900, fontSize: 11, borderBottom: "1px solid #000", marginBottom: 4, paddingBottom: 2 }}>خامساً: مستندات المركبة النشطة</div>
                <table style={{ width: "100%", fontSize: 9, textAlign: "right", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #000" }}>
                      <th>نوع المستند</th>
                      <th>الرقم</th>
                      <th>الانتهاء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {car.documents && car.documents.length > 0 ? (
                      car.documents.slice(0, 4).map((d: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                          <td style={{ fontWeight: "bold" }}>{d.document_type}</td>
                          <td>{d.document_number || "-"}</td>
                          <td>{d.expiry_date}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} style={{ fontStyle: "italic", color: "#666", textAlign: "center", paddingTop: 8 }}>لا يوجد مستندات مسجلة</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Signature Block */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginTop: "auto", paddingTop: 10 }}>
              {["توقيع المسؤول الفني", "مدير إدارة الحركة والأسطول"].map((lbl, i) => (
                <div key={i} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 11 }}>{lbl}</div>
                  <div style={{ borderBottom: "1px solid #000", marginTop: 24, marginBottom: 2 }} />
                  <div style={{ fontSize: 10, color: "#666" }}>التوقيع والختم</div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ borderTop: "1px solid #ccc", marginTop: 6, paddingTop: 4, display: "flex", justifyContent: "space-between", fontSize: 9, color: "#666" }}>
              <span>هذه الوثيقة تعتبر تقريراً رسمياً إلكترونياً معتمداً ومسجلاً بالنظام</span>
              <span>أجرة © {new Date().getFullYear()}</span>
            </div>

          </div>
        </div>
      </div>

      {/* Edit Car Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 relative" dir="rtl">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-2">تعديل بيانات المركبة</h2>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-sm font-bold text-slate-700 mb-1">الشركة المصنعة</label>
                  <input type="text" required className="border p-3 rounded-lg" value={editFormData.company} onChange={(e) => setEditFormData({...editFormData, company: e.target.value})} />
                </div>
                <div className="flex flex-col">
                  <label className="text-sm font-bold text-slate-700 mb-1">الموديل</label>
                  <input type="text" required className="border p-3 rounded-lg" value={editFormData.model} onChange={(e) => setEditFormData({...editFormData, model: e.target.value})} />
                </div>
                <div className="flex flex-col">
                  <label className="text-sm font-bold text-slate-700 mb-1">سنة الصنع</label>
                  <input type="number" required className="border p-3 rounded-lg" value={editFormData.year} onChange={(e) => setEditFormData({...editFormData, year: parseInt(e.target.value) || 0})} />
                </div>
                <div className="flex flex-col">
                  <label className="text-sm font-bold text-slate-700 mb-1">تاريخ الشراء</label>
                  <input type="date" required className="border p-3 rounded-lg text-slate-700" value={editFormData.purchase_date} onChange={(e) => setEditFormData({...editFormData, purchase_date: e.target.value})} />
                </div>
                <div className="flex flex-col">
                  <label className="text-sm font-bold text-slate-700 mb-1">رقم اللوحة</label>
                  <input type="text" required className="border p-3 rounded-lg" value={editFormData.plate_number} onChange={(e) => setEditFormData({...editFormData, plate_number: e.target.value})} />
                </div>
                <div className="flex flex-col">
                  <label className="text-sm font-bold text-slate-700 mb-1">اللون</label>
                  <input type="text" required className="border p-3 rounded-lg" value={editFormData.color} onChange={(e) => setEditFormData({...editFormData, color: e.target.value})} />
                </div>
                <div className="flex flex-col">
                  <label className="text-sm font-bold text-slate-700 mb-1">تكلفة الشراء (ريال)</label>
                  <input type="number" required className="border p-3 rounded-lg" value={editFormData.purchase_cost} onChange={(e) => setEditFormData({...editFormData, purchase_cost: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="flex flex-col">
                  <label className="text-sm font-bold text-slate-700 mb-1">طريقة الإهلاك</label>
                  <select className="border p-3 rounded-lg bg-white" value={editFormData.depreciation_method} onChange={(e) => setEditFormData({...editFormData, depreciation_method: e.target.value})}>
                    <option value="سنوات">سنوات</option>
                    <option value="كيلومترات">كيلومترات</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-4 mt-6 border-t pt-4">
                <button type="submit" className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 font-bold shadow-lg flex-1">حفظ التغييرات</button>
                <button type="button" onClick={() => setShowEditModal(false)} className="bg-slate-200 text-slate-800 px-6 py-3 rounded-xl hover:bg-slate-300 font-bold flex-1">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
