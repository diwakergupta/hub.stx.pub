export interface PanzoomOptions {
  maxScale?: number;
  minScale?: number;
  zoomSpeed?: number;
}

export interface PanzoomInstance {
  dispose(): void;
  reset(): void;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function panzoom(
  container: HTMLElement,
  target: SVGGraphicsElement,
  options: PanzoomOptions = {},
): PanzoomInstance {
  const {
    maxScale = 8,
    minScale = 0.35,
    zoomSpeed = 0.0015,
  } = options;

  let scale = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let lastX = 0;
  let lastY = 0;

  container.style.touchAction = "none";
  container.style.cursor = "grab";
  target.style.transformOrigin = "0 0";
  target.style.transformBox = "fill-box";

  const apply = () => {
    target.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const direction = -event.deltaY;
    const newScale = clamp(scale * (1 + direction * zoomSpeed), minScale, maxScale);
    if (newScale === scale) return;

    const rect = target.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const scaleFactor = newScale / scale;

    panX = offsetX - scaleFactor * (offsetX - panX);
    panY = offsetY - scaleFactor * (offsetY - panY);
    scale = newScale;
    apply();
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    isPanning = true;
    lastX = event.clientX;
    lastY = event.clientY;
    container.setPointerCapture(event.pointerId);
    container.style.cursor = "grabbing";
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!isPanning) return;
    panX += event.clientX - lastX;
    panY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    apply();
  };

  const endPan = (event: PointerEvent) => {
    if (!isPanning) return;
    isPanning = false;
    try {
      container.releasePointerCapture(event.pointerId);
    } catch {
      /* ignored */
    }
    container.style.cursor = "grab";
  };

  const handleLeave = (event: PointerEvent) => {
    if (isPanning) {
      endPan(event);
    }
  };

  const handleDoubleClick = (event: MouseEvent) => {
    event.preventDefault();
    reset();
  };

  const reset = () => {
    scale = 1;
    panX = 0;
    panY = 0;
    apply();
  };

  container.addEventListener("wheel", handleWheel, { passive: false });
  container.addEventListener("pointerdown", handlePointerDown);
  container.addEventListener("pointermove", handlePointerMove);
  container.addEventListener("pointerup", endPan);
  container.addEventListener("pointercancel", endPan);
  container.addEventListener("pointerleave", handleLeave);
  container.addEventListener("dblclick", handleDoubleClick);

  apply();

  return {
    dispose() {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", endPan);
      container.removeEventListener("pointercancel", endPan);
      container.removeEventListener("pointerleave", handleLeave);
      container.removeEventListener("dblclick", handleDoubleClick);
      container.style.cursor = "default";
      container.style.touchAction = "auto";
      target.style.transform = "";
      target.style.transformOrigin = "";
      target.style.transformBox = "";
    },
    reset,
  };
}

export default panzoom;
