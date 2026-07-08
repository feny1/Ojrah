import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Summary from "./pages/Summary";
import Cars from "./pages/Cars";
import CarDetails from "./pages/CarDetails";
import Drivers from "./pages/Drivers";
import DriverDetails from "./pages/DriverDetails";
import Contracts from "./pages/Contracts";
import Maintenance from "./pages/Maintenance";
import Violations from "./pages/Violations";
import Vouchers from "./pages/Vouchers";
import VoucherPrint from "./pages/VoucherPrint";
import DriverVouchersPrint from "./pages/DriverVouchersPrint";
import Settings from "./pages/Settings";
import Invoices from "./pages/Invoices";
import InvoicePrint from "./pages/InvoicePrint";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen text-slate-800">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cars" element={<Cars />} />
          <Route path="/cars/:id" element={<CarDetails />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/drivers/:id" element={<DriverDetails />} />
          <Route path="/drivers/print-vouchers/:id" element={<DriverVouchersPrint />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/violations" element={<Violations />} />
          <Route path="/vouchers" element={<Vouchers />} />
          <Route path="/vouchers/print/:id" element={<VoucherPrint />} />
          <Route path="/summary" element={<Summary />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/print/:id" element={<InvoicePrint />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
