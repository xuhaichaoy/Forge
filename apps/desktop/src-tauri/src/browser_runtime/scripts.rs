use serde_json::Value;

use super::cdp::browser_iab_frame_id;

pub(crate) fn browser_iab_eval_callback_script(script: &str) -> String {
    let script = browser_iab_json_string_literal(script);
    let mut wrapper = String::from(
        r#"(() => {
  const __forgeEvalSource = "#,
    );
    wrapper.push_str(&script);
    wrapper.push_str(
        r#";
  try {
    const __forgeEvalResult = (0, eval)(__forgeEvalSource);
    return JSON.stringify(__forgeEvalResult === undefined ? null : __forgeEvalResult);
  } catch (error) {
    return JSON.stringify({
      ok: false,
      text: error && error.message ? String(error.message) : String(error),
      description: error && error.stack ? String(error.stack) : String(error),
    });
  }
})()"#,
    );
    wrapper
}

pub(crate) fn browser_iab_runtime_evaluate_script(expression: &str) -> String {
    let expression = browser_iab_json_string_literal(expression);
    let mut script = String::from(
        r#"(() => {
  const __forgeExpression = "#,
    );
    script.push_str(&expression);
    script.push_str(
        r#";
  const __forgeSerialize = (value, depth = 0) => {
    if (value === undefined) return { type: "undefined" };
    if (value === null) return { type: "object", subtype: "null", value: null };
    const valueType = typeof value;
    if (valueType === "string" || valueType === "number" || valueType === "boolean") {
      return { type: valueType, value };
    }
    if (valueType === "bigint") return { type: "bigint", description: String(value) };
    if (valueType === "function") return { type: "function", description: value.name || "function" };
    if (valueType === "symbol") return { type: "symbol", description: String(value) };
    if (depth > 3) return { type: "object", description: Object.prototype.toString.call(value) };
    try {
      return {
        type: "object",
        subtype: Array.isArray(value) ? "array" : undefined,
        value: JSON.parse(JSON.stringify(value)),
      };
    } catch {
      return { type: "object", description: Object.prototype.toString.call(value) };
    }
  };
  try {
    const __forgeSource = String(__forgeExpression || "");
    const __forgeTrimmed = __forgeSource.trim();
    const __forgeValue = __forgeTrimmed.startsWith("const arg")
      && __forgeTrimmed.includes("const __playwrightEvaluate =")
      && __forgeTrimmed.includes("return ")
        ? (new Function(__forgeTrimmed.replace("return await __playwrightEvaluate(arg);", "return __playwrightEvaluate(arg);")))()
        : (0, eval)(__forgeSource);
    if (__forgeValue && typeof __forgeValue.then === "function") {
      return {
        ok: false,
        text: "Forge Browser iab probe cannot await Promise results from Runtime.evaluate.",
        description: "Use a synchronous expression or a supported Browser iab evaluate path.",
      };
    }
    return { ok: true, remoteObject: __forgeSerialize(__forgeValue) };
  } catch (error) {
    return {
      ok: false,
      text: error && error.message ? String(error.message) : String(error),
      description: error && error.stack ? String(error.stack) : String(error),
    };
  }
})()"#,
    );
    script
}

