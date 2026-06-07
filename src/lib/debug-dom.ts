/**
 * DOM 调试工具 - 用于排查 insertBefore / hydration 等 React DOM 错误
 */

let observer: MutationObserver | null = null;

export function initDomDebug() {
  if (typeof window === "undefined") return;

  // 1. 全局错误捕获
  window.addEventListener("error", (event) => {
    console.error("[DOM-DEBUG] 全局 error:", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error?.stack || event.error,
    });

    // 如果是 insertBefore / removeChild 错误，打印相关 DOM
    if (event.message?.includes("insertBefore") || event.message?.includes("removeChild")) {
      logDomState("error-trigger");
    }
  });

  // 2. 未处理的 Promise 拒绝
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[DOM-DEBUG] 未处理的 Promise 拒绝:", event.reason);
  });

  // 3. MutationObserver 监控 DOM 修改
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // 只关注 addedNodes / removedNodes
      if (mutation.type !== "childList") continue;

      const added = Array.from(mutation.addedNodes).filter(
        (n) => n.nodeType === Node.ELEMENT_NODE
      ) as Element[];
      const removed = Array.from(mutation.removedNodes).filter(
        (n) => n.nodeType === Node.ELEMENT_NODE
      ) as Element[];

      if (added.length === 0 && removed.length === 0) continue;

      const targetTag = (mutation.target as Element)?.tagName || "unknown";
      const targetId = (mutation.target as Element)?.id || "";
      const targetClass = (mutation.target as Element)?.className || "";

      for (const node of added) {
        const tag = node.tagName?.toLowerCase() || "?";
        const id = node.id || "";
        const cls = node.className || "";
        const attrs = Array.from(node.attributes || [])
          .map((a) => `${a.name}=${a.value.slice(0, 50)}`)
          .join(" ");

        // 检测可疑的扩展注入节点
        const isSuspicious =
          attrs.includes("_mst") ||
          attrs.includes("data-ms-") ||
          tag === "script" ||
          tag === "style";

        console.log(
          `[DOM-DEBUG] ${isSuspicious ? "⚠️ 可疑" : ""} 节点被插入`,
          {
            tag,
            id,
            class: cls,
            attrs,
            parent: `${targetTag}#${targetId}.${targetClass}`,
            outerHTML: node.outerHTML?.slice(0, 300),
          }
        );
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false,
  });

  console.log("[DOM-DEBUG] DOM 调试监控已启动");
}

export function logDomState(label: string) {
  if (typeof window === "undefined") return;
  const root = document.getElementById("root");
  console.log(`[DOM-DEBUG] ${label} - root 子节点数:`, root?.childNodes.length);
  console.log(`[DOM-DEBUG] ${label} - body 子节点数:`, document.body.childNodes.length);

  // 查找所有 input[type=password]
  const passwords = document.querySelectorAll('input[type="password"]');
  passwords.forEach((el, i) => {
    const attrs = Array.from(el.attributes)
      .map((a) => `${a.name}=${a.value.slice(0, 50)}`)
      .join(" ");
    console.log(`[DOM-DEBUG] ${label} - password[${i}] attrs:`, attrs);
  });

  // 查找被扩展修改的节点
  const mstNodes = document.querySelectorAll("[_mstplaceholder], [_msthash]");
  console.log(`[DOM-DEBUG] ${label} - 扩展修改的节点数:`, mstNodes.length);
  mstNodes.forEach((el, i) => {
    console.log(`[DOM-DEBUG] ${label} - mstNode[${i}]:`, el.outerHTML?.slice(0, 200));
  });
}

export function disconnectDomDebug() {
  observer?.disconnect();
}
