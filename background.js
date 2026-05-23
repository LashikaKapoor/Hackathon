const classroomTargets = [
  {
    className: "Classroom A",
    code: "veleddga",
    url: "https://classroom.google.com/c/ODY1ODY5NjU1NTIz"
  },
  {
    className: "Classroom B",
    code: "iz647o7e",
    url: "https://classroom.google.com/c/ODY1ODY4MzczNDI5"
  },
  {
    className: "Classroom C",
    code: "555xgzdi",
    url: "https://classroom.google.com/c/ODY1ODY5MzE2NjE5"
  }
];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "SCAN_CLASSROOMS") return false;

  scanClassrooms()
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});

async function scanClassrooms() {
  const scannedAt = new Date().toISOString();
  const allAssignments = [];
  const errors = [];

  for (const target of classroomTargets) {
    try {
      const assignments = await scanOneClassroom(target);
      allAssignments.push(...assignments);
    } catch (error) {
      errors.push(`${target.className}: ${error.message}`);
    }
  }

  const uniqueAssignments = uniqueByAssignment(allAssignments);
  await chrome.storage.local.set({
    assignmentHubImported: uniqueAssignments,
    assignmentHubLastScan: scannedAt,
    assignmentHubScanErrors: errors
  });

  return {
    ok: true,
    count: uniqueAssignments.length,
    assignments: uniqueAssignments,
    scannedAt,
    errors
  };
}

async function scanOneClassroom(target) {
  const tab = await chrome.tabs.create({ url: target.url, active: false });

  try {
    await waitForTabLoaded(tab.id);
    
    // INCREASED DELAY: Give Classroom stream time to populate dynamic elements
    await delay(3500);

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "SCRAPE_CLASSROOM_PAGE",
      target
    });

    return response?.assignments || [];
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

function waitForTabLoaded(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Classroom page took too long to load"));
    }, 18000);

    chrome.tabs.get(tabId, (tab) => {
      if (tab?.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function uniqueByAssignment(assignments) {
  const seen = new Set();
  return assignments.filter((assignment) => {
    const key = `${assignment.className}|${assignment.title}|${assignment.personName || ""}|${assignment.due}`
      .toLowerCase()
      .replace(/[^a-z0-9|]+/g, " ")
      .trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
