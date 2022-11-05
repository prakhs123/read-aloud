
registerMessagingPeer("content-script", {
  getCurrentIndex() {
    return readAloudDoc.getCurrentIndex()
  },
  getTexts({index, quietly}) {
    return readAloudDoc.getTexts(index, quietly)
  },
})
