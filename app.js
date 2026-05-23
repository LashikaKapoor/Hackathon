const classrooms = [
  {
    name: "Google Classroom 1",
    code: "veleddga",
    url: "https://classroom.google.com/w/ODY1ODY5NjU1NTIz",
    className: "Classroom A"
  },
  {
    name: "Google Classroom 2",
    code: "iz647o7e",
    url: "https://classroom.google.com/w/ODY1ODY4MzczNDI5",
    className: "Classroom B"
  },
  {
    name: "Google Classroom 3",
    code: "555xgzdi",
    url: "https://classroom.google.com/w/ODY1ODY5MzE2NjE5",
    className: "Classroom C"
  }
];

const defaultTools = [
  { title: "Writing", text: "Essay outline, citation tracker, draft checklist", className: "English" },
  { title: "Math", text: "Formula sheet, calculator, problem set planner", className: "Math" },
  { title: "Science", text: "Lab notes, research links, unit vocabulary", className: "Science" },
  { title: "Planning", text: "Daily workload sorter, priority queue, calendar", className: "All classes" },
  { title: "Review", text: "Flashcards, quiz reminders, study timer", className: "Tests" },
  { title: "Meetings", text: "Voice notes that catch assignment keywords", className: "Live class" }
];

const assignmentKeywords = ["assignment", "assignments", "homework", "project", "quiz", "test", "essay", "worksheet", "lab", "deadline", "presentation"];
const takeawayKeywords = ["concept", "remember", "important", "key point", "definition", "means", "because", "therefore", "today we learned", "main idea"];
const storageKey = "assignmentHubData";
const extensionStorageKey = "assignmentHubImported";

let state = loadState();
let calendarDate = new Date();
let timerSeconds = 25 * 60;
let timerId = null;
let timerMode = "Study";
let recognition = null;
let lastVoicePreview = "";

const $ = (id) => document.getElementById(id);

