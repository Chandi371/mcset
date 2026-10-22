import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

// Log uncaught global window errors and promise rejections for diagnostics
window.addEventListener("error", (event) => {
  console.error("Global window error caught:", event.error || event.message);
  try {
    localStorage.setItem(
      "mcset_last_window_error",
      JSON.stringify({
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        timestamp: Date.now(),
      })
    );
  } catch {}
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled Promise Rejection:", event.reason);
  try {
    localStorage.setItem(
      "mcset_last_promise_rejection",
      JSON.stringify({
        reason: String(event.reason),
        timestamp: Date.now(),
      })
    );
  } catch {}
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
