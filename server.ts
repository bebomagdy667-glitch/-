/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import { DatabaseState, DayData, Subscriber } from "./src/types";

const __filename = typeof import.meta?.url === "string" ? fileURLToPath(import.meta.url) : "";
const __dirname = __filename ? path.dirname(__filename) : process.cwd();

const app = express();
const PORT = 3000;
const DB_PATH = path.join(process.cwd(), "db.json");

app.use(express.json({ limit: "50mb" }));

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

// 1. Holy Bible - Book of Proverbs Setup & Utilities
// Total 31 chapters, 915 verses.
// mapping of verses in each of the 31 chapters
const VERSES_PER_CHAPTER = [
  0, 
  33, 22, 35, 27, 23, 35, 27, 36, 18, 32, // Ch 1-10
  31, 28, 25, 35, 33, 33, 28, 24, 29, 30, // Ch 11-20
  31, 29, 35, 34, 28, 28, 27, 28, 27, 33, // Ch 21-30
  31 // Ch 31
];

// Special famous Proverb verses pre-programmed for premium accuracy and beautiful church feeling
const FAMOUS_VERSES: { [key: string]: string } = {
  "1:1": "أَمْثَالُ سُلَيْمَانَ بْنِ دَاوُدَ مَلِكِ إِسْرَائِيلَ:",
  "1:2": "لِمَعْرِفَةِ حِكْمَةٍ وَأَدَبٍ، لإِدْرَاكِ أَقْوَالِ الْفَهْمِ.",
  "1:3": "لِقَبُولِ تَأْدِيبِ الْفِطْنَةِ وَالْعَدْلِ وَالْحَقِّ وَالاِسْتِقَامَةِ.",
  "1:4": "لِتُعْطِيَ الْجُهَّالَ ذَكَاءً، وَالشَّابَّ مَعْرِفَةً وَتَدَبُّرًا.",
  "1:5": "يَسْمَعُهَا الْحَكِيمُ فَيَزْدَادُ عِلْمًا، وَالْفَهِيمُ يَكْتَسِبُ تَدْبِيرًا.",
  "1:6": "لِفَهْمِ الْمَثَلِ وَاللُّغْزِ، كَلاَمِ الْحُكَمَاءِ وَغَوَامِضِهِمْ.",
  "1:7": "رَأْسُ الْمَعْرِفَةِ مَخَافَةُ الرَّبِّ، أَمَّا الْجَاهِلُونَ فَيَحْتَقِرُونَ الْحِكْمَةَ وَالأَدَبَ.",
  "1:8": "اِسْمَعْ يَا ابْنِي تَأْدِيبَ أَبِيكَ، وَلاَ تَرْفُضْ شَرِيعَةَ أُمِّكَ،",
  "1:9": "لأَنَّهُمَا إِكْلِيلُ نِعْمَةٍ لِرَأْسِكَ، وَقَلاَئِدُ لِعُنُقِكَ.",
  "1:10": "يَا ابْنِي، إِنْ أَغْوَاكَ الْخُطَاةُ فَلاَ تَرْضَ.",
  "1:11": "إِنْ قَالُوا: «اذْهَبْ مَعَنَا لِنَكْمُنَ لِلدَّمِ. لِنَخْتَفِ لِلْبَرِيءِ بَاطِلاً.",
  "1:12": "لِنَبْتَلِعْهُمْ أَحْيَاءً كَالْهَاوِيَةِ، وَأَصِحَّاءَ كَالْهَابِطِينَ فِي الْجُبِّ،»",
  "1:13": "فَنَجِدَ كُلَّ مُقْتَنًى ثَمِينٍ، نَمْلأَ بُيُوتَنَا غَنِيمَةً.",
  "1:14": "تُلْقِي قُرْعَتَكَ بَيْنَنَا. يَكُونُ لَنَا كُلِّنَا كِيسٌ وَاحِدٌ-»",
  "1:15": "يَا ابْنِي، لاَ تَسْلُكْ فِي الطَّرِيقِ مَعَهُمْ. اِمْنَعْ رِجْلَكَ عَنْ مَسَالِكِهِمْ.",
  "3:5": "تَوَكَّلْ عَلَى الرَّبِّ بِكُلِّ قَلْبِكَ، وَعَلَى فَهْمِكَ لاَ تَعْتَمِدْ.",
  "3:6": "فِي كُلِّ طُرُقِكَ اعْرِفْهُ، وَهُوَ يُقَوِّمُ سُبُلَكَ.",
  "3:7": "لاَ تَكُنْ حَكِيمًا فِي عَيْنَيْ نَفْسِكَ. اتَّقِ الرَّبَّ وَابْعِدْ عَنِ الشَّرِّ،",
  "4:23": "فَوْقَ كُلِّ تَحَفُّظٍ احْفَظْ قَلْبَكَ، لأَنَّ مِنْهُ مَخَارِجَ الْحَيَاةِ.",
  "9:10": "بَدْءُ الْحِكْمَةِ مَخَافَةُ الرَّبِّ، وَمَعْرِفَةُ الْقُدُّوسِ فَهْمٌ.",
  "15:1": "الْجَوَابُ اللَّيِّنُ يَصْرِفُ الْغَضَبَ، وَالْكَلاَمُ الْمُوجِعُ يُهَيِّجُ السَّخَطَ.",
  "16:18": "قَبْلَ الْكَسْرِ الْكِبْرِيَاءُ، وَقَبْلَ السُّقُوطِ تَعْظِيمُ الرُّوحِ.",
  "17:22": "الْقَلْبُ الْفَرْحَانُ يُطَيِّبُ الْجِسْمَ، وَالرُّوحُ الْمُنْسَحِقَةُ تُجَفِّفُ الْعِظَامَ.",
  "18:24": "اَلْمُكْثِرُ الأَصْدِقَاءِ يُخْرِبُ نَفْسَهُ، وَلَكِنْ يُوجَدُ صَدِيقٌ أَلْزَقُ مِنَ الأَخِ.",
  "22:1": "اَلصِّيتُ أَفْضَلُ مِنَ الْغِنَى الْعَظِيمِ، وَالنِّعْمَةُ الصَّالِحَةُ أَفْضَلُ مِنَ الْفِضَّةِ وَالذَّهَبِ.",
  "22:6": "رَبِّ الْوَلَدَ فِي طَرِيقِهِ، فَمَتَى شَاخَ أَيْضاً لَا يَحِيدُ عَنْهُ.",
  "31:10": "اِمْرَأَةٌ فَاضِلَةٌ مَنْ يَجِدُهَا؟ لأَنَّ ثَمَنَهَا يَفُوقُ اللَّآلِئَ.",
  "31:30": "اَلْحُسْنُ غِشٌّ وَالْجَمَالُ بَاطِلٌ، أَمَّا الْمَرْأَةُ الْمُتَّقِيَةُ الرَّبَّ فَهِيَ تُمْدَحُ."
};

