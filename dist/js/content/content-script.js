"use strict";

(function () {
  messagingClient.listen("content-script", {
    getDocumentInfo() {
      return {
        declaredLanguage: getDeclaredLanguage()
      };
    },
    getCurrentIndex() {
      return readAloudDoc.getCurrentIndex();
    },
    async getTexts(_ref) {
      let {
        index
      } = _ref;
      const texts = await readAloudDoc.getTexts(index);
      if (texts !== null && texts !== void 0 && texts.length) {
        for (var i = 0; i < texts.length; i++) if (/[\w)]$/.test(texts[i])) texts[i] += '.';
        return texts;
      } else {
        return null;
      }
    }
  });
  function getDeclaredLanguage() {
    let lang = document.documentElement.lang || $("html").attr("xml:lang");
    if (lang) lang = lang.split(",", 1)[0].replace(/_/g, '-');
    return lang;
  }
})();