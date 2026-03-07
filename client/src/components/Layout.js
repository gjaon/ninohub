import React from "react";
import { useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import LaunchCountdown from "./LaunchCountdown";
import Footer from "./Footer";
import { useLaunch } from "../context/LaunchContext";
import { useSelector } from "react-redux";
import "./Layout.css";

const Layout = ({ children }) => {
  const { isPreLaunch } = useLaunch();
  const { pathname } = useLocation();
  const { isAuthenticated, currentUser } = useSelector((state) => state.user);

  // Always show main content on waitlist page, hide on other pages if pre-launch - allow login page and registeration page also
  const showMainContent = pathname === "/waitlist" ||
    pathname === "/login" ||
    pathname === "/register";

  const adminEmails = ["yemijoshua81@gmail.com", "oluwakemisolanino@gmail.com"];

  const isAdmin = isAuthenticated && adminEmails.includes(currentUser?.email);

  const shouldDisplayLaunchCountDown = !isAdmin;

  return (
    <div className="layout-container">
      <Navbar />
        <main className="layout-main-content">{children}</main>
      <Footer />
    </div>
  );
};

export default Layout;
