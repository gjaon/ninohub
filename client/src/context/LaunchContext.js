import React, { createContext, useContext, useMemo } from "react";

const LaunchContext = createContext();

export const LaunchProvider = ({ children }) => {
  // Check if launch date has passed
  const launchDate = new Date("2026-03-06T00:00:00").getTime();
  const now = new Date().getTime();
  const isPreLaunch = now < launchDate;

  const value = useMemo(
    () => ({
      isPreLaunch,
      launchDate,
    }),
    [isPreLaunch]
  );

  return (
    <LaunchContext.Provider value={value}>{children}</LaunchContext.Provider>
  );
};

export const useLaunch = () => {
  const context = useContext(LaunchContext);
  if (!context) {
    throw new Error("useLaunch must be used within LaunchProvider");
  }
  return context;
};
