"use strict";

registerMessagingPeer("content-script", {
  getCurrentIndex() {
    return readAloudDoc.getCurrentIndex();
  },
  getTexts(_ref) {
    let {
      index,
      quietly
    } = _ref;
    return readAloudDoc.getTexts(index, quietly);
  }
});