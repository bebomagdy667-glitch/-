/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  BookOpen, Lock, Unlock, Award, User, Calendar, Edit, Settings, 
  Trash2, Search, LogOut, RefreshCw, FileDown, FileUp, QrCode, 
  Check, X, ChevronRight, HelpCircle, AlertTriangle, ShieldAlert, Copy,
  HardDrive, Cloud, FileSpreadsheet, Mail, Send
} from "lucide-react";
import { Question, DayData, Subscriber, DatabaseState } from "./types";
import { motion, AnimatePresence } from "motion/react";
import { 
  searchFolder, createFolder, searchBackupFile, saveBackupFile, 
  downloadBackupFile, exportToGoogleSheet 
} from "./gdrive";
import { 
  sendGmailMessage, getGoogleUserProfile 
} from "./gmail";

// Helper function to normalize Arabic names for smart, matching similarity
function normalizeArabicName(name: string): string {
  if (!name) return "";
  let norm = name.trim().toLowerCase();
  
  // Remove Arabic diacritics
  norm = norm.replace(/[\u064B-\u0652\u0653\u0654\u0655]/g, "");

  // Normalize Alef variants
  norm = norm.replace(/[أإآٱ]/g, "ا");

  // Normalize Ta Marbuta
  norm = norm.replace(/ة/g, "ه");

  // Normalize Yeh/Alef Maksura to normal Yaa
  norm = norm.replace(/ى/g, "ي");

  // Normalize spacing
  norm = norm.replace(/\s+/g, " ");

  return norm;
}