function makeId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    const parsed = JSON.parse(saved);
    return {
      ...parsed,
      keyTakeaways: parsed.keyTakeaways || [],
    };
  }

  const today = new Date();
  const plusDays = (days) => {
    const date = new Date(today);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };

  return {
    assignments: [
      {
        id: makeId(),
        title: "Finish missing homework scan",
        className: "Classroom A",
        due: plusDays(1),
        priority: "High",
        category: "Homework",
        tags: ["missing", "google-classroom"],
        minutes: 45
      },
      {
        id: makeId(),
        title: "Plan project checkpoints",
        className: "Classroom B",
        due: plusDays(4),
        priority: "Medium",
        category: "Project",
        tags: ["group-work"],
        minutes: 60
      }
    ],
    sources: [
      "https://mail.google.com",
      "https://calendar.google.com"
    ],
    dailyHours: 2,
    breaksEnabled: true,
    voiceEnabled: true,
    keyTakeaways: [],
  };
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  saveStateToExtension();
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function daysUntil(value) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${value}T00:00:00`);
  return Math.ceil((due - today) / 86400000);
}

function setupOptions() {
  const classes = classrooms.map((item) => item.className);
  $("classInput").innerHTML = classes.map((name) => `<option>${name}</option>`).join("");
  $("filterClass").innerHTML = `<option value="All">All classes</option>${classes.map((name) => `<option>${name}</option>`).join("")}`;
}

function renderClassrooms() {
  $("classroomList").innerHTML = classrooms.map((room) => `
    <div class="source-card">
      <div>
        <strong>${room.className}</strong>
        <p class="source-note">${room.name} · Join code: ${room.code}</p>
      </div>
      <a href="${room.url}" target="_blank" rel="noreferrer">Open</a>
    </div>
  `).join("");
}

function renderSources() {
  $("sourceList").innerHTML = state.sources.map((source, index) => `
    <div class="source-card">
      <div>
        <strong>${new URL(source).hostname}</strong>
        <p class="source-note">Added scan source</p>
      </div>
      <button class="complete-btn" data-remove-source="${index}">Remove</button>
    </div>
  `).join("");
}

function renderAssignments() {
  const list = $("assignmentList");
  const classFilter = $("filterClass").value;
  const priorityFilter = $("filterPriority").value;
  const assignments = dedupeAssignments([...state.assignments])
    .filter((item) => classFilter === "All" || item.className === classFilter)
    .filter((item) => priorityFilter === "All" || item.priority === priorityFilter)
    .sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority) || new Date(a.due) - new Date(b.due));

  if (!assignments.length) {
    list.innerHTML = `<div class="empty">No assignments match this view.</div>`;
    return;
  }

  const template = $("assignmentTemplate");
  list.innerHTML = "";
  assignments.forEach((item) => {
    const clone = template.content.cloneNode(true);
    clone.querySelector(".task-title").textContent = item.title;
    clone.querySelector(".task-meta").textContent = getAssignmentMeta(item);
    clone.querySelector(".tag-row").innerHTML = getVisibleTags(item).map((tag) => `<span class="tag">${tag}</span>`).join("");
    const pill = clone.querySelector(".priority-pill");
    pill.textContent = item.priority;
    pill.classList.add(`priority-${item.priority}`);
    clone.querySelector(".complete-btn").dataset.completeId = item.id;
    list.appendChild(clone);
  });
}

function getAssignmentMeta(item) {
  const timeText = item.dueTime ? ` at ${item.dueTime}` : "";
  if (item.tags?.includes("google-classroom")) {
    return `${item.className} - ${item.personName || "Teacher"} - Due ${formatDate(item.due)}${timeText}`;
  }

  return `${item.className} - ${item.category || "General"} - Due ${formatDate(item.due)}${timeText} - ${item.minutes} min`;
}

function getVisibleTags(item) {
  if (item.tags?.includes("google-classroom")) {
    return [item.itemType || "Assignment"];
  }

  return item.tags || [];
}

function renderStats() {
  const dueSoon = state.assignments.filter((item) => daysUntil(item.due) <= 3 && daysUntil(item.due) >= 0).length;
  const highPriority = state.assignments.filter((item) => item.priority === "High").length;
  $("dueSoonCount").textContent = dueSoon;
  $("totalAssignments").textContent = state.assignments.length;
  if ($("highPriorityCount")) $("highPriorityCount").textContent = highPriority;
}

function renderPlan() {
  const minutesAvailable = Number(state.dailyHours) * 60;
  const sorted = [...state.assignments].sort((a, b) => {
    const priorityScore = { High: 0, Medium: 1, Low: 2 };
    return priorityScore[a.priority] - priorityScore[b.priority] || new Date(a.due) - new Date(b.due);
  });

  let used = 0;
  const todayTasks = [];
  for (const task of sorted) {
    if (used + Number(task.minutes) <= minutesAvailable || !todayTasks.length) {
      todayTasks.push(task);
      used += Number(task.minutes);
    }
  }

  $("studyPlan").innerHTML = `
    <strong>Today's auto plan</strong>
    <p>${todayTasks.map((task) => task.title).join(", ") || "Add an assignment to build a plan."}</p>
    <p>${Math.min(used, minutesAvailable)} of ${minutesAvailable} minutes scheduled.</p>
  `;
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const blanks = firstDay.getDay();
  const monthName = calendarDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  $("calendarTitle").textContent = monthName;

  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = names.map((name) => `<div class="day-name">${name}</div>`).join("");
  html += Array.from({ length: blanks }, () => `<div></div>`).join("");

  for (let day = 1; day <= lastDay; day++) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const tasks = state.assignments.filter((item) => item.due === date);
    html += `
      <div class="calendar-day">
        <strong>${day}</strong>
        ${tasks.slice(0, 2).map((task) => `<span class="dot">${task.title}</span>`).join("")}
      </div>
    `;
  }
  $("calendar").innerHTML = html;
}

function renderTools() {
  $("toolList").innerHTML = defaultTools.map((tool) => `
    <div class="tool-card">
      <strong>${tool.title}</strong>
      <p class="source-note">${tool.className}</p>
      <p>${tool.text}</p>
    </div>
  `).join("");
}

function renderTakeaways() {
  const list = $("takeawayList");
  if (!state.keyTakeaways.length) {
    list.innerHTML = `<div class="empty">Voice notes with important concepts will appear here.</div>`;
    return;
  }

  list.innerHTML = state.keyTakeaways.map((item) => `
    <div class="takeaway-card">
      <strong>${item.text}</strong>
      <p>${item.className} - captured ${formatDate(item.date)}</p>
    </div>
  `).join("");
}

function renderAll() {
  $("dailyHours").value = state.dailyHours;
  $("breakToggle").checked = state.breaksEnabled;
  $("voiceEnabled").checked = state.voiceEnabled;
  $("emailInput").value = state.emailAddress || "";
  renderClassrooms();
  renderSources();
  renderAssignments();
  renderStats();
  renderPlan();
  renderCalendar();
  renderTools();
  renderTakeaways();
}

function addAssignment(data) {
  const assignment = {
    id: makeId(),
    title: cleanAssignmentTitle(data.title),
    personName: data.personName || "",
    itemType: data.itemType || "Assignment",
    className: data.className,
    due: data.due,
    dueTime: data.dueTime || "",
    priority: data.priority,
    category: data.category || "General",
    tags: data.tags || [],
    minutes: Number(data.minutes) || 30,
    source: data.source || ""
  };

  const alreadyExists = state.assignments.some((item) => assignmentKey(item) === assignmentKey(assignment));
  if (alreadyExists) return;

  state.assignments.push(assignment);
  saveState();
  renderAll();
}

function completeAssignment(id) {
  state.assignments = state.assignments.filter((item) => item.id !== id);
  saveState();
  renderAll();
}

function cleanAssignmentTitle(title) {
  return String(title || "Imported Classroom assignment")
    .replace(/\s+/g, " ")
    .replace(/^assignment[:\s-]*/i, "")
    .replace(/\s+due\s+.*$/i, "")
    .slice(0, 90)
    .trim();
}

function assignmentKey(item) {
  return `${item.className}|${cleanAssignmentTitle(item.title)}|${item.personName || ""}|${item.due}|${item.dueTime || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, " ")
    .trim();
}

