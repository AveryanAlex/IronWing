import type { SessionConnectionFormState } from "../platform/session";
import {
  validateTransportDescriptor,
  type ConnectFormValue,
  type TransportDescriptor,
} from "../../transport";

export type ConnectionFieldErrors = Partial<
  Record<"udpBind" | "tcpAddress" | "serialPort" | "baud" | "selectedBtDevice", string>
>;

export function toConnectFormValue(form: SessionConnectionFormState): ConnectFormValue {
  return {
    bind_addr: form.udpBind.trim(),
    address: (form.mode === "tcp" ? form.tcpAddress : form.selectedBtDevice).trim(),
    port: form.serialPort.trim(),
    baud: form.baud,
    demo_vehicle_preset: form.demoVehiclePreset,
  };
}

export function validateConnectionForm(
  descriptor: TransportDescriptor,
  form: SessionConnectionFormState,
): ConnectionFieldErrors {
  const errors = validateTransportDescriptor(descriptor, toConnectFormValue(form));
  return mapConnectionFieldErrors(form.mode, errors);
}

export function mapConnectionFieldErrors(
  mode: SessionConnectionFormState["mode"],
  errors: string[],
): ConnectionFieldErrors {
  const fieldErrors: ConnectionFieldErrors = {};

  for (const error of errors) {
    if (error.includes("bind_addr")) {
      fieldErrors.udpBind = error;
      continue;
    }

    if (error.includes("address")) {
      if (mode === "tcp") {
        fieldErrors.tcpAddress = error;
      } else {
        fieldErrors.selectedBtDevice = error;
      }
      continue;
    }

    if (error.includes("port")) {
      fieldErrors.serialPort = error;
      continue;
    }

    if (error.includes("baud")) {
      fieldErrors.baud = error;
    }
  }

  return fieldErrors;
}

export function firstConnectionFieldError(errors: ConnectionFieldErrors): string | null {
  return errors.udpBind ?? errors.tcpAddress ?? errors.serialPort ?? errors.baud ?? errors.selectedBtDevice ?? null;
}

export function hasConnectionFieldErrors(errors: ConnectionFieldErrors): boolean {
  return firstConnectionFieldError(errors) !== null;
}
