(() => {
  const original = document.getElementById("bear-navigation");
  const bearMessages = document.getElementById("bear-messages");
  const bearNavigation = document.createElement("div");
  bearNavigation.className = "bear-navigation";
  bearNavigation.setAttribute("aria-hidden", "true");
  original.after(bearNavigation);
  original.classList.add("bear-navigation-label");

  function render() {
    const total = bearMessages.children.length;
    bearNavigation.hidden = original.hidden || total < 2;
    if (bearNavigation.hidden || !bearMessages.clientWidth) return;
    const position = Math.min(total - 1, Math.max(0, bearMessages.scrollLeft / bearMessages.clientWidth));
    const current = Math.round(position);
    if (total < 2) return;
    const visible = Math.min(total, 5);
    const first = Math.min(Math.max(position - 2, 0), total - visible);
    // Keep the same dots as the window shifts, so they follow the swipe.
    if (bearNavigation.children.length !== total) {
      bearNavigation.replaceChildren(...Array.from({ length: total }, () => {
        const dot = document.createElement("span");
        dot.className = "bear-dot";
        return dot;
      }));
    }
    Array.from(bearNavigation.children).forEach((dot, index) => {
      const slot = index - first;
      const distance = Math.abs(index - position);
      const edgeScale = total <= 3 ? 1 : Math.max(.35, 1 - Math.max(0, distance - 1) * .32);
      dot.style.setProperty("--dot-offset", slot - (visible - 1) / 2);
      dot.style.setProperty("--dot-scale", index === current ? 1 : edgeScale);
      dot.hidden = slot < -.5 || slot >= visible - .5;
      dot.classList.toggle("is-active", index === current);
    });
  }

  bearMessages.addEventListener("scroll", render, { passive: true });
  new MutationObserver(render).observe(original, { attributeFilter: ["hidden", "aria-label"] });
  new ResizeObserver(render).observe(bearMessages);
  render();
})();
