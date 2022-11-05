const brapi = (typeof chrome != 'undefined') ? chrome : browser



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



//state management -----------------------------------------

function getState(name) {
  if (Array.isArray(name)) {
    return brapi.storage.local.get(name)
  }
  else {
    return brapi.storage.local.get([name])
      .then(items => items[name])
  }
}

function setState(items) {
  return brapi.storage.local.set(items)
}

function getTargetTabId() {
  return getState("targetTabId")
}

function setTargetTabId(value) {
  return setState({targetTabId: value})
}



//app configuration ----------------------------------------

function getContentHandlerFor(url) {
  return "js/content/html-doc.js"
}



//helpers -------------------------------------------

async function getActiveTab() {
  const [tab] = await brapi.tabs.query({active: true, lastFocusedWindow: true})
  return tab
}



//content-script helpers -----------------------------------

function getInnerText(elem) {
  var text = elem.innerText;
  return text ? text.trim() : "";
}

function isNotEmpty(text) {
  return text;
}
