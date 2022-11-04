"use strict";

brapi.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  const handler = handlers[message.method];
  if (handler) {
    Promise.resolve(message).then(handler).then(result => sendResponse({
      result
    })).catch(err => sendResponse({
      error: err.message
    }));
    return true;
  } else {
    sendResponse({
      error: "Bad method"
    });
  }
});
const handlers = {
  async readAloud() {
    //stop current
    const playerTabId = await getState("playerTabId");
    if (playerTabId) {
      brapi.scripting.executeScript({
        target: {
          tabId: playerTabId
        },
        func: function () {
          stopIt().catch(console.error);
        }
      });
    }

    //start new
    const tab = await getActiveTab();
    await setState({
      playerTabId: tab.id
    });
    brapi.scripting.executeScript({
      target: {
        tabId: tab.id
      },
      files: ['js/content/common.js', 'js/content/html-doc.js', 'js/player/engines.js', 'js/player/speech.js', 'js/player/player.js']
    });
  }
};