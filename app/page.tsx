"use client";

import { loginAction } from "@/app/actions/login";
import Image from "next/image";
import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type ViewState = "intro" | "reveal" | "login";

/** يُستدعى ضمن تفاعل المستخدم فقط؛ يخفي شريط عنوان المتصفح حيث يُسمح بذلك */
function requestViewportFullscreen(): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  const legacy = el as unknown as {
    webkitRequestFullscreen?: () => void;
    msRequestFullscreen?: () => void;
  };
  const go =
    el.requestFullscreen?.bind(el) ??
    legacy.webkitRequestFullscreen?.bind(el) ??
    legacy.msRequestFullscreen?.bind(el);
  if (!go) return;
  try {
    void Promise.resolve(go()).catch(() => undefined);
  } catch {
    /* رفض المتصفح أو وضع تطبيق مثبّت */
  }
}

function WelcomeScreenShell({
  stateClass,
  children,
}: {
  stateClass: string;
  children: ReactNode;
}) {
  return (
    <main className={`welcome-screen ${stateClass}`}>
      <div className="welcome-hero-bg" aria-hidden="true">
        <Image
          src="/residency.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="welcome-hero-image"
        />
      </div>
      <div className="welcome-hero-overlay" aria-hidden="true" />
      {children}
    </main>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const [userOpenedLogin, setUserOpenedLogin] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loginOpen = Boolean(errorCode) || userOpenedLogin;
  const viewState: ViewState = loginOpen ? "login" : introComplete ? "reveal" : "intro";

  useEffect(() => {
    if (loginOpen) return;
    const t = window.setTimeout(() => setIntroComplete(true), 2350);
    return () => window.clearTimeout(t);
  }, [loginOpen]);

  const stateClass = useMemo(() => `state-${viewState}`, [viewState]);

  const errorMessage =
    errorCode === "credentials"
      ? "اسم المستخدم أو كلمة المرور غير صحيحة."
      : errorCode === "db"
        ? "قاعدة البيانات غير مهيأة."
        : errorCode === "config"
          ? "إعداد الخادم ناقص (تحقق من AUTH_SECRET)."
          : null;

  return (
    <WelcomeScreenShell stateClass={stateClass}>
      <section className="welcome-panel" aria-label="واجهة الترحيب">
        <div className="logo-shell">
          <Image
            className="university-logo"
            src="/uob-logo.png"
            alt="شعار جامعة البصرة"
            width={88}
            height={88}
            priority
          />
        </div>

        <header className="title-block">
          <h1 className="system-title">نظام رصين لإدارة الامتحانات</h1>
          <p className="system-subtitle">جامعة البصرة</p>
          <p className="system-description">
            منصة رسمية لإدارة وتنظيم الامتحانات الجامعية
          </p>
        </header>

        <button
          type="button"
          className="enter-button"
          onClick={() => {
            requestViewportFullscreen();
            setUserOpenedLogin(true);
          }}
          aria-hidden={viewState === "login"}
          tabIndex={viewState === "login" ? -1 : 0}
        >
          <span className="enter-button-icon" aria-hidden="true">
            ↦
          </span>
          الدخول إلى النظام
        </button>

        <form
          className="login-form"
          aria-label="تسجيل الدخول"
          action={loginAction}
          onSubmit={() => {
            requestViewportFullscreen();
          }}
        >
          {errorMessage ? (
            <p className="login-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <label className="field-label" htmlFor="username">
            اسم المستخدم
          </label>
          <div className="field-wrap">
            <span className="field-icon field-icon-user" aria-hidden="true" />
            <input
              id="username"
              name="username"
              type="text"
              className="field-input"
              autoComplete="username"
              required
            />
          </div>

          <label className="field-label" htmlFor="password">
            كلمة المرور
          </label>
          <div className="field-wrap">
            <span className="field-icon field-icon-lock" aria-hidden="true" />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              className="field-input with-toggle"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            >
              {showPassword ? "إخفاء" : "إظهار"}
            </button>
          </div>

          <button type="submit" className="login-submit">
            تسجيل الدخول
          </button>
        </form>

        <p className="security-note">الاستخدام مقصور على المخوّلين تقنياً على الخادم</p>

        <p className="institution-note">جامعة البصرة – منصة إدارة الامتحانات</p>
      </section>
    </WelcomeScreenShell>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <WelcomeScreenShell stateClass="state-intro">
          <section className="welcome-panel" aria-label="جاري التحميل">
            <p className="system-description">جاري التحميل…</p>
          </section>
        </WelcomeScreenShell>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
