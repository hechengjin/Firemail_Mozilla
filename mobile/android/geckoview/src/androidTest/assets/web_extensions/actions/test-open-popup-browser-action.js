window.addEventListener("DOMContentLoaded", init);

function init() {
  document.body.addEventListener("click", event => {
    browser.browserAction.openPopup();
  });
}
