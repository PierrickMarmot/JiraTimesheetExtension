var webBrowser;

if (this.hasOwnProperty('browser')) {
  webBrowser = browser;
} else if (this.hasOwnProperty('chrome')) {
  webBrowser = chrome;
}

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
    data: []
  },
  settings: {
    apiToken: null,
    baseURL: null,
    emailAddress: null
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

async function loadSettings() {
  try {
    const result = await webBrowser.storage.local.get(["settings"])

    return {
        apiToken: result.settings.apiToken,
        baseURL: result.settings.baseURL,
        emailAddress: result.settings.emailAddress
    }
  } catch (error) {
    return null
  }
};

async function saveSettings(apiToken, baseURL, emailAddress) {
  try {
    await webBrowser.storage.local.set({
      settings: {
        apiToken: apiToken,
        baseURL: baseURL,
        emailAddress: emailAddress
      }
    })

    return true
  } catch (error) {
    return false
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
    const requestURL = `${baseURL}/rest/api/3/search?fields=worklog&maxResults=10000&jql=${encodedFilterRequest}`;
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
        }).filter(Boolean)
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

  let settings = await loadSettings();

  if (settings != null) {
    currentState.settings = settings;

    let data = await loadData(
      currentState.settings.apiToken,
      currentState.settings.baseURL,
      currentState.settings.emailAddress,
      currentState.timesheet.selectedDate
    );
    currentState.timesheet.data = data;
  }

  currentState.isLoading = false;

  updateUI();
};

async function applyNewSettings(apiToken, baseURL, emailAddress) {
  let result = await saveSettings(apiToken, baseURL, emailAddress);

  if (result) {
    currentState.view = View.timesheet;

    reload();
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

function showTimesheet(baseURL, date, data, canOpenInTab) {
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
    <div class="timesheet">
      <table>
        <thead>
          <tr>
            <th>-</th>
            `
            +
            [...Array(numberOfDaysInMonth(date)).keys()].map((day) => {
              const isTodayValue = isToday(date, day + 1);
              const isWorkDayValue = isWorkDay(date, day + 1);
              const customClass = isTodayValue ? "thtoday" : (isWorkDayValue ? "" : "thoffday")

              return `<th class="`+customClass+`">`+(day + 1)+`</th>`
            }).join("")
            +
            `
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          `
          +
          data.map((x) => {
          return `
          <tr>
            <th><a class="link" href="`+baseURL+`/browse/`+x.key+`" target="_blank">`+x.key+`</a></th>
            `
            +
            [...Array(numberOfDaysInMonth(date)).keys()].map((day) => {
              const isTodayValue = isToday(date, day + 1);
              const isWorkDayValue = isWorkDay(date, day + 1);
              const customClass = isTodayValue ? "tdtoday" : (isWorkDayValue ? "" : "tdoffday")

              const initialValue = 0;
              const sumWithInitial = x.worklogs.reduce(
                (accumulator, currentValue) => {
                  if (currentValue.started.getDate() == (day + 1)) {
                    return accumulator + currentValue.timeSpentSeconds
                  } else {
                    return accumulator
                  }
                },
                initialValue,
              );

              const value = sumWithInitial > 0 ? (sumWithInitial/3600).toFixed(1) + "h" : "-"
              return `<td class="`+customClass+`">`+value+`</td>`
            }).join("")
            +
            `
            `
            +
            [true].map((it) => {
              const initialValue = 0;
              const sumWithInitial = x.worklogs.reduce(
                (accumulator, currentValue) => {
                  return accumulator + currentValue.timeSpentSeconds
                },
                initialValue,
              );

              const value = sumWithInitial > 0 ? (sumWithInitial/3600).toFixed(1) + "h" : "-"
              return `<th>`+value+`</th>`
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
              const isTodayValue = isToday(date, day + 1);
              const isWorkDayValue = isWorkDay(date, day + 1);
              const customClass = isTodayValue ? "thtoday" : (isWorkDayValue ? "" : "thoffday")

              const initialValue = 0;
              const sumWithInitial = data.reduce(
                (accumulator, currentValue) => {
                  const initialValue2 = 0;
                  const sumWithInitial2 = currentValue.worklogs.reduce(
                    (accumulator2, currentValue2) => {
                      if (currentValue2.started.getDate() == (day + 1)) {
                        return accumulator2 + currentValue2.timeSpentSeconds
                      } else {
                        return accumulator2
                      }
                    },
                    initialValue2,
                  );
                  
                  return accumulator + sumWithInitial2
                },
                initialValue,
              );

              const value = sumWithInitial > 0 ? (sumWithInitial/3600).toFixed(1) + "h" : "-"
              return `<th class="`+customClass+`">`+value+`</th>`
            }).join("")
            +
            `
            `
            +
            [true].map((it) => {
              const initialValue = 0;
              const sumWithInitial = data.reduce(
                (accumulator, currentValue) => {
                  const initialValue2 = 0;
                  const sumWithInitial2 = currentValue.worklogs.reduce(
                    (accumulator2, currentValue2) => {
                      return accumulator2 + currentValue2.timeSpentSeconds
                    },
                    initialValue2,
                  );
                  
                  return accumulator + sumWithInitial2
                },
                initialValue,
              );

              const value = sumWithInitial > 0 ? (sumWithInitial/3600).toFixed(1) + "h" : "-"
              return `<th>`+value+`</th>`
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
};

function showSettings(apiToken, baseURL, emailAddress) {
  document.getElementById("content-container").innerHTML = `
    <h1>
      <button class="secondary-button" id="backButton"><span class="material-symbols-outlined">arrow_back</span></button>
      <span class="title">Paramètres</span>
      <button class="primary-button" id="saveButton" style="float: right;"><span class="material-symbols-outlined">save</span></button>
    </h1>
    <div class="form">
      <label for="baseURL">URL Jira (Exemple: https://DOMAIN.atlassian.net)</label>
      <input type="url" id="baseURLInput" name="baseURL" value="${baseURL}" required minlength="1" />
      <label for="emailAddress">Adresse mail Jira</label>
      <input type="email" id="emailAddressInput" name="emailAddress" value="${emailAddress}" required minlength="1"/>
      <label for="apiToken">API token Jira (Optionnel si connecté sur Jira avec Cookie)</label>
      <input type="text" id="apiTokenInput" name="apiToken" value="${apiToken}" required minlength="1" />
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

    applyNewSettings(apiToken, baseURL, emailAddress);
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
      currentState.timesheet.selectedDate,
      currentState.timesheet.data,
      currentState.timesheet.canOpenInTab
    );
  } else if (currentState.view == View.settings) {
    showSettings(
      currentState.settings.apiToken ?? "",
      currentState.settings.baseURL ?? "",
      currentState.settings.emailAddress ?? ""
    );
  }
};

setup();
reload();
