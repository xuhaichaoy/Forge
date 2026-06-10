/*
 * CODEX-REF: composer-B7sGHJVq.js — the composer permissions dropdown (`so`, a
 * Radix DropdownMenu opened from the footer permissions chip). Clicking the chip
 * opens a COMPACT popover, NOT the full Settings > Permissions panel:
 *
 *   oo.Title  → "How should Codex actions be approved?" (composer.permissionsDropdown.title)
 *               + a right-aligned "Learn more" link (composer.permissionsDropdown.learnMore)
 *               that opens the sandboxing docs (links-CnGTBd1G.js `v`).
 *   oo.Item ×4 (NOT the 5 settings-panel modes — read-only/granular are folded away):
 *     1. default      LeftIcon Nm (raised hand)  → "Ask for approval"  (workspace-write default = "auto")
 *     2. guardian     LeftIcon _l (shield-code)  → "Approve for me"    ("guardian-approvals")
 *     3. full-access  LeftIcon vl (shield-!)     → "Full access"       (gated on an "Are you sure?" confirm)
 *     4. custom       LeftIcon Ri (settings-cog) → "Custom (config.toml)"
 *   Each row: LeftIcon + (label over a muted SubText) + a right-edge check on the
 *   SELECTED mode (`RightIcon: <selected> ? check-md : void 0`).
 *
 * Selected-mode derivation mirrors Codex `Jd`/`G`: the default row ("Ask for
 * approval") is checked for ANY of read-only/auto/granular
 * (`G = !guardian && !full && !custom`); guardian/full/custom check on the exact
 * mode string. We reuse HiCodex's existing `permissionModeFromThreadContext`
 * (state/permissions-mode.ts), which returns the same six mode strings as `Jd`.
 *
 * Deliberate HiCodex divergences (all grounded in available wiring, see /goal audit):
 *  - Guardian icon: Codex's dropdown glyph is shield-code (a shield wrapping a `>`
 *    terminal prompt); lucide has no shield-code, so we reuse the footer chip's
 *    existing ShieldUser approximation (composer-external-footer.tsx
 *    PERMISSIONS_FOOTER_ICON) to keep chip↔dropdown icons consistent. Hand /
 *    ShieldAlert / Settings / Check are exact-equivalent glyphs.
 *  - Apply path: Desktop sends a thread-scoped `update-thread-settings-for-next-turn`.
 *    HiCodex uses the protocol-backed equivalent `thread/settings/update`.
 *  - Custom: there is no named-mode config edit for "custom" (it IS the resolved
 *    config.toml), so the Custom row opens the detailed Settings > Permissions
 *    panel — the HiCodex surface where config.toml permissions are edited.
 *  - Full-access confirm: replicated as a modal (warningTitle/body/"Turn on full
 *    access"/"Cancel"); like Codex's persisted `skip-full-access-confirm` flag it
 *    stops asking after the first confirm (localStorage).
 *  - Title: HiCodex drops the "Codex" brand word ("How should actions be
 *    approved?") and omits Codex's right-aligned "Learn more" docs link, and the
 *    surface is widened past Codex's max-w-[320px] so zh-CN subtexts fit one line.
 */
