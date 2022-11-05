
const serviceWorkerMessagingPeer = registerMessagingPeer("service-worker", {
  readAloud,
  pause: forwardToPlayer,
  resume: forwardToPlayer,
  stop: forwardToPlayer,
  forward: forwardToPlayer,
  rewind: forwardToPlayer,
  seek: forwardToPlayer,
})

function forwardToPlayer(message) {
  return serviceWorkerMessagingPeer.sendTo("player", message)
}


async function readAloud() {
  //stop current player if any
  const targetTabId = await getTargetTabId()
  if (targetTabId) {
    brapi.scripting.executeScript({
      target: {tabId: targetTabId},
      func: function() {
        if (typeof stopIt == "function") stopIt().catch(console.error)
      }
    })
  }

  //inject new player into active tab
  const tab = await getActiveTab()
  await setTargetTabId(tab.id)
  brapi.scripting.executeScript({
    target: {tabId: tab.id},
    files: [
      'js/common.js',
      'js/messaging.js',

      getContentHandlerFor(tab.url),
      'js/content/content-script.js',

      'js/player/engines.js',
      'js/player/speech.js',
      'js/player/source.js',
      'js/player/document.js',
      'js/player/player.js',
    ]
  })
}