// Generates Proverbs verses mapping for 305 days
function generateDefaultDatabase(): DatabaseState {
  // Build a flat list of all 915 verses mapped sequentially
  const flatVerses: { chapter: number; verseNum: number }[] = [];
  for (let ch = 1; ch <= 31; ch++) {
    const numVerses = VERSES_PER_CHAPTER[ch];
    for (let v = 1; v <= numVerses; v++) {
      flatVerses.push({ chapter: ch, verseNum: v });
    }
  }

  const days: { [dayId: number]: DayData } = {};

  for (let d = 1; d <= 305; d++) {
    const index1 = (d - 1) * 3;
    const index2 = index1 + 1;
    const index3 = index1 + 2;

    const v1 = flatVerses[index1] || { chapter: 31, verseNum: 31 };
    const v2 = flatVerses[index2] || { chapter: 31, verseNum: 31 };
    const v3 = flatVerses[index3] || { chapter: 31, verseNum: 31 };

    // Get verses Arabic text
    const getVerseText = (ch: number, vNum: number) => {
      const key = `${ch}:${vNum}`;
      if (FAMOUS_VERSES[key]) return FAMOUS_VERSES[key];
      return `وقال سُليمان الحكيم في سفر الأمثال، أصحاح ${ch} الآية ${vNum}: «هُنا يكتب المَشرف نص الآية المُطابقة للانجيل بحسب اختياره لتسهيل الحفظ للفتيان والتأكيد والمراجعة المستمرة»`;
    };

    // Determine the main chapter for this day (take the chapter of the first verse)
    const dayChapter = v1.chapter;

    // Default questions
    const questions = [
      {
        id: 1,
        text: `بحسب قراءتك لآية سفر الأمثال أصحاح ${v1.chapter}:${v1.verseNum}، ما هو المُراد بالتعليم الأساسي؟`,
        options: ["مخافة الرب وبدء الحكمة والتعلم", "الاهتمام بالمظاهر العالمية والغِنى الفاني", "التكاسل والتهاون بالوصايا الإلهية"],
        correctIndex: 0
      },
      {
        id: 2,
        text: `وفقاً للآية الشريفة في سفر الأمثال ${v2.chapter}:${v2.verseNum}، ما الذي ينبغي على المؤمن تجنبه؟`,
        options: ["طريق الأشرار والإغواء والشر", "صنع السلام والمحبة مع الإخوة والأصدقاء", "طلب الفهم والحكمة والتواضع"],
        correctIndex: 0
      },
      {
        id: 3,
        text: `في سفر الأمثال ${v3.chapter}:${v3.verseNum}، ماذا يُشبّه الكاتب تأديب الأب وشريعة الأم لرأس الابن وعنقه؟`,
        options: ["إكليل نعمة وقلائد جميلة تزينه", "قيود ثقيلة تعوق حركته وحريته", "أحمال مؤقتة لا قيمة روحية لها"],
        correctIndex: 0
      }
    ];

    // For Day 1, specify tailored questions to make the app premium out-of-the-box
    if (d === 1) {
      questions[0] = {
        id: 1,
        text: "من هو كاتب سفر الأمثال المذكور في الأية الأولى؟",
        options: ["سليمان بن داود ملك إسرائيل", "داود النبي والملك البار", "موسى النبي مستلم الشريعة"],
        correctIndex: 0
      };
      questions[1] = {
        id: 2,
        text: "ما هو الغرض من كتابة سفر الأمثال بحسب الآية الثانية؟",
        options: ["لمعرفة حكمة وأدب ولإدراك أقوال الفهم", "للتفاخر بالعلم أمام الفتيان وباقي الناس", "لكسب الثروات العظيمة والسلطة المؤقتة"],
        correctIndex: 0
      };
      questions[2] = {
        id: 3,
        text: "ما هي الصفات التي يقبل الإنسان تأديبها في الآية الثالثة؟",
        options: ["الفطنة والعدل والحق والاستقامة", "الخوف والتردد في اتخاذ القرارات", "حب الانتقام والعداوة والخصومات"],
        correctIndex: 0
      };
    } else if (d === 2) {
      questions[0] = {
        id: 1,
        text: "لمن يعطي سفر الأمثال ذكاءً ومعرفة وتدبراً بحسب الآية الرابعة؟",
        options: ["للجهال والشاب الصغير", "للحكماء العظماء فقط", "للملوك والقادة الأقوياء فقط"],
        correctIndex: 0
      };
      questions[1] = {
        id: 2,
        text: "ماذا يحدث للشخص الحكيم والفهيم عندما يستمع لأمثال سفر الأمثال؟",
        options: ["يزداد علماً ويكتسب تَدْبيراً نافعاً", "يتكبر على الآخرين ويعتزلهم", "ينسى كل ما تعلمه من قبل"],
        correctIndex: 0
      };
      questions[2] = {
        id: 3,
        text: "ما هو الهدف من فهم المثل واللغز وكلام الحكماء بحسب الآية السادسة؟",
        options: ["لإدراك الحكمة العميقة وغوامض الأمثال", "للتسلية في أوقات الفراغ دون تطبيق عملي", "لإبهار الناس بالألغاز الصعبة فقط"],
        correctIndex: 0
      };
    } else if (d === 3) {
      questions[0] = {
        id: 1,
        text: "ما هو رأس المعرفة الحقيقية بحسب الآية السابعة؟",
        options: ["مخافة الرب الإله العظيم", "الذكاء العقلي البشري المجرد", "التفاخر بالقراءة لكي يمدحنا الناس"],
        correctIndex: 0
      };
      questions[1] = {
        id: 2,
        text: "من هو الشخص الذي يحتقر الحكمة العميقة والتأديب والأدب؟",
        options: ["الجاهلون والرافضون للتعلم", "الحكماء والمستمعون للوصية", "المرشدون الروحيون للشعب"],
        correctIndex: 0
      };
      questions[2] = {
        id: 3,
        text: "بماذا تُشبِّه الآية الثامنة والتاسعة تأديب الأب وشريعة الأم؟",
        options: ["إكليل نعمة لرأسك وقلائد لعنقك", "أصفاد حديدية ثقيلة تحبس كفاحك", "مجرد كلمات قديمة لا تناسب فتيان اليوم"],
        correctIndex: 0
      };
    }

    days[d] = {
      id: d,
      chapter: dayChapter,
      verses: [
        { num: v1.verseNum, text: getVerseText(v1.chapter, v1.verseNum) },
        { num: v2.verseNum, text: getVerseText(v2.chapter, v2.verseNum) },
        { num: v3.verseNum, text: getVerseText(v3.chapter, v3.verseNum) }
      ],
      questions: questions,
      isOpen: d === 1 // Only day 1 is open by default
    };
  }

  return {
    password: "123", // Easy default password "123"
    days,
    subscribers: []
  };
}

