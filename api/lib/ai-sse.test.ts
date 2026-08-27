import { describe, expect, it } from "vitest";
import { parseSseStream } from "./ai";

const enc = new TextEncoder();

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

describe("parseSseStream", () => {
  it("累积 content 并忽略 reasoning_content", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"思考中"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"流"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"式"}}]}\n\n',
      "data: [DONE]\n\n",
    ].join("");
    const { content, reasoningLength, chunkCount } = await parseSseStream(
      makeStream([sse]).getReader(),
      () => {}
    );
    expect(content).toBe("流式");
    expect(reasoningLength).toBe(3);
    expect(chunkCount).toBe(3);
  });

  it("无 [DONE] 直接 EOF 也能返回", async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n';
    const { content } = await parseSseStream(makeStream([sse]).getReader(), () => {});
    expect(content).toBe("ok");
  });

  it("坏 JSON 行被忽略，不中断流", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"a"}}]}\n\n',
      "data: {broken json\n\n",
      'data: {"choices":[{"delta":{"content":"b"}}]}\n\n',
    ].join("");
    const { content, chunkCount } = await parseSseStream(makeStream([sse]).getReader(), () => {});
    expect(content).toBe("ab");
    expect(chunkCount).toBe(2);
  });

  it("注释行与空行被忽略", async () => {
    const sse = [": ping\n\n", "\n", 'data: {"choices":[{"delta":{"content":"x"}}]}\n\n', "\n\n"].join("");
    const { content } = await parseSseStream(makeStream([sse]).getReader(), () => {});
    expect(content).toBe("x");
  });

  it("SSE 事件被拆成多个字节块仍正确拼接", async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"拆块"}}]}\n\n';
    const parts = sse.split("");
    const byteChunks: string[] = [];
    for (let i = 0; i < parts.length; i += 3) byteChunks.push(parts.slice(i, i + 3).join(""));
    const { content } = await parseSseStream(makeStream(byteChunks).getReader(), () => {});
    expect(content).toBe("拆块");
  });

  it("onData 在数据到达时被调用", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"1"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"2"}}]}\n\n',
    ].join("");
    let calls = 0;
    await parseSseStream(makeStream([sse]).getReader(), () => calls++);
    expect(calls).toBeGreaterThanOrEqual(1);
  });

  it("data: 前缀带空格也兼容", async () => {
    const sse = 'data:{"choices":[{"delta":{"content":"紧凑"}}]}\n\n';
    const { content } = await parseSseStream(makeStream([sse]).getReader(), () => {});
    expect(content).toBe("紧凑");
  });
});