pub(crate) fn browser_iab_accessibility_snapshot_script() -> String {
    r#"(() => {
  const maxLines = 180;
  const maxCandidates = 480;
  const lines = [];
  const textNameRoles = new Set(["heading", "button", "link", "listitem"]);
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const visible = (element) => {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return true;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const roleFor = (element) => {
    const explicit = normalize(element.getAttribute("role"));
    if (explicit) return explicit;
    const tag = element.tagName;
    if (/^H[1-6]$/.test(tag)) return "heading";
    if (tag === "A" && element.hasAttribute("href")) return "link";
    if (tag === "BUTTON") return "button";
    if (tag === "TEXTAREA") return "textbox";
    if (tag === "SELECT") return "combobox";
    if (tag === "NAV") return "navigation";
    if (tag === "MAIN") return "main";
    if (tag === "ARTICLE") return "article";
    if (tag === "SECTION") return "region";
    if (tag === "UL" || tag === "OL") return "list";
    if (tag === "LI") return "listitem";
    if (tag === "IMG") return "img";
    if (tag === "INPUT") {
      const type = normalize(element.getAttribute("type")).toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "submit" || type === "button") return "button";
      return "textbox";
    }
    return "";
  };
  const nameFor = (element, role) => {
    const labelledBy = normalize(element.getAttribute("aria-labelledby"));
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => normalize(document.getElementById(id)?.textContent))
        .filter(Boolean)
        .join(" ");
      if (text) return text;
    }
    const direct = normalize(element.getAttribute("aria-label"))
      || normalize(element.getAttribute("alt"))
      || normalize(element.getAttribute("title"))
      || normalize(element.getAttribute("placeholder"))
      || normalize(element.value);
    if (direct) return direct;
    if (!textNameRoles.has(role)) return "";
    const text = normalize(element.textContent);
    if (role && text) return text.slice(0, 120);
    return "";
  };
  const pushLine = (role, name, extra = "") => {
    if (lines.length >= maxLines) return;
    const quoted = name ? ` "${name.replace(/"/g, '\\"')}"` : "";
    lines.push(`- ${role}${quoted}${extra}`);
  };
  const selector = [
    "[role]",
    "[aria-label]",
    "[aria-labelledby]",
    "a[href]",
    "button",
    "input",
    "textarea",
    "select",
    "summary",
    "h1,h2,h3,h4,h5,h6",
    "nav",
    "main",
    "article",
    "section",
    "li",
    "img[alt]"
  ].join(",");
  const addCandidate = (element) => {
    if (lines.length >= maxLines || !visible(element)) return;
    const role = roleFor(element);
    if (!role) return;
    const name = nameFor(element, role);
    let extra = "";
    if (role === "heading") {
      const level = Number(element.tagName.slice(1));
      if (Number.isFinite(level)) extra = ` [level=${level}]`;
    }
    pushLine(role, name, extra);
  };
  try {
    const candidates = Array.from(document.querySelectorAll(selector)).slice(0, maxCandidates);
    for (const element of candidates) addCandidate(element);
    if (lines.length === 0) {
      const text = normalize((document.body || document.documentElement)?.textContent).slice(0, 240);
      if (text) pushLine("text", text);
    }
    return { ok: true, remoteObject: { type: "string", value: lines.join("\n") } };
  } catch (error) {
    return {
      ok: false,
      text: error && error.message ? String(error.message) : String(error),
      description: error && error.stack ? String(error.stack) : String(error),
    };
  }
})()"#
    .to_string()
}

pub(crate) fn browser_iab_minimal_playwright_injection_script() -> String {
    r#"(() => {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const snapshot = (root) => {
    const scope = root && root.nodeType ? root : document.body || document.documentElement;
    const lines = [];
    const add = (role, name) => {
      if (lines.length >= 120) return;
      const text = normalize(name).slice(0, 140).replace(/"/g, '\\"');
      lines.push(text ? `- ${role} "${text}"` : `- ${role}`);
    };
    const selector = [
      "[role]",
      "[aria-label]",
      "a[href]",
      "button",
      "input",
      "textarea",
      "select",
      "h1,h2,h3,h4,h5,h6",
      "img[alt]"
    ].join(",");
    const roleFor = (element) => {
      const explicit = normalize(element.getAttribute("role"));
      if (explicit) return explicit;
      const tag = element.tagName;
      if (/^H[1-6]$/.test(tag)) return "heading";
      if (tag === "A" && element.hasAttribute("href")) return "link";
      if (tag === "BUTTON") return "button";
      if (tag === "TEXTAREA") return "textbox";
      if (tag === "SELECT") return "combobox";
      if (tag === "IMG") return "img";
      if (tag === "INPUT") {
        const type = normalize(element.getAttribute("type")).toLowerCase();
        if (type === "checkbox") return "checkbox";
        if (type === "radio") return "radio";
        if (type === "submit" || type === "button") return "button";
        return "textbox";
      }
      return "generic";
    };
    const nameFor = (element, role) => {
      const direct = normalize(element.getAttribute("aria-label"))
        || normalize(element.getAttribute("alt"))
        || normalize(element.getAttribute("title"))
        || normalize(element.getAttribute("placeholder"))
        || normalize(element.value);
      if (direct) return direct;
      if (role === "heading" || role === "button" || role === "link") {
        return normalize(element.textContent);
      }
      return "";
    };
    try {
      const candidates = Array.from((scope || document).querySelectorAll(selector)).slice(0, 360);
      for (const element of candidates) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) continue;
        const role = roleFor(element);
        add(role, nameFor(element, role));
      }
    } catch {}
    if (lines.length === 0) {
      add("text", normalize(scope?.textContent || document.title || "").slice(0, 240));
    }
    return lines.join("\n");
  };
  Object.defineProperty(window, "__codexPlaywrightInjected", {
    configurable: true,
    enumerable: false,
    value: { ariaSnapshot: snapshot },
    writable: true,
  });
  return { ok: true, remoteObject: { type: "undefined" } };
})()"#
    .to_string()
}

