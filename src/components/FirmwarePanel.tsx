import { Cpu } from "lucide-react";
import { FirmwareFlashWizard } from "./setup/FirmwareFlashWizard";
import type { FirmwareController } from "../hooks/use-firmware";

export type FirmwarePanelProps = {
  firmware: FirmwareController;
  connected: boolean;
  onSaveParams?: () => Promise<void>;
};

export function FirmwarePanel({ firmware, connected, onSaveParams }: FirmwarePanelProps) {
  return (
    <div data-testid="firmware-panel" className="flex h-full flex-col gap-4 overflow-y-auto">
      <section className="rounded-lg border border-border-light bg-accent/5 p-4">
        <div className="flex items-start gap-2.5">
          <Cpu size={14} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Firmware</h2>
            <p className="mt-0.5 text-[10px] leading-relaxed text-text-muted">
              Install, update, or recover your flight controller firmware. Supports serial bootloader flashing and DFU bootloader install for unresponsive boards.
            </p>
          </div>
        </div>
      </section>

      <FirmwareFlashWizard firmware={firmware} connected={connected} onSaveParams={onSaveParams} />
    </div>
  );
}