// Loads/creates state
function getDatabaseState(): DatabaseState {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const defaultState = generateDefaultDatabase();
      fs.writeFileSync(DB_PATH, JSON.stringify(defaultState, null, 2), "utf-8");
      return defaultState;
    }
    const data = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading database file, resetting to default:", err);
    return generateDefaultDatabase();
  }
}

function saveDatabaseState(state: DatabaseState) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving database file:", err);
  }
}

// Enriches subscriber solvedDays with the correctAnswers indices dynamically
function getEnrichedSubscriber(sub: Subscriber): Subscriber {
  const enriched: Subscriber = JSON.parse(JSON.stringify(sub));
  for (const dayId in enriched.solvedDays) {
    const dId = parseInt(dayId);
    const day = dbState.days[dId];
    if (day) {
      enriched.solvedDays[dId].correctAnswers = day.questions.map(q => q.correctIndex);
    }
  }
  return enriched;
}

// Initialize database
let dbState = getDatabaseState();

// 2. REST API Routes for Application

// Public Config
app.get("/api/config", (req, res) => {
  res.json({ title: "مارثون سفر الأمثال" });
});

// Participant login / status check
app.post("/api/participant/login", (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) {
    return res.status(400).json({ error: "اسم المشترك مطلوب لطلب التسجيل" });
  }

  dbState = getDatabaseState();
  const normalizedIncoming = normalizeArabicName(name);
  let sub = dbState.subscribers.find(s => normalizeArabicName(s.name) === normalizedIncoming);

  if (!sub) {
    sub = {
      id: "sub_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      name: name,
      joinedAt: new Date().toISOString(),
      solvedDays: {}
    };
    dbState.subscribers.push(sub);
    saveDatabaseState(dbState);
  }

  res.json({ participant: getEnrichedSubscriber(sub) });
});