pub(crate) fn browser_iab_dom_query_selector_script(params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let mut script = String::from(
        r#"(() => {
"#,
    );
    script.push_str(browser_iab_dom_registry_prelude());
    script.push_str(
        r#"
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  try {
    const registry = __forgeCdpRegistry();
    const selector = String(params.selector || "");
    if (!selector) return { ok: false, text: "DOM.querySelector requires selector." };
    const root = registry.nodeFor(Number(params.nodeId || params.backendNodeId || 1)) || document;
    const element = typeof root.querySelector === "function" ? root.querySelector(selector) : null;
    if (!element) return { ok: true, nodeId: 0 };
    return { ok: true, nodeId: registry.idFor(element) };
  } catch (error) {
    return { ok: false, text: error && error.message ? String(error.message) : String(error) };
  }
})()"#,
    );
    script
}

pub(crate) fn browser_iab_dom_describe_node_script(tab_id: usize, params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let frame_id = browser_iab_json_string_literal(&browser_iab_frame_id(tab_id));
    let mut script = String::from(
        r#"(() => {
"#,
    );
    script.push_str(browser_iab_dom_registry_prelude());
    script.push_str(
        r#"
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  const frameId = "#,
    );
    script.push_str(&frame_id);
    script.push_str(
        r#";
  try {
    const registry = __forgeCdpRegistry();
    const id = Number(params.nodeId || params.backendNodeId || 1);
    const node = registry.nodeFor(id);
    if (!node) return { ok: false, text: "DOM node is not available." };
    return { ok: true, node: registry.describe(node, id, frameId) };
  } catch (error) {
    return { ok: false, text: error && error.message ? String(error.message) : String(error) };
  }
})()"#,
    );
    script
}

pub(crate) fn browser_iab_dom_node_for_location_script(tab_id: usize, params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let frame_id = browser_iab_json_string_literal(&browser_iab_frame_id(tab_id));
    let mut script = String::from(
        r#"(() => {
"#,
    );
    script.push_str(browser_iab_dom_registry_prelude());
    script.push_str(
        r#"
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  const frameId = "#,
    );
    script.push_str(&frame_id);
    script.push_str(
        r#";
  try {
    const x = Number(params.x);
    const y = Number(params.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, text: "DOM.getNodeForLocation requires finite x and y." };
    }
    const registry = __forgeCdpRegistry();
    const element = document.elementFromPoint(x, y);
    if (!element) return { ok: true, nodeId: 0, backendNodeId: 0, frameId };
    const id = registry.idFor(element);
    return { ok: true, nodeId: id, backendNodeId: id, frameId };
  } catch (error) {
    return { ok: false, text: error && error.message ? String(error.message) : String(error) };
  }
})()"#,
    );
    script
}

pub(crate) fn browser_iab_dom_frame_owner_script(tab_id: usize, params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let frame_id = browser_iab_json_string_literal(&browser_iab_frame_id(tab_id));
    let mut script = String::from(
        r#"(() => {
"#,
    );
    script.push_str(browser_iab_dom_registry_prelude());
    script.push_str(
        r#"
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  const frameId = "#,
    );
    script.push_str(&frame_id);
    script.push_str(
        r#";
  try {
    const requestedFrameId = String(params.frameId || "");
    if (!requestedFrameId || requestedFrameId === frameId) {
      return { ok: false, text: "DOM.getFrameOwner requires a child frameId." };
    }
    const registry = __forgeCdpRegistry();
    const frames = Array.from(document.querySelectorAll("iframe,frame"));
    for (const frame of frames) {
      const id = registry.idFor(frame);
      if (requestedFrameId === `${frameId}-child-${id}`) {
        return { ok: true, nodeId: id, backendNodeId: id };
      }
    }
    return { ok: false, text: "DOM frame owner is not available in the lightweight Browser iab registry." };
  } catch (error) {
    return { ok: false, text: error && error.message ? String(error.message) : String(error) };
  }
})()"#,
    );
    script
}

