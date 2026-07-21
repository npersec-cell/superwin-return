/**
 * StatCard Component
 * Reusable stat display card for the homepage stats bar
 */

import React from "react";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  align?: "center" | "left" | "right";
  border?: boolean;
}

export function StatCard({ label, value, align = "center", border = true }: StatCardProps) {
  return (
    <div 
      className="stat" 
      style={{ 
        textAlign: align,
        borderLeft: border ? undefined : "none"
      }}
    >
      <span className="label">{label}</span>
      {value}
    </div>
  );
}

interface SkeletonStatCardProps {
  count?: number;
}

/** Skeleton loader for stats row */
export function StatsSkeleton() {
  const skeletonBlock = (widthLabel: number, widthValue: number) => (
    <>
      <div style={{ 
        width: widthLabel, height: 12, 
        background: "linear-gradient(90deg, var(--card) 25%, var(--border) 50%, var(--card) 75%)", 
        backgroundSize: "200% 100%", borderRadius: 4, 
        animation: "skeleton-loading 1.5s infinite", 
        margin: "0 auto 4px" 
      }} />
      <div style={{ 
        width: widthValue, height: 18, 
        background: "linear-gradient(90deg, var(--card) 25%, var(--border) 50%, var(--card) 75%)", 
        backgroundSize: "200% 100%", borderRadius: 4, 
        animation: "skeleton-loading 1.5s infinite", 
        margin: "0 auto" 
      }} />
    </>
  );

  return (
    <>
      <div className="stat" style={{ textAlign: "center" }}>{skeletonBlock(60, 40)}</div>
      <div className="stat" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
        {skeletonBlock(70, 60)}
      </div>
      <div className="stat" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
        {skeletonBlock(50, 60)}
      </div>
      <div className="stat" style={{ textAlign: "center" }}>{skeletonBlock(70, 50)}</div>
    </>
  );
}