function dedupeAssignments(assignments) {
  const seen = new Set();
  return assignments.filter((item) => {
    const key = assignmentKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function priorityWeight(priority) {
  return { High: 0, Medium: 1, Low: 2 }[priority] ?? 3;
}

async function scanSources() {
  const button = $("scanNowBtn");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Scanning...";

  if (isExtensionReady()) {
    await scanClassroomsWithExtension();
    button.disabled = false;
    button.textContent = originalText;
    return;
  }

  setScanStatus("This page is open as a normal file, so Chrome will not let it scan Google Classroom. Go to chrome://extensions, reload Assignment Hub, then open it from the extension icon and click Scan sources.", "scan-error");
  button.disabled = false;
  button.textContent = originalText;
}

function isExtensionReady() {
  return typeof chrome !== "undefined" && chrome.runtime?.id && chrome.storage?.local;
}

function scanClassroomsWithExtension() {
  setScanStatus("Scanning the three Classroom pages. Stay signed into Google Classroom in Chrome.", "");
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "SCAN_CLASSROOMS" }, (response) => {
      if (chrome.runtime.lastError) {
        setScanStatus(`Scan failed: ${chrome.runtime.lastError.message}`, "scan-error");
        resolve();
        return;
      }

      if (!response?.ok) {
        setScanStatus(`Scan failed: ${response?.error || "Unknown error"}`, "scan-error");
        resolve();
        return;
      }

      mergeImportedAssignments(response.assignments || []);
      const errorNote = response.errors?.length ? ` Some pages had issues: ${response.errors.join("; ")}` : "";
      setScanStatus(`Imported ${response.count} Classroom items, sorted by due date and priority.${errorNote}`, "scan-success");
      resolve();
    });
  });
}

function mergeImportedAssignments(assignments) {
  const scannedClasses = new Set(assignments.map((assignment) => assignment.className));
  state.assignments = state.assignments.filter((assignment) =>
    !assignment.tags?.includes("google-classroom") || !scannedClasses.has(assignment.className)
  );

  assignments.forEach((assignment) => {
    addAssignment({
      ...assignment,
      tags: [...new Set([...(assignment.tags || []), "imported"])]
    });
  });
  renderAll();
}

function saveStateToExtension() {
  if (!isExtensionReady()) return;
  chrome.storage.local.set({ assignmentHubState: state });
}

function loadImportedAssignmentsFromExtension() {
  if (!isExtensionReady()) return;
  chrome.storage.local.get([extensionStorageKey, "assignmentHubLastScan"], (data) => {
    const imported = data[extensionStorageKey] || [];
    if (imported.length) {
      mergeImportedAssignments(imported);
      const when = data.assignmentHubLastScan ? new Date(data.assignmentHubLastScan).toLocaleString() : "recently";
      setScanStatus(`Loaded ${imported.length} Classroom items from the last scan (${when}).`, "scan-success");
    } else {
      setScanStatus("Extension mode is ready. Click Scan sources to check all three Google Classroom links.", "");
    }
  });
}

