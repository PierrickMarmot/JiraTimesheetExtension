var webBrowser;

if (this.hasOwnProperty('browser')) {
  webBrowser = browser;
} else if (this.hasOwnProperty('chrome')) {
  webBrowser = chrome;
}

const Presence = {
  full: 1,
  half: 0.5,
  off: 0
};
const View = {
  timesheet: "timesheet",
  settings: "settings"
};
var currentState = {
  isLoading: true,
  view: View.timesheet,
  timesheet: {
    canOpenInTab: false,
    selectedDate: new Date(),
    scrollOffset: null,
    presences: [],
    data: []
  },
  settings: {
    apiToken: null,
    baseURL: null,
    emailAddress: null,
    workingTimePerDay: null
  }
};
var previousState = { };

function numberOfDaysInMonth(date) {
  const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

  return daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
};

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
};

function weekDayInMonth(date, day) {
  const dayDate = new Date(date.getUTCFullYear(), date.getUTCMonth(), day);

  return dayDate.getDay();
};

function isWorkDay(date, day) {
  const weekDay = weekDayInMonth(date, day);

  return weekDay != 0 && weekDay != 6;
};

function isToday(date, day) {
  const currentDate = new Date();

  return date.getUTCFullYear() == currentDate.getUTCFullYear() && date.getUTCMonth() == currentDate.getUTCMonth() && day == currentDate.getDate();
};

function isCurrentMonth(date) {
  const currentDate = new Date();

  return date.getUTCFullYear() == currentDate.getUTCFullYear() && date.getUTCMonth() == currentDate.getUTCMonth();
};

function dayPresence(monthPresences, date, day) {
  const isWorkDayValue = isWorkDay(date, day);

  const dayPresenceKey = `${day}`;
  const dayPresenceObject = monthPresences.find((dayPresence) => dayPresence.key == `${dayPresenceKey}`)

  if (dayPresenceObject !== undefined) {
    return dayPresenceObject.presence;
  } else {
    return isWorkDayValue ? Presence.full : Presence.off;
  }
};

function toggledDayPresence(dayPresence) {
  if (dayPresence == Presence.full) {
    return Presence.half
  } else if (dayPresence == Presence.half) {
    return Presence.off
  } else {
    return Presence.full
  }
};

async function loadPresences(date) {
  try {
    const result = await webBrowser.storage.local.get(["presences"])

    const monthKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;

    return result.presences.find((element) => element.key == monthKey).presences;
  } catch (error) {

    return null;
  }
};

async function savePresence(date, presence) {
  try {
    // [
    //   {
    //     key: "2024-1",
    //     presences: [
    //       {
    //         key: "1",
    //         presence: 0.5
    //       },
    //       ...
    //     ]
    //   },
    //   ...
    // ]

    const result = await webBrowser.storage.local.get(["presences"]);

    var presences = result.presences ?? [];

    const monthKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    const dayKey = `${date.getDate()}`;

    const monthObjectExists = presences.find((monthObject) => monthObject.key == monthKey);

    if (monthObjectExists !== undefined) {
      presences.map((monthObject) => {
        if (monthObject.key == monthKey) {
          const dayObjectExists = monthObject.presences.find((dayPresence) => dayPresence.key == dayKey);

          if (dayObjectExists !== undefined) {
            monthObject.presences.map((dayObject) => {
              if (dayObject.key == dayKey) {
                dayObject.presence = presence;
                return dayObject;
              } else {
                return dayObject;
              }
            })

          } else {
            monthObject.presences.push({
              key: dayKey,
              presence: presence
            });
          }

          return monthObject;
        } else {
          return monthObject;
        }
      })
    } else {
      presences.push({
        key: monthKey,
        presences: [
          {
            key: dayKey,
            presence: presence
          }
        ]
      });
    }
    
    await webBrowser.storage.local.set({
      presences: presences
    });

    return true;
  } catch (error) {
    return false;
  }
};

