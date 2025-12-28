function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => {
    s.classList.remove("active");
  });

  const target = document.getElementById(id);
  if (!target) {
    console.error("screen not found:", id);
    return;
  }
  target.classList.add("active");
}
