let io = null;
try {
  ({ io } = require("socket.io-client"));
} catch (_error) {
  ({ io } = require("../client/node_modules/socket.io-client"));
}

const baseUrl = process.argv[2] || "http://localhost:5002";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 12000);

const now = () => Number(process.hrtime.bigint()) / 1e6;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchProducts() {
  const response = await fetch(`${baseUrl}/api/products`);
  if (!response.ok) {
    throw new Error(`products status ${response.status}`);
  }
  return response.json();
}

function pickProduct(products = []) {
  const single = products.find(
    (item) => String(item?.listingType || "single") !== "group" && Number(item?.availableQuantity || 0) > 0
  );

  if (single) {
    return {
      id: single.id,
      name: single.name,
      price: Number(single.price || 0),
      image: single.image || "",
      selectedImage: single.selectedImage || single.image || "",
      listingId: single.listingId || single.id,
      listingType: single.listingType || "single",
      variantId: single.variantId || null,
      variantName: single.variantName || null,
      parentGroupId: single.parentGroupId || null,
      groupName: single.groupName || null,
      originalPrice: Number(single.originalPrice || single.price || 0),
      discountPercent: Number(single.discountPercent || 0),
    };
  }

  const grouped = products.find(
    (item) => String(item?.listingType || "") === "group" && Array.isArray(item?.variants) && item.variants.length
  );

  if (!grouped) {
    return null;
  }

  const variant = grouped.variants.find((entry) => Number(entry?.availableQuantity || 0) > 0) || grouped.variants[0];

  return {
    id: grouped.id,
    name: grouped.name,
    price: Number(variant?.price || grouped.price || 0),
    image: variant?.image || grouped.image || "",
    selectedImage: variant?.image || variant?.imageUrl || grouped.selectedImage || grouped.image || "",
    listingId: grouped.listingId || grouped.id,
    listingType: grouped.listingType || "group",
    variantId: variant?.variantId || variant?.id || null,
    variantName: variant?.name || null,
    parentGroupId: grouped.parentGroupId || grouped.groupId || null,
    groupName: grouped.groupName || grouped.name || null,
    originalPrice: Number(variant?.originalPrice || grouped.originalPrice || variant?.price || grouped.price || 0),
    discountPercent: Number(variant?.discountPercent || grouped.discountPercent || 0),
  };
}

async function waitForConnect(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("connect timeout")), timeoutMs);
    socket.on("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.on("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function runCartAdd(socket, product, operationId) {
  const startedAt = now();
  const ack = await new Promise((resolve) => {
    socket.emit("cart:add", { operationId, product, quantity: 1 }, (payload = {}) => {
      resolve({ payload, at: now() });
    });
  });

  const final = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ type: "timeout", at: now() }), timeoutMs);

    const onUpdated = (cart) => {
      if (String(cart?.operationId || "") !== operationId) return;
      clearTimeout(timeout);
      socket.off("cart:error", onError);
      resolve({ type: "updated", at: now(), cart });
    };

    const onError = (error) => {
      if (String(error?.operationId || "") !== operationId) return;
      clearTimeout(timeout);
      socket.off("cart:updated", onUpdated);
      resolve({ type: "error", at: now(), error });
    };

    socket.on("cart:updated", onUpdated);
    socket.on("cart:error", onError);
  });

  return {
    ackMs: Number((ack.at - startedAt).toFixed(2)),
    finalMs: Number((final.at - startedAt).toFixed(2)),
    ackAccepted: Boolean(ack.payload?.accepted),
    finalType: final.type,
    line: final?.cart?.items?.[0] || null,
  };
}

async function runCartUpdateQuantity(socket, line, operationId) {
  if (!line) {
    return null;
  }

  const startedAt = now();
  const nextQuantity = Number(line.quantity || 1) + 1;

  const ack = await new Promise((resolve) => {
    socket.emit(
      "cart:updateQuantity",
      {
        operationId,
        lineKey: line.lineKey,
        productId: line.productId,
        variantId: line.variantId || null,
        quantity: nextQuantity,
      },
      (payload = {}) => resolve({ payload, at: now() })
    );
  });

  const final = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ type: "timeout", at: now() }), timeoutMs);

    const onUpdated = (cart) => {
      if (String(cart?.operationId || "") !== operationId) return;
      clearTimeout(timeout);
      socket.off("cart:error", onError);
      resolve({ type: "updated", at: now(), cart });
    };

    const onError = (error) => {
      if (String(error?.operationId || "") !== operationId) return;
      clearTimeout(timeout);
      socket.off("cart:updated", onUpdated);
      resolve({ type: "error", at: now(), error });
    };

    socket.on("cart:updated", onUpdated);
    socket.on("cart:error", onError);
  });

  return {
    ackMs: Number((ack.at - startedAt).toFixed(2)),
    finalMs: Number((final.at - startedAt).toFixed(2)),
    ackAccepted: Boolean(ack.payload?.accepted),
    finalType: final.type,
  };
}

async function runProductsSyncBurst(socket, count = 10) {
  const samples = [];

  for (let index = 0; index < count; index += 1) {
    const correlationId = `smoke-sync-${Date.now()}-${index}`;
    const startedAt = now();

    const sample = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ ok: false, ms: now() - startedAt }), timeoutMs);

      const onSynced = (_products, metadata = {}) => {
        if (String(metadata.correlationId || "") !== correlationId) return;
        clearTimeout(timeout);
        socket.off("products:error", onError);
        resolve({ ok: true, ms: now() - startedAt });
      };

      const onError = () => {
        clearTimeout(timeout);
        socket.off("products:synced", onSynced);
        resolve({ ok: false, ms: now() - startedAt });
      };

      socket.on("products:synced", onSynced);
      socket.on("products:error", onError);
      socket.emit("products:sync", { correlationId, reason: "smoke-benchmark" });
    });

    samples.push(Number(sample.ms.toFixed(2)));
    await wait(120);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] || 0;

  return {
    count: samples.length,
    p50Ms: Number(percentile(0.5).toFixed(2)),
    p95Ms: Number(percentile(0.95).toFixed(2)),
    maxMs: Number(Math.max(...samples).toFixed(2)),
  };
}

async function main() {
  const socket = io(baseUrl, {
    transports: ["websocket"],
    auth: {
      sessionId: `smoke-${Date.now()}`,
    },
    reconnection: false,
    timeout: timeoutMs,
  });

  await waitForConnect(socket);

  let products = [];
  try {
    products = await fetchProducts();
  } catch (_error) {
    products = [];
  }

  const product = pickProduct(products) || {
    id: "smoke-fallback-product",
    name: "Smoke Fallback Product",
    price: 1000,
    image: "",
    selectedImage: "",
    listingId: "smoke-fallback-product",
    listingType: "single",
    variantId: null,
    variantName: null,
    parentGroupId: null,
    groupName: null,
    originalPrice: 1000,
    discountPercent: 0,
  };

  const add = await runCartAdd(socket, product, `smoke-add-${Date.now()}`);
  const updateQuantity = await runCartUpdateQuantity(socket, add.line, `smoke-upd-${Date.now()}`);
  const productsSync = await runProductsSyncBurst(socket, 8);

  socket.disconnect();

  const result = {
    baseUrl,
    samples: {
      add: {
        ackMs: add.ackMs,
        finalMs: add.finalMs,
        ackAccepted: add.ackAccepted,
        finalType: add.finalType,
      },
      updateQuantity,
      productsSync,
    },
  };

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
  process.exit(1);
});