async function applyNewPresence(date, presence, scrollOffset) {
  currentState.isLoading = true;

  updateUI();

  await savePresence(date, presence);

  // Load presences
  let presences = await loadPresences(currentState.timesheet.selectedDate);

  if (presences != null) {
    currentState.timesheet.presences = presences;
  } else {
    currentState.timesheet.presences = [];
  }

  currentState.isLoading = false;
  currentState.timesheet.scrollOffset = scrollOffset;

  updateUI();
};

async function loadSettings() {
  try {
    const result = await webBrowser.storage.local.get(["settings"])

    return {
        apiToken: result.settings.apiToken,
        baseURL: result.settings.baseURL,
        emailAddress: result.settings.emailAddress,
        workingTimePerDay: result.settings.workingTimePerDay
    };
  } catch (error) {
    return null;
  }
};

async function saveSettings(apiToken, baseURL, emailAddress, workingTimePerDay) {
  const apiTokenIsValid = true;
  const baseURLIsValid = true;
  const emailAddressIsValid = true;
  const workingTimePerDayIsValid = (typeof workingTimePerDay === 'number') && (workingTimePerDay >= 1) && (workingTimePerDay <= 24);

  if (apiTokenIsValid == false || baseURLIsValid == false || emailAddressIsValid == false || workingTimePerDayIsValid == false) {
    return false;
  }

  try {
    await webBrowser.storage.local.set({
      settings: {
        apiToken: apiToken,
        baseURL: baseURL,
        emailAddress: emailAddress,
        workingTimePerDay: workingTimePerDay
      }
    });

    return true;
  } catch (error) {
    return false;
  }
};

