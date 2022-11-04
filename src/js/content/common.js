const brapi = (typeof chrome != 'undefined') ? chrome : browser

function getInnerText(elem) {
  var text = elem.innerText;
  return text ? text.trim() : "";
}

function isNotEmpty(text) {
  return text;
}
