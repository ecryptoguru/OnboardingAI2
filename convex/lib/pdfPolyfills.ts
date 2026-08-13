// Polyfill browser globals pdfjs-dist expects in a server environment.
// These stubs must be installed before the pdfjs-dist module loads so its
// optional canvas path never fires. We never render, so no-ops are sufficient.

// pdfjs-dist logs a harmless optional-dependency warning when it cannot load
// @napi-rs/canvas. Filter it out so production logs stay clean.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const message = args
    .map((a) => (typeof a === "string" ? a : ""))
    .join(" ");
  if (
    message.includes("@napi-rs/canvas") ||
    message.includes("Cannot access the `require` function")
  ) {
    return;
  }
  originalWarn(...args);
};

const g = globalThis as typeof globalThis & Record<string, unknown>;

if (!g.DOMMatrix) {
  g.DOMMatrix = class DOMMatrix {
    translate() {
      return this;
    }
    scale() {
      return this;
    }
    multiply() {
      return this;
    }
    toString() {
      return "matrix(1, 0, 0, 1, 0, 0)";
    }
  } as unknown as typeof DOMMatrix;
}

if (!g.ImageData) {
  g.ImageData = class ImageData {} as unknown as typeof ImageData;
}

if (!g.Path2D) {
  g.Path2D = class Path2D {
    addPath() {}
    moveTo() {}
    lineTo() {}
    rect() {}
  } as unknown as typeof Path2D;
}

if (!g.Promise.withResolvers) {
  g.Promise.withResolvers = function <T>() {
    let resolve: (value: T | PromiseLike<T>) => void = () => {};
    let reject: (reason?: unknown) => void = () => {};
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