function setScanStatus(message, className) {
  const status = $("scanStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `source-note ${className || ""}`.trim();
}

function setEmailStatus(message, className) {
  const status = $("emailStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `source-note ${className || ""}`.trim();
}

function setupVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    $("voiceStatus").textContent = "Speech recognition is not supported in this browser. Try Chrome on Android for real-time listening.";
    $("voiceBtn").disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    let finalText = "";
    let previewText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const phrase = event.results[i][0].transcript;
      previewText += phrase;
      if (event.results[i].isFinal) finalText += phrase;
    }
    lastVoicePreview = previewText.trim() || lastVoicePreview;
    $("transcript").textContent = previewText.trim() || "Listening...";
    if (finalText.trim()) processVoiceTranscript(finalText);
  };

  recognition.onend = () => {
    $("voiceBtn").textContent = "Start listening";
    if (lastVoicePreview) processVoiceTranscript(lastVoicePreview);
  };
}

function processVoiceTranscript(text) {
  if (!state.voiceEnabled) return;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || wasVoiceTextHandled(clean)) return;
  captureImportantAssignment(clean);
  captureKeyTakeaway(clean);
}

function captureImportantAssignment(text) {
  const lower = text.toLowerCase();
  const heardAssignment = assignmentKeywords.some((word) => lower.includes(word));
  const dueInfo = extractVoiceDueInfo(text);
  if (!heardAssignment || !dueInfo.date) return;

  const title = extractVoiceAssignmentTitle(text);
  const alreadyOnCalendar = state.assignments.some((item) =>
    cleanAssignmentTitle(item.title) === cleanAssignmentTitle(title) &&
    item.due === dueInfo.date
  );
  if (alreadyOnCalendar) return;

  addAssignment({
    title,
    className: $("classInput").value,
    due: dueInfo.date,
    dueTime: dueInfo.time,
    priority: "Medium",
    category: "Voice note",
    tags: ["voice", "auto-captured"],
    minutes: 30
  });
}

function captureKeyTakeaway(text) {
  const lower = text.toLowerCase();
  const dueInfo = extractVoiceDueInfo(text);
  const isAssignmentDate = Boolean(dueInfo.date) && assignmentKeywords.some((word) => lower.includes(word));
  const learningText = extractLearningTakeawayText(text);
  const isConceptNote = takeawayKeywords.some((word) => lower.includes(word));
  const shouldSaveAsNote = Boolean(learningText) || (!isAssignmentDate && isConceptNote);
  if (!shouldSaveAsNote) return;

  const sentence = learningText || getBriefVoiceNote(text);
  if (!sentence) return;

  const alreadySaved = state.keyTakeaways.some((item) => normalizeText(item.text) === normalizeText(sentence));
  if (alreadySaved) return;

  state.keyTakeaways.unshift({
    id: makeId(),
    text: sentence,
    className: $("classInput").value,
    date: new Date().toISOString().slice(0, 10)
  });
  state.keyTakeaways = state.keyTakeaways.slice(0, 20);
  saveState();
  renderTakeaways();
}

function getBriefVoiceNote(text) {
  return getBestTakeawaySentence(text) || text.replace(/\s+/g, " ").trim().slice(0, 150);
}

function extractLearningTakeawayText(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const beforeAssessment = cleaned.split(/\b(?:we will have|we have|there will be|there is|you will have|you have|we're having|you'll have)\b/i)[0];
  const beforeDirectTask = beforeAssessment.split(/\b(?:test|quiz|project|presentation|essay|worksheet|homework|assignment)\b/i)[0];
  const withoutDateWords = beforeDirectTask
    .replace(/\b(?:due|deadline|on|by)\b.*$/i, "")
    .replace(/[,.]\s*$/g, "")
    .trim();

  if (!withoutDateWords) return "";
  if (assignmentKeywords.some((word) => normalizeText(withoutDateWords).split(" ").includes(word))) return "";
  if (extractVoiceDueInfo(withoutDateWords).date) return "";
  if (withoutDateWords.length < 12) return "";
  return withoutDateWords.slice(0, 150);
}

