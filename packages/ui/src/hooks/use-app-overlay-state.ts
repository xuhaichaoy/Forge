import { useCallback, useEffect, useState } from "react";

interface UseAppOverlayStateInput {
  loadPermissionsRequirements: () => Promise<unknown | undefined>;
  onModelPickerOpen: () => void;
  onPermissionsRequirementsError: (error: unknown) => void;
}

export function useAppOverlayState({
  loadPermissionsRequirements,
  onModelPickerOpen,
  onPermissionsRequirementsError,
}: UseAppOverlayStateInput) {
  const [modelPickerAnchor, setModelPickerAnchor] = useState<HTMLElement | null>(null);
  const [reasoningPickerAnchor, setReasoningPickerAnchor] = useState<HTMLElement | null>(null);
  const [permissionsPickerAnchor, setPermissionsPickerAnchor] = useState<HTMLElement | null>(null);
  const [permissionsRequirements, setPermissionsRequirements] = useState<unknown | undefined>(undefined);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);

  const toggleModelPickerAnchor = useCallback((anchor: HTMLElement) => {
    setModelPickerAnchor((current) => (current === anchor ? null : anchor));
  }, []);
  const closeModelPicker = useCallback(() => {
    setModelPickerAnchor(null);
  }, []);

  const toggleReasoningPickerAnchor = useCallback((anchor: HTMLElement) => {
    setReasoningPickerAnchor((current) => (current === anchor ? null : anchor));
  }, []);
  const closeReasoningPicker = useCallback(() => {
    setReasoningPickerAnchor(null);
  }, []);

  const togglePermissionsPickerAnchor = useCallback((anchor: HTMLElement) => {
    setPermissionsPickerAnchor((current) => (current === anchor ? null : anchor));
  }, []);
  const closePermissionsPicker = useCallback(() => {
    setPermissionsPickerAnchor(null);
  }, []);

  const openKeyboardShortcuts = useCallback(() => {
    setKeyboardShortcutsOpen(true);
  }, []);
  const closeKeyboardShortcuts = useCallback(() => {
    setKeyboardShortcutsOpen(false);
  }, []);

  useEffect(() => {
    if (modelPickerAnchor) onModelPickerOpen();
  }, [modelPickerAnchor, onModelPickerOpen]);

  useEffect(() => {
    if (!permissionsPickerAnchor) {
      setPermissionsRequirements(undefined);
      return;
    }
    let cancelled = false;
    setPermissionsRequirements(undefined);
    void loadPermissionsRequirements()
      .then((requirements) => {
        if (!cancelled) setPermissionsRequirements(requirements);
      })
      .catch((error: unknown) => {
        if (!cancelled) onPermissionsRequirementsError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [loadPermissionsRequirements, onPermissionsRequirementsError, permissionsPickerAnchor]);

  return {
    closeKeyboardShortcuts,
    closeModelPicker,
    closePermissionsPicker,
    closeReasoningPicker,
    keyboardShortcutsOpen,
    modelPickerAnchor,
    openKeyboardShortcuts,
    permissionsPickerAnchor,
    permissionsRequirements,
    reasoningPickerAnchor,
    toggleModelPickerAnchor,
    togglePermissionsPickerAnchor,
    toggleReasoningPickerAnchor,
  };
}
