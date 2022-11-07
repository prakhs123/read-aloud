
(function() {
  const getDocumentInfoMemoized = memoize(() => messagingClient.sendTo("content-script", {method: "getDocumentInfo"}))
  const player = makePlaylist(() => messagingClient.sendTo("content-script", {method: "getCurrentIndex"}), makeSpeech)

  messagingClient.listen("player", player)
  player.play()
    .catch(reportError)


  async function makeSpeech(index) {
    const d = await getDocumentInfoMemoized()
    let texts = await messagingClient.sendTo("content-script", {method: "getTexts", index})

    //language detection
    const text = texts.reduce((acc, text) => acc.length < 3000 ? acc + " " + text : acc)
    if (!d.detectedLanguage)
      d.detectedLanguage = await detectLanguageReliably(text)
    let chosenLanguage = !d.detectedLanguage || d.declaredLanguage?.startsWith(d.detectedLanguage)
      ? d.declaredLanguage
      : d.detectedLanguage
    if (!chosenLanguage)
      chosenLanguage = await detectLanguageBestEffort(text)

    //construct the speech options
    const settings = await getState(["voiceName", "rate", "pitch", "volume"])
    const voice = await getSpeechVoice(settings.voiceName, chosenLanguage)
    if (!voice) throw new Error(JSON.stringify({code: "error_no_voice", lang: chosenLanguage}))
    const options = {
      engine: await getEngine(voice),
      lang: chosenLanguage,
      voice,
      rate: settings.rate,
      pitch: settings.pitch,
      volume: settings.volume,
    }

    texts = reassemble(texts, options)
    return new Speech(texts, options)
  }

  function reportError(err) {
    console.error(err)
  }




  //language detection

  function detectLanguageReliably(text) {
    if (text.length >= 240) return detectLanguageOf(output)
  }

  function detectLanguageBestEffort(text) {

  }

  function detectLanguageOf(text) {
    if (text.length < 100) {
      //too little text, use cloud detection for improved accuracy
      return serverDetectLanguage(text)
        .then(function(result) {
          return result || browserDetectLanguage(text)
        })
        .then(function(lang) {
          //exclude commonly misdetected languages
          return ["cy", "eo"].includes(lang) ? null : lang
        })
    }
    return browserDetectLanguage(text)
      .then(function(result) {
        return result || serverDetectLanguage(text);
      })
  }

  function browserDetectLanguage(text) {
    if (!brapi.i18n.detectLanguage) return Promise.resolve(null);
    return new Promise(function(fulfill) {
      brapi.i18n.detectLanguage(text, fulfill);
    })
    .then(function(result) {
      if (result) {
          var list = result.languages.filter(function(item) {return item.language != "und"});
          list.sort(function(a,b) {return b.percentage-a.percentage});
          return list[0] && list[0].language;
      }
      else {
        return null;
      }
    })
  }

  function serverDetectLanguage(text) {
      return ajaxPost(config.serviceUrl + "/read-aloud/detect-language", {text: text}, "json")
        .then(JSON.parse)
        .then(function(res) {
          var result = Array.isArray(res) ? res[0] : res
          if (result && result.language && result.language != "und") return result.language
          else return null
        })
        .catch(function(err) {
          console.error(err)
          return null
        })
  }




  //voice querying

  async function getSpeechVoice(voiceName, lang) {
    const [voices, {preferredVoices}] = await Promise.all([getVoices(), getState(["preferredVoices"])])
    const preferredVoiceByLang = preferredVoices || {}
    let voice
    if (voiceName)
      voice = findVoiceByName(voices, voiceName)
    if (!voice && lang) {
      voiceName = preferredVoiceByLang[lang.split("-")[0]]
      if (voiceName)
        voice = findVoiceByName(voices, voiceName)
    }
    if (!voice && lang) {
      voice = findVoiceByLang(voices.filter(isGoogleNative), lang)
        || findVoiceByLang(voices.filter(negate(isRemoteVoice)), lang)
        || findVoiceByLang(voices.filter(isGoogleTranslate), lang)
        || findVoiceByLang(voices.filter(negate(isPremiumVoice)), lang)
        || findVoiceByLang(voices, lang)
      if (voice && isPremiumVoice(voice))
        voice = Object.assign({ autoSelect: true }, voice)
    }
    return voice
  }

  function findVoiceByName(voices, name) {
    for (var i=0; i<voices.length; i++) if (voices[i].voiceName == name) return voices[i];
    return null;
  }

  function findVoiceByLang(voices, lang) {
    var speechLang = parseLang(lang);
    var match = {};
    voices.forEach(function(voice) {
      if (voice.lang) {
        var voiceLang = parseLang(voice.lang);
        if (voiceLang.lang == speechLang.lang) {
          if (voiceLang.rest == speechLang.rest) {
            if (voice.gender == "female") match.first = match.first || voice;
            else match.second = match.second || voice;
          }
          else if (!voiceLang.rest) match.third = match.third || voice;
          else {
            if (voiceLang.lang == 'en' && voiceLang.rest == 'us') match.fourth = voice;
            else match.fourth = match.fourth || voice;
          }
        }
      }
    });
    return match.first || match.second || match.third || match.fourth;
  }



  //engine querying

  function getEngine(voice) {
    if (isGoogleTranslate(voice) && !/\s(Hebrew|Telugu)$/.test(voice.voiceName)) {
      return googleTranslateTtsEngine.ready()
        .then(function() {return googleTranslateTtsEngine})
        .catch(function(err) {
          console.warn("GoogleTranslate unavailable,", err)
          voice.autoSelect = true
          voice.voiceName = "Microsoft US English (Zira)"
          return remoteTtsEngine
        })
    }
    if (isAmazonPolly(voice)) return amazonPollyTtsEngine;
    if (isGoogleWavenet(voice)) return googleWavenetTtsEngine;
    if (isIbmWatson(voice)) return ibmWatsonTtsEngine;
    if (isRemoteVoice(voice)) return remoteTtsEngine;
    if (isGoogleNative(voice)) return new TimeoutTtsEngine(browserTtsEngine, 16*1000);
    return browserTtsEngine;
  }



  //reassembler

  function reassemble(texts, options) {
    const text = texts.join("\n\n")
    const isEA = /^zh|ko|ja/.test(options.lang)
    const punctuator = isEA ? new EastAsianPunctuator() : new LatinPunctuator()
    if (isGoogleNative(options.voice)) {
      const wordLimit = (/^(de|ru|es|id)/.test(options.lang) ? 32 : 36) * (isEA ? 2 : 1) * options.rate
      return new WordBreaker(wordLimit, punctuator).breakText(text)
    }
    else {
      if (isGoogleTranslate(options.voice)) return new CharBreaker(200, punctuator).breakText(text)
      else return new CharBreaker(750, punctuator, 200).breakText(text)
    }
  }

  //text breakers

  function WordBreaker(wordLimit, punctuator) {
    this.breakText = breakText;
    function breakText(text) {
      return punctuator.getParagraphs(text).flatMap(breakParagraph)
    }
    function breakParagraph(text) {
      return punctuator.getSentences(text).flatMap(breakSentence)
    }
    function breakSentence(sentence) {
      return merge(punctuator.getPhrases(sentence), breakPhrase);
    }
    function breakPhrase(phrase) {
      var words = punctuator.getWords(phrase);
      var splitPoint = Math.min(Math.ceil(words.length/2), wordLimit);
      var result = [];
      while (words.length) {
        result.push(words.slice(0, splitPoint).join(""));
        words = words.slice(splitPoint);
      }
      return result;
    }
    function merge(parts, breakPart) {
      var result = [];
      var group = {parts: [], wordCount: 0};
      var flush = function() {
        if (group.parts.length) {
          result.push(group.parts.join(""));
          group = {parts: [], wordCount: 0};
        }
      };
      parts.forEach(function(part) {
        var wordCount = punctuator.getWords(part).length;
        if (wordCount > wordLimit) {
          flush();
          var subParts = breakPart(part);
          for (var i=0; i<subParts.length; i++) result.push(subParts[i]);
        }
        else {
          if (group.wordCount + wordCount > wordLimit) flush();
          group.parts.push(part);
          group.wordCount += wordCount;
        }
      });
      flush();
      return result;
    }
  }

  function CharBreaker(charLimit, punctuator, paragraphCombineThreshold) {
    this.breakText = breakText;
    function breakText(text) {
      return merge(punctuator.getParagraphs(text), breakParagraph, paragraphCombineThreshold);
    }
    function breakParagraph(text) {
      return merge(punctuator.getSentences(text), breakSentence);
    }
    function breakSentence(sentence) {
      return merge(punctuator.getPhrases(sentence), breakPhrase);
    }
    function breakPhrase(phrase) {
      return merge(punctuator.getWords(phrase), breakWord);
    }
    function breakWord(word) {
      var result = [];
      while (word) {
        result.push(word.slice(0, charLimit));
        word = word.slice(charLimit);
      }
      return result;
    }
    function merge(parts, breakPart, combineThreshold) {
      var result = [];
      var group = {parts: [], charCount: 0};
      var flush = function() {
        if (group.parts.length) {
          result.push(group.parts.join(""));
          group = {parts: [], charCount: 0};
        }
      };
      parts.forEach(function(part) {
        var charCount = part.length;
        if (charCount > charLimit) {
          flush();
          var subParts = breakPart(part);
          for (var i=0; i<subParts.length; i++) result.push(subParts[i]);
        }
        else {
          if (group.charCount + charCount > (combineThreshold || charLimit)) flush();
          group.parts.push(part);
          group.charCount += charCount;
        }
      });
      flush();
      return result;
    }
  }

  //punctuators

  function LatinPunctuator() {
    this.getParagraphs = function(text) {
      return recombine(text.split(/((?:\r?\n\s*){2,})/));
    }
    this.getSentences = function(text) {
      return recombine(text.split(/([.!?]+[\s\u200b]+)/), /\b(\w|[A-Z][a-z]|Assn|Ave|Capt|Col|Comdr|Corp|Cpl|Gen|Gov|Hon|Inc|Lieut|Ltd|Rev|Univ|Jan|Feb|Mar|Apr|Aug|Sept|Oct|Nov|Dec|dept|ed|est|vol|vs)\.\s+$/);
    }
    this.getPhrases = function(sentence) {
      return recombine(sentence.split(/([,;:]\s+|\s-+\s+|—\s*)/));
    }
    this.getWords = function(sentence) {
      var tokens = sentence.trim().split(/([~@#%^*_+=<>]|[\s\-—/]+|\.(?=\w{2,})|,(?=[0-9]))/);
      var result = [];
      for (var i=0; i<tokens.length; i+=2) {
        if (tokens[i]) result.push(tokens[i]);
        if (i+1 < tokens.length) {
          if (/^[~@#%^*_+=<>]$/.test(tokens[i+1])) result.push(tokens[i+1]);
          else if (result.length) result[result.length-1] += tokens[i+1];
        }
      }
      return result;
    }
    function recombine(tokens, nonPunc) {
      var result = [];
      for (var i=0; i<tokens.length; i+=2) {
        var part = (i+1 < tokens.length) ? (tokens[i] + tokens[i+1]) : tokens[i];
        if (part) {
          if (nonPunc && result.length && nonPunc.test(result[result.length-1])) result[result.length-1] += part;
          else result.push(part);
        }
      }
      return result;
    }
  }

  function EastAsianPunctuator() {
    this.getParagraphs = function(text) {
      return recombine(text.split(/((?:\r?\n\s*){2,})/));
    }
    this.getSentences = function(text) {
      return recombine(text.split(/([.!?]+[\s\u200b]+|[\u3002\uff01]+)/));
    }
    this.getPhrases = function(sentence) {
      return recombine(sentence.split(/([,;:]\s+|[\u2025\u2026\u3000\u3001\uff0c\uff1b]+)/));
    }
    this.getWords = function(sentence) {
      return sentence.replace(/\s+/g, "").split("");
    }
    function recombine(tokens) {
      var result = [];
      for (var i=0; i<tokens.length; i+=2) {
        if (i+1 < tokens.length) result.push(tokens[i] + tokens[i+1]);
        else if (tokens[i]) result.push(tokens[i]);
      }
      return result;
    }
  }
})()