pub(crate) fn browser_iab_dom_geometry_script(params: &Value, kind: &str) -> String {
    let params = browser_iab_json_value_literal(params);
    let kind = browser_iab_json_string_literal(kind);
    let mut script = String::from(
        r#"(() => {
"#,
    );
    script.push_str(browser_iab_dom_registry_prelude());
    script.push_str(
        r#"
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  const kind = "#,
    );
    script.push_str(&kind);
    script.push_str(
        r#";
  try {
    const registry = __forgeCdpRegistry();
    const id = Number(params.nodeId || params.backendNodeId || 1);
    const node = registry.nodeFor(id);
    if (!node) return { ok: false, text: "DOM node is not available." };
    const geometry = registry.geometry(node);
    if (!geometry) return { ok: false, text: "DOM node geometry is not available." };
    if (kind === "quads") return { ok: true, quads: [geometry.quad] };
    return {
      ok: true,
      model: {
        content: geometry.quad,
        padding: geometry.quad,
        border: geometry.quad,
        margin: geometry.quad,
        width: geometry.width,
        height: geometry.height,
      },
    };
  } catch (error) {
    return { ok: false, text: error && error.message ? String(error.message) : String(error) };
  }
})()"#,
    );
    script
}

pub(crate) fn browser_iab_dom_scroll_into_view_script(params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let mut script = String::from(
        r#"(() => {
"#,
    );
    script.push_str(browser_iab_dom_registry_prelude());
    script.push_str(
        r#"
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  try {
    const registry = __forgeCdpRegistry();
    const id = Number(params.nodeId || params.backendNodeId || 1);
    const node = registry.nodeFor(id);
    const element = registry.elementFor(node);
    if (!element) return { ok: false, text: "DOM node is not scrollable into view." };
    element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    return { ok: true };
  } catch (error) {
    return { ok: false, text: error && error.message ? String(error.message) : String(error) };
  }
})()"#,
    );
    script
}

pub(crate) fn browser_iab_synthesize_scroll_gesture_script(params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let mut script = String::from(
        r#"(() => {
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  try {
    const x = Number(params.x || window.innerWidth / 2 || 0);
    const y = Number(params.y || window.innerHeight / 2 || 0);
    const left = -Number(params.xDistance || 0);
    const top = -Number(params.yDistance || 0);
    const findScrollable = (node) => {
      let current = node && node.nodeType === 1 ? node : document.scrollingElement || document.documentElement;
      while (current && current !== document.body && current !== document.documentElement) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY || "";
        const overflowX = style.overflowX || "";
        const canY = /(auto|scroll|overlay)/.test(overflowY) && current.scrollHeight > current.clientHeight;
        const canX = /(auto|scroll|overlay)/.test(overflowX) && current.scrollWidth > current.clientWidth;
        if (canY || canX) return current;
        current = current.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    };
    const target = findScrollable(document.elementFromPoint(x, y));
    if (target === document.documentElement || target === document.body || target === document.scrollingElement) {
      window.scrollBy({ left, top, behavior: "instant" });
    } else {
      target.scrollBy({ left, top, behavior: "instant" });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, text: error && error.message ? String(error.message) : String(error) };
  }
})()"#,
    );
    script
}

