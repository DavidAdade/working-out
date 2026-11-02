"use client";

export default function RetryButton() {
  return (
    <button className="btn" onClick={() => window.location.replace("/")}>
      Try again
    </button>
  );
}
