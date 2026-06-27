import { Markdownish } from "./message-markdown-renderer";

export interface PlanTabContentProps {
  readonly title: string;
  readonly content: string;
}

export function PlanTabContent({ title, content }: PlanTabContentProps) {
  return (
    <section className="hc-plan-tab" aria-label={title}>
      <div className="hc-plan-tab__inner">
        <h2 className="hc-plan-tab__title">{title}</h2>
        <div className="hc-plan-tab__content">
          <Markdownish text={content} />
        </div>
      </div>
    </section>
  );
}
