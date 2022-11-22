
(function() {
  messagingClient.listen("content-script", {
    getDocumentInfo() {
      return {
        url: location.href,
        declaredLanguage: getDeclaredLanguage(),
      }
    },
    getCurrentIndex() {
      return readAloudDoc.getCurrentIndex()
    },
    async getTexts({index}) {
      const texts = await readAloudDoc.getTexts(index)
      if (texts) {
        for (var i=0; i<texts.length; i++) if (/[\w)]$/.test(texts[i])) texts[i] += '.'
        return texts
      }
      else {
        return null
      }
    },
  })


  function getDeclaredLanguage() {
    let lang = document.documentElement.lang || $("html").attr("xml:lang")
    if (lang) lang = lang.split(",",1)[0].replace(/_/g, '-')
    return lang
  }
})()