function extractVoiceAssignmentTitle(text) {
  const learningTopic = extractLearningTakeawayText(text);
  const assessmentMatch = text.match(/\b(test|quiz|project|presentation|essay|worksheet|lab|homework|assignment)\b/i);
  if (assessmentMatch && learningTopic) {
    return `${capitalize(assessmentMatch[1])}: ${learningTopic}`;
  }

  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/(?:due|deadline|by|on)\s+.*$/i, "")
    .replace(/^(remember|important|the)?\s*/i, "")
    .trim();

  return cleaned.slice(0, 80) || "Voice captured assignment";
}

function extractVoiceDueInfo(text) {
  const time = extractVoiceTime(text);
  const lower = text.toLowerCase();
  const monthMatch = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:,\s*(\d{4}))?/i);
  if (monthMatch) {
    const date = new Date(Number(monthMatch[3]) || new Date().getFullYear(), voiceMonthIndex(monthMatch[1]), Number(monthMatch[2]));
    if (!monthMatch[3] && date < startOfToday()) date.setFullYear(date.getFullYear() + 1);
    return { date: date.toISOString().slice(0, 10), time };
  }

  const relativeMatch = lower.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (relativeMatch) return { date: guessDueDate(relativeMatch[1]), time };

  const numericMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i);
  if (numericMatch) {
    const rawYear = numericMatch[3];
    const year = rawYear ? (Number(rawYear) < 100 ? 2000 + Number(rawYear) : Number(rawYear)) : new Date().getFullYear();
    return { date: new Date(year, Number(numericMatch[1]) - 1, Number(numericMatch[2])).toISOString().slice(0, 10), time };
  }

  return { date: "", time };
}

function guessDueDate(word) {
  const date = new Date();
  if (word === "tomorrow") date.setDate(date.getDate() + 1);
  if (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].includes(word)) {
    const target = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(word);
    const diff = (target + 7 - date.getDay()) % 7 || 7;
    date.setDate(date.getDate() + diff);
  }
  return date.toISOString().slice(0, 10);
}

function voiceMonthIndex(name) {
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .findIndex((month) => name.toLowerCase().startsWith(month));
}

