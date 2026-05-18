import { AlertCircle, CalendarClock, RefreshCw, X } from "lucide-react";
import type { AutomationsSurfaceModel } from "../state/automations-viewer";

export interface AutomationsPreviewPanelProps {
  model: AutomationsSurfaceModel;
  onClose?: () => void;
  onRefresh?: () => void;
}

export function AutomationsPreviewPanel({
  model,
  onClose,
  onRefresh,
}: AutomationsPreviewPanelProps) {
  return (
    <section className="hc-automations-panel" aria-label="Automations">
      <header className="hc-automations-panel-header">
        <div className="hc-automations-panel-title">
          <CalendarClock size={17} />
          <div>
            <h2>{model.title}</h2>
            <span data-status={model.status}>{statusLabel(model.status)}</span>
          </div>
        </div>
        <div className="hc-automations-panel-actions">
          {onRefresh && (
            <button
              aria-label="Refresh automations"
              className="hc-automations-icon-button"
              title="Refresh automations"
              type="button"
              onClick={onRefresh}
            >
              <RefreshCw size={15} />
            </button>
          )}
          {onClose && (
            <button
              aria-label="Close automations"
              className="hc-automations-icon-button"
              title="Close automations"
              type="button"
              onClick={onClose}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </header>

      <div className="hc-automations-panel-message" data-status={model.status}>
        {model.status === "loading" ? <RefreshCw className="hc-spin" size={15} /> : null}
        {model.status === "unsupported" || model.status === "error" ? <AlertCircle size={15} /> : null}
        <span>{model.message}</span>
      </div>

      {model.heartbeatEligibility && (
        <div className="hc-automations-heartbeat" data-eligible={model.heartbeatEligibility.isEligible ? "true" : "false"}>
          <span>Heartbeat eligibility</span>
          <strong>
            {model.heartbeatEligibility.isEligible
              ? "Eligible"
              : heartbeatReasonLabel(model.heartbeatEligibility.reason)}
          </strong>
        </div>
      )}

      {model.schedules.length > 0 ? (
        <div className="hc-automations-schedule-list">
          {model.schedules.map((schedule) => (
            <article className="hc-automations-schedule-row" key={schedule.id}>
              <div>
                <h3>{schedule.title}</h3>
                <p>{schedule.schedule}</p>
              </div>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>{schedule.status}</dd>
                </div>
                {schedule.timezone && (
                  <div>
                    <dt>Timezone</dt>
                    <dd>{schedule.timezone}</dd>
                  </div>
                )}
                {schedule.nextRunAt && (
                  <div>
                    <dt>Next run</dt>
                    <dd>{schedule.nextRunAt}</dd>
                  </div>
                )}
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <div className="hc-automations-empty">
          <span>No automation schedules to show.</span>
        </div>
      )}

      <div className="hc-automations-hooks">
        <span>Future app-server hooks</span>
        <code>{model.futureHooks.join(", ")}</code>
      </div>
    </section>
  );
}

function heartbeatReasonLabel(reason: NonNullable<AutomationsSurfaceModel["heartbeatEligibility"]>["reason"]): string {
  switch (reason) {
    case null:
      return "Not eligible";
    case "missing_conversation":
      return "No active chat";
    case "unsupported_host":
      return "Unsupported host";
    case "resuming":
      return "Resuming chat";
    case "waiting_on_user_input":
      return "Waiting on user input";
    case "waiting_on_approval":
      return "Waiting on approval";
    case "missing_turn":
      return "No completed turn";
    case "turn_in_progress":
      return "Turn in progress";
    case "pending_request":
      return "Pending request";
  }
}

function statusLabel(status: AutomationsSurfaceModel["status"]): string {
  switch (status) {
    case "empty":
      return "empty";
    case "error":
      return "error";
    case "loading":
      return "loading";
    case "offline":
      return "offline";
    case "ready":
      return "read-only";
    case "unsupported":
      return "unsupported";
  }
}