export default function App() {
  // Session States
  const [participantName, setParticipantName] = useState<string>(() => {
    return localStorage.getItem("proverbs_participant_name") || "";
  });
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem("proverbs_admin_logged") === "true";
  });
  const [adminPassword, setAdminPassword] = useState<string>(() => {
    return localStorage.getItem("proverbs_admin_password") || "";
  });

  // Data States
  const [days, setDays] = useState<{ [dayId: number]: DayData }>({});
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorStatus, setErrorStatus] = useState<string>("");

  // Input States
  const [regNameInput, setRegNameInput] = useState<string>("");
  const [admPasswordInput, setAdmPasswordInput] = useState<string>("");
  const [showAdminLogin, setShowAdminLogin] = useState<boolean>(false);
  const [qrModalOpen, setQrModalOpen] = useState<boolean>(false);

  // Participant Dashboard States
  const [participantData, setParticipantData] = useState<Subscriber | null>(null);
  const [currentSolveDay, setCurrentSolveDay] = useState<DayData | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<(number | null)[]>([null, null, null]);
  const [tempAnswersResult, setTempAnswersResult] = useState<{
    correctAnswers: number[];
    score: number;
    solvedAt: string;
  } | null>(null);
  const [dayRangeFilter, setDayRangeFilter] = useState<number>(0); // Index for pagination blocks of days (1-30, 31-60, etc.)

  // Admin Panel States
  const [adminTab, setAdminTab] = useState<"ranking" | "days" | "settings">("ranking");
  const [adminSearchQuery, setAdminSearchQuery] = useState<string>("");
  const [selectedSubscriberForDetail, setSelectedSubscriberForDetail] = useState<Subscriber | null>(null);
  const [editingDay, setEditingDay] = useState<DayData | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState<string>("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState<string>("");
  const [adminDaysSearchQuery, setAdminDaysSearchQuery] = useState<string>("");
  const [subscriberToDelete, setSubscriberToDelete] = useState<Subscriber | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Google Drive Integration States
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => {
    return localStorage.getItem("google_drive_access_token") || null;
  });
  const [googleClientId, setGoogleClientId] = useState<string>(() => {
    return localStorage.getItem("google_drive_client_id") || "863807530665-is6g4t7hghbndvfeq1e582e0jphbcsun.apps.googleusercontent.com"; // Preset default
  });
  const [gdriveStatus, setGDriveStatus] = useState<"idle" | "connecting" | "connected" | "error">(() => {
    return localStorage.getItem("google_drive_access_token") ? "connected" : "idle";
  });
  const [isBackupInTransit, setIsBackupInTransit] = useState<boolean>(false);
  const [isExportInTransit, setIsExportInTransit] = useState<boolean>(false);
  const [isRestoreInTransit, setIsRestoreInTransit] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string>("");
  const [googleDriveBackupDate, setGoogleDriveBackupDate] = useState<string | null>(() => {
    return localStorage.getItem("google_drive_backup_date") || null;
  });
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(() => {
    return localStorage.getItem("google_user_email") || null;
  });
  const [gmailRecipient, setGmailRecipient] = useState<string>("");
  const [gmailSubject, setGmailSubject] = useState<string>("نتائج وكشوف درجات مارثون سفر الأمثال");
  const [gmailBody, setGmailBody] = useState<string>("مرحباً بكم، مرفق أدناه نتائج ومستويات المشتركين في مارثون سفر الأمثال.");
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [adminOfflineCacheCount, setAdminOfflineCacheCount] = useState<number>(0);
  const [showLocalRestoreBanner, setShowLocalRestoreBanner] = useState<boolean>(false);

  // General Notification Alert
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Generate day range page buttons
  const RANGE_LIMIT = 30; // 30 days per tab to keep DOM lightweight and clean
  const totalTabs = Math.ceil(305 / RANGE_LIMIT); // 11 tabs for 305 days

  // Trigger Toast Messages
  const triggerToast = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Fetch Public Days content on load
  const loadPublicDays = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/days/public");
      if (res.ok) {
        const body = await res.json();
        setDays(body.days);
      } else {
        throw new Error("حدث خطأ أثناء تحميل بيانات أيام المارثون");
      }
    } catch (err: any) {
      setErrorStatus(err.message || "خطأ اتصال بالشبكة");
    } finally {
      setLoading(false);
    }
  };

  // Sync Participant History structure
  const syncParticipantData = async (name: string) => {
    if (!name) return;
    try {
      const res = await fetch(`/api/participant/status/${encodeURIComponent(name)}`);
      if (res.ok) {
        const dat = await res.json();
        setParticipantData(dat.participant);
        // Save database copy of themselves to participant's local storage
        localStorage.setItem("proverbs_subscriber_backup", JSON.stringify(dat.participant));
      } else if (res.status === 404) {
        // If the server restarted/wiped, let's see if we have a local storage backup of our results
        const storedBackup = localStorage.getItem("proverbs_subscriber_backup");
        if (storedBackup) {
          try {
            const parsedBackup = JSON.parse(storedBackup);
            if (normalizeArabicName(parsedBackup.name) === normalizeArabicName(name)) {
              // Self-heal and restore onto the server
              const restoreRes = await fetch("/api/participant/sync-backup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, backup: parsedBackup })
              });
              if (restoreRes.ok) {
                const restoreDat = await restoreRes.json();
                setParticipantData(restoreDat.participant);
                localStorage.setItem("proverbs_subscriber_backup", JSON.stringify(restoreDat.participant));
                console.log("System self-healed subscriber state from local cache!");
              }
            }
          } catch (jsonErr) {
            console.error("Error parsing stored backup", jsonErr);
          }
        }
      }
    } catch (e) {
      console.error("Error syncing participant state", e);
    }
  };

  // Sync Full Admin Stats Data
  const syncAdminData = async (pwd = adminPassword) => {
    if (!pwd) return;
    try {
      const res = await fetch("/api/admin/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd })
      });
      if (res.ok) {
        const fullDB: DatabaseState = await res.json();
        setDays(fullDB.days);
        setSubscribers(fullDB.subscribers);

        const cachedStr = localStorage.getItem("proverbs_admin_full_db_cache");
        let serverResetIndictator = false;

        if (cachedStr) {
          try {
            const cachedDB: DatabaseState = JSON.parse(cachedStr);
            if (cachedDB) {
              // Check if server is currently in default state with NO subscribers, but browser has a non-empty cache or custom password
              const browserHasSubscribers = Array.isArray(cachedDB.subscribers) && cachedDB.subscribers.length > 0;
              const browserHasCustomPass = cachedDB.password && cachedDB.password !== "123";
              const serverIsEmptyOfSubscribers = fullDB.subscribers.length === 0;

              if (serverIsEmptyOfSubscribers && (browserHasSubscribers || browserHasCustomPass)) {
                serverResetIndictator = true;
                console.log("Server database has reverted to empty defaults, triggering client-side restore-backup...");
                const restoreRes = await fetch("/api/admin/restore-backup", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    password: pwd,
                    backup: {
                      days: cachedDB.days,
                      subscribers: cachedDB.subscribers,
                      password: pwd
                    }
                  })
                });
                if (restoreRes.ok) {
                  setDays(cachedDB.days);
                  setSubscribers(cachedDB.subscribers);
                  setShowLocalRestoreBanner(false);
                  triggerToast("🛡️ تم استرجاع ومزامنة كافة بيانات المارثون وتعديلاتك تلقائياً وبأمان من النسخة الاحتياطية المتصفحية!", "success");
                } else {
                  setAdminOfflineCacheCount(browserHasSubscribers ? cachedDB.subscribers.length : 1);
                  setShowLocalRestoreBanner(true);
                }
              }
            }
          } catch (jsonErr) {
            console.error("Error reading admin DB cache during success sync", jsonErr);
          }
        }

        // If the server was not reset (or was restored successfully), it's safe to update the browser cache
        if (!serverResetIndictator) {
          localStorage.setItem("proverbs_admin_full_db_cache", JSON.stringify(fullDB));
          setShowLocalRestoreBanner(false);
        }
      } else if (res.status === 401) {
        // Wait, did the server restart and revert to default password "123"?
        // Let's check if we have an admin DB cache in localStorage
        const cachedStr = localStorage.getItem("proverbs_admin_full_db_cache");
        if (cachedStr) {
          try {
            const cachedDB: DatabaseState = JSON.parse(cachedStr);
            if (cachedDB) {
              console.log("Server password check failed. Attempting silent self-healing from local browser cache...");
              // Try to restore using default password "123"
              const restoreRes = await fetch("/api/admin/restore-backup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  password: "123", // The default server password on restart
                  backup: {
                    days: cachedDB.days,
                    subscribers: cachedDB.subscribers,
                    password: pwd // Restore our custom password!
                  }
                })
              });

              if (restoreRes.ok) {
                console.log("Database self-healed successfully onto server!");
                // Now retry fetching the data with our actual custom password!
                const retryRes = await fetch("/api/admin/data", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ password: pwd })
                });

                if (retryRes.ok) {
                  const retryDB: DatabaseState = await retryRes.json();
                  setDays(retryDB.days);
                  setSubscribers(retryDB.subscribers);
                  localStorage.setItem("proverbs_admin_full_db_cache", JSON.stringify(retryDB));
                  setShowLocalRestoreBanner(false);
                  triggerToast("🛡️ تم استرجاع ومزامنة كافة بيانات المارثون وتعديلاتك تلقائياً وبأمان من النسخة الاحتياطية المتصفحية!", "success");
                  return; // Self-healing complete and successful!
                }
              }
            }
          } catch (jsonErr) {
            console.error("Error during silent auto-healing parse", jsonErr);
          }
        }

        const err = await res.json();
        triggerToast(err.error || "فشل التحقق من هوية المشرف", "error");
        setIsAdminLoggedIn(false);
        localStorage.removeItem("proverbs_admin_logged");
      } else {
        const err = await res.json();
        triggerToast(err.error || "فشل التحقق من هوية المشرف", "error");
        setIsAdminLoggedIn(false);
        localStorage.removeItem("proverbs_admin_logged");
      }
    } catch (e) {
      triggerToast("حدث خلل في الاتصال بالملقم", "error");
    }
  };

  // Init Hook
  useEffect(() => {
    loadPublicDays();
    if (participantName) {
      syncParticipantData(participantName);
    }
    if (isAdminLoggedIn && adminPassword) {
      syncAdminData(adminPassword);
    }
  }, []);

  // Redirect-detection for the Google Drive OAuth popup
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token=")) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get("access_token");
      if (token) {
        if (window.opener) {
          window.opener.postMessage(
            { type: "GOOGLE_OAUTH_SUCCESS", token },
            window.location.origin
          );
          window.close();
        } else {
          setGoogleAccessToken(token);
          setGDriveStatus("connected");
          localStorage.setItem("google_drive_access_token", token);
          window.location.hash = "";
          triggerToast("تم ربط حساب Google بنجاح!", "success");
        }
      }
    }
  }, []);

  // Message listener for receiving Google OAuth token from the popup
  useEffect(() => {
    const handleGoogleMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data && e.data.type === "GOOGLE_OAUTH_SUCCESS") {
        const token = e.data.token;
        setGoogleAccessToken(token);
        setGDriveStatus("connected");
        localStorage.setItem("google_drive_access_token", token);
        triggerToast("تم ربط حساب Google بنجاح!", "success");
      }
    };
    window.addEventListener("message", handleGoogleMessage);
    return () => window.removeEventListener("message", handleGoogleMessage);
  }, []);

  // Fetch user Gmail profile when connected
  useEffect(() => {
    if (googleAccessToken) {
      getGoogleUserProfile(googleAccessToken)
        .then((profile) => {
          setGoogleUserEmail(profile.email);
          localStorage.setItem("google_user_email", profile.email);
        })
        .catch((err) => {
          console.error("Failed to fetch Google profile info", err);
        });
    }
  }, [googleAccessToken]);

  // Sync state periodically slightly (or on actions)
  useEffect(() => {
    if (participantName) {
      const timer = setInterval(() => {
        syncParticipantData(participantName);
      }, 15000); // 15 seconds refresh loop
      return () => clearInterval(timer);
    }
  }, [participantName]);

  // Keep the administrator full database cache in sync with local edits
  useEffect(() => {
    if (isAdminLoggedIn && adminPassword && Object.keys(days).length > 0) {
      const stateToCache = {
        password: adminPassword,
        days: days,
        subscribers: subscribers
      };
      localStorage.setItem("proverbs_admin_full_db_cache", JSON.stringify(stateToCache));
    }
  }, [days, subscribers, adminPassword, isAdminLoggedIn]);

  // Handle Subscriber Entry & Registration
  const handleParticipantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = regNameInput.trim();
    if (!name) {
      triggerToast("من فضلك اكتب اسمك ثلاثياً للمشاركة بالمارثون", "error");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch("/api/participant/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });

      if (res.ok) {
        const dat = await res.json();
        setParticipantName(dat.participant.name);
        setParticipantData(dat.participant);
        localStorage.setItem("proverbs_participant_name", dat.participant.name);
        localStorage.setItem("proverbs_subscriber_backup", JSON.stringify(dat.participant));
        triggerToast(`مرحباً بك يا ${dat.participant.name}، بالتوفيق في المارثون!`, "success");
        setRegNameInput("");
      } else {
        const err = await res.json();
        triggerToast(err.error || "فشل التسجيل بالمارثون", "error");
      }
    } catch (err) {
      triggerToast("عفواً، لم نتمكن من الوصول للملقم للتسجيل", "error");
    } finally {
      setLoading(false);
    }
  };

  // Log out current user
  const handleLogoutParticipant = () => {
    localStorage.removeItem("proverbs_participant_name");
    setParticipantName("");
    setParticipantData(null);
    setCurrentSolveDay(null);
    setTempAnswersResult(null);
    setSelectedAnswers([null, null, null]);
    triggerToast("تم الخروج بنجاح من حسابك. في انتظار عودتك!", "success");
  };

  // Handle Admin Log in
  const handleAdminVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const pwd = admPasswordInput.trim();
    if (!pwd) {
      triggerToast("يرجى إدخال كلمة المرور الخاصة بالمشرف", "error");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd })
      });

      if (res.ok) {
        setIsAdminLoggedIn(true);
        setAdminPassword(pwd);
        localStorage.setItem("proverbs_admin_logged", "true");
        localStorage.setItem("proverbs_admin_password", pwd);
        syncAdminData(pwd);
        triggerToast("تم تسجيل دخول المشرف بنجاح!", "success");
        setAdmPasswordInput("");
        setShowAdminLogin(false);
      } else if (res.status === 401) {
        // Double check silent self-healing on login in case server restarted!
        const cachedStr = localStorage.getItem("proverbs_admin_full_db_cache");
        if (cachedStr) {
          try {
            const cachedDB: DatabaseState = JSON.parse(cachedStr);
            if (cachedDB) {
              console.log("Login failed. Attempting silent self-healing during login from browser cache...");
              const restoreRes = await fetch("/api/admin/restore-backup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  password: "123", // The default server password on restart
                  backup: {
                    days: cachedDB.days,
                    subscribers: cachedDB.subscribers,
                    password: pwd // The password they typed is restored as the custom password!
                  }
                })
              });

              if (restoreRes.ok) {
                // Retry login now!
                const retryRes = await fetch("/api/admin/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ password: pwd })
                });

                if (retryRes.ok) {
                  setIsAdminLoggedIn(true);
                  setAdminPassword(pwd);
                  localStorage.setItem("proverbs_admin_logged", "true");
                  localStorage.setItem("proverbs_admin_password", pwd);
                  syncAdminData(pwd);
                  triggerToast("تمت استعادة كافة تعديلاتك وتأمين السيرفر بنجاح وتسجيل دخولك تلقائياً! 🛡️", "success");
                  setAdmPasswordInput("");
                  setShowAdminLogin(false);
                  return;
                }
              }
            }
          } catch (jsonErr) {
            console.error("Error during silent auto-healing on login", jsonErr);
          }
        }
        
        const err = await res.json();
        triggerToast(err.error || "الرقم السري للمشرف غير صحيح", "error");
      } else {
        const err = await res.json();
        triggerToast(err.error || "الرقم السري للمشرف غير صحيح", "error");
      }
    } catch (e) {
      triggerToast("حدث عطل في الاتصال بخادم المشرفين", "error");
    } finally {
      setLoading(false);
    }
  };

  // Handle Force Resetting Password to Default "123"
  const handleForceResetPassword = async () => {
    const key = window.prompt("⚠️ لإعادة التعيين، يرجى إدخال مفتاح الاستعادة السري (Recovery Key) الخاص بالمطور/المشرف لمنع تسلل غير المخولين:");
    if (key === null) return; // User canceled the dialog
    
    if (!key.trim()) {
      triggerToast("مفتاح الاستعادة السري مطلوب لإعادة تعيين الرقم السري!", "error");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/admin/force-reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryKey: key.trim() })
      });
      if (res.ok) {
        triggerToast("تمت إعادة تعيين الرقم السري للمشرف إلى 123 بنجاح! يمكنك استخدامه الآن للدخول بأمان.", "success");
        setAdmPasswordInput("123");
      } else {
        const errData = await res.json();
        triggerToast(errData.error || "مفتاح الاستعادة المدخل غير صحيح! يرجى الاستعانة بالمطور.", "error");
      }
    } catch (err) {
      triggerToast("عطل اتصال بالملقم أثناء إعادة التعيين", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSignout = () => {
    localStorage.removeItem("proverbs_admin_logged");
    localStorage.removeItem("proverbs_admin_password");
    setIsAdminLoggedIn(false);
    setAdminPassword("");
    loadPublicDays();
    triggerToast("تم خروج المشرف بأمان", "success");
  };

  // Submit Answer for Day
  const handleAnswerSubmit = async () => {
    if (!currentSolveDay || !participantName) return;
    const unansweredIndex = selectedAnswers.findIndex(a => a === null);
    if (unansweredIndex !== -1) {
      triggerToast(`من فضلك قم بإجابة السؤال رقم ${unansweredIndex + 1} أولاً`, "error");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/participant/submit/${encodeURIComponent(participantName)}/${currentSolveDay.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: selectedAnswers })
      });

      if (res.ok) {
        const resp = await res.json();
        setTempAnswersResult({
          correctAnswers: resp.correctAnswers,
          score: resp.score,
          solvedAt: resp.solvedAt
        });
        triggerToast(`أحسنت! درجة اليوم: ${resp.score} من 3`, "success");
        syncParticipantData(participantName);
      } else {
        const err = await res.json();
        triggerToast(err.error || "فشل إرسال إجابات اليوم", "error");
      }
    } catch (err) {
      triggerToast("تعذر إرسال الإجابة بسبب انقطاع بالشبكة", "error");
    } finally {
      setLoading(false);
    }
  };

  // Admin: Toggle open or close day
  const handleAdminToggleDay = async (dayId: number, currentOpenState: boolean) => {
    try {
      const res = await fetch("/api/admin/toggle-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: adminPassword,
          dayId,
          isOpen: !currentOpenState
        })
      });

      if (res.ok) {
        triggerToast(`تم ${!currentOpenState ? "فتح" : "إغلاق"} اليوم ${dayId} بنجاح!`, "success");
        syncAdminData();
      } else {
        triggerToast("فشل تفعيل حالة اليوم المختار", "error");
      }
    } catch (e) {
      triggerToast("خلل في ملقم المشرف", "error");
    }
  };

  // Admin: Save edit day content
  const handleAdminSaveDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDay) return;

    try {
      const res = await fetch("/api/admin/edit-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: adminPassword,
          dayId: editingDay.id,
          dayData: editingDay
        })
      });

      if (res.ok) {
        triggerToast(`تم تعديل محتوى اليوم رقم ${editingDay.id} بنجاح!`, "success");
        setEditingDay(null);
        syncAdminData();
      } else {
        const err = await res.json();
        triggerToast(err.error || "فشل حفظ تعديلات اليوم", "error");
      }
    } catch (e) {
      triggerToast("عطل اتصال أثناء الحفظ", "error");
    }
  };

  // Admin: Delete subscriber name entirely (Warning included & fully persistent)
  const handleAdminDeleteSubscriber = (sub: Subscriber) => {
    setSubscriberToDelete(sub);
  };

  const confirmDeleteSubscriber = async () => {
    if (!subscriberToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/admin/delete-subscriber", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: adminPassword,
          subscriberId: subscriberToDelete.id
        })
      });

      if (res.ok) {
        triggerToast(`تمت إزالة المشترك "${subscriberToDelete.name}" من نظام كشوفات المارثون بنجاح.`, "success");
        if (selectedSubscriberForDetail?.id === subscriberToDelete.id) {
          setSelectedSubscriberForDetail(null);
        }
        setSubscriberToDelete(null);
        syncAdminData();
      } else {
        const err = await res.json();
        triggerToast(err.error || "فشل مسح الاسم من الكشوفات", "error");
      }
    } catch (e) {
      triggerToast("عطل تواصل بالخادم المالي للمشاهدة", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Admin: Change password
  const handleAdminPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPasswordInput !== confirmPasswordInput) {
      triggerToast("كلمة المرور الجديدة وغير المتطابقة", "error");
      return;
    }
    if (newPasswordInput.trim().length === 0) {
      triggerToast("يرجى كتابة كلمة مرور جديدة صالحة", "error");
      return;
    }

    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: adminPassword,
          newPassword: newPasswordInput.trim()
        })
      });

      if (res.ok) {
        triggerToast("تم تحديث كلمة مرور المشرف بنجاح!", "success");
        setAdminPassword(newPasswordInput.trim());
        localStorage.setItem("proverbs_admin_password", newPasswordInput.trim());
        setNewPasswordInput("");
        setConfirmPasswordInput("");
      } else {
        const err = await res.json();
        triggerToast(err.error || "فشل تغيير كلمة المرور", "error");
      }
    } catch (e) {
      triggerToast("عطل اتصال بالملقم أثناء المعالجة", "error");
    }
  };

  // System Backup Exporter (Generates real .json file client-side)
  const handleExportBackup = () => {
    const backupObj = {
      days,
      subscribers,
      password: adminPassword
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `marathon_proverbs_backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    triggerToast("تم تحميل النسخة الاحتياطية بنجاح!", "success");
  };

  // System Backup Importer (Accepts .json file upload and saves fully on server)
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = async (event) => {
        try {
          const parsedData = JSON.parse(event.target?.result as string);
          if (!parsedData.days || !Array.isArray(parsedData.subscribers)) {
            triggerToast("صيغة الملف المرفوع غير صالحة ولا تتطابق مع المارثون", "error");
            return;
          }

          const res = await fetch("/api/admin/restore-backup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              password: adminPassword,
              backup: parsedData
            })
          });

          if (res.ok) {
            triggerToast("تم استعادة جميع البيانات، الأيام، وتصحيح الكشوفات بنجاح!", "success");
            syncAdminData();
          } else {
            const err = await res.json();
            triggerToast(err.error || "فشل رفع واستعادة محتوى النسخة", "error");
          }
        } catch (e) {
          triggerToast("حدث عطل في قراءة مستند الـ JSON", "error");
        }
      };
    }
  };

  // ============================================
  // GOOGLE DRIVE BACKUP & RESTORE HANDLERS
  // ============================================

  const handleGoogleDriveConnect = () => {
    if (!googleClientId) {
      triggerToast("يرجى إدخال معرّف العميل Client ID الخاص بجوجل أولاً", "error");
      return;
    }
    setGDriveStatus("connecting");
    localStorage.setItem("google_drive_client_id", googleClientId);

    const redirectUri = window.location.origin;
    const scope = encodeURIComponent(
      "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly"
    );
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}&state=marathon_gdrive`;

    const authWindow = window.open(authUrl, "oauth_popup", "width=600,height=700");
    if (!authWindow) {
      setGDriveStatus("error");
      triggerToast("تم حظر النافذة المنبثقة! يرجى تفعيل النوافذ المنبثقة من إعدادات المتصفح ثم المحاولة مجدداً.", "error");
    }
  };

  const handleGoogleDriveDisconnect = () => {
    setGoogleAccessToken(null);
    setGoogleUserEmail(null);
    setGDriveStatus("idle");
    localStorage.removeItem("google_drive_access_token");
    localStorage.removeItem("google_user_email");
    triggerToast("تم إلغاء ربط حساب Google بنجاح.", "success");
  };

  const handleBackupToGoogleDrive = async () => {
    if (!googleAccessToken) {
      triggerToast("يرجى ربط حساب Google أولاً", "error");
      return;
    }

    setIsBackupInTransit(true);
    setSyncStatusMsg("جاري الاتصال بجوجل درايف واستكشاف المجلدات...");

    try {
      const folderName = "مارثون سفر الأمثال - النسخ الاحتياطي";
      let folderId = await searchFolder(googleAccessToken, folderName);

      if (!folderId) {
        setSyncStatusMsg("مجلد المارثون غير موجود، جاري إنشاؤه سحابياً...");
        folderId = await createFolder(googleAccessToken, folderName);
      }

      setSyncStatusMsg("جاري حفظ وتشفير قواعد البيانات ورفعها...");
      const backupObj = {
        days,
        subscribers,
        password: adminPassword,
      };

      const existingFileId = await searchBackupFile(googleAccessToken, folderId, "marathon_proverbs_backup.json");
      const result = await saveBackupFile(googleAccessToken, backupObj, folderId, existingFileId);

      const now = new Date().toLocaleString("ar-EG", { timeZone: "Africa/Cairo" });
      setGoogleDriveBackupDate(now);
      localStorage.setItem("google_drive_backup_date", now);

      triggerToast("تم الحفظ والنسخ الاحتياطي على Google Drive بنجاح!", "success");
    } catch (error: any) {
      console.error(error);
      if (error.message && (error.message.includes("401") || error.message.includes("Expired"))) {
        handleGoogleDriveDisconnect();
        triggerToast("انتهت صلاحية جلسة Google، يرجى إعادة ربط الحساب.", "error");
      } else {
        triggerToast("فشل الحفظ في درايف. تأكد من معرّف العميل وصلاحية الاتصال.", "error");
      }
    } finally {
      setIsBackupInTransit(false);
      setSyncStatusMsg("");
    }
  };

  const handleRestoreFromGoogleDrive = async () => {
    if (!googleAccessToken) {
      triggerToast("يرجى ربط حساب Google أولاً", "error");
      return;
    }

    setIsRestoreInTransit(true);
    setSyncStatusMsg("جاري استكشاف ملف النسخ الاحتياطي في جوجل درايف...");

    try {
      const folderName = "مارثون سفر الأمثال - النسخ الاحتياطي";
      const folderId = await searchFolder(googleAccessToken, folderName);

      if (!folderId) {
        triggerToast("لم يُعثر على المجلد السحابي للمارثون. تأكد من وجود المجلد.", "error");
        setIsRestoreInTransit(false);
        setSyncStatusMsg("");
        return;
      }

      const fileId = await searchBackupFile(googleAccessToken, folderId, "marathon_proverbs_backup.json");
      if (!fileId) {
        triggerToast("لم يُعثر على الملف marathon_proverbs_backup.json داخل المجلد السحابي!", "error");
        setIsRestoreInTransit(false);
        setSyncStatusMsg("");
        return;
      }

      setSyncStatusMsg("جاري تحميل وتزحيف ملف النسخ الاحتياطي السحابي...");
      const backupData = await downloadBackupFile(googleAccessToken, fileId);

      setSyncStatusMsg("جاري حفظ واسترجاع البيانات على الخادم...");
      const res = await fetch("/api/admin/restore-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: adminPassword,
          backup: backupData,
        }),
      });

      if (res.ok) {
        setDays(backupData.days);
        setSubscribers(backupData.subscribers);
        triggerToast("تم استيراد واستعادة البيانات بالكامل من Google Drive بنجاح!", "success");
      } else {
        const err = await res.json();
        triggerToast(err.error || "فشل استيراد واسترجاع ملف البيانات", "error");
      }
    } catch (error: any) {
      console.error(error);
      if (error.message && (error.message.includes("401") || error.message.includes("Expired"))) {
        handleGoogleDriveDisconnect();
        triggerToast("انتهت صلاحية جلسة Google، يرجى إعادة ربط الحساب.", "error");
      } else {
        triggerToast("حدث خلل أثناء استيراد البيانات من Google Drive.", "error");
      }
    } finally {
      setIsRestoreInTransit(false);
      setSyncStatusMsg("");
    }
  };

  const handleExportRankingToGoogleSheet = async () => {
    if (!googleAccessToken) {
      triggerToast("يرجى ربط حساب Google أولاً", "error");
      return;
    }

    if (subscribers.length === 0) {
      triggerToast("لا يوجد أي مشتركين مسجلين لتصدير كشوفاتهم بعد!", "error");
      return;
    }

    setIsExportInTransit(true);
    setSyncStatusMsg("جاري التحضير وربط مستندات Google Sheets...");

    try {
      const folderName = "مارثون سفر الأمثال - النسخ الاحتياطي";
      let folderId = await searchFolder(googleAccessToken, folderName);

      if (!folderId) {
        folderId = await createFolder(googleAccessToken, folderName);
      }

      const sheetTitle = `كشف درجات ونتائج مارثون سفر الأمثال - ${new Date().toISOString().slice(0, 10)}`;
      setSyncStatusMsg("جاري إنشاء المستند وكتابة أسماء ودرجات الفتيان...");

      const spreadsheetId = await exportToGoogleSheet(
        googleAccessToken,
        folderId,
        subscribers,
        days,
        sheetTitle
      );

      triggerToast("تم تصدير كشوفات الفتيان المُرتبة إلى مستند Google Sheets بنجاح!", "success");
      window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, "_blank");
    } catch (error: any) {
      console.error(error);
      if (error.message && (error.message.includes("401") || error.message.includes("Expired"))) {
        handleGoogleDriveDisconnect();
        triggerToast("انتهت صلاحية جلسة Google، يرجى إعادة ربط الحساب.", "error");
      } else {
        triggerToast("حدث خلل أثناء محاولة كتابة الكشوفات بـ Google Sheets.", "error");
      }
    } finally {
      setIsExportInTransit(false);
      setSyncStatusMsg("");
    }
  };

  const handleSendReportEmail = async () => {
    if (!googleAccessToken) {
      triggerToast("يرجى ربط حساب Google أولاً لتفعيل البريد السحابي Gmail", "error");
      return;
    }
    if (!gmailRecipient) {
      triggerToast("يرجى إدخال البريد الإلكتروني للمستلم", "error");
      return;
    }
    if (subscribers.length === 0) {
      triggerToast("لا يوجد كشوف أو متنافسين لإرسال نتائجهم حالياً!", "error");
      return;
    }

    setIsSendingEmail(true);
    setSyncStatusMsg("جاري إنشاء الكشف وتصميم بريد النتائج...");

    try {
      // Sort subscribers by total score
      const sortedSubs = [...subscribers].sort((a, b) => getSubTotalScore(b) - getSubTotalScore(a));

      let tableRowsHtml = "";
      sortedSubs.forEach((sub, idx) => {
        const totalScore = getSubTotalScore(sub);
        const rank = idx + 1;
        let medal = "";
        if (rank === 1) medal = "🥇 ";
        else if (rank === 2) medal = "🥈 ";
        else if (rank === 3) medal = "🥉 ";

        tableRowsHtml += `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 12px; text-align: center; font-weight: bold; color: #1e293b;">${medal}${rank}</td>
            <td style="padding: 12px; text-align: right; font-weight: bold; color: #0f172a;">${sub.name}</td>
            <td style="padding: 12px; text-align: center; font-weight: bold; color: #d97706;">${totalScore} نقطة</td>
            <td style="padding: 12px; text-align: center; color: #64748b; font-size: 11px;">${new Date(sub.joinedAt).toLocaleDateString("ar-EG")}</td>
          </tr>
        `;
      });

      const bodyHtml = `
        <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; padding: 40px 10px; text-align: right;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
            <!-- Header -->
            <div style="background-color: #d97706; padding: 30px; text-align: center; color: #ffffff;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 800;">📖 مارثون سفر الأمثال</h1>
              <p style="margin: 5px 0 0 0; font-size: 13px; font-opacity: 0.9; font-weight: 600;">تقرير النتائج وكشوف الدرجات لجميع المشتركين</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 30px; color: #334155;">
              <p style="font-weight: bold; font-size: 16px; color: #0f172a; margin-top: 0;">مرحباً،</p>
              <p style="line-height: 1.6; font-size: 14px; color: #475569;">
                ${gmailBody.replace(/\n/g, "<br>")}
              </p>
              
              <div style="margin: 25px 0; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  <thead>
                    <tr style="background-color: #fdf6ec; border-bottom: 2px solid #f5e6d3; color: #b45309; font-weight: bold;">
                      <th style="padding: 12px; text-align: center; width: 15%;">الترتيب</th>
                      <th style="padding: 12px; text-align: right; width: 45%;">الاسم الكلي للفتى</th>
                      <th style="padding: 12px; text-align: center; width: 20%;">إجمالي النقاط</th>
                      <th style="padding: 12px; text-align: center; width: 20%;">تاريخ الانضمام</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${tableRowsHtml}
                  </tbody>
                </table>
              </div>
              
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                تم توليد هذا التقرير ومزامنته سحابياً تلقائياً بواسطة واجهة Gmail API بمارثون سفر الأمثال.
              </p>
            </div>
          </div>
        </div>
      `;

      await sendGmailMessage({
        token: googleAccessToken,
        to: gmailRecipient,
        subject: gmailSubject,
        bodyHtml,
        bodyText: `${gmailBody}\n\nيرجى تفعيل عرض البريد بصيغة HTML لمشاهدة كشوف النتائج التفاعلية كاملة.`
      });

      triggerToast("تم إرسال بريد النتائج بنجاح عبر Gmail السحابي!", "success");
    } catch (error: any) {
      console.error(error);
      if (error.message && (error.message.includes("401") || error.message.includes("Expired"))) {
        handleGoogleDriveDisconnect();
        triggerToast("انتهت صلاحية جلسة Google، يرجى إعادة ربط الحساب.", "error");
      } else {
        triggerToast("فشل إرسال البريد. تأكد من صحة المستلم والصلاحيات في Google.", "error");
      }
    } finally {
      setIsSendingEmail(false);
      setSyncStatusMsg("");
    }
  };

  const handleRestoreFromLocalCache = async () => {
    const cachedStr = localStorage.getItem("proverbs_admin_full_db_cache");
    if (!cachedStr) {
      triggerToast("لا يوجد كاش مخزن محلياً بمتصفحك للاستعادة!", "error");
      return;
    }

    try {
      setLoading(true);
      const cachedDB: DatabaseState = JSON.parse(cachedStr);
      
      const res = await fetch("/api/admin/restore-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: adminPassword,
          backup: {
            days: cachedDB.days,
            subscribers: cachedDB.subscribers,
            password: adminPassword
          }
        }),
      });

      if (res.ok) {
        setDays(cachedDB.days);
        setSubscribers(cachedDB.subscribers);
        setShowLocalRestoreBanner(false);
        triggerToast("تم بنجاح استعادة جميع المشتركين وكشوفات ومسار المارثون من كاش المتصفح!", "success");
      } else {
        const err = await res.json();
        triggerToast(err.error || "فشل رفع كاش الاستعادة إلى الملقم", "error");
      }
    } catch (e) {
      console.error(e);
      triggerToast("حدث خلل أثناء محاولة استعادة البيانات المخزنة", "error");
    } finally {
      setLoading(false);
    }
  };

  // Helper: Calculate participant global score across database
  const getSubTotalScore = (sub: Subscriber) => {
    return Object.values(sub.solvedDays).reduce((sum, current) => sum + current.score, 0);
  };

  // Helper: Calculate participant rank
  const getParticipantRankAndStats = (name: string) => {
    if (subscribers.length === 0) return { rank: 1, totalParticipants: 1 };
    
    // Sort subscribers based on aggregate score, then join timestamp
    const sortedSubs = [...subscribers].sort((a, b) => {
      const scoreA = getSubTotalScore(a);
      const scoreB = getSubTotalScore(b);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    });

    const index = sortedSubs.findIndex(s => normalizeArabicName(s.name) === normalizeArabicName(name));
    return {
      rank: index !== -1 ? index + 1 : sortedSubs.length + 1,
      totalParticipants: sortedSubs.length
    };
  };

  // Helper: Format ISO date/time into a highly readable Egyptian Arabic timestamp
  const formatTimestampArabic = (isoString: string) => {
    try {
      const dt = new Date(isoString);
      return dt.toLocaleString("ar-EG", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
    } catch (e) {
      return isoString;
    }
  };

  // Filtering Subscribers in panel
  const filteredSubscribers = subscribers
    .filter(sub => normalizeArabicName(sub.name).includes(normalizeArabicName(adminSearchQuery)))
    .sort((a, b) => {
      const scoreA = getSubTotalScore(a);
      const scoreB = getSubTotalScore(b);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    });

  // Filtering days in panel
  const filteredDaysForAdmin = (Object.values(days) as DayData[]).filter((day: DayData) => {
    const qStr = adminDaysSearchQuery.trim();
    if (!qStr) return true;
    return (
      day.id.toString() === qStr ||
      day.chapter.toString() === qStr ||
      day.verses.some(v => v.text.includes(qStr)) ||
      day.questions.some(q => q.text.includes(qStr))
    );
  });

  return (
    <div id="marathon_root" className="min-h-screen bg-[#f7f7ee] text-slate-800 font-sans selection:bg-[#d97706] selection:text-white" dir="rtl">
      {/* Visual Header Styling Lines */}
      <div className="h-2 bg-[#d97706] w-full" id="header_band"></div>

      {/* Floating Notifications UI */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            id="toast_notification"
            className={`fixed top-6 right-6 left-6 md:left-auto md:w-96 z-50 p-4 rounded-xl shadow-2xl flex items-center gap-3 border ${
              toast.type === "success" 
                ? "bg-green-50 border-green-200 text-green-900" 
                : "bg-red-50 border-red-200 text-red-900"
            }`}
          >
            {toast.type === "success" ? (
              <div className="p-2 bg-green-500 text-white rounded-full"><Check className="w-5 h-5 pointer-events-none" /></div>
            ) : (
              <div className="p-2 bg-red-500 text-white rounded-full"><AlertTriangle className="w-5 h-5 pointer-events-none" /></div>
            )}
            <span className="font-semibold text-sm leading-relaxed">{toast.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Block State */}
      {loading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 animate-fade-in" id="loading_overlay">
          <div className="bg-white/95 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4 text-center border border-slate-200">
            <RefreshCw className="w-10 h-10 text-[#d97706] animate-spin" />
            <p className="font-bold text-slate-800 text-lg">جاري تحميل بيانات كنيسة ماريوحنا المعمدان...</p>
            <p className="text-slate-500 text-xs font-mono">برجاء الانتظار قليلاً</p>
          </div>
        </div>
      )}

      {/* Primary Layout Container */}
      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12" id="marathon_layout">
        
        {/* LANDING / OUT-OF-SESSION VIEW */}
        {!participantName && !isAdminLoggedIn && (
          <div className="space-y-12 max-w-2xl mx-auto py-10 md:py-16 text-center" id="landing_view">
            
            {/* Header Identity (STRICT USER SPECIFICATION) */}
            <div className="space-y-4" id="church_identity_header">
              <h1 className="text-2xl md:text-4xl font-extrabold text-[#111827] tracking-tight leading-tight select-none">
                كنيسة ماريوحنا المعمدان واخنوخ البار وايليا النبى
              </h1>
              <h2 className="text-xl md:text-2xl font-bold text-[#b45309] tracking-normal select-none">
                اجتماع الثلاث فتيه القديسين لفتيان إعدادى
              </h2>
              <div className="w-20 h-1 bg-[#d97706] mx-auto my-6 rounded-full"></div>
              
              <h3 className="text-2xl md:text-3xl font-black text-slate-800 pt-2 font-serif">
                🏆 مارثون الكتاب المقدس (سفر الأمثال) 🏆
              </h3>
              <p className="text-slate-600 text-sm max-w-md mx-auto leading-relaxed pt-2">
                سفر الأمثال مكون من 31 أصحاحاً شاملاً لـ 915 آية عظيمة، بمعدل حفظ 3 آيات يومياً على مدار 305 أيام متتالية للاستفادة وبناء حياتنا اليومية.
              </p>
            </div>

            {/* Input Forms (Subscribers & Administrator) */}
            <div className="bg-white rounded-3xl shadow-xl border border-orange-100 p-8 space-y-8" id="auth_container">
              
              {/* Participant Registration (اسمك ايه؟) */}
              <form onSubmit={handleParticipantSubmit} className="space-y-4 text-right" id="form_registration">
                <label className="block text-slate-900 font-bold text-lg text-center md:text-right" htmlFor="sub_name_input">
                  👤 اسمك إيه؟ (اكتب اسمك الثلاثي للمشاركة)
                </label>
                <div className="flex flex-col md:flex-row gap-3">
                  <input
                    id="sub_name_input"
                    type="text"
                    required
                    placeholder="اكتب اسمك كاملاً..."
                    value={regNameInput}
                    onChange={(e) => setRegNameInput(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-right font-medium focus:outline-none focus:ring-2 focus:ring-[#d97706] focus:border-[#d97706] transition text-base"
                  />
                  <button
                    type="submit"
                    id="btn_sub_enter"
                    className="bg-[#d97706] hover:bg-[#b45309] text-white font-bold rounded-xl px-6 py-3.5 transition flex items-center justify-center gap-2 shadow-lg shadow-orange-700/10 active:scale-95"
                  >
                    <span>ابدأ المارثون الآن</span>
                    <ChevronRight className="w-5 h-5 pointer-events-none transform rotate-180" />
                  </button>
                </div>
              </form>

              <div className="border-t border-slate-100 my-6"></div>

              {/* Admin Panel Toggle Trigger */}
              <div className="text-center" id="admin_trigger_box">
                {!showAdminLogin ? (
                  <button
                    onClick={() => setShowAdminLogin(true)}
                    id="btn_show_admin"
                    className="text-slate-500 hover:text-[#d97706] font-semibold text-sm transition inline-flex items-center gap-2 border border-slate-200 hover:border-amber-200 rounded-xl px-4 py-2.5 bg-slate-50 hover:bg-amber-50/20 shadow-sm"
                  >
                    <Settings className="w-4 h-4 text-slate-400" />
                    <span>الدخول كـ مشرف الاجتماع</span>
                  </button>
                ) : (
                  <form onSubmit={handleAdminVerify} className="space-y-4 text-right animate-fade-in" id="form_admin_verify">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-900 font-bold text-base" htmlFor="admin_pass_input">
                        🔑 كلمة مرور المشرف الحالية
                      </label>
                      <button 
                        type="button" 
                        onClick={() => setShowAdminLogin(false)}
                        className="text-slate-400 hover:text-slate-600 text-xs"
                      >
                        إلغاء دخول المشرف
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        id="admin_pass_input"
                        type="password"
                        required
                        placeholder="أدخل الرقم السري للمشرف..."
                        value={admPasswordInput}
                        onChange={(e) => setAdmPasswordInput(e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-right focus:outline-none focus:ring-2 focus:ring-[#d97706] transition text-sm font-mono"
                      />
                      <button
                        type="submit"
                        id="btn_admin_verify"
                        className="bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl px-5 py-3 transition text-sm flex items-center gap-1.5 shadow-md active:scale-95"
                      >
                        <ShieldAlert className="w-4 h-4" />
                        <span>تحقق ودخول</span>
                      </button>
                    </div>
                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={handleForceResetPassword}
                        className="text-xs text-amber-700 hover:text-rose-600 font-bold underline transition inline-flex items-center gap-1 cursor-pointer"
                      >
                        ⚠️ نسيت كلمة المرور؟ اضغط هنا لإعادة تعيين الرقم السري للمشرف فوراً إلى (123)
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Bottom Floating Area with QR Code Button */}
            <div className="pt-4 flex justify-center gap-4 text-center" id="qr_footer_trigger">
              <button
                onClick={() => setQrModalOpen(true)}
                id="btn_main_qr"
                className="inline-flex items-center gap-2 bg-white hover:bg-amber-50 text-amber-900 rounded-2xl px-6 py-3 border border-orange-100 shadow-md transition font-bold"
              >
                <QrCode className="w-5 h-5 text-[#d97706]" />
                <span>عرض كود الـ QR للموقع</span>
              </button>
            </div>
          </div>
        )}


        {/* PARTICIPANT DASHBOARD VIEW */}
        {participantName && participantData && (
          <div className="space-y-8" id="participant_view">
            
            {/* Participant Custom Header */}
            <header className="bg-white rounded-3xl p-6 md:p-8 shadow-md border border-slate-100 flex flex-col md:flex-row items-center md:items-stretch gap-6 justify-between text-right" id="sub_header">
              <div className="space-y-3 flex-1">
                <div className="flex flex-wrap items-center gap-2 justify-center md:justify-start">
                  <span className="bg-amber-100 text-[#d97706] text-xs font-black rounded-lg px-2.5 py-1">مشترك نشط</span>
                  <p className="text-slate-400 text-xs font-medium">كنيسة ماريوحنا المعمدان</p>
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 text-center md:text-right">
                  أهلاً بك يا، {participantData.name} 👋
                </h2>
                <p className="text-slate-500 text-sm italic font-serif text-center md:text-right">
                  «تَوَكَّلْ عَلَى الرَّبِّ بِكُلِّ قَلْبِكَ، وَعَلَى فَهْمِكَ لاَ تَعْتَمِدْ.» (أمثال 3: 5)
                </p>
              </div>

              {/* Mini Stats Banner */}
              <div className="flex flex-wrap gap-4 justify-center" id="sub_stats_area">
                {/* Solved Days Count Card */}
                <div className="bg-orange-50/50 border border-orange-100 rounded-2xl p-4 text-center min-w-[120px] shadow-xs">
                  <Calendar className="w-5 h-5 text-orange-600 mx-auto mb-1 pointer-events-none" />
                  <p className="text-slate-500 text-xs font-semibold">الأيام المكتملة</p>
                  <p className="text-2xl font-black text-rose-700 font-mono mt-1">
                    {Object.keys(participantData.solvedDays).length} <span className="text-xs text-slate-400 font-normal">يوم</span>
                  </p>
                </div>

                {/* Score Card */}
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center min-w-[120px] shadow-xs">
                  <Award className="w-5 h-5 text-[#d97706] mx-auto mb-1 pointer-events-none" />
                  <p className="text-slate-500 text-xs font-semibold">مجموع الدرجات</p>
                  <p className="text-2xl font-black text-[#d97706] font-mono mt-1">
                    {getSubTotalScore(participantData)} <span className="text-xs text-slate-400 font-normal">درجة</span>
                  </p>
                </div>

                {/* Rank Card */}
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center min-w-[120px] shadow-xs">
                  <Award className="w-5 h-5 text-emerald-600 mx-auto mb-1 pointer-events-none" />
                  <p className="text-slate-500 text-xs font-semibold">ترتيبك الحالي</p>
                  <p className="text-2xl font-black text-emerald-700 mt-1 font-serif">
                    المركز {getParticipantRankAndStats(participantData.name).rank}
                  </p>
                </div>
              </div>

              {/* Sign out button */}
              <div className="flex items-center">
                <button
                  onClick={handleLogoutParticipant}
                  id="btn_participant_sigout"
                  className="bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-1 shadow-xs"
                >
                  <LogOut className="w-4 h-4 pointer-events-none" />
                  <span>خروج المشترك</span>
                </button>
              </div>
            </header>

            {/* Days Selection Space */}
            <div className="space-y-6" id="marathon_days_grid_box">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="text-right">
                  <h3 className="text-lg font-extrabold text-slate-900">أيام مارثون سفر الأمثال (305 يوم)</h3>
                  <p className="text-xs text-slate-500 font-medium">كل يوم يحتوي على 3 آيات من سفر الأمثال + 3 أسئلة اختيار من متعدد.</p>
                </div>

                {/* Range Filter Segment (Pagination tabs to optimize layouts) */}
                <div className="flex flex-wrap gap-1.5 bg-white border border-slate-200/60 p-1.5 rounded-2xl shadow-xs" id="range_tabs">
                  {Array.from({ length: totalTabs }).map((_, index) => {
                    const start = index * RANGE_LIMIT + 1;
                    const end = Math.min((index + 1) * RANGE_LIMIT, 305);
                    const isSelected = dayRangeFilter === index;
                    return (
                      <button
                        key={index}
                        onClick={() => setDayRangeFilter(index)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                          isSelected 
                            ? "bg-[#d97706] text-white shadow-sm" 
                            : "text-slate-600 hover:bg-orange-50"
                        }`}
                      >
                        {start}-{end}
                      </button>
                    );
                  })}
                </div>
              </div>


              {/* Interactive Days Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4" id="days_buttons_grid">
                {Array.from({ length: 305 }).map((_, idx) => {
                  const dayId = idx + 1;
                  // Filter out days based on page tab
                  const startDay = dayRangeFilter * RANGE_LIMIT + 1;
                  const endDay = startDay + RANGE_LIMIT - 1;
                  if (dayId < startDay || dayId > endDay) return null;

                  const serverDay = days[dayId];
                  const isOpen = serverDay ? serverDay.isOpen : false;
                  
                  // Check participant progress
                  const answersData = participantData.solvedDays[dayId];
                  const isSolved = !!answersData;

                  return (
                    <button
                      key={dayId}
                      onClick={() => {
                        if (isOpen || isSolved) {
                          setCurrentSolveDay(serverDay || { id: dayId, chapter: 1, verses: [], questions: [], isOpen: false });
                          setTempAnswersResult(answersData ? {
                            correctAnswers: [], // Resolved separately using local check during display if needed
                            score: answersData.score,
                            solvedAt: answersData.solvedAt
                          } : null);
                          setSelectedAnswers(answersData ? answersData.answers : [null, null, null]);
                        } else {
                          triggerToast(`اليوم رقم ${dayId} مغلق حالياً من قِبل مشرف الاجتماع.`, "error");
                        }
                      }}
                      id={`day_button_${dayId}`}
                      className={`relative overflow-hidden rounded-2xl p-4 text-center border transition-all duration-300 transform h-28 flex flex-col justify-between items-center text-right ${
                        isSolved 
                          ? "bg-emerald-50/50 border-emerald-200 hover:border-emerald-300 text-slate-800 shadow-xs hover:scale-103"
                          : isOpen
                            ? "bg-white border-orange-200 hover:border-[#d97706] text-slate-800 shadow-md ring-1 ring-orange-100 hover:scale-103 cursor-pointer"
                            : "bg-slate-100 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed"
                      }`}
                    >
                      {/* Solved Status Tag */}
                      {isSolved && (
                        <div className="absolute top-2 right-2 bg-emerald-500 text-white rounded-full p-1 shadow-xs">
                          <Check className="w-3.5 h-3.5 pointer-events-none" />
                        </div>
                      )}

                      {/* Locked Status Tag */}
                      {!isSolved && !isOpen && (
                        <div className="absolute top-2 right-2 text-slate-400 p-1">
                          <Lock className="w-3.5 h-3.5 pointer-events-none" />
                        </div>
                      )}

                      {/* Active Uncompleted Tag */}
                      {!isSolved && isOpen && (
                        <div className="absolute top-2 right-2 bg-rose-500 rounded-full w-2 h-2 animate-ping"></div>
                      )}

                      {/* Day Label */}
                      <span className="font-semibold text-xs text-slate-400 block pt-1 select-none">اليوم</span>
                      <span className="font-extrabold text-2xl font-mono block leading-none text-slate-800">{dayId}</span>

                      {/* Status Caption */}
                      {isSolved ? (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-lg px-2 py-0.5">
                          الدرجة: {answersData.score}/3
                        </span>
                      ) : isOpen ? (
                        <span className="text-[#d97706] text-[10px] font-extrabold">ابدأ الحل الآن 📝</span>
                      ) : (
                        <span className="text-slate-400 text-[10px] font-medium">مغلق مؤقتاً</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SEPARATE ACTIVE DAY SOLVE SECTION / PANEL (MODAL INTERACTIVE OVERLAY) */}
            <AnimatePresence>
              {currentSolveDay && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  id="active_solve_panel"
                  className="fixed inset-0 bg-slate-950/80 backdrop-blur-md overflow-y-auto px-4 py-6 md:py-12 z-50 animate-fade-in"
                >
                  <motion.div
                    initial={{ scale: 0.95, y: 30 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 30 }}
                    className="bg-white rounded-3xl max-w-2xl mx-auto border border-slate-200 overflow-hidden shadow-2xl relative"
                  >
                    
                    {/* Header Panel */}
                    <div className="bg-[#1e293b] text-white p-6 md:p-8 relative text-right flex justify-between items-start">
                      <div className="space-y-1">
                        <span className="bg-amber-600/60 text-amber-200 text-xs font-bold rounded-lg px-2 py-1">الأصحاح {currentSolveDay.chapter} من سفر الأمثال</span>
                        <h3 className="text-xl md:text-2xl font-black">اليوم رقم {currentSolveDay.id} من المارثون</h3>
                      </div>
                      <button
                        onClick={() => {
                          setCurrentSolveDay(null);
                          setTempAnswersResult(null);
                        }}
                        className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition active:scale-90"
                      >
                        <X className="w-5 h-5 pointer-events-none" />
                      </button>
                    </div>

                    <div className="p-6 md:p-8 space-y-8 text-right" id="solve_main_content">
                      
                      {/* Part 1: Holy Scriptures Section */}
                      <div className="space-y-4">
                        <h4 className="text-[#d97706] font-extrabold text-base border-b border-orange-100 pb-2 flex items-center gap-2">
                          <BookOpen className="w-5 h-5 pointer-events-none" />
                          <span>اقرأ آيات اليوم بتمعّن ثم احفظها:</span>
                        </h4>

                        <div className="bg-[#fcfbf7] border border-orange-100 rounded-2xl p-6 space-y-4 shadow-sm relative">
                          <div className="absolute top-3 left-4 text-orange-200 font-serif text-5xl">”</div>
                          {currentSolveDay.verses && currentSolveDay.verses.length > 0 ? (
                            currentSolveDay.verses.map((v, index) => (
                              <div key={index} className="leading-relaxed">
                                <span className="bg-amber-100 text-[#b45309] rounded-lg px-2 py-0.5 text-xs font-bold font-mono ml-2">
                                  ({v.num})
                                </span>
                                <span className="text-slate-800 font-bold text-base md:text-lg leading-relaxed font-serif">
                                  {v.text}
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="text-slate-500 font-bold">لا يوجد آيات مسجلة لهذا اليوم، سيتم تحديثها قريباً من المشرف.</p>
                          )}
                        </div>
                      </div>

                      {/* Part 2: Interactive Quiz Segment */}
                      <div className="space-y-6">
                        <h4 className="text-slate-950 font-extrabold text-base border-b border-slate-100 pb-2 flex items-center gap-2">
                          <HelpCircle className="w-5 h-5 pointer-events-none text-slate-500" />
                          <span>أجب عن الأسئلة المخصصة لليوم:</span>
                        </h4>

                        {currentSolveDay.questions && currentSolveDay.questions.length > 0 ? (
                          currentSolveDay.questions.map((q, qIndex) => {
                            const isUserAlreadySolved = !!participantData.solvedDays[currentSolveDay.id];
                            const currentSelectedOption = selectedAnswers[qIndex];
                            
                            // Check correct answer based on dynamic lookups
                            let correctOptionIdx = days[currentSolveDay.id]?.questions[qIndex]?.correctIndex;
                            if (correctOptionIdx === undefined) {
                              correctOptionIdx = participantData.solvedDays[currentSolveDay.id]?.correctAnswers?.[qIndex];
                            }
                            if (correctOptionIdx === undefined) {
                              correctOptionIdx = tempAnswersResult?.correctAnswers?.[qIndex];
                            }

                            return (
                              <div key={q.id || qIndex} className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5 space-y-4">
                                <p className="font-extrabold text-slate-900 text-sm md:text-base leading-relaxed flex gap-2">
                                  <span className="text-slate-400 font-mono font-bold">س {qIndex+1}:</span>
                                  <span>{q.text}</span>
                                </p>

                                {/* 3 Multiple choice options buttons */}
                                <div className="grid grid-cols-1 gap-2.5">
                                  {q.options.map((opt, optIdx) => {
                                    const isThisSelected = currentSelectedOption === optIdx;
                                    const isAnyAnswerSelected = currentSelectedOption !== null;

                                    // Styling determinations
                                    let btnStyle = "bg-white text-slate-800 border-slate-200 hover:bg-slate-100";
                                    
                                    if (isUserAlreadySolved) {
                                      // Render solutions
                                      if (optIdx === correctOptionIdx) {
                                        btnStyle = "bg-emerald-100 border-emerald-300 text-emerald-900 font-bold";
                                      } else if (isThisSelected) {
                                        btnStyle = "bg-rose-100 border-rose-300 text-rose-900 font-bold";
                                      } else {
                                        btnStyle = "bg-white text-slate-400 border-slate-100 cursor-not-allowed";
                                      }
                                    } else {
                                      // Active Solving Mode
                                      if (isThisSelected) {
                                        btnStyle = "bg-amber-600 border-amber-600 text-white font-bold ring-2 ring-amber-200";
                                      } else if (isAnyAnswerSelected) {
                                        btnStyle = "bg-slate-100 text-slate-400 border-slate-100 cursor-not-allowed";
                                      }
                                    }

                                    return (
                                      <button
                                        key={optIdx}
                                        disabled={isAnyAnswerSelected || isUserAlreadySolved}
                                        onClick={() => {
                                          if (!isAnyAnswerSelected && !isUserAlreadySolved) {
                                            const newSel = [...selectedAnswers];
                                            newSel[qIndex] = optIdx;
                                            setSelectedAnswers(newSel);
                                          }
                                        }}
                                        className={`w-full text-right px-4 py-3.5 rounded-xl border text-sm transition-all duration-200 ${btnStyle} ${
                                          !isAnyAnswerSelected && !isUserAlreadySolved ? "hover:scale-[1.01] active:scale-99 cursor-pointer" : ""
                                        }`}
                                      >
                                        <div className="flex justify-between items-center">
                                          <span>{opt}</span>
                                          {isUserAlreadySolved && optIdx === correctOptionIdx && (
                                            <span className="text-emerald-700 bg-emerald-50 rounded-lg px-2 py-0.5 text-xs font-bold font-serif">
                                              {isThisSelected ? "إجابتك صحيحة ✓" : "الإجابة الصحيحة ✓"}
                                            </span>
                                          )}
                                          {isUserAlreadySolved && isThisSelected && optIdx !== correctOptionIdx && (
                                            <span className="text-rose-700 bg-rose-50 rounded-lg px-2 py-0.5 text-xs font-bold font-serif">
                                              إجابة خاطئة ✗
                                            </span>
                                          )}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-slate-400 text-xs">لا يوجد أسئلة مضافة لهذا اليوم.</p>
                        )}
                      </div>

                      {/* Display Submit & Score Responses */}
                      {!participantData.solvedDays[currentSolveDay.id] ? (
                        <div className="pt-4 border-t border-slate-100" id="submission_controls">
                          <button
                            onClick={handleAnswerSubmit}
                            id="btn_submit_answers"
                            className="w-full bg-[#d97706] hover:bg-[#b45309] text-white font-bold py-4 rounded-2xl transition shadow-lg shadow-orange-700/10 flex items-center justify-center gap-2 text-base active:scale-95"
                          >
                            <span>تسليم الإجابات النهائية وحساب الدرجة</span>
                            <ChevronRight className="w-5 h-5 pointer-events-none transform rotate-180" />
                          </button>
                          <p className="text-center text-slate-400 text-xs mt-3 select-none">
                            تنبيه: لا يمكن تغيير الإجابة بعد الضغط على زر اختيار الخيار ("مينفعش يرجع يختار اختيار تانى").
                          </p>
                        </div>
                      ) : (
                        <div className="pt-6 border-t border-slate-100 text-center space-y-4" id="feedback_screen">
                          <div className="bg-emerald-50 text-emerald-900 rounded-2xl p-6 border border-emerald-100 inline-block w-full">
                            <span className="text-slate-500 text-xs block mb-1 font-semibold">إجمالي درجتك في هذا اليوم</span>
                            <span className="text-4xl font-black text-emerald-800 font-mono">
                              {participantData.solvedDays[currentSolveDay.id]?.score} / 3
                            </span>
                            <span className="text-xs text-slate-400 block mt-2 font-mono">
                              تاريخ حل الأسئلة: {formatTimestampArabic(participantData.solvedDays[currentSolveDay.id]?.solvedAt)}
                            </span>
                          </div>

                          <button
                            onClick={() => {
                              setCurrentSolveDay(null);
                              setTempAnswersResult(null);
                            }}
                            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 rounded-2xl transition"
                          >
                            <span>حسناً، عودة لجدول المارثون الرئيسي</span>
                          </button>
                        </div>
                      )}

                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        )}


        {/* ADMINISTRATOR CONTROL PANEL VIEW (لوحة تحكم المشرف) */}
        {isAdminLoggedIn && adminPassword && (
          <div className="space-y-8" id="admin_dashboard">
            
            {/* Header section admin */}
            <header className="bg-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl flex flex-col md:flex-row items-center md:items-stretch gap-6 justify-between text-right" id="admin_hdr">
              <div className="space-y-2 flex-1">
                <span className="bg-[#d97706] text-white text-xs font-black rounded-lg px-2.5 py-1">مدير الاجتماع</span>
                <h2 className="text-2xl md:text-3xl font-extrabold pb-1">
                  لوحة إدارة مارثون سفر الأمثال ⚙️
                </h2>
                <p className="text-slate-400 text-[13px] leading-relaxed">
                  مرحباً بك يا مشرف فتيان إعدادي بكنيسة ماريوحنا المعمدان. من هنا يمكنك فتح وإغلاق الأيام، إدارة المشتركين والدرجات، تعديل الآيات والأسئلة وحفظ البيانات لتظل باقية للأبد.
                </p>
              </div>

              {/* Log out admin */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleAdminSignout}
                  id="btn_admin_logout"
                  className="bg-white/10 hover:bg-white/20 text-white font-bold px-5 py-3 rounded-xl text-xs transition flex items-center gap-1.5"
                >
                  <LogOut className="w-4 h-4" />
                  <span>خروج المشرف</span>
                </button>
              </div>
            </header>

            {/* Self-Healing Local Recover Banner */}
            {showLocalRestoreBanner && adminOfflineCacheCount > 0 && (
              <div className="bg-amber-50 border-2 border-dashed border-amber-300 rounded-3xl p-6 text-right space-y-4 shadow-sm flex flex-col md:flex-row items-center gap-6 justify-between animate-fade-in">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 justify-end text-amber-800 font-extrabold text-base">
                    <span>نظام الحماية من فقدان البيانات مفعل 🛡️</span>
                    <ShieldAlert className="w-5 h-5 text-amber-600" />
                  </div>
                  <p className="text-xs text-amber-700 font-semibold leading-relaxed">
                    يبدو أن خادم الاستضافة السحابي مر بمرحلة إعادة تشغيل دورية وتم تفريغ القائمة الحالية (المسجل لدى السيرفر حالياً: 0 مشتركين).
                    <br />
                    لحسن الحظ وبفضل تقنية الحفظ الذكي بمتصفحك، <strong>تحتفظ ذاكرتك المحلية بكافة كشوفات {adminOfflineCacheCount} مشترك ونتائجهم كاملة!</strong> اضغط على الزر أدناه لمزامنة السيرفر واسترجاعها فوراً.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleRestoreFromLocalCache}
                    className="bg-[#d97706] hover:bg-[#b45309] text-white font-extrabold py-3.5 px-6 rounded-2xl text-xs transition shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>مزامنة واستعادة {adminOfflineCacheCount} مشترك الآن</span>
                  </button>
                </div>
              </div>
            )}

            {/* Panel Tabs Navigation */}
            <div className="border-b border-slate-200 flex flex-wrap gap-2" id="admin_tabs_row">
              <button
                onClick={() => setAdminTab("ranking")}
                className={`px-5 py-3.5 font-bold text-sm transform transition rounded-t-xl flex items-center gap-2 ${
                  adminTab === "ranking"
                    ? "bg-white border-t-2 border-[#d97706] text-[#d97706] shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Award className="w-4 h-4" />
                <span>كشف نتائج ورتب الفتيان ({subscribers.length})</span>
              </button>

              <button
                onClick={() => setAdminTab("days")}
                className={`px-5 py-3.5 font-bold text-sm transform transition rounded-t-xl flex items-center gap-2 ${
                  adminTab === "days"
                    ? "bg-white border-t-2 border-[#d97706] text-[#d97706] shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>تحكم الأيام والآيات والأسئلة (305 يوم)</span>
              </button>

              <button
                onClick={() => setAdminTab("settings")}
                className={`px-5 py-3.5 font-bold text-sm transform transition rounded-t-xl flex items-center gap-2 ${
                  adminTab === "settings"
                    ? "bg-white border-t-2 border-[#d97706] text-[#d97706] shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>الرقم السري والنسخ الاحتياطي للأمان</span>
              </button>
            </div>


            {/* TAB CONTAINER: RANKINGS & RESULTS AND USER MANAGEMENT */}
            {adminTab === "ranking" && (
              <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 space-y-6" id="panel_ranking_list">
                
                {/* Search query */}
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div className="text-right">
                    <h3 className="text-lg font-extrabold text-slate-900">جدول رتب ودرجات المشتركين بالمارثون</h3>
                    <p className="text-xs text-slate-500 font-medium">الترتيب يصيغه النظام تلقائياً الأعلى درجةً ثم الأسبق انضماماً للمارثون.</p>
                  </div>

                  <div className="relative w-full md:w-80">
                    <input
                      type="text"
                      placeholder="ابحث عن اسم الفتى المشترك..."
                      value={adminSearchQuery}
                      onChange={(e) => setAdminSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#d97706]"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute top-3.5 right-3.5 pointer-events-none" />
                  </div>
                </div>

                {/* Subscribers table list */}
                {filteredSubscribers.length > 0 ? (
                  <div className="overflow-x-auto" id="ranking_table_wrapper">
                    <table className="w-full text-right border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-bold">
                          <th className="py-3 px-4 text-center">الترتيب</th>
                          <th className="py-3 px-4">اسم الفتى</th>
                          <th className="py-3 px-4 text-center">مجموع الدرجات</th>
                          <th className="py-3 px-4 text-center">الأيام التي أجابها</th>
                          <th className="py-3 px-4">تاريخ الانضمام</th>
                          <th className="py-3 px-4 text-center">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredSubscribers.map((sub, sIdx) => {
                          const totalScore = getSubTotalScore(sub);
                          const isTop3 = sIdx < 3;
                          let medalColor = "text-slate-500 bg-slate-100";
                          if (sIdx === 0) medalColor = "text-amber-800 bg-amber-100 font-bold";
                          if (sIdx === 1) medalColor = "text-slate-800 bg-slate-200 font-bold";
                          if (sIdx === 2) medalColor = "text-amber-900 bg-amber-50 font-bold";

                          return (
                            <tr key={sub.id} className="hover:bg-slate-50/50 transition">
                              <td className="py-3.5 px-4 text-center">
                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs ${medalColor}`}>
                                  {sIdx + 1}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 font-bold text-slate-900">{sub.name}</td>
                              <td className="py-3.5 px-4 text-center font-extrabold text-[#d97706] font-mono text-base">{totalScore}</td>
                              <td className="py-3.5 px-4 text-center font-semibold font-mono text-slate-700">
                                {Object.keys(sub.solvedDays).length} يوم
                              </td>
                              <td className="py-3.5 px-4 text-slate-500 text-xs">
                                {new Date(sub.joinedAt).toLocaleDateString("ar-EG")}
                              </td>
                              <td className="py-3.5 px-4 text-center flex items-center justify-center gap-2">
                                <button
                                  onClick={() => setSelectedSubscriberForDetail(sub)}
                                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs transition"
                                >
                                  عرض الحلول بالتفصيل 👁️
                                </button>
                                
                                <button
                                  onClick={() => handleAdminDeleteSubscriber(sub)}
                                  id={`btn_delete_sub_${sub.id}`}
                                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-1 active:scale-95"
                                  title="حذف هذا المشترك نهائياً من قائمة النتائج"
                                >
                                  <Trash2 className="w-3.5 h-3.5pointer-events-none" />
                                  <span>حذف الاسم ❌</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center" id="empty_ranking_state">
                    <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-semibold text-sm">لا يوجد مشتركين مسجلين يطابقون محددات البحث حالياً</p>
                  </div>
                )}
              </div>
            )}


            {/* TAB CONTAINER: DAYS MANAGEMENT, CODES, VERSES & TOGGLES */}
            {adminTab === "days" && (
              <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 space-y-6" id="panel_days_controls">
                
                {/* Search day panel header */}
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div className="text-right">
                    <h3 className="text-lg font-extrabold text-slate-900">جداول أيام المارثون الكاملة (305 يوم)</h3>
                    <p className="text-xs text-slate-500 font-medium">يمكنك فتح وإغلاق بوابات الأيام فورياً للمشتركين بضغطة زر وتعديل أسئلة ومحتويات كل يوم.</p>
                  </div>

                  <div className="relative w-full md:w-80">
                    <input
                      type="text"
                      placeholder="ابحث برقم اليوم، برقم الأصحاح، آية..."
                      value={adminDaysSearchQuery}
                      onChange={(e) => setAdminDaysSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-[#d97706]"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute top-3.5 right-3.5 pointer-events-none" />
                  </div>
                </div>

                {/* Days card controls list */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" id="admin_days_grid_card">
                  {filteredDaysForAdmin.map(day => (
                    <div 
                      key={day.id} 
                      className={`rounded-2xl p-4 border transition flex flex-col justify-between h-44 ${
                        day.isOpen 
                          ? "bg-amber-50/50 border-amber-200" 
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex justify-between items-center pb-2 border-b border-dashed border-slate-200/80">
                        <span className="font-extrabold text-slate-800 text-sm">اليوم رقم: {day.id}</span>
                        <span className="bg-slate-200/85 text-slate-700 text-[10px] font-bold rounded-md px-1.5 py-0.5">أصحاح: {day.chapter}</span>
                      </div>

                      <div className="py-2 flex-1 text-right">
                        <span className="text-slate-400 text-[10px] font-semibold block">بدء الآيات:</span>
                        <p className="text-xs text-slate-600 font-serif font-bold truncate">
                          {day.verses && day.verses[0] ? day.verses[0].text : "لا يوجد آيات مكتوبة"}
                        </p>
                        <span className="text-slate-400 text-[10px] font-semibold block mt-1">الأسئلة:</span>
                        <p className="text-xs text-slate-600 truncate">{day.questions && day.questions[0] ? day.questions[0].text : "لا يوجد أسئلة"}</p>
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-slate-100">
                        {/* Toggle open/closed */}
                        <button
                          onClick={() => handleAdminToggleDay(day.id, day.isOpen)}
                          className={`flex-1 font-bold py-1.5 rounded-lg text-xs transition flex items-center justify-center gap-1 ${
                            day.isOpen
                              ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-800"
                              : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                          }`}
                        >
                          {day.isOpen ? <Unlock className="w-3.5 h-3.5 pointer-events-none text-emerald-600" /> : <Lock className="w-3.5 h-3.5 pointer-events-none text-slate-500" />}
                          <span>{day.isOpen ? "مفتوح" : "مغلق"}</span>
                        </button>

                        {/* Edit Day Form Trigger */}
                        <button
                          onClick={() => setEditingDay(day)}
                          className="bg-slate-800 hover:bg-slate-950 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition flex items-center justify-center gap-1"
                        >
                          <Edit className="w-3.5 h-3.5 pointer-events-none" />
                          <span>تعديل</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}


            {/* TAB CONTAINER: PASSWORDS & SYSTEM BACKUPS */}
            {adminTab === "settings" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8" id="panel_configs">
                
                {/* Section A: Changer admin password */}
                <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 space-y-4 text-right">
                  <h3 className="text-lg font-extrabold text-slate-900 border-b border-slate-100 pb-3">⚙️ تعديل الرقم السري وتغييره للمشرف</h3>
                  <form onSubmit={handleAdminPasswordChange} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500 font-bold block" htmlFor="new_pass_input">الرقم السري الجديد للمشرف</label>
                      <input
                        id="new_pass_input"
                        type="password"
                        required
                        placeholder="أدخل الرقم السري الجديد..."
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-right focus:outline-none focus:ring-2 focus:ring-[#d97706] text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500 font-bold block" htmlFor="confirm_pass_input">أكد الرقم السري الجديد</label>
                      <input
                        id="confirm_pass_input"
                        type="password"
                        required
                        placeholder="أعد إدخال الرقم السري..."
                        value={confirmPasswordInput}
                        onChange={(e) => setConfirmPasswordInput(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-right focus:outline-none focus:ring-2 focus:ring-[#d97706] text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      id="btn_save_password"
                      className="bg-slate-800 hover:bg-slate-950 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition"
                    >
                      حفظ الرقم السري الجديد للمشرف
                    </button>
                  </form>
                </div>

                {/* Section B: System Admin Backup and Restore (Durable system) */}
                <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 text-right flex flex-col justify-between" style={{ minHeight: "100%" }}>
                  <div className="space-y-4">
                    <h3 className="text-lg font-extrabold text-[#d97706] border-b border-orange-100 pb-3">🛡️ أمان وحفظ قاعدة بيانات المارثون للأبد</h3>
                    
                    {/* Part 1: Local Backup & Restore */}
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
                      <h4 className="text-sm font-bold text-slate-800">📂 النسخ الاحتياطي المحلي والتصدير اليدوي</h4>
                      <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                        لأن نظام السيرفر قد يتعرض لإعادة التشغيل بمرور الوقت، ننصحك بتحميل نسخة احتياطية بشكل دوري كملف بجهازك، وفي أي وقت يمكنك رفع هذا الملف لاستعادة درجات طفولتك بالكامل!
                      </p>

                      <div className="flex flex-col sm:flex-row gap-3 pt-1">
                        {/* Exporter Button */}
                        <button
                          onClick={handleExportBackup}
                          id="btn_export_backup"
                          className="flex-1 bg-slate-800 hover:bg-slate-950 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-xs active:scale-95 cursor-pointer"
                        >
                          <FileDown className="w-4 h-4 pointer-events-none" />
                          <span>تحميل نسخة احتياطية (.json)</span>
                        </button>

                        {/* Importer Button */}
                        <label 
                          id="label_importer"
                          className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-xs hover:cursor-pointer text-center active:scale-95"
                        >
                          <FileUp className="w-4 h-4 pointer-events-none" />
                          <span>رفع استعادة قاعدة البيانات</span>
                          <input
                            type="file"
                            accept=".json"
                            onChange={handleImportBackup}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Part 2: Google Drive & Google Sheets Cloud Sync */}
                    <div className="bg-[#fcf8f2] rounded-2xl p-4 border border-[#f5e6d3] space-y-3 text-right">
                      <h4 className="text-sm font-bold text-[#b45309] flex items-center gap-2 justify-end">
                        <span>مزامنة سحابة جوجل درايف و Google Sheets</span>
                        <Cloud className="w-4 h-4 text-[#d97706]" />
                      </h4>

                      {/* Pending status message */}
                      {syncStatusMsg && (
                        <div className="bg-amber-100 border border-amber-200 text-amber-900 rounded-xl p-2 text-center text-xs font-bold animate-pulse flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>{syncStatusMsg}</span>
                        </div>
                      )}

                      {gdriveStatus !== "connected" ? (
                        <div className="space-y-3">
                          <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                            قم بربط كتابك في Google والنسخ الاحتياطي سحابياً مباشرةً داخل درايف، بالإضافة لتصدير كشوفات درجات المشتركين مُرتّبة لجدول كشف تفاعلي في Google Sheets.
                          </p>
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-bold block">
                              معرّف العميل Google Web Client ID (اختياري / افتراضي للبرنامج)
                            </label>
                            <input
                              type="text"
                              value={googleClientId}
                              onChange={(e) => setGoogleClientId(e.target.value)}
                              placeholder="أدخل Google Client ID الخاص بك..."
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-left focus:outline-none focus:ring-1 focus:ring-[#d97706] text-xs font-mono"
                            />
                          </div>
                          <button
                            onClick={handleGoogleDriveConnect}
                            className="w-full bg-[#d97706] hover:bg-[#b45309] text-white font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-md cursor-pointer"
                          >
                            <Cloud className="w-4 h-4" />
                            <span>ربط حساب Google ومزامنة درايف</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
                            <button
                              onClick={handleGoogleDriveDisconnect}
                              className="text-rose-600 hover:text-rose-800 text-[10px] font-bold border border-rose-100 hover:bg-rose-50 px-2 py-1 rounded-md transition"
                            >
                              إلغاء ربط الحساب
                            </button>
                            <span className="text-xs text-emerald-800 font-bold flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                              <span>حساب Google متّصل بنجاح</span>
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {/* Cloud Backup Button */}
                            <button
                              onClick={handleBackupToGoogleDrive}
                              disabled={isBackupInTransit}
                              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-2 px-3 rounded-xl text-xs transition flex items-center justify-center gap-1 cursor-pointer"
                            >
                              {isBackupInTransit ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Cloud className="w-3.5 h-3.5" />
                              )}
                              <span>نسخ احتياطي سحابي</span>
                            </button>

                            {/* Cloud Restore Button */}
                            <button
                              onClick={handleRestoreFromGoogleDrive}
                              disabled={isRestoreInTransit}
                              className="bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white font-bold py-2 px-3 rounded-xl text-xs transition flex items-center justify-center gap-1 cursor-pointer"
                            >
                              {isRestoreInTransit ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <HardDrive className="w-3.5 h-3.5" />
                              )}
                              <span>استعادة من درايف</span>
                            </button>
                          </div>

                          {/* Export to Google Sheets */}
                          <button
                            onClick={handleExportRankingToGoogleSheet}
                            disabled={isExportInTransit}
                            className="w-full bg-[#15803d] hover:bg-[#166534] disabled:bg-slate-300 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                          >
                            {isExportInTransit ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <FileSpreadsheet className="w-4 h-4" />
                            )}
                            <span>تصدير كشف الفتية لـ Google Sheets</span>
                          </button>

                          {googleDriveBackupDate && (
                            <p className="text-[10px] text-slate-500 text-center font-bold">
                              آخر نسخة احتياطية مرفوعة سحابياً: {googleDriveBackupDate}
                            </p>
                          )}

                          {/* Part 3: Gmail integration wrapper */}
                          <div className="bg-[#f0f4f8] rounded-2xl p-4 border border-[#d2e0f0] space-y-3 mt-4 text-right">
                            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 justify-end">
                              <span>إرسال تقرير النتائج بالبريد (Gmail)</span>
                              <Mail className="w-4 h-4 text-slate-700" />
                            </h4>
                            <p className="text-[11px] text-slate-600 leading-relaxed font-semibold">
                              أرسل كشفاً منسقاً بألوان وتصاميم مميزة يحتوي على سلم رتب ودرجات جميع الفتيان لأي بريد إلكتروني مباشرة من حسابك.
                            </p>

                            <div className="space-y-2.5 pt-1">
                              {/* Recipient email */}
                              <div className="space-y-1">
                                <div className="flex justify-between items-center">
                                  {googleUserEmail && (
                                    <button
                                      type="button"
                                      onClick={() => setGmailRecipient(googleUserEmail)}
                                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                                    >
                                      بريدي: {googleUserEmail}
                                    </button>
                                  )}
                                  <label className="text-[10px] text-slate-500 font-bold block">
                                    البريد الإلكتروني للمستلم
                                  </label>
                                </div>
                                <input
                                  type="email"
                                  value={gmailRecipient}
                                  onChange={(e) => setGmailRecipient(e.target.value)}
                                  placeholder="example@gmail.com"
                                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-left focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-slate-800 font-mono"
                                />
                              </div>

                              {/* Email Subject */}
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-bold block">
                                  عنوان الرسالة (Subject)
                                </label>
                                <input
                                  type="text"
                                  value={gmailSubject}
                                  onChange={(e) => setGmailSubject(e.target.value)}
                                  placeholder="أدخل عنوان رسالة البريد..."
                                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-right focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-slate-800 font-bold"
                                />
                              </div>

                              {/* Body introduction */}
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-bold block">
                                  مقدمة نص الرسالة (أعلى جدول الدرجات)
                                </label>
                                <textarea
                                  value={gmailBody}
                                  onChange={(e) => setGmailBody(e.target.value)}
                                  placeholder="اكتب رسالة ترحيبية أو تشجيعية للفتيان هنا..."
                                  rows={2}
                                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-right focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-slate-800"
                                />
                              </div>

                              {/* Send report email button */}
                              <button
                                onClick={handleSendReportEmail}
                                disabled={isSendingEmail}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                              >
                                {isSendingEmail ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Send className="w-4 h-4" />
                                )}
                                <span>إرسال كشف الرتب والدرجات بـ Gmail</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            )}


            {/* SUB-MODAL A: PARTICIPANT HISTORY & PRECISE SUBMISSIONS DETAIL DISPLAY */}
            <AnimatePresence>
              {selectedSubscriberForDetail && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  id="admin_sub_detail_panel"
                  className="fixed inset-0 bg-slate-950/80 backdrop-blur-md overflow-y-auto px-4 py-8 z-50 flex items-center justify-center"
                >
                  <motion.div
                    initial={{ scale: 0.95 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.95 }}
                    className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 overflow-hidden shadow-2xl text-right p-6 md:p-8 space-y-6"
                  >
                    <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                      <div>
                        <span className="text-[#d97706] text-xs font-bold block mb-1">بيانات تفصيلية للمشترك</span>
                        <h4 className="text-xl font-extrabold text-slate-900">{selectedSubscriberForDetail.name}</h4>
                      </div>
                      <button
                        onClick={() => setSelectedSubscriberForDetail(null)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full p-1.5 transition"
                      >
                        <X className="w-5 h-5 pointer-events-none" />
                      </button>
                    </div>

                    <div className="space-y-4 overflow-y-auto max-h-96 pr-2" id="sub_detail_body">
                      {/* Sub Info elements */}
                      <div className="bg-slate-50 rounded-2xl p-4 flex justify-between items-center text-xs">
                        <div>
                          <span className="text-slate-400 block mb-0.5">درجته الإجمالية</span>
                          <span className="text-lg font-black text-[#d97706] font-mono">{getSubTotalScore(selectedSubscriberForDetail)} درجة</span>
                        </div>
                        <div className="text-left">
                          <span className="text-slate-400 block mb-0.5">تاريخ أول تسجيل بالشبكة</span>
                          <span className="font-semibold text-slate-700">{new Date(selectedSubscriberForDetail.joinedAt).toLocaleDateString("ar-EG")}</span>
                        </div>
                      </div>

                      <h5 className="font-extrabold text-slate-800 text-sm">كشف الأيام المكتملة بالتفصيل:</h5>

                      {Object.keys(selectedSubscriberForDetail.solvedDays).length > 0 ? (
                        <div className="space-y-2.5">
                          {Object.keys(selectedSubscriberForDetail.solvedDays).map(dayIdStr => {
                            const dId = parseInt(dayIdStr);
                            const record = selectedSubscriberForDetail.solvedDays[dId];
                            return (
                              <div key={dayIdStr} className="border border-slate-100 rounded-xl p-3.5 flex justify-between items-center text-xs">
                                <div>
                                  <span className="font-bold text-slate-900 block">اليوم رقم {dId} من المارثون</span>
                                  <span className="text-slate-400 block mt-0.5">وقت الحل والتسجيل:</span>
                                  <span className="text-slate-500 text-[10px] font-mono leading-none font-semibold block">{formatTimestampArabic(record.solvedAt)}</span>
                                </div>
                                <div className="text-left font-mono">
                                  <span className="bg-emerald-100 text-emerald-800 rounded-lg px-2 py-1 text-xs font-bold font-mono">
                                    الدرجة: {record.score} / 3
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-slate-400 text-xs">لا يوجد أي يوم مجاب أو مكتمل حتى الآن.</div>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>


            {/* SUB-MODAL B: FULL EDIT SHEET FOR VERSES & STUDY QUESTIONS */}
            <AnimatePresence>
              {editingDay && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  id="admin_edit_day_overlay"
                  className="fixed inset-0 bg-slate-950/80 backdrop-blur-md overflow-y-auto px-4 py-8 z-50 flex items-center justify-center animate-fade-in"
                >
                  <motion.div
                    initial={{ scale: 0.95 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.95 }}
                    className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 overflow-hidden shadow-2xl text-right flex flex-col h-[90vh]"
                  >
                    
                    {/* Edit Header */}
                    <div className="bg-[#1e293b] text-white p-6 justify-between flex items-center shrink-0">
                      <div>
                        <h4 className="text-lg font-black">تحرير بيانات وتعديل محتوى اليوم رقم {editingDay.id}</h4>
                        <p className="text-xs text-slate-400 block mt-0.5">يمكنك تغيير الآيات، والأسئلة لليوم وتحديد الإجابات النموذجية.</p>
                      </div>
                      <button
                        onClick={() => setEditingDay(null)}
                        className="bg-white/10 hover:bg-white/20 text-white rounded-full p-1.5 transition"
                      >
                        <X className="w-5 h-5 pointer-events-none" />
                      </button>
                    </div>

                    <form onSubmit={handleAdminSaveDay} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                      
                      {/* Chapter configuration */}
                      <div className="space-y-1.5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <label className="text-xs text-slate-900 font-bold block" htmlFor="edit_chapter_input">الأصحاح التابع له هذا اليوم من سفر الأمثال</label>
                        <input
                          id="edit_chapter_input"
                          type="number"
                          min="1"
                          max="31"
                          required
                          value={editingDay.chapter}
                          onChange={(e) => setEditingDay({ ...editingDay, chapter: parseInt(e.target.value) || 1 })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-1 focus:ring-[#d97706]"
                        />
                      </div>

                      {/* Editing Verses Texts (Strict check Bible match Arabic) */}
                      <div className="space-y-4">
                        <h5 className="font-extrabold text-sm text-[#d97706] border-b border-orange-50 pb-1 flex items-center gap-1">
                          <BookOpen className="w-4 h-4 pointer-events-none" />
                          <span>تعديل آيات سفر الأمثال الثلاثة لليوم ومطابقتها بالتفصيل:</span>
                        </h5>

                        {editingDay.verses && editingDay.verses.map((v, vIndex) => (
                          <div key={vIndex} className="space-y-1.5 p-3.5 bg-orange-50/15 border border-orange-100 rounded-xl">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-slate-500">الآية رقم ({vIndex+1})</span>
                              <div className="flex items-center gap-1">
                                <label className="text-xs text-slate-400 font-bold">رقم الآية الفعلي في سفر الأمثال: </label>
                                <input
                                  type="number"
                                  required
                                  value={v.num}
                                  onChange={(e) => {
                                    const nextVerses = [...editingDay.verses];
                                    nextVerses[vIndex].num = parseInt(e.target.value) || 1;
                                    setEditingDay({ ...editingDay, verses: nextVerses });
                                  }}
                                  className="w-16 bg-white border border-slate-200 rounded px-1 text-center font-mono focus:outline-none"
                                />
                              </div>
                            </div>
                            
                            <textarea
                              required
                              rows={2}
                              value={v.text}
                              onChange={(e) => {
                                const nextVerses = [...editingDay.verses];
                                nextVerses[vIndex].text = e.target.value;
                                setEditingDay({ ...editingDay, verses: nextVerses });
                              }}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-right text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#d97706] font-serif"
                              placeholder="أدخل نص الآية بدقة..."
                            />
                          </div>
                        ))}
                      </div>

                      {/* Editing Questions & Answers Choices */}
                      <div className="space-y-6">
                        <h5 className="font-extrabold text-sm text-slate-900 border-b border-slate-100 pb-1 flex items-center gap-1">
                          <HelpCircle className="w-4 h-4 pointer-events-none text-slate-500" />
                          <span>تعديل الأسئلة الثلاث والخيارات والإجابة النموذجية:</span>
                        </h5>

                        {editingDay.questions && editingDay.questions.map((q, qIndex) => (
                          <div key={qIndex} className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                            <span className="bg-slate-800 text-white rounded-lg px-2 py-0.5 text-[10px] font-bold">السؤال {qIndex+1}</span>
                            
                            <div className="space-y-1">
                              <label className="text-xs text-slate-500 font-bold block">نص السؤال نفسه:</label>
                              <input
                                type="text"
                                required
                                value={q.text}
                                onChange={(e) => {
                                  const nextQs = [...editingDay.questions];
                                  nextQs[qIndex].text = e.target.value;
                                  setEditingDay({ ...editingDay, questions: nextQs });
                                }}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-right text-xs focus:ring-1 focus:ring-[#d97706] focus:outline-none"
                              />
                            </div>

                            {/* Options */}
                            <div className="space-y-2">
                              <label className="text-xs text-slate-500 font-bold block">الخيارات الثلاثة المتاحة للفتى:</label>
                              {q.options.map((opt, optIdx) => (
                                <div key={optIdx} className="flex gap-2 items-center">
                                  <span className="text-xs font-mono font-extrabold text-slate-400">({optIdx+1})</span>
                                  <input
                                    type="text"
                                    required
                                    value={opt}
                                    onChange={(e) => {
                                      const nextQs = [...editingDay.questions];
                                      nextQs[qIndex].options[optIdx] = e.target.value;
                                      setEditingDay({ ...editingDay, questions: nextQs });
                                    }}
                                    className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-right text-xs focus:ring-1 focus:ring-[#d97706] focus:outline-none"
                                  />
                                </div>
                              ))}
                            </div>

                            {/* Correct Index Lookup Dropdown */}
                            <div className="space-y-1.5 flex items-center gap-3">
                              <label className="text-xs text-amber-900 font-bold">رقم الخيار الصحيح نموذجياً الحقيقي:</label>
                              <select
                                value={q.correctIndex}
                                onChange={(e) => {
                                  const nextQs = [...editingDay.questions];
                                  nextQs[qIndex].correctIndex = parseInt(e.target.value);
                                  setEditingDay({ ...editingDay, questions: nextQs });
                                }}
                                className="bg-white border border-slate-200 rounded-lg py-1.5 px-3 text-xs focus:ring-1 focus:ring-[#d97706]"
                              >
                                <option value="0">الخيار رقم (1)</option>
                                <option value="1">الخيار رقم (2)</option>
                                <option value="2">الخيار رقم (3)</option>
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Overlay controls */}
                      <div className="pt-4 border-t border-slate-100 flex gap-3 shrink-0">
                        <button
                          type="submit"
                          className="flex-1 bg-[#d97706] hover:bg-[#b45309] text-white font-bold py-3 rounded-xl transition text-sm text-center"
                        >
                          حفظ كافة التعديلات بدقة ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDay(null)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl transition text-sm"
                        >
                          إلغاء التعديلات
                        </button>
                      </div>

                    </form>

                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        )}

      </div>


      {/* PUBLIC QR CODE MODAL AREA (عرض كود الموقع للمشاركة) */}
      <AnimatePresence>
        {qrModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setQrModalOpen(false)}
            id="qr_code_modal_backdrop"
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-sm w-full border border-slate-100 overflow-hidden shadow-2xl text-center p-6 md:p-8 space-y-6 text-right"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h4 className="text-lg font-extrabold text-slate-900">QR Code رمز الاستجابة السريعة 📲</h4>
                <button
                  onClick={() => setQrModalOpen(false)}
                  className="bg-slate-50 hover:bg-slate-200 text-slate-500 rounded-full p-1.5 transition"
                >
                  <X className="w-4 h-4 pointer-events-none" />
                </button>
              </div>

              {/* Dynamic QR API pointing to actual app root origin with elegant borders */}
              <div className="py-4 flex justify-center">
                <div className="bg-orange-50/50 p-4 rounded-3xl border border-orange-100 shadow-inner inline-block">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(window.location.origin)}`}
                    alt="أيقونة المارثون للوصول السريع"
                    referrerPolicy="no-referrer"
                    className="w-56 h-56 mx-auto rounded-xl shadow-xs"
                  />
                </div>
              </div>

              <div className="text-center space-y-2">
                <p className="font-extrabold text-slate-800 text-sm">شارك المارثون مع فتيتنا بالاجتماع!</p>
                <p className="text-slate-500 text-xs leading-relaxed max-w-xs mx-auto">
                  دع فتيانك يفتحون كاميرا الهاتف المحمول ويمسحون هذا الرمز للدخول مباشرة إلى المارثون وحل أمثال سليمان الحكيم يومياً بكل سلاسة وأريحية!
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.origin);
                    triggerToast("تم نسخ رابط الاشتراك بنجاح!", "success");
                  }}
                  className="w-full bg-[#d97706] hover:bg-[#b45309] text-white font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1"
                >
                  <Copy className="w-4 h-4 pointer-events-none" />
                  <span>نسخ رابط الاشتراك الفوري 🔗</span>
                </button>
                <div className="text-center text-[10px] text-slate-400 select-all font-mono">
                  {window.location.origin}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {subscriberToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans"
            id="delete_confirm_modal"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 text-right space-y-5"
            >
              <div className="flex items-center gap-3 text-red-600 justify-start flex-row-reverse border-b border-slate-100 pb-3">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h3 className="text-lg font-extrabold">تأكيد حذف المشترك نهائياً</h3>
              </div>
              
              <div className="space-y-3">
                <p className="text-slate-700 text-sm leading-relaxed font-semibold">
                  ⚠️ تحذير هام جداً:
                </p>
                <p className="text-slate-600 text-xs leading-relaxed">
                  هل تريد بالتأكيد حذف المشترك <span className="font-bold text-slate-950">"{subscriberToDelete.name}"</span> نهائياً من كشوفات المارثون؟
                </p>
                <p className="text-rose-600 text-xs bg-rose-50 p-3 rounded-xl border border-rose-100 leading-relaxed font-semibold">
                  سيؤدي هذا إلى حذف جميع درجاته وسجل مشاركته بالكامل من نظام كشوفات المارثون. هذا الإجراء غير قابل للتراجع عنه نهائياً!
                </p>
              </div>

              <div className="flex gap-2 flex-row-reverse">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={confirmDeleteSubscriber}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition flex-1 active:scale-95 disabled:opacity-50"
                >
                  {isDeleting ? "جاري الحذف..." : "نعم، حذف الاسم نهائياً 🗑️"}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setSubscriberToDelete(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex-1 active:scale-95"
                >
                  إلغاء التراجع ↩️
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
