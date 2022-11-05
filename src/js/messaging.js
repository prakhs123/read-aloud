
const _messagingPeers = {}


function registerMessagingPeer(name, handlers) {
  async function handle(message) {
    const handler = handlers[message.method]
    if (!handler) throw new Error("Bad method " + message.method)
    return handler(message)
  }

  brapi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.dest == name) {
      handle(message)
        .then(result => sendResponse({ result }))
        .catch(err => sendResponse({ error: err.message }))
      return true
    }
  })

  _messagingPeers[name] = { handle }

  return {
    async sendTo(dest, message) {
      message.dest = dest
      if (_messagingPeers[dest]) return _messagingPeers[dest].handle(message)
      let response
      if (dest.startsWith("~")) response = await brapi.tabs.sendMessage(await getTargetTabId(), message)
      else response = await brapi.runtime.sendMessage(message)
      if (response.error) throw new Error(response.error)
      else return response.result
    }
  }
}
