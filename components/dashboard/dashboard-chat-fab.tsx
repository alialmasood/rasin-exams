"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ChatScope = "PUBLIC" | "PRIVATE";

type Recipient = {
  userId: string;
  username: string;
  displayLabel: string;
  accountKind: "FORMATION" | "DEPARTMENT" | "FOLLOWUP" | null;
};

type MessageItem = {
  id: string;
  scope: ChatScope;
  senderUserId: string;
  senderUsername: string;
  senderLabel: string;
  recipientUserId: string | null;
  body: string;
  createdAtIso: string;
};

type PrivateSummaryItem = {
  peerUserId: string;
  unreadCount: number;
  lastMessageId: string | null;
  lastMessageBody: string | null;
  lastMessageAtIso: string | null;
  lastMessageSenderUserId: string | null;
};

const POLL_MS = 2000;
type ConnectionState = "online" | "reconnecting";

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-IQ-u-ca-gregory-nu-latn", {
      timeZone: "Asia/Baghdad",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function DashboardChatFab({
  currentUserId,
  role,
}: {
  currentUserId: string;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ChatScope>("PUBLIC");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [peerUserId, setPeerUserId] = useState("");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [privateSummaries, setPrivateSummaries] = useState<PrivateSummaryItem[]>([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNew, setHasNew] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("online");
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string>("");
  const prevUnreadTotalRef = useRef<number>(0);

  const enabled = role === "COLLEGE";

  const selectedPeer = useMemo(
    () => recipients.find((r) => r.userId === peerUserId) ?? null,
    [recipients, peerUserId]
  );

  const unreadByPeer = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of privateSummaries) {
      m.set(s.peerUserId, s.unreadCount);
    }
    return m;
  }, [privateSummaries]);

  const totalPrivateUnread = useMemo(
    () => privateSummaries.reduce((a, s) => a + (s.unreadCount > 0 ? s.unreadCount : 0), 0),
    [privateSummaries]
  );

  const filteredRecipients = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = recipients;
    const withUnreadFirst = [...base].sort((a, b) => (unreadByPeer.get(b.userId) ?? 0) - (unreadByPeer.get(a.userId) ?? 0));
    if (!q) return withUnreadFirst;
    return withUnreadFirst.filter((r) => `${r.displayLabel} ${r.username}`.toLowerCase().includes(q));
  }, [recipients, search, unreadByPeer]);

  const loadRecipients = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/chat/recipients", { credentials: "same-origin" });
      const data = (await res.json()) as { ok?: boolean; users?: Recipient[]; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? "تعذر تحميل الحسابات.");
        return;
      }
      setRecipients(data.users ?? []);
      setConnectionState("online");
      if (!peerUserId && (data.users?.length ?? 0) > 0) {
        setPeerUserId(data.users![0]!.userId);
      }
    } catch {
      setConnectionState("reconnecting");
      setError("تعذر تحميل الحسابات.");
    }
  }, [enabled, peerUserId]);

  const playNewMessageTone = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.stop(ctx.currentTime + 0.25);
      window.setTimeout(() => void ctx.close(), 400);
    } catch {
      /* تجاهل فشل الصوت */
    }
  }, []);

  const loadPrivateSummaries = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/chat/private-summaries", { credentials: "same-origin" });
      const data = (await res.json()) as {
        ok?: boolean;
        items?: PrivateSummaryItem[];
        message?: string;
      };
      if (!res.ok || !data.ok) {
        setConnectionState("reconnecting");
        setError(data.message ?? "تعذر تحميل ملخص المحادثات الخاصة.");
        return;
      }
      const next = data.items ?? [];
      const nextTotal = next.reduce((a, s) => a + (s.unreadCount > 0 ? s.unreadCount : 0), 0);
      setPrivateSummaries(next);
      setConnectionState("online");
      const prevTotal = prevUnreadTotalRef.current;
      prevUnreadTotalRef.current = nextTotal;
      if (nextTotal > prevTotal) {
        setHasNew(true);
        playNewMessageTone();
      }
    } catch {
      setConnectionState("reconnecting");
      setError("تعذر تحميل ملخص المحادثات الخاصة.");
    }
  }, [enabled, playNewMessageTone]);

  const pollMessages = useCallback(
    async (opts?: { reset?: boolean }) => {
      if (!enabled) return;
      if (scope === "PRIVATE" && !peerUserId) return;
      if (opts?.reset) {
        lastIdRef.current = "";
        setMessages([]);
      }
      setLoading(true);
      try {
      const q = new URLSearchParams();
      q.set("scope", scope);
      if (scope === "PRIVATE") q.set("peerUserId", peerUserId);
      if (lastIdRef.current) q.set("sinceId", lastIdRef.current);
      const res = await fetch(`/api/chat/messages?${q.toString()}`, { credentials: "same-origin" });
        const data = (await res.json()) as { ok?: boolean; messages?: MessageItem[]; message?: string };
        if (!res.ok || !data.ok) {
          setConnectionState("reconnecting");
          setError(data.message ?? "تعذر تحميل الرسائل.");
          return;
        }
        const incoming = data.messages ?? [];
        setConnectionState("online");
        if (incoming.length > 0) {
          lastIdRef.current = incoming[incoming.length - 1]!.id;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev];
          for (const m of incoming) {
            if (!seen.has(m.id)) {
              merged.push(m);
              seen.add(m.id);
            }
          }
          return merged;
        });
          if (!open) setHasNew(true);
        }
      } catch {
        setConnectionState("reconnecting");
        setError("تعذر تحميل الرسائل.");
      } finally {
        setLoading(false);
      }
    },
    [enabled, open, peerUserId, scope]
  );

  useEffect(() => {
    if (!open) return;
    setHasNew(false);
    setError(null);
    if (enabled) {
      void loadRecipients();
      void loadPrivateSummaries();
      void pollMessages({ reset: true });
    }
  }, [open, enabled, loadRecipients, loadPrivateSummaries, pollMessages]);

  useEffect(() => {
    if (!enabled) return;
    if (!open) return;
    if (scope === "PRIVATE" && !peerUserId) return;
    void pollMessages({ reset: true });
  }, [enabled, open, scope, peerUserId, pollMessages]);

  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => {
      void loadPrivateSummaries();
      if (!(scope === "PRIVATE" && !peerUserId)) {
        void pollMessages();
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [enabled, pollMessages, scope, peerUserId, loadPrivateSummaries]);

  useEffect(() => {
    if (!enabled) return;
    if (!open || scope !== "PRIVATE" || !peerUserId) return;
    const upTo = messages.length > 0 ? messages[messages.length - 1]!.id : null;
    void fetch("/api/chat/private-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ peerUserId, upToMessageId: upTo }),
    }).then(() => void loadPrivateSummaries());
  }, [enabled, open, scope, peerUserId, messages, loadPrivateSummaries]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = boxRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function onSend() {
    const msg = text.trim();
    if (!msg) return;
    if (scope === "PRIVATE" && !peerUserId) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          scope,
          peerUserId: scope === "PRIVATE" ? peerUserId : undefined,
          text: msg,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? "تعذر إرسال الرسالة.");
        return;
      }
      setText("");
      await pollMessages();
    } catch {
      setError("تعذر إرسال الرسالة.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-24 end-6 z-[89]" dir="rtl" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "إغلاق المحادثة" : "فتح المحادثة"}
        className="relative flex size-14 items-center justify-center rounded-full bg-[#1E3A8A] text-white shadow-lg shadow-[#1E3A8A]/35 ring-4 ring-white transition hover:bg-[#172554] focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400/50"
      >
        <svg className="size-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.1} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 9.75h6.75m-6.75 3h4.5M6.75 18.75h10.5A2.25 2.25 0 0 0 19.5 16.5V7.5a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 7.5v9A2.25 2.25 0 0 0 6.75 18.75Z"
          />
        </svg>
        {hasNew || totalPrivateUnread > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-w-[1.1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {totalPrivateUnread > 99 ? "99+" : totalPrivateUnread > 0 ? totalPrivateUnread : "!"}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="mt-2 w-[min(92vw,420px)] rounded-2xl border border-[#E2E8F0] bg-white shadow-2xl">
          <div className="border-b border-[#E2E8F0] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-extrabold text-[#0F172A]">محادثة النظام</p>
              {enabled ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    connectionState === "online"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                  title={connectionState === "online" ? "الاتصال مستقر" : "يوجد انقطاع مؤقت، تتم إعادة المحاولة"}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      connectionState === "online" ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    aria-hidden
                  />
                  {connectionState === "online" ? "متصل" : "يعيد المحاولة"}
                </span>
              ) : null}
            </div>
            {!enabled ? (
              <p className="mt-1 text-xs text-[#EF4444]">هذه الميزة متاحة لحسابات الأقسام/الفروع/العمداء فقط.</p>
            ) : (
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => setScope("PRIVATE")}
                  className={`rounded-md px-2 py-1 text-xs font-bold ${scope === "PRIVATE" ? "bg-[#1E3A8A] text-white" : "bg-[#F1F5F9] text-[#334155]"}`}
                >
                  محادثة خاصة
                </button>
                <button
                  type="button"
                  onClick={() => setScope("PUBLIC")}
                  className={`rounded-md px-2 py-1 text-xs font-bold ${scope === "PUBLIC" ? "bg-[#1E3A8A] text-white" : "bg-[#F1F5F9] text-[#334155]"}`}
                >
                  محادثة عامة
                </button>
              </div>
            )}
          </div>

          {enabled && scope === "PRIVATE" ? (
            <div className="border-b border-[#E2E8F0] px-3 py-2">
              <label className="mb-1 block text-[11px] font-bold text-[#475569]">ابحث واختر الحساب</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث باسم التشكيل أو المستخدم..."
                className="h-9 w-full rounded-md border border-[#CBD5E1] px-2 text-sm"
              />
              <div className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-1">
                {filteredRecipients.map((r) => {
                  const unread = unreadByPeer.get(r.userId) ?? 0;
                  const active = r.userId === peerUserId;
                  return (
                    <button
                      key={r.userId}
                      type="button"
                      onClick={() => setPeerUserId(r.userId)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-right text-xs ${active ? "bg-[#DBEAFE] text-[#1E3A8A]" : "bg-white text-[#334155] hover:bg-[#F1F5F9]"}`}
                    >
                      <span className="truncate font-semibold">{r.displayLabel}</span>
                      {unread > 0 ? (
                        <span className="mr-2 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {filteredRecipients.length === 0 ? (
                  <p className="px-2 py-1 text-[11px] text-[#94A3B8]">لا توجد نتائج مطابقة.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div ref={listRef} className="max-h-[320px] min-h-[220px] overflow-y-auto px-3 py-2">
            {scope === "PRIVATE" && !peerUserId ? (
              <p className="text-center text-xs text-[#64748B]">اختر حسابًا لبدء المحادثة الخاصة.</p>
            ) : messages.length === 0 && !loading ? (
              <p className="text-center text-xs text-[#64748B]">لا توجد رسائل بعد.</p>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => {
                  const mine = m.senderUserId === currentUserId;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[85%] rounded-xl px-2.5 py-2 text-xs ${mine ? "bg-[#DBEAFE] text-[#0F172A]" : "bg-[#F1F5F9] text-[#0F172A]"}`}>
                        <p className="mb-0.5 font-bold text-[11px] text-[#1E3A8A]">{m.senderLabel}</p>
                        <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                        <p className="mt-1 text-[10px] text-[#64748B]">{formatTime(m.createdAtIso)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {enabled ? (
            <div className="border-t border-[#E2E8F0] p-2">
              <div className="flex gap-1.5">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void onSend();
                    }
                  }}
                  placeholder={scope === "PUBLIC" ? "اكتب رسالة عامة..." : `اكتب رسالة إلى ${selectedPeer?.displayLabel ?? "الحساب المختار"}...`}
                  className="h-10 flex-1 rounded-md border border-[#CBD5E1] px-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void onSend()}
                  disabled={sending || (scope === "PRIVATE" && !peerUserId)}
                  className="rounded-md bg-[#1E3A8A] px-3 text-xs font-extrabold text-white disabled:opacity-50"
                >
                  إرسال
                </button>
              </div>
              {error ? <p className="mt-1 text-[11px] font-semibold text-[#EF4444]">{error}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
