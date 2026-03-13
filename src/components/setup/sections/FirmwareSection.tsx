import { Cpu } from "lucide-react";
import { SetupSectionIntro } from "../shared/SetupSectionIntro";
import { FirmwareFlashWizard } from "../FirmwareFlashWizard";
import type { useFirmware } from "../../../hooks/use-firmware";

export type FirmwareSectionProps = {
  firmware: ReturnType<typeof useFirmware>;
  connected: boolean;
  onSaveParams?: () => Promise<void>;
};

export function FirmwareSection({ firmware, connected, onSaveParams }: FirmwareSectionProps) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <SetupSectionIntro
        icon={Cpu}
        title="Firmware"
        description="Install, update, or recover your flight controller firmware. Supports serial bootloader flashing and DFU recovery for unresponsive boards."
      />
      <FirmwareFlashWizard firmware={firmware} connected={connected} onSaveParams={onSaveParams} />
    </div>
  );
}
