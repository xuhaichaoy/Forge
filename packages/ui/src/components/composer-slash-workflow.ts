import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SLASH_COMMANDS,
  filterSlashCommands,
  slashCommandsForComposerMode,
  type ComposerMode,
} from "../state/composer-workflow";
import { slashSearchText } from "./composer-text-utils";

export function useComposerSlashWorkflow(input: string, mode: ComposerMode) {
  const slashMenuRef = useRef<HTMLDivElement | null>(null);
  const slashActiveRowRef = useRef<HTMLButtonElement | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashQuery = useMemo(() => slashSearchText(input), [input]);
  const availableSlashCommands = useMemo(() => slashCommandsForComposerMode(mode, DEFAULT_SLASH_COMMANDS), [mode]);
  const slashCommands = useMemo(
    () => filterSlashCommands(slashQuery, availableSlashCommands).filter((command) => !command.hidden),
    [availableSlashCommands, slashQuery],
  );
  const selectedSlashCommand = slashCommands[Math.min(slashIndex, Math.max(0, slashCommands.length - 1))] ?? null;

  useLayoutEffect(() => {
    if (!slashOpen) return;
    const menu = slashMenuRef.current;
    const row = slashActiveRowRef.current;
    if (!menu || !row) return;
    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    const visibleTop = menu.scrollTop;
    const visibleBottom = visibleTop + menu.clientHeight;
    if (rowTop < visibleTop) {
      menu.scrollTop = Math.max(0, rowTop - 6);
    } else if (rowBottom > visibleBottom) {
      menu.scrollTop = rowBottom - menu.clientHeight + 6;
    }
  }, [slashCommands.length, slashIndex, slashOpen]);

  return {
    slashMenuRef,
    slashActiveRowRef,
    slashOpen,
    setSlashOpen,
    slashIndex,
    setSlashIndex,
    slashCommands,
    selectedSlashCommand,
  };
}
