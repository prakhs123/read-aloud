
const player = makePlaylist(
  function() {
    return playerMessagingPeer.sendTo("content-script", {method: "getCurrentIndex"})
  },
  async function makeSpeech(index) {
    const texts = await playerMessagingPeer.sendTo("content-script", {method: "getTexts", index})
    return new Speech(texts, {
      lang: "en",
      voice: {
        voiceName: "Google US English"
      }
    })
  })

const playerMessagingPeer = registerMessagingPeer("player", player)

player.play()
  .catch(reportError)


function reportError(err) {
  console.error(err)
}