fn browser_iab_dom_registry_prelude() -> &'static str {
    r#"
  const __forgeCdpRegistry = () => {
    const key = "__forgeCdpNodeRegistry";
    const create = () => {
      const state = {
        document,
        nextId: 2,
        ids: new WeakMap(),
        nodes: new Map(),
      };
      state.ids.set(document, 1);
      state.nodes.set(1, document);
      return state;
    };
    let state = globalThis[key];
    if (!state || state.document !== document) {
      state = create();
      Object.defineProperty(globalThis, key, {
        configurable: true,
        enumerable: false,
        value: state,
        writable: true,
      });
    }
    state.idFor = (node) => {
      if (!node || typeof node !== "object") return 0;
      const existing = state.ids.get(node);
      if (existing) return existing;
      const id = state.nextId++;
      state.ids.set(node, id);
      state.nodes.set(id, node);
      return id;
    };
    state.nodeFor = (id) => {
      const numeric = Number(id || 1);
      return state.nodes.get(numeric) || null;
    };
    state.elementFor = (node) => {
      if (!node) return null;
      if (node.nodeType === Node.DOCUMENT_NODE) return document.documentElement || document.body;
      if (node.nodeType === Node.ELEMENT_NODE) return node;
      return node.parentElement || null;
    };
    state.describe = (node, id, frameId) => {
      const attributes = [];
      if (node.attributes) {
        for (const attr of Array.from(node.attributes)) {
          attributes.push(attr.name, attr.value);
        }
      }
      const description = {
        nodeId: Number(id || state.idFor(node)),
        backendNodeId: Number(id || state.idFor(node)),
        nodeType: Number(node.nodeType || 0),
        nodeName: String(node.nodeName || ""),
        localName: String(node.localName || ""),
        nodeValue: String(node.nodeValue || ""),
        childNodeCount: Number(node.childNodes ? node.childNodes.length : 0),
      };
      if (attributes.length > 0) description.attributes = attributes;
      if (node.nodeType === Node.DOCUMENT_NODE) {
        description.documentURL = String(document.location.href || "");
        description.baseURL = String(document.baseURI || document.location.href || "");
        description.frameId = frameId;
      }
      if (node instanceof HTMLIFrameElement || node instanceof HTMLFrameElement) {
        description.frameId = frameId + "-child-" + Number(id || state.idFor(node));
      }
      return description;
    };
    state.geometry = (node) => {
      const element = state.elementFor(node);
      if (!element || typeof element.getBoundingClientRect !== "function") return null;
      const rect = element.getBoundingClientRect();
      const left = Number(rect.left || 0);
      const top = Number(rect.top || 0);
      const right = Number(rect.right || left + Math.max(Number(rect.width || 0), 1));
      const bottom = Number(rect.bottom || top + Math.max(Number(rect.height || 0), 1));
      const width = Math.max(Number(rect.width || right - left || 1), 1);
      const height = Math.max(Number(rect.height || bottom - top || 1), 1);
      return {
        quad: [left, top, right, top, right, bottom, left, bottom],
        width,
        height,
      };
    };
    return state;
  };
"#
}

pub(crate) fn browser_iab_layout_metrics_script() -> String {
    r#"(() => {
  try {
    const doc = document.documentElement || document.body;
    const body = document.body || doc;
    const viewport = window.visualViewport;
    const pageX = Number(window.scrollX || viewport?.pageLeft || 0);
    const pageY = Number(window.scrollY || viewport?.pageTop || 0);
    const clientWidth = Number(viewport?.width || window.innerWidth || doc?.clientWidth || 1280);
    const clientHeight = Number(viewport?.height || window.innerHeight || doc?.clientHeight || 720);
    const contentWidth = Math.max(
      Number(doc?.scrollWidth || 0),
      Number(body?.scrollWidth || 0),
      Number(doc?.clientWidth || 0),
      clientWidth
    );
    const contentHeight = Math.max(
      Number(doc?.scrollHeight || 0),
      Number(body?.scrollHeight || 0),
      Number(doc?.clientHeight || 0),
      clientHeight
    );
    return {
      ok: true,
      value: {
        pageX,
        pageY,
        clientWidth,
        clientHeight,
        contentWidth,
        contentHeight,
        scale: Number(viewport?.scale || 1),
      },
    };
  } catch (error) {
    return {
      ok: false,
      text: error && error.message ? String(error.message) : String(error),
    };
  }
})()"#
        .to_string()
}

pub(crate) fn browser_iab_mouse_event_script(params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let mut script = String::from(
        r#"(() => {
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  const typeMap = {
    mouseMoved: "mousemove",
    mousePressed: "mousedown",
    mouseReleased: "mouseup",
    mouseWheel: "wheel",
  };
  const x = Number(params.x || 0);
  const y = Number(params.y || 0);
  const domType = typeMap[params.type] || String(params.type || "mousemove");
  const target = document.elementFromPoint(x, y) || document.activeElement || document.body || document.documentElement;
  if (!target) return { ok: false, text: "No DOM target is available for mouse event." };
  const buttonName = params.button || "none";
  const button = buttonName === "left" ? 0 : buttonName === "middle" ? 1 : buttonName === "right" ? 2 : -1;
  if (domType === "wheel") {
    target.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      deltaX: Number(params.deltaX || 0),
      deltaY: Number(params.deltaY || 0),
      view: window,
    }));
    return { ok: true };
  }
  target.dispatchEvent(new MouseEvent(domType, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: Math.max(button, 0),
    buttons: Number(params.buttons || 0),
    detail: Number(params.clickCount || 0),
    view: window,
  }));
  if (params.type === "mouseReleased" && Number(params.clickCount || 0) > 0) {
    target.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: Math.max(button, 0),
      detail: Number(params.clickCount || 1),
      view: window,
    }));
    if (Number(params.clickCount || 0) > 1) {
      target.dispatchEvent(new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: Math.max(button, 0),
        detail: 2,
        view: window,
      }));
    }
  }
  return { ok: true };
})()"#,
    );
    script
}

