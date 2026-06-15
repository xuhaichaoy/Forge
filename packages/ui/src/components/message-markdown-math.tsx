import { renderToString as renderKatexToString } from "katex";
import { useForgeIntl } from "./i18n-provider";

export function MathDisplay({ text }: { text: string }) {
  const { formatMessage } = useForgeIntl();
  const html = renderKatexHtml(text, true);
  return (
    <div className="hc-math-display" role="img" aria-label={formatMessage({ id: "hc.markdown.math.label", defaultMessage: "Math: {text}" }, { text })}>
      {html
        ? <span dangerouslySetInnerHTML={{ __html: html }} />
        : <span className="hc-math-source">{text}</span>}
    </div>
  );
}

export function MathInline({ text }: { text: string }) {
  const { formatMessage } = useForgeIntl();
  const html = renderKatexHtml(text, false);
  const label = formatMessage({ id: "hc.markdown.math.label", defaultMessage: "Math: {text}" }, { text });
  return html
    ? <span className="hc-math-inline" aria-label={label} dangerouslySetInnerHTML={{ __html: html }} />
    : <span className="hc-math-inline" aria-label={label}>{text}</span>;
}

function renderKatexHtml(text: string, displayMode: boolean): string | null {
  try {
    return renderKatexToString(text, {
      displayMode,
      output: "htmlAndMathml",
      strict: "ignore",
      throwOnError: false,
      trust: false,
    });
  } catch {
    return null;
  }
}
