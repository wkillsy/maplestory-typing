let menuIndex = 0;
const menuItems = document.querySelectorAll("#screen-menu .menu-item");
const debug = document.getElementById("debug-selected");

function updateMenu() {
  menuItems.forEach((item, i) => {
    item.classList.toggle("selected", i === menuIndex);
  });
  debug.textContent = "selected: " + menuItems[menuIndex].dataset.mode;
}

document.addEventListener("keydown", (e) => {
  if (!document.getElementById("screen-menu").classList.contains("active")) {
    return; // メニュー画面以外では無視
  }

  if (e.key === "ArrowUp") {
    menuIndex = (menuIndex - 1 + menuItems.length) % menuItems.length;
    updateMenu();
  }

  if (e.key === "ArrowDown") {
    menuIndex = (menuIndex + 1) % menuItems.length;
    updateMenu();
  }

  if (e.key === "Enter") {
    console.log("ENTER:", menuItems[menuIndex].dataset.mode);
    // 次はここで showScreen("screen-difficulty") する
  }
});

updateMenu();
