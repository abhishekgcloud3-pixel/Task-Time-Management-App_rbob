"use client";

import React from "react";
import { useRouter } from "next/navigation";

const APP_PASSWORD = "Tikur@12345";

export default function Landing(): JSX.Element {
  const router = useRouter();
  const [password, setPassword] = React.useState<string>("");
  const [error, setError] = React.useState<string>("");
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [isShaking, setIsShaking] = React.useState<boolean>(false);
  const [showPassword, setShowPassword] = React.useState<boolean>(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    window.setTimeout(() => {
      const ok = password === APP_PASSWORD;
      if (ok) {
        try {
          if (navigator?.vibrate) navigator.vibrate(30);
        } catch {
          // ignore
        }
        router.push("/");
      } else {
        try {
          if (navigator?.vibrate) navigator.vibrate([20, 30, 20]);
        } catch {
          // ignore
        }
        setError("Incorrect password. Please try again.");
        setIsShaking(true);
        window.setTimeout(() => setIsShaking(false), 600);
      }
      setIsSubmitting(false);
    }, 300);
  };

  const onEnterKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const form = e.currentTarget.closest("form");
      if (form) {
        form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }
    }
  };

  return (
    <div className="min-h-screen calm-gradient relative overflow-hidden flex items-center justify-center px-6">
      <div
        className={`max-w-md w-full animate-slide-up hover-scale backdrop-blur-sm rounded-2xl border 
        bg-white/70 border-white/30 shadow-xl dark:bg-neutral-800/60 dark:border-neutral-700/50`}
      >
        <div className="p-8">
          {/* Logo + App Name */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 via-violet-500 to-teal-400 shadow-md" />
              <div className="flex flex-col">
                <span className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                  Nimbus Tasks
                </span>
                <span className="text-sm text-neutral-600 dark:text-neutral-300">
                  Plan your day, focus deeply, and get more done.
                </span>
              </div>
            </div>
            <a
              href="/"
              className="text-xs rounded-lg px-3 py-2 bg-white/70 dark:bg-neutral-800/60 border border-white/30 dark:border-neutral-700/60 text-neutral-700 dark:text-neutral-200 hover:shadow-sm focus-ring"
              aria-label="Go to app"
              title="Go to app"
            >
              Open App
            </a>
          </div>

          {/* Tagline */}
          <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-6 text-balance">
            A calming space to organize Personal, Work, and custom tasks with smart reminders.
          </p>

          {/* Password Form */}
          <form onSubmit={onSubmit} className="space-y-4">
            <div className={`transition-transform ${isShaking ? "animate-shake" : ""}`}>
              <label
                htmlFor="app-password"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2"
              >
                Enter Access Password
              </label>
              <div className="relative">
                <input
                  id="app-password"
                  name="app-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={onEnterKey}
                  autoComplete="off"
                  className="w-full rounded-xl bg-white/80 dark:bg-neutral-800/70 border border-neutral-200/70 dark:border-neutral-700/60 px-4 py-3 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 focus-ring"
                  placeholder="Password"
                  aria-invalid={!!error}
                  aria-describedby={error ? "password-error" : undefined}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100/70 dark:hover:bg-neutral-700/50 focus-ring"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {error && (
                <p
                  id="password-error"
                  role="alert"
                  className="mt-2 text-sm text-red-600 dark:text-red-400"
                  aria-live="polite"
                >
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-violet-600 to-teal-500 text-white font-medium py-3 shadow-md hover:shadow-lg hover:brightness-105 active:brightness-95 transition-all focus-ring disabled:opacity-60"
            >
              {isSubmitting ? "Checking..." : "Enter App"}
            </button>

            <div className="text-xs text-neutral-500 dark:text-neutral-400 text-center">
              This is a simple password gate. You can extend authentication later.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
