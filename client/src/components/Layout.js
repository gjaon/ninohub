import React from "react";
import { useLocation, matchPath } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import "./Layout.css";

const MAINTENANCE_MODE =
  String(process.env.REACT_APP_MAINTENANCE_MODE ?? "true").toLowerCase() !==
  "false";

const CHROME_ALLOWED_PATHS = ["/barcode"];

const isScanPath = (pathname) =>
  Boolean(matchPath({ path: "/scan/:slug", end: true }, pathname));

const Layout = ({ children }) => {
  const { pathname } = useLocation();

  // /scan/:slug is the public barcode content — must render without any chrome.
  // During maintenance only the admin-facing /barcode keeps the navbar/footer.
  const renderChrome = MAINTENANCE_MODE
    ? CHROME_ALLOWED_PATHS.includes(pathname) && !isScanPath(pathname)
    : !isScanPath(pathname);

  return (
    <div className="layout-container">
      {renderChrome && <Navbar />}
      <main className="layout-main-content">{children}</main>
      {renderChrome && <Footer />}
    </div>
  );
};

export default Layout;
