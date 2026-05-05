document.addEventListener("DOMContentLoaded", function() {
  var toggleBtn = document.getElementById("toggleBtn");
  var clearBtn = document.getElementById("clearBtn");
  var modeBtns = document.querySelectorAll(".mode-btn");
  var isActive = false;

  function sendToContent(msg) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, msg);
      }
    });
  }

  toggleBtn.addEventListener("click", function() {
    isActive = !isActive;
    sendToContent({ action: "toggle" });
    toggleBtn.textContent = isActive ? "Disable (F9)" : "Enable (F9)";
    toggleBtn.classList.toggle("on", isActive);
    document.getElementById("wrapper").classList.toggle("active", isActive);
  });

  clearBtn.addEventListener("click", function() {
    sendToContent({ action: "clear" });
  });

  modeBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      modeBtns.forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");
      sendToContent({ action: "setMode", mode: btn.dataset.mode });
    });
  });

  chrome.storage.local.get("gesturePresenterActive", function(data) {
    if (data.gesturePresenterActive) {
      isActive = true;
      toggleBtn.textContent = "Disable (F9)";
      toggleBtn.classList.add("on");
      document.getElementById("wrapper").classList.add("active");
    }
  });
});
