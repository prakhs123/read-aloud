"use strict";

(function () {
  const getDocumentInfoMemoized = memoize(() => messagingClient.sendTo("content-script", {
    method: "getDocumentInfo"
  }));
  messagingClient.listen("player", {
    play,
    stop
  });
  let currentIndex;
  let activeSpeech;
  let foundText;
  play();
  async function play() {
    try {
      currentIndex = await messagingClient.sendTo("content-script", {
        method: "getCurrentIndex"
      });
      return readCurrent();
    } catch (err) {
      console.error(err);
      reportStatus({
        status: "IDLE",
        error: wrapError(err)
      });
      getDocumentInfoMemoized().then(d => sendErrorReport(d.url, err)).catch(console.error);
    }
  }
  async function readCurrent(rewinded) {
    const texts = await messagingClient.sendTo("content-script", {
      method: "getTexts",
      index: currentIndex
    }).catch(err => null);
    if (texts) {
      if (texts.length) {
        foundText = true;
        return read(texts);
      } else {
        currentIndex++;
        return readCurrent();
      }
    } else {
      if (!foundText) reportStatus({
        status: "IDLE",
        error: {
          code: "error_no_text"
        }
      });else reportStatus({
        status: "IDLE"
      });
    }
    async function read(texts) {
      texts = texts.map(preprocess);
      if (activeSpeech) return;
      activeSpeech = await getSpeech(texts);
      activeSpeech.onEnd = function (err) {
        if (err) {
          reportStatus({
            status: "IDLE",
            error: wrapError(err)
          });
        } else {
          activeSpeech = null;
          currentIndex++;
          readCurrent().catch(function (err) {
            reportStatus({
              status: "IDLE",
              error: wrapError(err)
            });
          });
        }
      };
      if (rewinded) activeSpeech.gotoEnd();
      return activeSpeech.play();
    }
    function preprocess(text) {
      text = truncateRepeatedChars(text, 3);
      return text.replace(/https?:\/\/\S+/g, "HTTP URL.");
    }
    function truncateRepeatedChars(text, max) {
      var result = "";
      var startIndex = 0;
      var count = 1;
      for (var i = 1; i < text.length; i++) {
        if (text.charCodeAt(i) == text.charCodeAt(i - 1)) {
          count++;
          if (count == max) result += text.slice(startIndex, i + 1);
        } else {
          if (count >= max) startIndex = i;
          count = 1;
        }
      }
      if (count < max) result += text.slice(startIndex);
      return result;
    }
  }
  async function getSpeech(texts) {
    const d = await getDocumentInfoMemoized();

    //language detection
    let chosenLanguage;
    if (d.detectedLanguage) {
      var _d$declaredLanguage;
      chosenLanguage = (_d$declaredLanguage = d.declaredLanguage) !== null && _d$declaredLanguage !== void 0 && _d$declaredLanguage.startsWith(d.detectedLanguage) ? d.declaredLanguage : d.detectedLanguage;
    } else {
      const result = await detectLanguageOf(texts);
      if (result) {
        if (result.isReliable) {
          var _d$declaredLanguage2;
          d.detectedLanguage = result.language;
          chosenLanguage = (_d$declaredLanguage2 = d.declaredLanguage) !== null && _d$declaredLanguage2 !== void 0 && _d$declaredLanguage2.startsWith(d.detectedLanguage) ? d.declaredLanguage : d.detectedLanguage;
        } else {
          //not reliable
          chosenLanguage = d.declaredLanguage || result.language;
        }
      } else {
        //detection fails
        chosenLanguage = d.declaredLanguage || "en";
      }
    }

    //construct the options
    const settings = await getSettings(["voiceName", "rate", "pitch", "volume"]);
    const voice = await getSpeechVoice(settings.voiceName, chosenLanguage);
    if (!voice) throw new Error(JSON.stringify({
      code: "error_no_voice",
      lang: chosenLanguage
    }));
    const options = {
      rate: settings.rate || config.defaults.rate,
      pitch: settings.pitch || config.defaults.pitch,
      volume: settings.volume || config.defaults.volume,
      lang: config.langMap[chosenLanguage] || chosenLanguage || 'en-US',
      voice
    };
    return new Speech(texts, options);
  }
  async function stop() {
    if (activeSpeech) {
      await activeSpeech.stop();
      activeSpeech = null;
    }
  }
  function reportStatus(statusInfo) {
    messagingClient.sendTo("popup", {
      method: "onPlaybackStatusUpdate",
      statusInfo
    }).catch(err => {
      if (err.code != "DEST_NOT_FOUND") reportError(err);
    });
  }

  //language detection

  async function detectLanguageOf(texts) {
    const text = texts.reduce((acc, text) => acc.length < 1200 ? acc + " " + text : acc);
    const result = await browserDetectLanguage(text);
    return result !== null && result !== void 0 && result.isReliable ? result : await serverDetectLanguage(text);
  }
  async function browserDetectLanguage(text) {
    try {
      if (brapi.i18n.detectLanguage) {
        var _languages$filter$sor;
        const {
          isReliable,
          languages
        } = await brapi.i18n.detectLanguage(text);
        const language = (_languages$filter$sor = languages.filter(x => x.language != "und").sort((a, b) => b.percentage - a.percentage)[0]) === null || _languages$filter$sor === void 0 ? void 0 : _languages$filter$sor.language;
        return {
          language,
          isReliable
        };
      }
    } catch (err) {
      reportError(err);
    }
  }
  async function serverDetectLanguage(text) {
    try {
      const results = await fetch(config.serviceUrl + "/read-aloud/detect-language", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text
        })
      }).then(x => x.json());
      return results.filter(x => x.language != "und")[0];
    } catch (err) {
      reportError(err);
    }
  }

  //voice querying

  async function getVoices() {
    const {
      awsCreds,
      gcpCreds
    } = await getSettings(["awsCreds", "gcpCreds"]);
    return Promise.all([browserTtsEngine.getVoices(), googleTranslateTtsEngine.getVoices(), remoteTtsEngine.getVoices(), awsCreds ? amazonPollyTtsEngine.getVoices() : [], gcpCreds ? googleWavenetTtsEngine.getVoices() : googleWavenetTtsEngine.getFreeVoices(), ibmWatsonTtsEngine.getVoices()]).then(arr => arr.flat());
  }
  async function getSpeechVoice(voiceName, lang) {
    const [voices, preferredVoices] = await Promise.all([getVoices(), getSettings("preferredVoices").then(x => x || {})]);
    let voice;
    if (voiceName) voice = findVoiceByName(voices, voiceName);
    if (!voice && lang) {
      voiceName = preferredVoices[lang.split("-")[0]];
      if (voiceName) voice = findVoiceByName(voices, voiceName);
    }
    if (!voice && lang) {
      voice = findVoiceByLang(voices.filter(isGoogleNative), lang) || findVoiceByLang(voices.filter(negate(isRemoteVoice)), lang) || findVoiceByLang(voices.filter(isGoogleTranslate), lang) || findVoiceByLang(voices.filter(negate(isPremiumVoice)), lang) || findVoiceByLang(voices, lang);
      if (voice && isPremiumVoice(voice)) voice = Object.assign({
        autoSelect: true
      }, voice);
    }
    return voice;
  }
  function findVoiceByName(voices, name) {
    for (var i = 0; i < voices.length; i++) if (voices[i].voiceName == name) return voices[i];
    return null;
  }
  function findVoiceByLang(voices, lang) {
    var speechLang = parseLang(lang);
    var match = {};
    voices.forEach(function (voice) {
      if (voice.lang) {
        var voiceLang = parseLang(voice.lang);
        if (voiceLang.lang == speechLang.lang) {
          if (voiceLang.rest == speechLang.rest) {
            if (voice.gender == "female") match.first = match.first || voice;else match.second = match.second || voice;
          } else if (!voiceLang.rest) match.third = match.third || voice;else {
            if (voiceLang.lang == 'en' && voiceLang.rest == 'us') match.fourth = voice;else match.fourth = match.fourth || voice;
          }
        }
      }
    });
    return match.first || match.second || match.third || match.fourth;
  }
  function parseLang(lang) {
    const tokens = lang.toLowerCase().replace(/_/g, '-').split(/-/, 2);
    return {
      lang: tokens[0],
      rest: tokens[1]
    };
  }
})();