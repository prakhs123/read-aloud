"use strict";

const popupMessagingPeer = registerMessagingPeer("popup", {
  onPlaybackStatusUpdate
});
popupMessagingPeer.sendTo("service-worker", {
  method: "readAloud"
}).catch(console.error);
function onPlaybackStatusUpdate(message) {
  console.info(message);
}