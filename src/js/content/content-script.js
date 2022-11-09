
(function() {
  messagingClient.listen("content-script", {
    getDocumentInfo() {
      return {
        declaredLanguage: getDeclaredLanguage(),
      }
    },
    getCurrentIndex() {
      return readAloudDoc.getCurrentIndex()
    },
    getTexts({index, quietly}) {
      return readAloudDoc.getTexts(index, quietly)
        .then(texts => texts.length ? texts : null)
        .then(texts => {
          if (texts) for (var i=0; i<texts.length; i++) if (/[\w)]$/.test(texts[i])) texts[i] += '.';
          return texts
        })
    },
  })


  function getDeclaredLanguage() {
    let lang = document.documentElement.lang || $("html").attr("xml:lang")
    if (lang) lang = lang.split(",",1)[0].replace(/_/g, '-')
    return lang
  }
})()
