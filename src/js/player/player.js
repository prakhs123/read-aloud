
const playerMessagingPeer = registerMessagingPeer("player", {
  stop: stopIt,
})

const playerPromise = readAloud()




async function readAloud() {
  let speech = null
  playLoop()
    .catch(reportError)
  return {
    stop() {
      if (speech) speech.stop()
      speech = null
    }
  }
}

async function playLoop() {
  let currentIndex = await readAloudDoc.getCurrentIndex()
  let texts = await readAloudDoc.getTexts(currentIndex)
  while (texts) {
    speech = new Speech(texts, {
      voiceName: "Google US English",
      lang: "en",
    })
    await speech.play()
    await new Promise(f => speech.onEnd = f)
    speech = null
    texts = await readAloudDoc.getTexts(++currentIndex)
  }
}

async function stopIt() {
  const player = await playerPromise
  player.stop()
}



function reportError(err) {
  console.error(err)
  brapi.runtime.sendMessage({method: "onError", error: err.message})
}
