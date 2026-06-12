import { Check, Hand, Settings, ShieldAlert, ShieldUser, type LucideIcon } from "lucide-react";
import type { PermissionDropdownKey } from "../state/permissions-mode";
import { useHiCodexIntl } from "./i18n-provider";

interface PermissionDropdownItemDescriptor {
  key: PermissionDropdownKey;
  icon: LucideIcon;
  labelId: string;
  labelDefault: string;
  subtextId: string;
  subtextDefault: string;
}

// codex oo.Item order: default, guardian, full-access, custom.
export const PERMISSION_DROPDOWN_ITEMS: readonly PermissionDropdownItemDescriptor[] = [
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
    icon: ShieldUser, // codex _l (shield-code) — closest available lucide; see parent file header
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

interface ComposerPermissionsDropdownItemProps {
  item: PermissionDropdownItemDescriptor;
  isSelected: boolean;
  blockedReason: string;
  onClick: () => void;
}

export function ComposerPermissionsDropdownItem({
  item,
  isSelected,
  blockedReason,
  onClick,
}: ComposerPermissionsDropdownItemProps) {
  const { formatMessage } = useHiCodexIntl();
  const Icon = item.icon;
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
      onClick={onClick}
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
}
