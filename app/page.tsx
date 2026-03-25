"use client";

import { loginAction } from "@/app/actions/login";
import Image from "next/image";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type ViewState = "intro" | "reveal" | "login";

function HomeContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const [userOpenedLogin, setUserOpenedLogin] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);

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
    <main className={`welcome-screen ${stateClass}`}>
      <section className="welcome-panel" aria-label="واجهة الترحيب">
        <div className="logo-shell">
          <Image
            className="university-logo"
            src="/uob-logo.png"
            alt="شعار جامعة البصرة"
            width={166}
            height={166}
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
          onClick={() => setUserOpenedLogin(true)}
          aria-hidden={viewState === "login"}
          tabIndex={viewState === "login" ? -1 : 0}
        >
          <span className="enter-button-icon" aria-hidden="true">
            ↦
          </span>
          الدخول إلى النظام
        </button>

        <form className="login-form" aria-label="تسجيل الدخول" action={loginAction}>
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
              type="password"
              className="field-input"
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="login-submit">
            تسجيل الدخول
          </button>
        </form>

        <p className="security-note">الاستخدام مقصور على المخوّلين تقنياً على الخادم</p>

        <p className="institution-note">جامعة البصرة – منصة إدارة الامتحانات</p>
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="welcome-screen state-intro">
          <section className="welcome-panel" aria-label="جاري التحميل">
            <p className="system-description">جاري التحميل…</p>
          </section>
        </main>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