import { Check, Hand, Settings, ShieldAlert, ShieldUser, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  permissionDropdownApplyMode,
  permissionDropdownBlockedReason,
  permissionsDropdownSelectedKey,
  type PermissionDropdownKey,
  type PermissionMode,
  type PermissionModeStatus,
} from "../state/permissions-mode";
import { useHiCodexIntl } from "./i18n-provider";
import { HICODEX_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "../state/hicodex-desktop-namespace";

// codex `skip-full-access-confirm` (hr) — once the user confirms full access the
// modal is not shown again. Persisted like reasoningEffortOverride.
const SKIP_FULL_ACCESS_CONFIRM_KEY = HICODEX_DESKTOP_CONFIG_KEYS.skipFullAccessConfirm;
const LEGACY_SKIP_FULL_ACCESS_CONFIRM_KEY = "hicodex.skipFullAccessConfirm";

// Wider than Codex's menuBounded (max-w-[320px]) so the two-line zh-CN subtexts
// sit on a single line per the product owner's request ("可以长一些").
const MENU_WIDTH_PX = 380;
const MENU_VIEWPORT_MARGIN_PX = 12;

interface DropdownItemDescriptor {
  key: PermissionDropdownKey;
  icon: LucideIcon;
  labelId: string;
  labelDefault: string;
  subtextId: string;
  subtextDefault: string;
}

// codex oo.Item order: default, guardian, full-access, custom.
const DROPDOWN_ITEMS: readonly DropdownItemDescriptor[] = [
  {
    key: "default",
    icon: Hand, // codex Nm (raised hand) — exact glyph
    labelId: "composer.permissionsDropdown.default.approvalOptionLabel",
    labelDefault: "Ask for approval",
    subtextId: "composer.permissionsDropdown.default.description",
    subtextDefault: "Always ask to edit external files and use the internet",
  },
  {
    key: "guardian-approvals",
    icon: ShieldUser, // codex _l (shield-code) — closest available lucide; see file header
    labelId: "composer.permissionsDropdown.guardianApproval.optionLabel",
    labelDefault: "Approve for me",
    subtextId: "composer.permissionsDropdown.guardianApproval.description",
    subtextDefault: "Only ask for actions detected as potentially unsafe",
  },
  {
    key: "full-access",
    icon: ShieldAlert, // codex vl (shield-exclamation) — exact glyph
    labelId: "composer.permissionsDropdown.fullAccess.optionLabel",
    labelDefault: "Full access",
    subtextId: "composer.permissionsDropdown.fullAccess.description",
    subtextDefault: "Unrestricted access to the internet and any file on your computer",
  },
  {
    key: "custom",
    icon: Settings, // codex Ri (settings.cog) — gear
    labelId: "composer.permissionsDropdown.custom.optionLabel",
    labelDefault: "Custom (config.toml)",
    subtextId: "composer.permissionsDropdown.custom.description",
    subtextDefault: "Uses permissions defined in config.toml",
  },
];

export interface ComposerPermissionsDropdownProps {
  anchor: HTMLElement;
  /** Resolved mode from permissionModeFromThreadContext(threadContextDefaults). */
  currentMode: PermissionModeStatus;
  requirements?: unknown;
  /** Apply a named permission mode through thread/settings/update. */
  onApplyMode: (mode: PermissionMode) => void;
  /** Custom (config.toml) → open the detailed Settings > Permissions panel. */
  onOpenCustomSettings: () => void;
  onClose: () => void;
}

export function ComposerPermissionsDropdown({
  anchor,
  currentMode,
  requirements,
  onApplyMode,
  onOpenCustomSettings,
  onClose,
}: ComposerPermissionsDropdownProps) {
  const { formatMessage } = useHiCodexIntl();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [confirmingFullAccess, setConfirmingFullAccess] = useState(false);

  /*
   * Position the popover above the anchor button (codex dropdown `side:"top"`).
   * The footer chip is bottom-aligned, so anchor the menu bottom to the chip top
   * with a small gap and translateY(-100%) (mirrors ReasoningPickerMenu).
   */
  useLayoutEffect(() => {
    const compute = () => {
      const rect = anchor.getBoundingClientRect();
      const maxLeft = window.innerWidth - MENU_WIDTH_PX - MENU_VIEWPORT_MARGIN_PX;
      const clampedLeft = Math.max(MENU_VIEWPORT_MARGIN_PX, Math.min(rect.left, maxLeft));
      setPosition({ top: rect.top - 6, left: clampedLeft });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [anchor]);

  // Close on outside click / Esc — suppressed while the confirm modal owns dismissal.
  useEffect(() => {
    if (confirmingFullAccess) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      if (target instanceof Node && anchor.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [anchor, onClose, confirmingFullAccess]);

  const selectedKey = permissionsDropdownSelectedKey(currentMode);

  // codex `w!==P&&E(P)`: applying a named mode is a no-op when it is already active.
  const applyNamedMode = useCallback(
    (key: Exclude<PermissionDropdownKey, "custom">) => {
      const targetMode = permissionDropdownApplyMode(key, currentMode);
      if (targetMode) onApplyMode(targetMode);
      onClose();
    },
    [currentMode, onApplyMode, onClose],
  );

  // codex `q`/`ke`: Full access is gated on the confirm modal unless the skip flag is set.
  const requestFullAccess = useCallback(() => {
    if (currentMode === "full-access") {
      onClose();
      return;
    }
    let skip = false;
    try {
      skip = readMigratedStorageValue(
        window.localStorage,
        SKIP_FULL_ACCESS_CONFIRM_KEY,
        [LEGACY_SKIP_FULL_ACCESS_CONFIRM_KEY],
      ) === "true";
    } catch {
      skip = false;
    }
    if (skip) {
      onApplyMode("full-access");
      onClose();
      return;
    }
    setConfirmingFullAccess(true);
  }, [currentMode, onApplyMode, onClose]);

  const confirmFullAccess = useCallback(() => {
    // codex `k(!0)`: remember the confirmation so we don't ask again.
    try {
      window.localStorage.setItem(SKIP_FULL_ACCESS_CONFIRM_KEY, "true");
    } catch {
      // localStorage unavailable — confirm still applies this time.
    }
    onApplyMode("full-access");
    onClose();
  }, [onApplyMode, onClose]);

  const handleItemClick = useCallback(
    (key: PermissionDropdownKey) => {
      if (permissionDropdownBlockedReason(key, requirements)) return;
      if (key === "custom") {
        // codex custom → resolved config.toml; HiCodex routes to the detailed editor.
        onOpenCustomSettings();
        onClose();
        return;
      }
      if (key === "full-access") {
        requestFullAccess();
        return;
      }
      applyNamedMode(key);
    },
    [applyNamedMode, onClose, onOpenCustomSettings, requestFullAccess, requirements],
  );

  if (position == null) return null;

  return (
    <>
      <div
        ref={menuRef}
        className="hc-thread-menu hc-app-popover-menu hc-composer-permissions-menu"
        role="menu"
        aria-label={formatMessage({
          id: "composer.permissionsDropdown.title",
          defaultMessage: "How should actions be approved?",
        })}
        data-state="open"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          width: MENU_WIDTH_PX,
          transform: "translateY(-100%)",
        }}
      >
        {/* codex oo.Title — heading only (HiCodex drops the "Codex" brand word
            and the "Learn more" link per the product owner's request). */}
        <div className="hc-composer-permissions-title">
          {formatMessage({
            id: "composer.permissionsDropdown.title",
            defaultMessage: "How should actions be approved?",
          })}
        </div>
        {DROPDOWN_ITEMS.map((item) => {
          const Icon = item.icon;
          const isSelected = item.key === selectedKey;
          const blockedReason = permissionDropdownBlockedReason(item.key, requirements);
          const disabled = blockedReason !== "";
          return (
            <button
              key={item.key}
              type="button"
              role="menuitemradio"
              aria-checked={isSelected}
              aria-disabled={disabled || undefined}
              disabled={disabled}
              className="hc-thread-menu-item hc-composer-permissions-item"
              data-permission-key={item.key}
              data-selected={isSelected ? "true" : undefined}
              onClick={() => handleItemClick(item.key)}
            >
              <Icon size={18} className="hc-composer-permissions-item-icon" aria-hidden />
              <span className="hc-composer-permissions-item-body">
                <span className="hc-composer-permissions-item-label">
                  {formatMessage({ id: item.labelId, defaultMessage: item.labelDefault })}
                </span>
                <span className="hc-composer-permissions-item-subtext">
                  {blockedReason || formatMessage({ id: item.subtextId, defaultMessage: item.subtextDefault })}
                </span>
              </span>
              {isSelected && (
                <Check size={16} className="hc-composer-permissions-item-check" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
      {confirmingFullAccess && (
        <FullAccessConfirmDialog
          onConfirm={confirmFullAccess}
          onCancel={() => setConfirmingFullAccess(false)}
        />
      )}
    </>
  );
}

/*
 * codex `zm` — the full-access confirmation modal. Reuses HiCodex's shared dialog
 * surface (hc-settings-backdrop / hc-thread-dialog-panel, cf. confirm-dialog.tsx)
 * with the Codex strings + a danger confirm button.
 */
function FullAccessConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { formatMessage } = useHiCodexIntl();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="hc-settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="hc-thread-dialog-panel hc-full-access-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={formatMessage({
          id: "composer.mode.agentMode.fullAccessConfirm.warningTitle",
          defaultMessage: "Are you sure?",
        })}
      >
        <header>
          <div>
            {formatMessage({
              id: "composer.mode.agentMode.fullAccessConfirm.warningTitle",
              defaultMessage: "Are you sure?",
            })}
          </div>
        </header>
        <div className="hc-thread-dialog-body">
          <p>
            {formatMessage({
              id: "composer.mode.agentMode.fullAccessConfirm.warningDescription",
              defaultMessage:
                "Full access lets Codex access the internet and edit any file on your computer without asking for your approval. This comes with risks like data loss and prompt injection.",
            })}
          </p>
        </div>
        <footer>
          <button type="button" className="hc-kb-topbar-btn" onClick={onCancel} autoFocus>
            {formatMessage({
              id: "composer.mode.agentMode.fullAccessConfirm.goBack",
              defaultMessage: "Cancel",
            })}
          </button>
          <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--danger" onClick={onConfirm}>
            {formatMessage({
              id: "composer.mode.agentMode.fullAccessConfirm.turnOnButton",
              defaultMessage: "Turn on full access",
            })}
          </button>
        </footer>
      </div>
    </div>
  );
}
