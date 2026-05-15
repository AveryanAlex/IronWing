import {
  resolveVehicleIconKind,
  VEHICLE_ICON_SVG,
  type VehicleIconKind,
} from "../overview/vehicle-icon";

export type VehicleMarkerElementOptions = {
  mavType?: number;
  iconKind?: VehicleIconKind;
  headingDeg?: number;
  className?: string;
};

export type HomeMarkerElementOptions = {
  label?: string;
  ariaLabel?: string;
  className?: string;
  stopClickPropagation?: boolean;
};

export type DeviceMarkerElementOptions = {
  ariaLabel?: string;
  className?: string;
};

export type GuidedTargetMarkerElementOptions = {
  altitudeM?: number;
  className?: string;
};

export function createVehicleMarkerElement(options: VehicleMarkerElementOptions = {}): HTMLDivElement {
  const element = document.createElement("div");
  element.className = joinClassNames("vehicle-marker", options.className);
  setVehicleMarkerIcon(element, options);

  if (typeof options.headingDeg === "number") {
    setVehicleMarkerHeading(element, options.headingDeg);
  }

  return element;
}

export function setVehicleMarkerIcon(
  element: HTMLElement,
  options: Pick<VehicleMarkerElementOptions, "mavType" | "iconKind"> = {},
): SVGSVGElement | null {
  const iconKind = options.iconKind ?? resolveVehicleIconKind(options.mavType);
  element.dataset.iconKind = iconKind;
  element.innerHTML = VEHICLE_ICON_SVG[iconKind];
  return element.querySelector("svg");
}

export function setVehicleMarkerHeading(element: HTMLElement, headingDeg: number): boolean {
  const svg = element.querySelector("svg");

  if (!(svg instanceof SVGSVGElement)) {
    return false;
  }

  svg.style.transform = `rotate(${headingDeg}deg)`;
  return true;
}

export function createHomeMarkerElement(options: HomeMarkerElementOptions = {}): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = joinClassNames("mission-pin is-home", options.className);
  element.textContent = options.label ?? "H";
  element.setAttribute("aria-label", options.ariaLabel ?? "Home position marker");

  if (options.stopClickPropagation ?? true) {
    element.addEventListener("click", (event) => event.stopPropagation());
  }

  return element;
}

export function createDeviceMarkerElement(options: DeviceMarkerElementOptions = {}): HTMLDivElement {
  const element = document.createElement("div");
  element.className = joinClassNames("device-location-marker", options.className);
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", options.ariaLabel ?? "Device location marker");
  return element;
}

export function createGuidedTargetMarkerElement(options: GuidedTargetMarkerElementOptions = {}): HTMLDivElement {
  const element = document.createElement("div");
  element.className = joinClassNames("guided-target-marker", options.className);
  element.setAttribute("role", "img");
  updateGuidedTargetMarkerElement(element, options);
  return element;
}

export function updateGuidedTargetMarkerElement(
  element: HTMLElement,
  options: GuidedTargetMarkerElementOptions = {},
): void {
  const altitudeLabel = Number.isFinite(options.altitudeM) ? ` at ${Math.round(Number(options.altitudeM))} m` : "";
  const label = `Guided target${altitudeLabel}`;

  element.setAttribute("aria-label", label);
  element.setAttribute("title", label);
  element.replaceChildren();

  const halo = document.createElement("span");
  halo.className = "guided-target-marker__halo";
  halo.setAttribute("aria-hidden", "true");

  const pin = document.createElement("span");
  pin.className = "guided-target-marker__pin";
  pin.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "guided-target-marker__label";
  text.textContent = "G";

  pin.append(text);
  element.append(halo, pin);
}

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}
