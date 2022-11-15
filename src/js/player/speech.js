
function makeSpeech(texts, options) {
  options.rate = (options.rate || 1) * (isGoogleNative(options.voice) ? 0.9 : 1);

  const pauseDuration = 650/options.rate;
  let delayedPlayTimer;

  const playlist = makePlaylist(() => 0, index => makeUtterance(texts[index], options))

  return {
    async play() {
      await playlist.play()
    },
    async stop() {
      await playlist.stop()
    },
  }
}



function makeUtterance(text, options) {
  return {
    play() {
      return new Promise((fulfill, reject) => {
        let isResolved = false
        options.engine.speak(text, options, event => {
          if (event.type == "start") {
            //raise event
          }
          else if (event.type == "end") {
            fulfill()
            isResolved = true
          }
          else if (event.type == "error") {
            if (!isResolved) {
              reject(new Error(event.errorMessage))
              isResolved = true
            }
            else {
              //raise event
            }
          }
        })
      })
    },
    stop() {
      options.engine.stop()
    },
  }
}
