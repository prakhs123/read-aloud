"use strict";

const brapi = typeof chrome != 'undefined' ? chrome : browser;

/* COMPONENTS ------------

(1) Service Worker
Acting only as an event hub and coordinator, all playback commands are passed directly to Player

(2) Popup
User interface, triggers playback events on (1), displays playback status to user

(3) Player
Runs in content script for now (may be moved to offscreen document when chrome.offscreen becomes available)
- readAloud()
- pause()
- resume()
- stop()
- forward()
- rewind()
- seek()

(4) Content Script
Provides methods for navigating and scraping the present document
- getDocumentInfo()
- getCurrentIndex()
- getTexts(index)

Unless components are colocated, communication happens via message passing.

------- */

//app configuration

const config = {
  serviceUrl: "https://support.readaloud.app",
  webAppUrl: "https://readaloud.app",
  pdfViewerUrl: "https://assets.lsdsoftware.com/read-aloud/page-scripts/pdf-upload.html",
  langMap: {
    iw: 'he'
  },
  unsupportedSites: ['https://chrome.google.com/webstore', 'https://addons.mozilla.org'],
  wavenetPerms: {
    permissions: ["webRequest"],
    origins: ["https://*/"]
  },
  defaults: {
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    showHighlighting: 1,
    highlightFontSize: 3,
    highlightWindowSize: 2
  }
};
const paragraphSplitter = /(?:\s*\r?\n\s*){2,}/;
function getContentHandlerFor(url) {
  return "js/content/html-doc.js";
}

//messaging

const messagingClient = makeMessagingClient(dest => ["content-script", "player"].includes(dest) ? getTargetTabId() : -1);
function makeMessagingClient(getDestinationTabId) {
  const listeners = {};
  return {
    listen(name, handlers) {
      if (listeners[name]) throw new Error("Listener '" + name + "' already exists");
      listeners[name] = {
        async handle(message) {
          const handler = handlers[message.method];
          if (!handler) throw new Error("Bad method " + message.method);
          return handler(message);
        }
      };
      brapi.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.dest == name) {
          listeners[name].handle(message).then(result => sendResponse({
            result
          })).catch(err => sendResponse({
            error: wrapError(err)
          }));
          return true;
        }
      });
    },
    async sendTo(dest, message) {
      if (message === undefined) return message => sendTo(dest, message);
      message.dest = dest;
      if (listeners[dest]) return listeners[dest].handle(message);
      const tabId = await getDestinationTabId(dest);
      const response = await (tabId != -1 ? brapi.tabs.sendMessage(tabId, message) : brapi.runtime.sendMessage(message));
      if (response) {
        if (response.error) throw wrapError(response.error);else return response.result;
      } else {
        throw {
          code: "DEST_NOT_FOUND"
        };
      }
    }
  };
}

//state management

function getState(name) {
  if (Array.isArray(name)) {
    return brapi.storage.local.get(name);
  } else {
    return brapi.storage.local.get([name]).then(items => items[name]);
  }
}
function setState(items) {
  return brapi.storage.local.set(items);
}
function getTargetTabId() {
  return getState("targetTabId");
}
function setTargetTabId(value) {
  return setState({
    targetTabId: value
  });
}
function getSettings(name) {
  if (Array.isArray(name)) {
    return brapi.storage.local.get(name);
  } else {
    return brapi.storage.local.get([name]).then(items => items[name]);
  }
}
function updateSettings(items) {
  return brapi.storage.local.set(items);
}

//voice queries

