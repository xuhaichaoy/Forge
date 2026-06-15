import {
  AppWindow,
  Archive,
  Boxes,
  Camera,
  Cog,
  Container,
  FlaskConical,
  Gauge,
  GitBranch,
  Globe,
  ImageIcon,
  Keyboard,
  KeyRound,
  MonitorPlay,
  MousePointer2,
  Plug,
  Server,
  Settings,
  ShieldCheck,
  Smile,
  Sun,
  Wrench,
} from "lucide-react";
import type { SETTINGS_SECTIONS } from "../state/settings-panel-workflow";

/*
 * CODEX-REF: Codex Desktop's per-slug icon map lives in settings-page-*.js
 * as a slug -> icon component table. Each Lucide pick below targets the
 * closest visual/semantic match; Forge does not bundle Codex's bespoke
 * icon set.
 */
export function settingsSectionIcon(icon: (typeof SETTINGS_SECTIONS)[number]["icon"]) {
  switch (icon) {
    case "models":
      return <KeyRound size={15} />;
    case "images":
      return <ImageIcon size={15} />;
    case "permissions":
      return <ShieldCheck size={15} />;
    case "apps":
      return <AppWindow size={15} />;
    case "experimental":
      return <FlaskConical size={15} />;
    case "appearance":
      return <Sun size={15} />;
    case "appshots":
      return <Camera size={15} />;
    case "connections":
      return <Globe size={15} />;
    case "git":
      return <GitBranch size={15} />;
    case "usage":
      return <Gauge size={15} />;
    case "agent":
      return <Cog size={15} />;
    case "personalization":
      return <Smile size={15} />;
    case "keyboard":
      return <Keyboard size={15} />;
    case "browser":
      return <MonitorPlay size={15} />;
    case "computer":
      return <MousePointer2 size={15} />;
    case "environments":
      return <Container size={15} />;
    case "worktrees":
      return <GitBranch size={15} />;
    case "mcp":
      return <Server size={15} />;
    case "skills":
      return <Boxes size={15} />;
    case "hooks":
      return <Wrench size={15} />;
    case "plugins":
      return <Plug size={15} />;
    case "archive":
      return <Archive size={15} />;
    case "general":
    default:
      return <Settings size={15} />;
  }
}