// Participant sync/restore local backup endpoint (Self-healing system)
app.post("/api/participant/sync-backup", (req, res) => {
  const { name, backup } = req.body;
  if (!name || !backup) {
    return res.status(400).json({ error: "البيانات المطلوبة غير مكتملة" });
  }

  dbState = getDatabaseState();
  const normalizedIncoming = normalizeArabicName(name);
  let sub = dbState.subscribers.find(s => normalizeArabicName(s.name) === normalizedIncoming);

  if (!sub) {
    // If the server was wiped/restarted, restore the subscriber completely from client's local storage
    sub = {
      id: backup.id || "sub_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      name: backup.name || name,
      joinedAt: backup.joinedAt || new Date().toISOString(),
      solvedDays: backup.solvedDays || {}
    };
    dbState.subscribers.push(sub);
    saveDatabaseState(dbState);
  } else {
    // Merge solvedDays to ensure no answers are lost
    let modified = false;
    const backupSolvedDays = backup.solvedDays || {};
    for (const dId in backupSolvedDays) {
      if (!sub.solvedDays[dId]) {
        sub.solvedDays[dId] = backupSolvedDays[dId];
        modified = true;
      }
    }
    if (modified) {
      saveDatabaseState(dbState);
    }
  }

  res.json({ participant: getEnrichedSubscriber(sub) });
});