async function loadData(apiToken, baseURL, emailAddress, date) {
  try {
    const headers = new Headers({
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Basic ${btoa(`${emailAddress}:${apiToken}`)}`
    });

    const filterStartDate = `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1)}-01`;
    const filterEndDate = `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1)}-${numberOfDaysInMonth(date)}`;
    const filterRequest = `worklogDate >= ${filterStartDate} AND worklogDate <= ${filterEndDate} AND worklogAuthor = currentUser() AND timeSpent > 0 order by created ASC`;
    const encodedFilterRequest = encodeURI(filterRequest);
    const requestURL = `${baseURL}/rest/api/3/search?fields=worklog,summary&maxResults=10000&jql=${encodedFilterRequest}`;
    const response = await fetch(requestURL, { method: "GET", headers: headers });
    const responseText = await response.text()
    const responseJSON = JSON.parse(responseText);

    // TODO PAGINATION
    // https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-get
    // https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/#api-rest-api-3-issue-issueidorkey-worklog-get
    // fetch(baseURL + "/rest/api/3/issue/"+key+"/worklog", { method: "GET", headers: headers})

    return responseJSON.issues.map((issue) => {
      return {
        key: issue.key,
        summary: issue.fields.summary,
        worklogs: issue.fields.worklog.worklogs.map((worklog) => {
          try {
            const startedDate = new Date(worklog.started);

            if (worklog.author.emailAddress == emailAddress && worklog.timeSpentSeconds > 0 && date.getUTCFullYear() == startedDate.getUTCFullYear() && date.getUTCMonth() == startedDate.getUTCMonth()) {
              return {
                timeSpentSeconds: worklog.timeSpentSeconds,
                started: startedDate
              };
            } else {
              return null;
            }
          } catch (error) {
            return null;
          }
        }).filter(Boolean),
      }
    }).filter((object) => object.worklogs.length > 0);
  } catch (error) {
    return [];
  }
};

function setup() {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  const isTab = urlParams.get("mode") == "tab"

  currentState.timesheet.canOpenInTab = !isTab;
};

async function reload() {
  currentState.isLoading = true;
  currentState.timesheet.data = [];

  updateUI();

  // Load presences
  let presences = await loadPresences(currentState.timesheet.selectedDate);

  if (presences != null) {
    currentState.timesheet.presences = presences;
  } else {
    currentState.timesheet.presences = [];
  }

  // Load settings
  let settings = await loadSettings();

  if (settings != null) {
    currentState.settings = settings;
  } else {
    currentState.settings = {
      apiToken: null,
      baseURL: null,
      emailAddress: null,
      workingTimePerDay: null
    }
  }

  // Load data
  if (currentState.settings != null) {
    let data = await loadData(
      currentState.settings.apiToken,
      currentState.settings.baseURL,
      currentState.settings.emailAddress,
      currentState.timesheet.selectedDate
    );
    currentState.timesheet.data = data;
  } else {
    currentState.timesheet.data = [];
  }

  currentState.isLoading = false;

  updateUI();
};

async function applyNewSettings(apiToken, baseURL, emailAddress, workingTimePerDay) {
  currentState.isLoading = true;

  updateUI();

  let result = await saveSettings(apiToken, baseURL, emailAddress, workingTimePerDay);

  if (result) {
    currentState.view = View.timesheet;

    reload();
  } else {
    currentState.isLoading = false;

    updateUI();
  }
};

function startLoading() {
  document.getElementById("loader").classList.remove("visible");
  document.getElementById("loader").classList.remove("invisible");
  document.getElementById("content-container").classList.remove("loading");
  document.getElementById("content-container").classList.remove("loaded");

  document.getElementById("loader").classList.add("visible");
  document.getElementById("content-container").classList.add("loading");
};

function stopLoading() {
  document.getElementById("loader").classList.remove("visible");
  document.getElementById("loader").classList.remove("invisible");
  document.getElementById("content-container").classList.remove("loading");
  document.getElementById("content-container").classList.remove("loaded");

  document.getElementById("loader").classList.add("invisible");
  document.getElementById("content-container").classList.add("loaded");
};

function showTimesheet(baseURL, workingTimePerDay, date, data, presences, canOpenInTab) {
  const monthText = date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
  const monthTitle = capitalizeFirstLetter(monthText);

  const optionalOpenInTabButton = canOpenInTab ? `<button class="secondary-button" id="openInTabButton" style="float: right; margin-left: 8px;"><span class="material-symbols-outlined">open_in_new</span></button>` : ``

  document.getElementById("content-container").innerHTML = `
    <h1>
      <button class="primary-button" id="previousMonthButton"><span class="material-symbols-outlined">navigate_before</span></button>
      <span class="title" id="currentMonth">${monthTitle}</span>
      <button class="primary-button" id="nextMonthButton"><span class="material-symbols-outlined">navigate_next</span></button>
      <button class="secondary-button" id="todayButton" style="margin-left: 8px;"><span class="material-symbols-outlined">today</span></button>
      <button class="secondary-button" id="refreshButton" style="margin-left: 8px;"><span class="material-symbols-outlined">refresh</span></button>
      <button class="secondary-button" id="settingsButton" style="float: right; margin-left: 8px;"><span class="material-symbols-outlined">settings</span></button>
      ${optionalOpenInTabButton}
    </h1>
    <div class="timesheet" id="timesheet">
      <table>
        <thead>
          <tr>
            <th>Jour</th>
            `
            +
            [...Array(numberOfDaysInMonth(date)).keys()].map((day) => {
              const iterationDay = day + 1;
              const isTodayValue = isToday(date, iterationDay);
              const isWorkDayValue = isWorkDay(date, iterationDay);
              const customClass = isTodayValue ? "thtoday" : (isWorkDayValue ? "" : "thoffday")
              return `<th class="`+customClass+`">`+iterationDay+`</th>`
            }).join("")
            +
            `
            `
            +
            [true].map((it) => {
              const isCurrentMonthValue = isCurrentMonth(date);

              if (isCurrentMonthValue == false) {
                return ""
              }

              return "<th>Total écoulé</th>"
            }).join("")
            +
            `
            <th>Total mois</th>
          </tr>
          <tr>
            <th>Présence</th>
            `
            +
            [...Array(numberOfDaysInMonth(date)).keys()].map((day) => {
              const iterationDay = day + 1;
              const isTodayValue = isToday(date, iterationDay);
              const isWorkDayValue = isWorkDay(date, iterationDay);
              const customClass = isTodayValue ? "thtoday" : (isWorkDayValue ? "" : "thoffday");
              const presence = dayPresence(presences, date, iterationDay);
              const customButtonClass = (presence == Presence.full) ? "green-button" : ((presence == Presence.half) ? "yellow-button" : "red-button")

              return `<th class="`+customClass+`"><button class="${customButtonClass} update-presence">${presence}</button></th>`
            }).join("")
            +
            `
            `
            +
            [true].map((it) => {
              const isCurrentMonthValue = isCurrentMonth(date);

              if (isCurrentMonthValue == false) {
                return ""
              }

              const totalDays = [...Array((new Date).getDate() - 1).keys()].reduce(
                (accumulator, currentValue) => {
                  const iterationDay = currentValue + 1;
                  const isWorkDayValue = isWorkDay(date, iterationDay);
                  const presence = dayPresence(presences, date, iterationDay);

                  return accumulator + presence;
                },
                0,
              );

              const value = totalDays.toFixed(1) + "j"

              return `<th>${value}</th>`
            }).join("")
            +
            `
            `
            +
            [true].map((it) => {
              const totalDays = [...Array(numberOfDaysInMonth(date)).keys()].reduce(
                (accumulator, currentValue) => {
                  const iterationDay = currentValue + 1;
                  const isWorkDayValue = isWorkDay(date, iterationDay);
                  const presence = dayPresence(presences, date, iterationDay);

                  return accumulator + presence;
                },
                0,
              );

              const value = totalDays.toFixed(1) + "j"

              return `<th>${value}</th>`
            }).join("")
            +
            `
          </tr>
        </thead>
        <tbody>
          `
          +
          data.map((x) => {
          return `
          <tr>
            <th><a class="link" href="`+baseURL+`/browse/`+x.key+`" target="_blank" data-title="`+x.summary+`">`+x.key+`</a></th>
            `
            +
            [...Array(numberOfDaysInMonth(date)).keys()].map((day) => {
              const iterationDay = day + 1;
              const isTodayValue = isToday(date, iterationDay);
              const isWorkDayValue = isWorkDay(date, iterationDay);
              const customClass = isTodayValue ? "tdtoday" : (isWorkDayValue ? "" : "tdoffday")

              const totalTimeSpentSeconds = x.worklogs.reduce(
                (accumulator, currentValue) => {
                  if (currentValue.started.getDate() == iterationDay) {
                    return accumulator + currentValue.timeSpentSeconds
                  } else {
                    return accumulator
                  }
                },
                0,
              );

              const value = (totalTimeSpentSeconds > 0) ? (totalTimeSpentSeconds / 3600).toFixed(1) + "h" : "-"

              return `<td class="${customClass}">${value}</td>`
            }).join("")
            +
            `
            `
            +
            [true].map((it) => {
              const isCurrentMonthValue = isCurrentMonth(date);

              if (isCurrentMonthValue == false) {
                return ""
              }

              const currentDay = (new Date()).getDate();

              const totalTimeSpentSeconds = x.worklogs.reduce(
                (accumulator, currentValue) => {
                  if (currentValue.started.getDate() <= (currentDay - 1)) {
                    return accumulator + currentValue.timeSpentSeconds;
                  } else {
                    return accumulator;
                  }
                },
                0,
              );

              const value = (totalTimeSpentSeconds > 0) ? (totalTimeSpentSeconds / 3600).toFixed(1) + "h" : "-"
              
              return `<th>${value}</th>`
            }).join("")
            +
            `
            `
            +
            [true].map((it) => {
              const totalTimeSpentSeconds = x.worklogs.reduce(
                (accumulator, currentValue) => {
                  return accumulator + currentValue.timeSpentSeconds
                },
                0,
              );

              const value = (totalTimeSpentSeconds > 0) ? (totalTimeSpentSeconds / 3600).toFixed(1) + "h" : "-"
              
              return `<th>${value}</th>`
            }).join("")
            +
            `
          </tr>
          `
          }).join("")
          +
          `
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            `
            +
            [...Array(numberOfDaysInMonth(date)).keys()].map((day) => {
              const iterationDay = day + 1;
              const isTodayValue = isToday(date, iterationDay);
              const isWorkDayValue = isWorkDay(date, iterationDay);
              const customClass = isTodayValue ? "thtoday" : (isWorkDayValue ? "" : "thoffday")

              const totalTimeSpentSeconds = data.reduce(
                (firstAccumulator, firstCurrentValue) => {
                  const issueTotalTimeSpentSeconds = firstCurrentValue.worklogs.reduce(
                    (secondAccumulator, secondCurrentValue) => {
                      if (secondCurrentValue.started.getDate() == (day + 1)) {
                        return secondAccumulator + secondCurrentValue.timeSpentSeconds
                      } else {
                        return secondAccumulator
                      }
                    },
                    0,
                  );
                  
                  return firstAccumulator + issueTotalTimeSpentSeconds
                },
                0,
              );

              const value = (totalTimeSpentSeconds > 0) ? (totalTimeSpentSeconds / 3600).toFixed(1) + "h" : "-"
              
              return `<th class="${customClass}">${value}</th>`
            }).join("")
            +
            `
            `
            +
            [true].map((it) => {
              const isCurrentMonthValue = isCurrentMonth(date);

              if (isCurrentMonthValue == false) {
                return ""
              }

              const currentDay = (new Date()).getDate();

              const totalTimeSpentSeconds = data.reduce(
                (firstAccumulator, firstCurrentValue) => {
                  const issueTotalTimeSpentSeconds = firstCurrentValue.worklogs.reduce(
                    (secondAccumulator, secondCurrentValue) => {
                      if (secondCurrentValue.started.getDate() <= (currentDay - 1)) {
                        return secondAccumulator + secondCurrentValue.timeSpentSeconds;
                      } else {
                        return secondAccumulator;
                      }
                    },
                    0,
                  );
                  
                  return firstAccumulator + issueTotalTimeSpentSeconds
                },
                0,
              );

              const value = (totalTimeSpentSeconds > 0) ? (totalTimeSpentSeconds / 3600).toFixed(1) + "h" : "-"
              
              return `<th>${value}</th>`
            }).join("")
            +
            `
            `
            +
            [true].map((it) => {
              const totalTimeSpentSeconds = data.reduce(
                (firstAccumulator, firstCurrentValue) => {
                  const issueTotalTimeSpentSeconds = firstCurrentValue.worklogs.reduce(
                    (secondAccumulator, secondCurrentValue) => {
                      return secondAccumulator + secondCurrentValue.timeSpentSeconds
                    },
                    0,
                  );
                  
                  return firstAccumulator + issueTotalTimeSpentSeconds
                },
                0,
              );

              const value = (totalTimeSpentSeconds > 0) ? (totalTimeSpentSeconds / 3600).toFixed(1) + "h" : "-"
              
              return `<th>${value}</th>`
            }).join("")
            +
            `
          </tr>
          <tr>
            <th>Complétion</th>
            `
            +
            [...Array(numberOfDaysInMonth(date)).keys()].map((day) => {
              const iterationDay = day + 1;
              const isTodayValue = isToday(date, iterationDay);
              const isWorkDayValue = isWorkDay(date, iterationDay);
              const customClass = isTodayValue ? "thtoday" : (isWorkDayValue ? "" : "thoffday")

              const totalTimeSpentSeconds = data.reduce(
                (fristAccumulator, firstCurrentValue) => {
                  const issueTotalTimeSpentSeconds = firstCurrentValue.worklogs.reduce(
                    (secondAccumulator, secondCurrentValue) => {
                      if (secondCurrentValue.started.getDate() == iterationDay) {
                        return secondAccumulator + secondCurrentValue.timeSpentSeconds
                      } else {
                        return secondAccumulator
                      }
                    },
                    0,
                  );
                  
                  return fristAccumulator + issueTotalTimeSpentSeconds
                },
                0,
              );
              const totalTimeSpentHours = (totalTimeSpentSeconds / 3600);
              const presence = dayPresence(presences, date, iterationDay);
              const goalHours = workingTimePerDay * presence;

              if (goalHours != 0) {
                const percent = (totalTimeSpentHours * 100) / goalHours;
                const value = percent.toFixed(1) + "%"

                return `<th class="${customClass}">${value}</th>`
              } else {
                return `<th class="${customClass}">-</th>`
              }
            }).join("")
            +
            `
            `
            +
            [true].map((it) => {
              const isCurrentMonthValue = isCurrentMonth(date);

              if (isCurrentMonthValue == false) {
                return ""
              }

              const currentDay = (new Date()).getDate();

              const totalTimeSpentSeconds = data.reduce(
                (firstAccumulator, firstCurrentValue) => {
                  const issueTotalTimeSpentSeconds = firstCurrentValue.worklogs.reduce(
                    (secondAccumulator, secondCurrentValue) => {
                      if (secondCurrentValue.started.getDate() <= (currentDay - 1)) {
                        return secondAccumulator + secondCurrentValue.timeSpentSeconds;
                      } else {
                        return secondAccumulator;
                      }
                    },
                    0,
                  );
                  
                  return firstAccumulator + issueTotalTimeSpentSeconds
                },
                0,
              );
              const totalTimeSpentHours = (totalTimeSpentSeconds / 3600);

              const totalDays = [...Array((new Date).getDate() - 1).keys()].reduce(
                (accumulator, currentValue) => {
                  const iterationDay = currentValue + 1;
                  const presence = dayPresence(presences, date, iterationDay);

                  return accumulator + presence;
                },
                0,
              );

              const goalHours = totalDays * workingTimePerDay;

              if (goalHours != 0) {
                const percent = (totalTimeSpentHours * 100) / goalHours;

                const value = percent.toFixed(1) + "%"

                return `<th>${value}</th>`
              } else {
                return `<th>-</th>`
              }
            }).join("")
            +
            `
            `
            +
            [true].map((it) => {
              const totalTimeSpentSeconds = data.reduce(
                (firstAccumulator, firstCurrentValue) => {
                  const issueTotalTimeSpentSeconds = firstCurrentValue.worklogs.reduce(
                    (secondAccumulator, secondCurrentValue) => {
                      return secondAccumulator + secondCurrentValue.timeSpentSeconds;
                    },
                    0,
                  );
                  
                  return firstAccumulator + issueTotalTimeSpentSeconds
                },
                0,
              );
              const totalTimeSpentHours = (totalTimeSpentSeconds / 3600);

              const totalDays = [...Array(numberOfDaysInMonth(date)).keys()].reduce(
                (accumulator, currentValue) => {
                  const iterationDay = currentValue + 1;
                  const presence = dayPresence(presences, date, iterationDay);

                  return accumulator + presence;
                },
                0,
              );

              const goalHours = totalDays * workingTimePerDay;

              if (goalHours != 0) {
                const percent = (totalTimeSpentHours * 100) / goalHours;

                const value = percent.toFixed(1) + "%"

                return `<th>${value}</th>`
              } else {
                return `<th>-</th>`
              }
            }).join("")
            +
            `
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  document.getElementById("previousMonthButton").addEventListener("click", function() {
    currentState.timesheet.selectedDate.setMonth(currentState.timesheet.selectedDate.getMonth() - 1);

    reload();
  });

  document.getElementById("nextMonthButton").addEventListener("click", function() {
    currentState.timesheet.selectedDate.setMonth(currentState.timesheet.selectedDate.getMonth() + 1);

    reload();
  });

  document.getElementById("todayButton").addEventListener("click", function() {
    currentState.timesheet.selectedDate = new Date();

    reload();
  });

  document.getElementById("refreshButton").addEventListener("click", function() {
    reload();
  });

  document.getElementById("settingsButton").addEventListener("click", function() {
    currentState.view = View.settings;
    
    updateUI();
  });

  if (canOpenInTab) {
    document.getElementById("openInTabButton").addEventListener("click", function() {
      webBrowser.tabs.create({ url: webBrowser.runtime.getURL("index.html?mode=tab") });
    });
  }

  Array.from(document.getElementsByClassName("update-presence")).forEach(function(element, i) {
    const day = i + 1;

    element.addEventListener("click", function() {
      var presenceDate = date;
      presenceDate.setDate(day);

      const scrollOffset = document.getElementById("timesheet").scrollLeft;

      const presence = dayPresence(presences, date, day);
      const newPresence = toggledDayPresence(presence);

      applyNewPresence(presenceDate, newPresence, scrollOffset);
    });
  });

};

