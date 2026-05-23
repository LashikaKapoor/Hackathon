(() => {
  const assignmentWords = [
    "assignment",
    "homework",
    "due",
    "deadline",
    "quiz",
    "test",
    "project",
    "essay",
    "worksheet",
    "lab"
  ];
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "SCRAPE_CLASSROOM_PAGE") return false;
  
    const assignments = scrapeClassroom(message.target);
    sendResponse({ ok: true, assignments });
    return false;
  });
  
  function scrapeClassroom(target) {
    const className = target?.className || getClassNameFromPage();
    const candidates = collectCandidateBlocks();
  
    const parsed = candidates
      .map((block) => parseAssignmentBlock(block, className))
      .filter(Boolean)
      .sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority) || new Date(a.due) - new Date(b.due));
  
    return uniqueAssignments(parsed)
      .slice(0, 60);
  }
  
  function collectCandidateBlocks() {
    // EXPANDED SELECTOR: Added broader fallback catching for link structures inside classroom posts
    const nodes = [...document.querySelectorAll("article,[role='listitem'],a[href*='/a/'],a[href*='/c/'],a[href*='/u/'],div[data-assignment-id]")];
    const seen = new Set();
    const blocks = [];
  
    for (const node of nodes) {
      const text = cleanText(node.innerText || node.textContent || "");
      if (text.length < 12 || text.length > 650) continue;
      if (!assignmentWords.some((word) => text.toLowerCase().includes(word))) continue;
      if (!/due|deadline|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\bjan\b|\bfeb\b|\bmar\b|\bapr\b|\bmay\b|\bjun\b|\bjul\b|\baug\b|\bsep\b|\boct\b|\bnov\b|\bdec\b/i.test(text)) continue;
  
      if (isNavigationOrChrome(text)) continue;
  
      const key = normalizeKey(text);
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push({ text, link: closestLink(node) });
    }
  
    return blocks;
  }
  
  function parseAssignmentBlock(block, className) {
    const lines = block.text.split("\n").map(cleanText).filter(Boolean);
    const due = extractDueDate(block.text);
    if (!due) return null;
  
    const itemType = getItemType(block.text, block.link);
    const personName = getPersonName(lines);
    const dueLineIndex = lines.findIndex((line) => /due|deadline/i.test(line));
    const titleLine = lines.find((line, index) => {
      if (index === dueLineIndex) return false;
      if (isBadTitleLine(line, personName)) return false;
      return line.length >= 4 && line.length <= 120;
    }) || lines[0] || "Imported Classroom assignment";
    const title = cleanTitle(titleLine);
  
    return {
      id: `classroom-${hash(`${className}-${title}-${personName}-${due}`)}`,
      title,
      personName,
      itemType,
      className,
      due,
      priority: getPriority(due, block.text),
      category: itemType === "Stream post" ? "Stream post" : getCategory(block.text),
      tags: ["google-classroom", "extension-scan"],
      minutes: getEstimatedMinutes(block.text),
      source: block.link || location.href
    };
  }
  
  function uniqueAssignments(assignments) {
    const seen = new Set();
    return assignments.filter((assignment) => {
      const key = normalizeKey(`${assignment.className} ${assignment.title} ${assignment.personName} ${assignment.due}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  function getItemType(text, link) {
    if (/\/[au]\//.test(link || "") || /assignment|homework|turned in|missing|due/i.test(text)) return "Assignment";
    return "Stream post";
  }
  
  function getPersonName(lines) {
    const bad = /google classroom|classwork|stream|people|grades|assignment|homework|due|deadline|posted|missing|turned in|view all|add class comment/i;
    const person = lines.find((line) => {
      if (bad.test(line)) return false;
      if (line.length < 3 || line.length > 48) return false;
      const words = line.split(" ");
      return words.length >= 2 && words.length <= 4 && words.every((word) => /^[A-Z][a-z'.-]+$/.test(word));
    });
    return person || "Teacher";
  }
  
  function isBadTitleLine(line, personName) {
    if (line === personName) return true;
    return /posted|stream|classwork|people|grades|view all|missing|turned in|add class comment|your work|private comments|google classroom/i.test(line);
  }
  
  function cleanTitle(title) {
    return title
      .replace(/^assignment[:\s-]*/i, "")
      .replace(/\s+due\s+.*$/i, "")
      .slice(0, 90)
      .trim() || "Imported Classroom assignment";
  }
  
  function isNavigationOrChrome(text) {
    return /stream classwork people grades/.test(text.toLowerCase()) ||
      /google apps|main menu|account|settings/.test(text.toLowerCase());
  }
  
  function extractDueDate(text) {
    const lower = text.toLowerCase();
    const now = new Date();
  
    if (lower.includes("due today") || lower.includes("deadline today")) return toDateInput(now);
  
    if (lower.includes("due tomorrow") || lower.includes("deadline tomorrow")) {
      const date = new Date(now);
      date.setDate(date.getDate() + 1);
      return toDateInput(date);
    }
  
    const weekdayMatch = lower.match(/(?:due|deadline).*?\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    if (weekdayMatch) return nextWeekday(weekdayMatch[1]);
  
    const dateMatch = text.match(/\b(?:due|deadline)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:,\s*(\d{4}))?/i);
    if (dateMatch) {
      const date = new Date(Number(dateMatch[3]) || now.getFullYear(), monthIndex(dateMatch[1]), Number(dateMatch[2]));
      if (date < startOfToday()) date.setFullYear(date.getFullYear() + 1);
      return toDateInput(date);
    }
  
    const numericMatch = text.match(/\b(?:due|deadline)?\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i);
    if (numericMatch) {
      const year = numericMatch[3] ? normalizeYear(numericMatch[3]) : now.getFullYear();
      const date = new Date(year, Number(numericMatch[1]) - 1, Number(numericMatch[2]));
      if (date < startOfToday()) date.setFullYear(date.getFullYear() + 1);
      return toDateInput(date);
    }
  
    return null;
  }
  
  function getPriority(due, text) {
    const days = Math.ceil((new Date(`${due}T00:00:00`) - startOfToday()) / 86400000);
    if (/missing|late|overdue|due today|deadline today/i.test(text) || days <= 1) return "High";
    if (days <= 4 || /quiz|test|project|essay/i.test(text)) return "Medium";
    return "Low";
  }
  
  function getCategory(text) {
    if (/quiz|test|exam/i.test(text)) return "Test";
    if (/project/i.test(text)) return "Project";
    if (/essay|writing|draft/i.test(text)) return "Writing";
    if (/lab/i.test(text)) return "Lab";
    return "Classwork";
  }
  
  function getEstimatedMinutes(text) {
    if (/project|essay|test|exam/i.test(text)) return 75;
    if (/quiz|lab/i.test(text)) return 50;
    return 35;
  }
  
  function getClassNameFromPage() {
    const heading = document.querySelector("h1, [role='heading']");
    return cleanText(heading?.innerText || "Google Classroom");
  }
  
  function closestLink(node) {
    const link = node.closest("a") || node.querySelector("a[href]");
    return link?.href || location.href;
  }
  
  function cleanText(text) {
    return text.replace(/\s+/g, " ").trim();
  }
  
  function normalizeKey(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  
  function nextWeekday(dayName) {
    const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const target = names.indexOf(dayName);
    const date = new Date();
    const diff = (target + 7 - date.getDay()) % 7 || 7;
    date.setDate(date.getDate() + diff);
    return toDateInput(date);
  }
  
  function monthIndex(name) {
    return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
      .findIndex((month) => name.toLowerCase().startsWith(month));
  }
  
  function normalizeYear(year) {
    const number = Number(year);
    return number < 100 ? 2000 + number : number;
  }
  
  function startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }
  
  function toDateInput(date) {
    return date.toISOString().slice(0, 10);
  }
  
  function priorityWeight(priority) {
    return { High: 0, Medium: 1, Low: 2 }[priority] ?? 3;
  }
  
  function hash(value) {
    let result = 0;
    for (let index = 0; index < value.length; index++) {
      result = (result << 5) - result + value.charCodeAt(index);
      result |= 0;
    }
    return Math.abs(result).toString(16);
  }
  })();
  