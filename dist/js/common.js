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
  }
};
const paragraphSplitter = /(?:\s*\r?\n\s*){2,}/;
function getContentHandlerFor(url) {
  return "js/content/html-doc.js";
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

//abstraction for playlist playback behavior

/**
 * interface PlaylistItem {
 *  play: () => Promise<void>
 *  pause?: () => Promise<void>
 *  resume?: () => Promise<void>
 *  stop: () => Promise<void>
 * }
 *
 * getCurrentIndex: () => Promise<number>
 * makePlaylistItem: (index) => Promise<PlaylistItem>
 */
function makePlaylist(getCurrentIndex, makePlaylistItem) {
  let index = null;
  let activeItem = null;
  return {
    async play() {
      if (index == null) index = await getCurrentIndex();
      while (activeItem = await makePlaylistItem(index)) {
        await activeItem.play();
        activeItem = null;
        index++;
      }
    },
    async pause() {
      if (typeof activeItem.pause == "function") {
        await activeItem.pause();
      } else {
        await activeItem.stop();
        activeItem = null;
      }
    },
    async resume() {
      await activeItem.resume();
    },
    async stop() {
      await activeItem.stop();
      activeItem = null;
      index = null;
    }
  };
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
function escapeHtml(text) {
  const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };
  return text.replace(/[&<>"'`=\/]/g, s => entityMap[s]);
}

//content-script helpers -----------------------------------

function getInnerText(elem) {
  var text = elem.innerText;
  return text ? text.trim() : "";
}
function isNotEmpty(text) {
  return text;
}