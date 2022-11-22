"use strict";

const serviceWorkerMessagingPeer = messagingClient.listen("service-worker", {
  readAloud,
  pause: forwardToPlayer,
  resume: forwardToPlayer,
  stop: forwardToPlayer,
  forward: forwardToPlayer,
  rewind: forwardToPlayer,
  seek: forwardToPlayer
});
function forwardToPlayer(message) {
  return messagingClient.sendTo("player", message);
}
async function readAloud() {
  //stop current player if any
  messagingClient.sendTo("player", {
    method: "stop"
  }).catch(err => "OK");

  //inject new player into active tab
  const tab = await getActiveTab();
  if (!tab) throw {
    code: "error_page_unreadable"
  };
  await setTargetTabId(tab.id);
  if (await isPlayerAlreadyInjected(tab)) await messagingClient.sendTo("player", {
    method: "play"
  });else await injectPlayer(tab);
}
async function isPlayerAlreadyInjected(tab) {
  const [{
    result
  }] = await brapi.scripting.executeScript({
    target: {
      tabId: tab.id
    },
    func: function () {
      return typeof brapi != "undefined";
    }
  });
  return result == true;
}
async function injectPlayer(tab) {
  await brapi.scripting.executeScript({
    target: {
      tabId: tab.id
    },
    files: ['js/common.js', 'js/content/jquery-3.1.1.min.js', getContentHandlerFor(tab.url), 'js/content/content-script.js', 'js/player/engines.js', 'js/player/speech.js', 'js/player/player.js']
  });
}