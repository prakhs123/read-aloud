"use strict";

function getInnerText(elem) {
  var text = elem.innerText;
  return text ? text.trim() : "";
}
function isNotEmpty(text) {
  return text;
}