function showSettings(apiToken, baseURL, emailAddress, workingTimePerDay) {
  document.getElementById("content-container").innerHTML = `
    <h1>
      <button class="secondary-button" id="backButton"><span class="material-symbols-outlined">arrow_back</span></button>
      <span class="title">Paramètres</span>
      <button class="primary-button" id="saveButton" style="float: right;"><span class="material-symbols-outlined">save</span></button>
    </h1>
    <div class="form">
      <label for="baseURL">URL Jira (Exemple: https://DOMAIN.atlassian.net)</label>
      <input type="url" id="baseURLInput" name="baseURL" value="${baseURL}" />
      <label for="emailAddress">Adresse mail Jira</label>
      <input type="email" id="emailAddressInput" name="emailAddress" value="${emailAddress}" />
      <label for="apiToken">API token Jira (Optionnel si connecté sur Jira avec Cookie)</label>
      <input type="text" id="apiTokenInput" name="apiToken" value="${apiToken}" />
      <label for="workingTimePerDay">Temps de travail par jour en heure</label>
      <input type="number" id="workingTimePerDayInput" name="workingTimePerDay" value="${workingTimePerDay}" />
    </div>
  `;

  document.getElementById("backButton").addEventListener("click", function() {
    currentState.view = View.timesheet;

    updateUI();
  });

  document.getElementById("saveButton").addEventListener("click", function() {
    const apiToken = document.getElementById("apiTokenInput").value
    const baseURL = document.getElementById("baseURLInput").value
    const emailAddress = document.getElementById("emailAddressInput").value
    const workingTimePerDay = Number(document.getElementById("workingTimePerDayInput").value)

    applyNewSettings(apiToken, baseURL, emailAddress, workingTimePerDay);
  });
};

function updateUI() {
  if (currentState.isLoading) {
    startLoading();
  } else {
    stopLoading();
  }

  if (currentState.view == View.timesheet) {
    showTimesheet(
      currentState.settings.baseURL,
      currentState.settings.workingTimePerDay,
      currentState.timesheet.selectedDate,
      currentState.timesheet.data,
      currentState.timesheet.presences,
      currentState.timesheet.canOpenInTab
    );
  } else if (currentState.view == View.settings) {
    showSettings(
      currentState.settings.apiToken ?? "",
      currentState.settings.baseURL ?? "",
      currentState.settings.emailAddress ?? "",
      currentState.settings.workingTimePerDay ?? 7
    );
  }

  if (currentState.timesheet.scrollOffset != null) {
    document.getElementById("timesheet").scrollTo({
      left: currentState.timesheet.scrollOffset,
      behavior: "instant"
    });
    currentState.timesheet.scrollOffset = null;
  }
};

setup();
reload();