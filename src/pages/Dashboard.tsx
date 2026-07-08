import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = time.toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const formattedDate = time.toLocaleDateString("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const categories = [
    { id: "all", name: "كل التطبيقات" },
    { id: "fleet", name: "إدارة الأسطول" },
    { id: "financial", name: "المالية والتقارير" },
    { id: "system", name: "النظام" },
  ];

  const menuItems = [
    {
      title: "ملخصات وتقارير",
      description: "تحليل البيانات، إيرادات الأسطول، وحالة التشغيل اليومي",
      path: "/summary",
      category: "financial",
      gradient: "from-purple-500 to-indigo-600",
      shadow: "shadow-purple-500/20",
      badge: "تقارير",
      icon: (className: string) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
        </svg>
      ),
    },
    {
      title: "إدارة المركبات",
      description: "إضافة وتحديث السيارات، وتتبع لوحاتها وحالات الصلاحية والتشغيل",
      path: "/cars",
      category: "fleet",
      gradient: "from-blue-500 to-cyan-600",
      shadow: "shadow-blue-500/20",
      badge: "الأسطول",
      icon: (className: string) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      title: "إدارة السائقين",
      description: "بيانات السائقين، كشوفات الحساب، السلف والمدفوعات والمستندات",
      path: "/drivers",
      category: "fleet",
      gradient: "from-emerald-500 to-green-600",
      shadow: "shadow-emerald-500/20",
      badge: "السائقين",
      icon: (className: string) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      title: "عقود التشغيل",
      description: "صياغة عقود تسليم المركبات والالتزامات الأسبوعية والإجمالية",
      path: "/contracts",
      category: "fleet",
      gradient: "from-indigo-500 to-violet-600",
      shadow: "shadow-indigo-500/20",
      badge: "عقود",
      icon: (className: string) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
    },
    {
      title: "جدول الصيانات",
      description: "متابعة صيانة السيارات الدورية وتغيير الزيوت وقطع الغيار والتنبيهات",
      path: "/maintenance",
      category: "fleet",
      gradient: "from-rose-500 to-red-600",
      shadow: "shadow-rose-500/20",
      badge: "صيانة",
      icon: (className: string) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      title: "المخالفات المرورية",
      description: "رصد وتسجيل المخالفات المرورية المنسوبة لكل سائق وسيارة وتوزيعها",
      path: "/violations",
      category: "financial",
      gradient: "from-amber-500 to-orange-600",
      shadow: "shadow-amber-500/20",
      badge: "مخالفات",
      icon: (className: string) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      title: "السندات المالية",
      description: "إصدار سندات قبض وصرف للمستحقات والسداد اليومي والأسبوعي",
      path: "/vouchers",
      category: "financial",
      gradient: "from-sky-500 to-blue-600",
      shadow: "shadow-sky-500/20",
      badge: "سندات",
      icon: (className: string) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      title: "الفواتير الضريبية",
      description: "إصدار وإدارة الفواتير الضريبية المبسطة وضريبة القيمة المضافة للعملاء",
      path: "/invoices",
      category: "financial",
      gradient: "from-amber-500 to-yellow-600",
      shadow: "shadow-amber-500/20",
      badge: "فواتير",
      icon: (className: string) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      title: "الإعدادات العامة",
      description: "تهيئة معلومات المؤسسة، إعدادات الطباعة، والتحكم بقواعد البيانات والنسخ",
      path: "/settings",
      category: "system",
      gradient: "from-slate-600 to-slate-800",
      shadow: "shadow-slate-600/20",
      badge: "إعدادات",
      icon: (className: string) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      ),
    },
  ];

  const filteredItems = menuItems.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      activeCategory === "all" || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-16 transition-colors duration-300">
      {/* Background patterns */}
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none opacity-50"></div>
      
      {/* Status Bar / Top Menu Bar */}
      <div className="sticky top-0 z-50 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">أجرة ويندوز</span>
          <span className="text-xs text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-0.5">الإصدار 1.0.0</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 block">{formattedTime}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500 block">{formattedDate}</span>
          </div>
        </div>
      </div>

      <div className="p-8 max-w-6xl mx-auto space-y-10 relative z-10 mt-6">
        {/* Modern Welcome & OS Card */}
        <div className="bg-gradient-to-l from-emerald-600 to-teal-700 rounded-3xl p-8 md:p-10 shadow-xl shadow-emerald-700/10 text-white relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute left-10 bottom-0 w-48 h-48 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="space-y-3 relative z-10">
            <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs font-semibold tracking-wide backdrop-blur-sm">
              🔑 لوحة الإدارة العامة
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight font-sans">
              مرحباً بك، المدير العام
            </h1>
            <p className="text-emerald-100/90 text-lg font-light max-w-xl">
              واجهة تشغيل تطبيقات نظام إدارة الأسطول والسيارات وتتبع السندات المالية والمخالفات.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3 relative z-10 bg-white/10 p-4 rounded-2xl backdrop-blur-md border border-white/15">
            <div className="text-center px-4 py-2 border-l border-white/10">
              <span className="text-2xl font-black block">٨</span>
              <span className="text-xs text-emerald-100/80">تطبيقات نشطة</span>
            </div>
            <div className="text-center px-4 py-2">
              <span className="text-2xl font-black block">متصل</span>
              <span className="text-xs text-emerald-100/80">حالة النظام</span>
            </div>
          </div>
        </div>

        {/* Filters and Search Bar Container */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="البحث عن تطبيق أو مهمة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 left-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Categories */}
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer ${
                  activeCategory === category.id
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/15 scale-[1.02]"
                    : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        {/* Applications Launchpad Grid */}
        {filteredItems.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
            <div className="h-16 w-16 mx-auto bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              🔍
            </div>
            <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300">لم يتم العثور على تطبيقات مطابقة</h3>
            <p className="text-slate-400 mt-2">يرجى تعديل مصطلح البحث أو الفئة المحددة.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredItems.map((item, idx) => (
              <Link
                key={idx}
                to={item.path}
                className="group relative bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/60 dark:border-slate-800/60 shadow-sm hover:shadow-xl hover:border-emerald-500/30 dark:hover:border-emerald-500/20 hover:-translate-y-1.5 active:scale-98 transition-all duration-300 flex flex-col items-center text-center cursor-pointer overflow-hidden"
              >
                {/* Decorative glow behind icon */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-50/50 dark:to-slate-950/20 pointer-events-none"></div>
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-slate-100/50 dark:from-slate-800/20 to-transparent rounded-full -mr-8 -mt-8 pointer-events-none group-hover:scale-150 transition-transform duration-500"></div>

                {/* Badge Category Tag */}
                <span className="absolute top-4 left-4 text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full border border-slate-200/40 dark:border-slate-700/40">
                  {item.badge}
                </span>

                {/* App-like Rounded Square Icon */}
                <div className={`w-16 h-16 rounded-[22px] flex items-center justify-center bg-gradient-to-tr ${item.gradient} text-white mb-5 shadow-lg ${item.shadow} group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                  {item.icon("w-8 h-8")}
                </div>

                {/* App Name */}
                <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  {item.title}
                </h3>

                {/* App Description */}
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2.5 leading-relaxed">
                  {item.description}
                </p>

                {/* Open App arrow/indicator */}
                <div className="mt-4 flex items-center gap-1 text-[11px] font-black text-emerald-600 dark:text-emerald-400 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300">
                  <span>تشغيل التطبيق</span>
                  <span>←</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
