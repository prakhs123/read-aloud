
function makeSpeech(texts, options, listeners) {
  options.rate = (options.rate || 1) * (isGoogleNative(options.voice) ? 0.9 : 1);

  const pauseDuration = 650/options.rate;
  let delayedPlayTimer;

  const playlist = makePlaylist(() => 0, index => makeUtterance(texts[index], options, listeners))

  return {
    async play() {
      await playlist.play()
    },
    async stop() {
      await playlist.stop()
    },
  }
}



function makeUtterance(text, options, listeners) {
  return {
    play() {
      return new Promise((fulfill, reject) => {
        listeners.onLoading(true)
        options.engine.speak(text, options, event => {
          if (event.type == "start") listeners.onLoading(false)
          else if (event.type == "end") fulfill()
          else if (event.type == "error") reject(new Error(event.errorMessage))
        })
      })
    },
    stop() {
      options.engine.stop()
    },
  }
}