function isGoogleNative(voice) {
  return /^Google\s/.test(voice.voiceName);
}
function isChromeOSNative(voice) {
  return /^Chrome\sOS\s/.test(voice.voiceName);
}
function isGoogleTranslate(voice) {
  return /^GoogleTranslate /.test(voice.voiceName);
}
function isAmazonCloud(voice) {
  return /^Amazon /.test(voice.voiceName);
}
function isMicrosoftCloud(voice) {
  return /^Microsoft /.test(voice.voiceName) && voice.voiceName.indexOf(' - ') == -1;
}
function isReadAloudCloud(voice) {
  return /^ReadAloud /.test(voice.voiceName);
}
function isAmazonPolly(voice) {
  return /^AmazonPolly /.test(voice.voiceName);
}
function isGoogleWavenet(voice) {
  return /^Google(Standard|Wavenet|Neural2) /.test(voice.voiceName);
}
function isIbmWatson(voice) {
  return /^IBM-Watson /.test(voice.voiceName);
}
function isRemoteVoice(voice) {
  return isAmazonCloud(voice) || isMicrosoftCloud(voice) || isReadAloudCloud(voice) || isGoogleTranslate(voice) || isGoogleWavenet(voice) || isAmazonPolly(voice) || isIbmWatson(voice);
}
function isPremiumVoice(voice) {
  return isAmazonCloud(voice) || isMicrosoftCloud(voice);
}

//helpers -------------------------------------------

async function getActiveTab() {
  const [tab] = await brapi.tabs.query({
    active: true,
    lastFocusedWindow: true
  });
  return tab;
}
function memoize(get) {
  let value;
  return () => value || (value = get());
}
function isRTL(language) {
  return /^(ar|az|dv|he|iw|ku|fa|ur)\b/.test(language);
}
function promiseTimeout(millis, errorMsg, promise) {
  return new Promise(function (fulfill, reject) {
    var timedOut = false;
    var timer = setTimeout(onTimeout, millis);
    promise.then(onFulfill, onReject);
    function onFulfill(value) {
      if (timedOut) return;
      clearTimeout(timer);
      fulfill(value);
    }
    function onReject(err) {
      if (timedOut) return;
      clearTimeout(timer);
      reject(err);
    }
    function onTimeout() {
      timedOut = true;
      reject(new Error(errorMsg));
    }
  });
}
function reportError(err) {
  console.error(err);
  //sendErrorReport(null, err)
  //.catch(console.error)
}

async function sendErrorReport(url, err) {
  if (err !== null && err !== void 0 && err.stack) {
    let details = err.stack;
    if (!details.startsWith(err.name)) details = err.name + ": " + err.message + "\n" + details;
    await sendIssueReport(url, details);
  }
}
async function sendIssueReport(url, comment) {
  const manifest = brapi.runtime.getManifest();
  const report = await getSettings(["voiceName", "rate", "pitch", "volume", "showHighlighting", "languages", "highlightFontSize", "highlightWindowSize", "preferredVoices"]);
  Object.assign(report, {
    url,
    version: manifest.version,
    userAgent: navigator.userAgent
  });
  await fetch(config.serviceUrl + "/read-aloud/report-issue", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      url: JSON.stringify(report),
      comment
    })
  });
}
function wrapError(err) {
  const toString = function () {
    return "Error: " + (this.message || this.code);
  };
  if (err instanceof Error) {
    return err.message.startsWith("{") ? Object.assign({
      stack: err.stack,
      toString
    }, JSON.parse(err.message)) : {
      stack: err.stack,
      message: err.message,
      toString
    };
  } else {
    err.toString = toString;
    return err;
  }
}
function getQueryString() {
  return location.search ? parseQueryString(location.search) : {};
}
function parseQueryString(search) {
  if (search.charAt(0) != '?') throw new Error("Invalid argument");
  var queryString = {};
  search.substr(1).replace(/\+/g, '%20').split('&').forEach(function (tuple) {
    var tokens = tuple.split('=');
    queryString[decodeURIComponent(tokens[0])] = tokens[1] && decodeURIComponent(tokens[1]);
  });
  return queryString;
}

//content-script helpers -----------------------------------

function getInnerText(elem) {
  var text = elem.innerText;
  return text ? text.trim() : "";
}
function isNotEmpty(text) {
  return text;
}