// Get participant status
app.get("/api/participant/status/:name", (req, res) => {
  const name = req.params.name.trim();
  dbState = getDatabaseState();
  const sub = dbState.subscribers.find(s => normalizeArabicName(s.name) === normalizeArabicName(name));
  
  if (!sub) {
    return res.status(404).json({ error: "المشترك غير مسجل حالياً" });
  }
  res.json({ participant: getEnrichedSubscriber(sub) });
});

// Submit answers for a specific day
app.post("/api/participant/submit/:name/:dayId", (req, res) => {
  const name = req.params.name.trim();
  const dayId = parseInt(req.params.dayId);
  const answers = req.body.answers; // e.g. [0, 1, 2]

  if (!Array.isArray(answers) || answers.length !== 3) {
    return res.status(400).json({ error: "يجب تقديم إجابات لجميع الأسئلة الثلاثة" });
  }

  dbState = getDatabaseState();
  const sub = dbState.subscribers.find(s => normalizeArabicName(s.name) === normalizeArabicName(name));
  if (!sub) {
    return res.status(404).json({ error: "المشترك غير موجود في كشوفات المارثون" });
  }

  const day = dbState.days[dayId];
  if (!day) {
    return res.status(404).json({ error: "اليوم المطلوب غير موجود" });
  }

  if (!day.isOpen) {
    return res.status(403).json({ error: "عفواً، هذا اليوم مغلق حالياً من قِبل المشرف" });
  }

  if (sub.solvedDays[dayId]) {
    return res.status(403).json({ error: "لقد قمت بإجابة أسئلة هذا اليوم بالفعل، ولا يمكنك إعادتها مرة أخرى" });
  }

  // Calculate score
  let score = 0;
  day.questions.forEach((q, idx) => {
    if (q.correctIndex === answers[idx]) {
      score++;
    }
  });

  const egyptTime = new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" });
  const egyptianSubmitTime = new Date(egyptTime).toISOString();

  sub.solvedDays[dayId] = {
    solvedAt: egyptianSubmitTime,
    answers: answers,
    score: score,
    correctAnswers: day.questions.map(q => q.correctIndex)
  };

  saveDatabaseState(dbState);

  res.json({
    score: score,
    correctAnswers: day.questions.map(q => q.correctIndex),
    solvedAt: egyptianSubmitTime
  });
});

// Public view for days list (removes answers indices for secure anti-cheating)
app.get("/api/days/public", (req, res) => {
  dbState = getDatabaseState();
  const publicDays: { [key: number]: any } = {};

  for (const dayId in dbState.days) {
    const day = dbState.days[dayId];
    // Strip correct index to prevent F12 cheats
    const safeQuestions = day.questions.map(q => ({
      id: q.id,
      text: q.text,
      options: q.options
    }));

    publicDays[dayId] = {
      id: day.id,
      chapter: day.chapter,
      verses: day.verses,
      questions: safeQuestions,
      isOpen: day.isOpen
    };
  }

  res.json({ days: publicDays });
});

// Admin verify password & login
app.post("/api/admin/login", (req, res) => {
  const password = req.body.password;
  dbState = getDatabaseState();

  if (password === dbState.password) {
    return res.json({ success: true });
  }
  return res.status(401).json({ error: "كلمة المرور غير صحيحة" });
});

