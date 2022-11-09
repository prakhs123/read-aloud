
function Speech(texts, options) {
  options.rate = (options.rate || 1) * (isGoogleNative(options.voice) ? 0.9 : 1);

  var self = this;
  var engine = options.engine
  var pauseDuration = 650/options.rate;
  var state = "IDLE";
  var index = 0;
  var delayedPlayTimer;

  this.play = play;
  this.pause = pause;
  this.resume = resume;
  this.stop = stop;
  this.forward = forward;
  this.rewind = rewind;
  this.seek = seek;
  this.gotoEnd = gotoEnd;

  function getState() {
    return new Promise(function(fulfill) {
      engine.isSpeaking(function(isSpeaking) {
        if (state == "PLAYING") fulfill(isSpeaking ? "PLAYING" : "LOADING");
        else fulfill("PAUSED");
      })
    })
  }

  function play() {
    if (index >= texts.length) {
      state = "IDLE";
      if (self.onEnd) self.onEnd();
      return Promise.resolve();
    }
    else {
      state = new String("PLAYING");
      state.startTime = new Date().getTime();
      return speak(texts[index],
        function() {
          state = "IDLE";
          if (engine.setNextStartTime) engine.setNextStartTime(new Date().getTime() + pauseDuration, options);
          index++;
          play()
            .catch(function(err) {
              if (self.onEnd) self.onEnd(err)
            })
        },
        function(err) {
          state = "IDLE";
          if (self.onEnd) self.onEnd(err);
        })
        .then(function() {
          if (texts[index+1] && engine.prefetch) engine.prefetch(texts[index+1], options);
        })
    }
  }

  function delayedPlay() {
    clearTimeout(delayedPlayTimer);
    delayedPlayTimer = setTimeout(() => stop().then(play), 750);
  }

  function canPause() {
    return engine.pause && !(
      isChromeOSNative(options.voice) ||
      options.voice.voiceName == "US English Female TTS (by Google)"
    )
  }

  function pause() {
    if (canPause()) {
      clearTimeout(delayedPlayTimer);
      engine.pause();
      state = "PAUSED";
    }
    else stop();
  }

  async function resume() {
    if (state == "PAUSED") {
      state = "PLAYING"
      engine.resume()
    }
  }

  function stop() {
    clearTimeout(delayedPlayTimer);
    engine.stop();
    state = "IDLE";
  }

  function forward() {
    if (index+1 < texts.length) {
      index++;
      if (state == "PLAYING") return delayedPlay()
      else return stop()
    }
    else return Promise.reject(new Error("Can't forward, at end"));
  }

  function rewind() {
    if (state == "PLAYING" && new Date().getTime()-state.startTime > 3*1000) {
      return stop().then(play);
    }
    else if (index > 0) {
      index--;
      if (state == "PLAYING") return stop().then(play)
      else return stop()
    }
    else return Promise.reject(new Error("Can't rewind, at beginning"));
  }

  function seek(n) {
    index = n;
    return play();
  }

  function gotoEnd() {
    index = texts.length && texts.length-1;
  }

  function speak(text, onEnd, onError) {
    var state = "IDLE";
    return new Promise(function(fulfill, reject) {
      engine.speak(text, options, function(event) {
        if (event.type == "start") {
          if (state == "IDLE") {
            fulfill();
            state = "STARTED";
          }
        }
        else if (event.type == "end") {
          if (state == "IDLE") {
            reject(new Error("TTS engine end event before start event"));
            state = "ERROR";
          }
          else if (state == "STARTED") {
            onEnd();
            state = "ENDED";
          }
        }
        else if (event.type == "error") {
          if (state == "IDLE") {
            reject(new Error(event.errorMessage || "Unknown TTS error"));
            state = "ERROR";
          }
          else if (state == "STARTED") {
            onError(new Error(event.errorMessage || "Unknown TTS error"));
            state = "ERROR";
          }
        }
      })
    })
  }
}
