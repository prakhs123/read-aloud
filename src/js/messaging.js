
const _messagingPeers = {}
const tabDests = new Set(["content-script", "player"])


function registerMessagingPeer(name, handlers) {
  async function handle(message) {
    const handler = handlers[message.method]
    if (!handler) throw new Error("Bad method " + message.method)
    return handler(message)
  }

  if (_messagingPeers[name]) throw new Error("Messaging peer '" + name + "' already registered")
  _messagingPeers[name] = { handle }

  brapi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.dest == name) {
      handle(message)
        .then(result => sendResponse({ result }))
        .catch(err => sendResponse({ error: { message: err.message, stack: err.stack } }))
      return true
    }
  })

  return {
    async sendTo(dest, message) {
      message.dest = dest
      if (_messagingPeers[dest]) return _messagingPeers[dest].handle(message)
      let response
      if (tabDests.has(dest)) response = await brapi.tabs.sendMessage(await getTargetTabId(), message)
      else response = await brapi.runtime.sendMessage(message)
      if (response.error) throw response.error
      else return response.result
    }
  }
}
