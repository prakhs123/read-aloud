
try {
  importScripts(
    '/js/common.js',
    '/js/messaging.js',
    '/js/service-worker.js',
  )
}
catch (err) {
  console.error(err)
}