function extractVoiceTime(text) {
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)\b/i);
  if (!match) return "";

  let hour = Number(match[1]);
  const minute = match[2] || "00";
  const period = match[3].toLowerCase();
  if (period.startsWith("p") && hour < 12) hour += 12;
  if (period.startsWith("a") && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function buildDateTakeaway(text, dueInfo) {
  const title = extractVoiceAssignmentTitle(text);
  const dateText = formatDate(dueInfo.date);
  const timeText = dueInfo.time ? ` at ${dueInfo.time}` : "";
  return `${title} - ${dateText}${timeText}`;
}

function capitalize(text) {
  const value = String(text || "");
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function wasVoiceTextHandled(text) {
  const key = normalizeText(text);
  if (!wasVoiceTextHandled.cache) wasVoiceTextHandled.cache = new Set();
  if (wasVoiceTextHandled.cache.has(key)) return true;
  wasVoiceTextHandled.cache.add(key);
  if (wasVoiceTextHandled.cache.size > 50) {
    wasVoiceTextHandled.cache = new Set([...wasVoiceTextHandled.cache].slice(-25));
  }
  return false;
}

function getBestTakeawaySentence(text) {
  const sentences = text
    .split(/[.!?]/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 18 && sentence.length <= 160);

  const picked = sentences.find((sentence) =>
    takeawayKeywords.some((word) => sentence.toLowerCase().includes(word))
  ) || sentences[0];

  return picked ? picked.slice(0, 150) : "";
}

function normalizeText(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildLatestAssignmentsEmail() {
  const latest = [...state.assignments]
    .sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority) || new Date(a.due) - new Date(b.due))
    .slice(0, 8);

  if (!latest.length) {
    return {
      subject: "Stacked: no assignments right now",
      body: "You are all caught up. Nice work.\n\n- Stacked"
    };
  }

  const lines = latest.map((item, index) => {
    const timeText = item.dueTime ? ` at ${item.dueTime}` : "";
    return `${index + 1}. ${item.title}\n   Class: ${item.className}\n   Due: ${formatDate(item.due)}${timeText}\n   Priority: ${item.priority}`;
  });

  return {
    subject: `Stacked: ${latest.length} latest assignment${latest.length === 1 ? "" : "s"}`,
    body: `Here are your latest assignments:\n\n${lines.join("\n\n")}\n\nPoints earned: ${state.points || 0}\n\n- Stacked`
  };
}

function sendEmailDigest(event) {
  event.preventDefault();
  const email = $("emailInput").value.trim();
  if (!email) {
    setEmailStatus("Add an email address first.", "scan-error");
    return;
  }

  state.emailAddress = email;
  saveState();

  const digest = buildLatestAssignmentsEmail();
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(digest.subject)}?body=${encodeURIComponent(digest.body)}`;
  window.location.href = mailto;
  setEmailStatus("Your email app should open with the latest assignment digest ready to send.", "scan-success");
}

function setupEvents() {
  $("emailForm").addEventListener("submit", sendEmailDigest);

  $("assignmentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    addAssignment({
      title: $("titleInput").value,
      className: $("classInput").value,
      due: $("dueInput").value,
      priority: $("priorityInput").value,
      category: $("categoryInput").value,
      tags: $("tagsInput").value.split(",").map((tag) => tag.trim()).filter(Boolean),
      minutes: $("minutesInput").value
    });
    event.target.reset();
  });

  $("sourceForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = $("sourceInput").value.trim();
    if (!value) return;
    state.sources.push(value);
    $("sourceInput").value = "";
    saveState();
    renderSources();
  });

  document.addEventListener("click", (event) => {
    const completeId = event.target.dataset.completeId;
    const removeSource = event.target.dataset.removeSource;
    if (completeId) {
      completeAssignment(completeId);
    }
    if (removeSource !== undefined) {
      state.sources.splice(Number(removeSource), 1);
      saveState();
      renderSources();
    }
  });

  $("filterClass").addEventListener("change", renderAssignments);
  $("filterPriority").addEventListener("change", renderAssignments);
  $("dailyHours").addEventListener("input", (event) => {
    state.dailyHours = Number(event.target.value);
    saveState();
    renderPlan();
  });
  $("breakToggle").addEventListener("change", (event) => {
    state.breaksEnabled = event.target.checked;
    saveState();
  });
  $("voiceEnabled").addEventListener("change", (event) => {
    state.voiceEnabled = event.target.checked;
    saveState();
  });
  $("clearTakeawaysBtn").addEventListener("click", () => {
    state.keyTakeaways = [];
    saveState();
    renderTakeaways();
  });
  $("prevMonth").addEventListener("click", () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
  });
  $("nextMonth").addEventListener("click", () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
  });
  $("scanNowBtn").addEventListener("click", scanSources);
  $("openDashboardBtn").addEventListener("click", openDashboard);
  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "assignment-hub-export.json";
    link.click();
  });
  $("voiceBtn").addEventListener("click", () => {
    if (!recognition) return;
    if ($("voiceBtn").textContent.includes("Start")) {
      recognition.start();
      $("voiceBtn").textContent = "Stop listening";
      $("voiceStatus").textContent = "Listening now. Say assignment details out loud.";
    } else {
      recognition.stop();
    }
  });
  $("startTimer").addEventListener("click", toggleTimer);
  $("resetTimer").addEventListener("click", resetTimer);
}

function openDashboard() {
  if (isExtensionReady()) {
    window.open(chrome.runtime.getURL("index.html"), "_blank");
    return;
  }

  setScanStatus("The full synced dashboard only works after loading this folder as a Chrome extension. Open it from the extension icon, then use Open dashboard.", "scan-error");
}

function toggleTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
    $("startTimer").textContent = "Start";
    return;
  }
  $("startTimer").textContent = "Pause";
  timerId = setInterval(() => {
    timerSeconds -= 1;
    updateTimerDisplay();
    if (timerSeconds <= 0) {
      clearInterval(timerId);
      timerId = null;
      if (state.breaksEnabled && timerMode === "Study") {
        timerMode = "Break";
        timerSeconds = 5 * 60;
      } else {
        timerMode = "Study";
        timerSeconds = 25 * 60;
      }
      updateTimerDisplay();
      $("startTimer").textContent = "Start";
    }
  }, 1000);
}

function resetTimer() {
  clearInterval(timerId);
  timerId = null;
  timerMode = "Study";
  timerSeconds = 25 * 60;
  $("startTimer").textContent = "Start";
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;
  $("timerMode").textContent = timerMode;
  $("timerDisplay").textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

setupOptions();
setupEvents();
setupVoice();
renderAll();
updateTimerDisplay();
loadImportedAssignmentsFromExtension();