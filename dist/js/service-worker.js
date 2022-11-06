"use strict";

const serviceWorkerMessagingPeer = registerMessagingPeer("service-worker", {
  readAloud,
  pause: forwardToPlayer,
  resume: forwardToPlayer,
  stop: forwardToPlayer,
  forward: forwardToPlayer,
  rewind: forwardToPlayer,
  seek: forwardToPlayer
});
function forwardToPlayer(message) {
  return serviceWorkerMessagingPeer.sendTo("player", message);
}
async function readAloud() {
  //stop current player if any
  serviceWorkerMessagingPeer.sendTo("player", {
    method: "stop"
  }).catch(err => "OK");

  //inject new player into active tab
  const tab = await getActiveTab();
  await setTargetTabId(tab.id);
  brapi.scripting.executeScript({
    target: {
      tabId: tab.id
    },
    files: ['js/common.js', 'js/messaging.js', 'js/content/jquery-3.1.1.min.js', getContentHandlerFor(tab.url), 'js/content/content-script.js', 'js/player/engines.js', 'js/player/speech.js', 'js/player/player.js']
  });
}