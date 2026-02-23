import React from "react";
import { useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import LaunchCountdown from "./LaunchCountdown";
import Footer from "./Footer";
import { useLaunch } from "../context/LaunchContext";
import "./Layout.css";

const Layout = ({ children }) => {
  const { isPreLaunch } = useLaunch();
  const { pathname } = useLocation();

  // Always show main content on waitlist page, hide on other pages if pre-launch
  const showMainContent = !isPreLaunch || pathname === "/waitlist";

  return (
    <div className="layout-container">
      <Navbar />
      <LaunchCountdown />
      {showMainContent && (
        <main className="layout-main-content">{children}</main>
      )}
      {/* <main className="layout-main-content">{children}</main> */}
      <Footer />
    </div>
  );
};

export default Layout;
