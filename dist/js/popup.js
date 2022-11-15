"use strict";

messagingClient.listen("popup", {
  onPlaybackStatusUpdate(message) {
    console.info(message);
  }
});
messagingClient.sendTo("service-worker", {
  method: "readAloud"
}).catch(console.error);