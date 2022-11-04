"use strict";

const brapi = typeof chrome != 'undefined' ? chrome : browser;
async function readAloud() {
  let speech = null;
  player = {
    stop() {
      if (speech) speech.stop();
      speech = null;
    }
  };
  let currentIndex = await readAloudDoc.getCurrentIndex();
  let texts = await readAloudDoc.getTexts(currentIndex);
  while (texts) {
    speech = new Speech(texts, {
      voiceName: "Google US English",
      lang: "en"
    });
    await speech.play();
    await new Promise(f => speech.onEnd = f);
    speech = null;
    texts = await readAloudDoc.getTexts(++currentIndex);
  }
}
async function stopIt() {
  const player = await playerPromise;
  player.stop();
}
function reportError(err) {
  console.error(err);
  brapi.runtime.sendMessage({
    method: "onError",
    error: err.message
  });
}
const playerPromise = readAloud();