"use strict";

const brapi = typeof chrome != 'undefined' ? chrome : browser;
async function getActiveTab() {
  const [tab] = await brapi.tabs.query({
    active: true,
    lastFocusedWindow: true
  });
  return tab;
}
function getState(names) {
  return new Promise(fulfill => {
    if (Array.isArray(names)) {
      brapi.storage.local.get(names, fulfill);
    } else {
      const name = names;
      brapi.storage.local.get([name], items => fulfill(items[name]));
    }
  });
}
function setState(items) {
  return new Promise(fulfill => {
    brapi.storage.local.set(items, fulfill);
  });
}