pub(crate) fn browser_iab_key_event_script(params: &Value) -> String {
    let params = browser_iab_json_value_literal(params);
    let mut script = String::from(
        r#"(() => {
  const params = "#,
    );
    script.push_str(&params);
    script.push_str(
        r#";
  const target = document.activeElement || document.body || document.documentElement;
  if (!target) return { ok: false, text: "No active DOM target is available for key event." };
  const typeMap = {
    rawKeyDown: "keydown",
    keyDown: "keydown",
    char: "keypress",
    keyUp: "keyup",
  };
  const domType = typeMap[params.type] || String(params.type || "keydown");
  const event = new KeyboardEvent(domType, {
    bubbles: true,
    cancelable: true,
    key: params.key || params.text || "",
    code: params.code || "",
    ctrlKey: Boolean((params.modifiers || 0) & 2),
    shiftKey: Boolean((params.modifiers || 0) & 8),
    altKey: Boolean((params.modifiers || 0) & 1),
    metaKey: Boolean((params.modifiers || 0) & 4),
  });
  target.dispatchEvent(event);
  if ((params.type === "char" || params.type === "keyDown" || params.type === "rawKeyDown") && params.text) {
    const text = String(params.text);
    if (typeof target.value === "string") {
      const start = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
      const end = typeof target.selectionEnd === "number" ? target.selectionEnd : start;
      target.value = target.value.slice(0, start) + text + target.value.slice(end);
      const next = start + text.length;
      if (typeof target.setSelectionRange === "function") target.setSelectionRange(next, next);
      target.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, data: text, inputType: "insertText" }));
    } else if (target.isContentEditable && document.execCommand) {
      document.execCommand("insertText", false, text);
    }
  }
  return { ok: true };
})()"#,
    );
    script
}

pub(crate) fn browser_iab_insert_text_script(text: &str) -> String {
    let text = browser_iab_json_string_literal(text);
    let mut script = String::from(
        r#"(() => {
  const text = "#,
    );
    script.push_str(&text);
    script.push_str(
        r#";
  const target = document.activeElement || document.body || document.documentElement;
  if (!target) return { ok: false, text: "No active DOM target is available for text insertion." };
  if (typeof target.value === "string") {
    const start = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
    const end = typeof target.selectionEnd === "number" ? target.selectionEnd : start;
    target.value = target.value.slice(0, start) + text + target.value.slice(end);
    const next = start + text.length;
    if (typeof target.setSelectionRange === "function") target.setSelectionRange(next, next);
    target.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, data: text, inputType: "insertText" }));
  } else if (target.isContentEditable && document.execCommand) {
    document.execCommand("insertText", false, text);
  }
  return { ok: true };
})()"#,
    );
    script
}

fn browser_iab_json_string_literal(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn browser_iab_json_value_literal(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        browser_iab_dom_frame_owner_script, browser_iab_dom_node_for_location_script,
        browser_iab_dom_scroll_into_view_script, browser_iab_synthesize_scroll_gesture_script,
    };
    use serde_json::json;

    #[test]
    fn browser_iab_scroll_scripts_cover_browser_client_paths() {
        let point_scroll = browser_iab_synthesize_scroll_gesture_script(&json!({
            "x": 300,
            "y": 400,
            "xDistance": 0,
            "yDistance": -240,
        }));
        assert!(point_scroll.contains("scrollBy"));
        assert!(point_scroll.contains("-Number(params.yDistance"));

        let node_scroll = browser_iab_dom_scroll_into_view_script(&json!({
            "backendNodeId": 7,
        }));
        assert!(node_scroll.contains("scrollIntoView"));
        assert!(node_scroll.contains("__forgeCdpRegistry"));

        let node_for_location = browser_iab_dom_node_for_location_script(
            9,
            &json!({
                "x": 12,
                "y": 24,
            }),
        );
        assert!(node_for_location.contains("elementFromPoint"));
        assert!(node_for_location.contains("hicodex-frame-9"));

        let frame_owner = browser_iab_dom_frame_owner_script(
            9,
            &json!({
                "frameId": "hicodex-frame-9-child-7",
            }),
        );
        assert!(frame_owner.contains("iframe,frame"));
        assert!(frame_owner.contains("DOM.getFrameOwner requires a child frameId"));
    }
}