// Fetch full configuration & stats (Admin Only, validates with password payload)
app.post("/api/admin/data", (req, res) => {
  const password = req.body.password;
  dbState = getDatabaseState();

  if (password !== dbState.password) {
    return res.status(401).json({ error: "غير مصرح لك بالدخول، يرجى التثبت من كلمة المرور" });
  }

  res.json(dbState);
});

// Toggle day status
app.post("/api/admin/toggle-day", (req, res) => {
  const { password, dayId, isOpen } = req.body;
  dbState = getDatabaseState();

  if (password !== dbState.password) {
    return res.status(401).json({ error: "غير مصرح لك بفتح أو غلق الأيام" });
  }

  const dId = parseInt(dayId);
  if (dbState.days[dId]) {
    dbState.days[dId].isOpen = !!isOpen;
    saveDatabaseState(dbState);
    return res.json({ success: true });
  }

  res.status(404).json({ error: "اليوم المحدد غير مسجل" });
});

// Edit specific day (verses & questions)
app.post("/api/admin/edit-day", (req, res) => {
  const { password, dayId, dayData } = req.body;
  dbState = getDatabaseState();

  if (password !== dbState.password) {
    return res.status(401).json({ error: "غير مصرح لك بتعديل بيانات الأيام والآيات" });
  }

  const dId = parseInt(dayId);
  if (dbState.days[dId] && dayData) {
    dbState.days[dId].verses = dayData.verses;
    dbState.days[dId].questions = dayData.questions;
    dbState.days[dId].chapter = parseInt(dayData.chapter) || dbState.days[dId].chapter;
    saveDatabaseState(dbState);
    return res.json({ success: true, updatedDay: dbState.days[dId] });
  }

  res.status(404).json({ error: "اليوم المحدد غير صحيح أو لم يتقبل البيانات الجديدة" });
});

// Change Admin Password
app.post("/api/admin/change-password", (req, res) => {
  const { currentPassword, newPassword } = req.body;
  dbState = getDatabaseState();

  if (currentPassword !== dbState.password) {
    return res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
  }

  if (!newPassword || newPassword.trim().length === 0) {
    return res.status(400).json({ error: "كلمة المرور الجديدة لا يمكن أن تكون فارغة" });
  }

  dbState.password = newPassword.trim();
  saveDatabaseState(dbState);

  res.json({ success: true });
});

// Delete specific subscriber
app.post("/api/admin/delete-subscriber", (req, res) => {
  const { password, subscriberId } = req.body;
  dbState = getDatabaseState();

  if (password !== dbState.password) {
    return res.status(401).json({ error: "غير مصرح لك بحذف المشتركين من النتائج" });
  }

  const initialLength = dbState.subscribers.length;
  dbState.subscribers = dbState.subscribers.filter(sub => sub.id !== subscriberId);

  if (dbState.subscribers.length === initialLength) {
    return res.status(404).json({ error: "المشترك المطلوب حذفه لم يتم العثور عليه" });
  }

  saveDatabaseState(dbState);
  res.json({ success: true });
});

// Restore backup file data
app.post("/api/admin/restore-backup", (req, res) => {
  const { password, backup } = req.body;
  dbState = getDatabaseState();

  if (password !== dbState.password) {
    return res.status(401).json({ error: "غير مصرح لحضرتك باستعادة البيانات السابقة" });
  }

  if (!backup || !backup.days || !Array.isArray(backup.subscribers)) {
    return res.status(400).json({ error: "المستند المرفوع لا يطابق تركيبة قواعد معطيات المارثون" });
  }

  dbState.days = backup.days;
  dbState.subscribers = backup.subscribers;
  if (backup.password) {
    dbState.password = backup.password;
  }

  saveDatabaseState(dbState);
  res.json({ success: true });
});


// 3. Integrated Vite setup (handles assets and single page layout client-side)
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PROVERBS MARATHON SERVER listening on http://localhost:${PORT}`);
  });
}

startServer();
