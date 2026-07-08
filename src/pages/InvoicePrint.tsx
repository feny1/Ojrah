import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";

const PRINT_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
  @media print {
    @page { size: A4 portrait; margin: 12mm; }
    body { background: white !important; }
    .no-print { display: none !important; }
    .page-break { page-break-after: always; break-after: page; }
  }
  * { box-sizing: border-box; }
`;

const S = {
  page: {
    fontFamily: "'Cairo', 'Arial', sans-serif",
    width: "210mm",
    minHeight: "297mm",
    margin: "0 auto",
    padding: "16mm 14mm",
    background: "white",
    color: "#000",
    fontSize: 14,
    lineHeight: 1.8,
  } as React.CSSProperties,
  outerBorder: {
    border: "3px solid #000",
    padding: "14px 18px",
    minHeight: "255mm",
    display: "flex",
    flexDirection: "column",
  } as React.CSSProperties,
  innerBorder: {
    border: "1px solid #000",
    padding: "10px 14px",
    flex: 1,
    display: "flex",
    flexDirection: "column",
  } as React.CSSProperties,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "2px solid #000",
    paddingBottom: 10,
    marginBottom: 14,
  } as React.CSSProperties,
  typeBadge: {
    border: "2px solid #000",
    padding: "5px 18px",
    textAlign: "center",
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 1,
  } as React.CSSProperties,
  metaRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 16,
    fontSize: 12,
  } as React.CSSProperties,
  underline: {
    borderBottom: "1px solid #000",
    paddingBottom: 2,
    minWidth: 90,
    display: "inline-block",
    textAlign: "center",
    fontWeight: 700,
  } as React.CSSProperties,
  contentBox: {
    border: "1px solid #000",
    padding: "16px 20px",
    marginBottom: 16,
  } as React.CSSProperties,
  fieldRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 12,
    fontSize: 14,
  } as React.CSSProperties,
  fieldLabel: {
    fontWeight: 700,
    whiteSpace: "nowrap",
    minWidth: 180,
  } as React.CSSProperties,
  fieldValue: {
    borderBottom: "1px solid #000",
    flex: 1,
    fontWeight: 700,
    paddingBottom: 2,
    textAlign: "center",
  } as React.CSSProperties,
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 10,
    marginBottom: 16,
    fontSize: 13,
  } as React.CSSProperties,
  th: {
    border: "1px solid #000",
    padding: "8px",
    backgroundColor: "#f8fafc",
    fontWeight: "bold",
    textAlign: "center",
  } as React.CSSProperties,
  td: {
    border: "1px solid #000",
    padding: "8px",
    textAlign: "center",
  } as React.CSSProperties,
  totalsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginTop: "auto",
    paddingTop: 10,
    borderTop: "1px solid #000",
  } as React.CSSProperties,
  footer: {
    borderTop: "1px solid #ccc",
    marginTop: 16,
    paddingTop: 6,
    display: "flex",
    justifyContent: "space-between",
    fontSize: 10,
    color: "#666",
  } as React.CSSProperties,
};

// ZATCA Base64 TLV Generator
function generateZatcaQrB64(sellerName: string, vatNumber: string, timestamp: string, total: string, vatTotal: string) {
  const getTlv = (tag: number, val: string) => {
    const valueBuf = new TextEncoder().encode(val);
    const tagBuf = new Uint8Array([tag]);
    const lengthBuf = new Uint8Array([valueBuf.length]);
    const combined = new Uint8Array(tagBuf.length + lengthBuf.length + valueBuf.length);
    combined.set(tagBuf, 0);
    combined.set(lengthBuf, tagBuf.length);
    combined.set(valueBuf, tagBuf.length + lengthBuf.length);
    return combined;
  };
  
  try {
    const parts = [
      getTlv(1, sellerName),
      getTlv(2, vatNumber),
      getTlv(3, timestamp),
      getTlv(4, total),
      getTlv(5, vatTotal)
    ];
    
    let totalLen = parts.reduce((acc, part) => acc + part.length, 0);
    let tlvBytes = new Uint8Array(totalLen);
    let offset = 0;
    parts.forEach(part => {
      tlvBytes.set(part, offset);
      offset += part.length;
    });
    
    let binary = "";
    for (let i = 0; i < tlvBytes.length; i++) {
      binary += String.fromCharCode(tlvBytes[i]);
    }
    return btoa(binary);
  } catch (e) {
    console.error("Error generating ZATCA TLV Base64", e);
    return "";
  }
}

export default function InvoicePrint() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<any>(null);
  const [settings, setSettings] = useState<any>({ vat_number: "310123456700003" });
  const printedRef = useRef(false);

  useEffect(() => {
    // 1. Fetch settings
    fetch("http://localhost:3001/api/settings")
      .then(res => res.json())
      .then(data => {
        if (data.vat_number) setSettings(data);
      })
      .catch(err => console.error("Error loading settings:", err));

    // 2. Fetch invoice details
    fetch(`http://localhost:3001/api/invoices/${id}`)
      .then(res => res.json())
      .then(data => {
        setInvoice(data);
        if (!printedRef.current) {
          printedRef.current = true;
          setTimeout(() => window.print(), 700);
        }
      })
      .catch(err => console.error("Error loading invoice:", err));
  }, [id]);

  if (!invoice) return <div style={{ padding: 40, textAlign: "center", fontFamily: "Cairo" }}>جاري التحميل...</div>;

  const sellerName = "مؤسسة نجلاء القحطاني للأجرة العامة";
  const vatNumber = settings.vat_number;
  
  // Tax calculations
  const totalAmount = invoice.amount || 0;
  const baseAmount = totalAmount / 1.15;
  const vatAmount = totalAmount - baseAmount;

  // Base64 TLV for ZATCA QR code
  const timestamp = `${invoice.invoice_date}T12:00:00Z`;
  const qrB64 = generateZatcaQrB64(
    sellerName,
    vatNumber,
    timestamp,
    totalAmount.toFixed(2),
    vatAmount.toFixed(2)
  );
  
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(qrB64)}`;

  return (
    <>
      <style>{PRINT_STYLE}</style>
      <div className="no-print" style={{ padding: 16 }}>
        <Link to="/invoices" style={{ background: "#1e293b", color: "white", padding: "8px 16px", borderRadius: 6, textDecoration: "none", fontFamily: "Cairo", fontWeight: 700 }}>
          ← العودة للفواتير
        </Link>
      </div>

      <div dir="rtl" style={S.page}>
        <div style={S.outerBorder}>
          <div style={S.innerBorder}>
            
            {/* Header */}
            <div style={S.header}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900 }}>{sellerName}</div>
                <div style={{ fontSize: 10, color: "#444", marginTop: 3 }}>إدارة أسطول المركبات والامتثال الضريبي</div>
                <div style={{ fontSize: 11, fontWeight: "bold", marginTop: 4 }}>الرقم الضريبي للمنشأة: {vatNumber}</div>
              </div>
              <div style={S.typeBadge}>فاتورة ضريبية مبسطة</div>
            </div>

            {/* Meta Row */}
            <div style={S.metaRow}>
              <div><b>رقم الفاتورة:</b> <span style={S.underline}>{invoice.invoice_number}</span></div>
              <div><b>تاريخ الفاتورة:</b> <span style={S.underline}>{invoice.invoice_date}</span></div>
              <div><b>تاريخ التوريد:</b> <span style={S.underline}>{invoice.invoice_date}</span></div>
            </div>

            {/* Client and vehicle details */}
            <div style={S.contentBox}>
              {invoice.driver_name && (
                <div style={S.fieldRow}>
                  <span style={S.fieldLabel}>اسم العميل / السائق:</span>
                  <span style={S.fieldValue}>{invoice.driver_name}</span>
                </div>
              )}
              {invoice.driver_national_id && (
                <div style={S.fieldRow}>
                  <span style={S.fieldLabel}>رقم الهوية الوطنية / الإقامة:</span>
                  <span style={S.fieldValue}>{invoice.driver_national_id}</span>
                </div>
              )}
              {invoice.plate_number ? (
                <div style={S.fieldRow}>
                  <span style={S.fieldLabel}>بيانات المركبة (اللوحة):</span>
                  <span style={S.fieldValue}>
                    {invoice.plate_number} ({invoice.company} {invoice.model} - {invoice.year})
                  </span>
                </div>
              ) : (
                <div style={S.fieldRow}>
                  <span style={S.fieldLabel}>بيانات المركبة:</span>
                  <span style={S.fieldValue}>غير محددة / عامة</span>
                </div>
              )}
              {invoice.receipt_number && (
                <div style={S.fieldRow}>
                  <span style={S.fieldLabel}>بموجب سند قبض رقم:</span>
                  <span style={S.fieldValue}>{invoice.receipt_number}</span>
                </div>
              )}
            </div>

            {/* Services Table */}
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={{ ...S.th, width: "10%" }}>م</th>
                  <th style={{ ...S.th, width: "50%" }}>البيان / الخدمة</th>
                  <th style={{ ...S.th, width: "15%" }}>معدل الضريبة</th>
                  <th style={{ ...S.th, width: "25%" }}>المبلغ شامل الضريبة</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={S.td}>١</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{invoice.service_type}</td>
                  <td style={S.td}>١٥٪</td>
                  <td style={{ ...S.td, fontWeight: "bold" }}>{totalAmount.toLocaleString()} ر.س</td>
                </tr>
              </tbody>
            </table>

            {/* Bottom Grid: QR Code & Totals */}
            <div style={S.totalsGrid}>
              
              {/* QR Code and Compliance Info */}
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div>
                  <img 
                    src={qrUrl} 
                    alt="ZATCA Compliance QR Code" 
                    style={{ border: "1px solid #ddd", padding: 2, display: "block" }} 
                  />
                </div>
                <div style={{ fontSize: 9, color: "#333", lineHeight: 1.5 }}>
                  <div style={{ fontWeight: "bold", fontSize: 10, marginBottom: 2 }}>الامتثال الضريبي (هيئة الزكاة والضريبة والجمارك):</div>
                  <div>• هذه فاتورة ضريبية مبسطة إلكترونية.</div>
                  <div>• يرجى مسح الرمز للتحقق من هوية المنشأة الضريبية.</div>
                  <div>• ضريبة القيمة المضافة تحتسب بنسبة 15٪.</div>
                </div>
              </div>

              {/* Totals Table */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, borderRight: "1px solid #000", paddingRight: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>المجموع الخاضع للضريبة (غير شامل الضريبة):</span>
                  <span style={{ fontWeight: "bold" }}>{baseAmount.toFixed(2)} ر.س</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>ضريبة القيمة المضافة (١٥٪):</span>
                  <span style={{ fontWeight: "bold" }}>{vatAmount.toFixed(2)} ر.س</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, borderTop: "2px solid #000", paddingTop: 6, marginTop: 4 }}>
                  <span style={{ fontWeight: 900 }}>الإجمالي المستحق شامل الضريبة:</span>
                  <span style={{ fontWeight: 900, borderBottom: "3px double #000", paddingBottom: 1 }}>{totalAmount.toFixed(2)} ر.س</span>
                </div>
              </div>
            </div>

            {/* Signatures */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginTop: 40 }}>
              {["توقيع العميل / المستلم", "الموظف المسؤول / الختم"].map((lbl, i) => (
                <div key={i} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 11 }}>{lbl}</div>
                  <div style={{ borderBottom: "1px solid #000", marginTop: 36, marginBottom: 3 }} />
                  <div style={{ fontSize: 10, color: "#666" }}>التوقيع والتأكيد</div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={S.footer}>
              <span>تعتبر هذه الفاتورة وثيقة رسمية خاضعة لأحكام ضريبة القيمة المضافة بالمملكة العربية السعودية</span>
              <span>الرقم المرجعي: {invoice.invoice_number} | أجرة © {new Date().getFullYear()}</span>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
