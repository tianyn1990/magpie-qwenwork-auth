// Adapted from XuePengJu/dsh-our-free-model, channel-pack (MIT), Copyright (c) 2026 Jet.
// Vendor WASM is loaded locally and is not distributed. See THIRD_PARTY_NOTICES.md.
import { readFileSync, statSync } from "node:fs";
import { FALLBACK_VERSION } from "./constants.mjs";
const glues = new Map;
async function getGlue(wasmPath) {
  const info = statSync(wasmPath);
  const key = wasmPath + ":" + info.size + ":" + info.mtimeMs;
  if (!glues.has(key)) {
    glues.clear();
    const pending = createGlue(wasmPath);
    glues.set(key, pending);
    pending.catch(() => {
      if (glues.get(key) === pending)
        glues.delete(key);
    });
  }
  return glues.get(key);
}
async function createGlue(wasmPath) {
  const bytes = readFileSync(wasmPath);
  const module = await WebAssembly.compile(bytes);
  let exports = {};
  let cachedHeap = null;
  let cachedView = null;
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
  const encoder = new TextEncoder;
  const heap = () => {
    if (cachedHeap === null || cachedHeap.byteLength === 0) {
      cachedHeap = new Uint8Array(exports.memory.buffer);
    }
    return cachedHeap;
  };
  const view = () => {
    if (cachedView === null || cachedView.buffer !== exports.memory.buffer) {
      cachedView = new DataView(exports.memory.buffer);
    }
    return cachedView;
  };
  const readString = (ptr, len) => decoder.decode(heap().subarray(ptr >>> 0, (ptr >>> 0) + len));
  const objects = new Array(1024).fill(undefined);
  objects.push(undefined, null, true, false);
  let firstFree = objects.length;
  const heapObject = (index) => objects[index];
  const pushObject = (value) => {
    if (firstFree === objects.length)
      objects.push(objects.length + 1);
    const index = firstFree;
    firstFree = objects[index];
    objects[index] = value;
    return index;
  };
  const takeObject = (index) => {
    const value = heapObject(index);
    if (index >= 1028) {
      objects[index] = firstFree;
      firstFree = index;
    }
    return value;
  };
  let lastLength = 0;
  const writeString = (text) => {
    const encoded = encoder.encode(text);
    const ptr = exports.__wbindgen_export2(encoded.length, 1) >>> 0;
    heap().subarray(ptr, ptr + encoded.length).set(encoded);
    lastLength = encoded.length;
    return ptr;
  };
  const callPointer = (invoke) => {
    const stack = exports.__wbindgen_add_to_stack_pointer(-16);
    try {
      invoke(stack);
      const v = view();
      const ptr = v.getInt32(stack + 0, true);
      const isError = v.getInt32(stack + 8, true);
      if (isError)
        throw takeObject(v.getInt32(stack + 4, true));
      return ptr;
    } finally {
      exports.__wbindgen_add_to_stack_pointer(16);
    }
  };
  const guard = (fn, args) => {
    try {
      fn(...args);
    } catch (error) {
      exports.__wbindgen_export(pushObject(error));
    }
  };
  const imports = {
    __wbindgen_object_drop_ref: (a) => takeObject(a),
    __wbindgen_object_clone_ref: (a) => pushObject(heapObject(a)),
    __wbindgen_cast_0000000000000001: (a, e) => pushObject(heap().subarray(a >>> 0, (a >>> 0) + e)),
    __wbindgen_cast_0000000000000002: (a, e) => pushObject(readString(a, e)),
    __wbg_set_08463b1df38a7e29: (a, e, t) => pushObject(heapObject(a).set(heapObject(e), heapObject(t))),
    __wbg_getRandomValues_d49329ff89a07af1: (...a) => guard((x, y) => {
      globalThis.crypto.getRandomValues(heap().subarray(x >>> 0, (x >>> 0) + y));
    }, a),
    __wbg_getRandomValues_c44a50d8cfdaebeb: (...a) => guard((x, y) => {
      heapObject(x).getRandomValues(heapObject(y));
    }, a),
    __wbg_randomFillSync_6c25eac9869eb53c: (...a) => guard((x, y) => {
      heapObject(x).randomFillSync(takeObject(y));
    }, a),
    __wbg_new_99cabae501c0a8a0: () => pushObject(new Map),
    __wbg_now_88621c9c9a4f3ffc: () => Date.now(),
    __wbg_crypto_38df2bab126b63dc: (a) => pushObject(heapObject(a).crypto),
    __wbg_msCrypto_bd5a034af96bcba6: (a) => pushObject(heapObject(a).msCrypto),
    __wbg_process_44c7a14e11e9f69e: (a) => pushObject(heapObject(a).process),
    __wbg_versions_276b2795b1c6a219: (a) => pushObject(heapObject(a).versions),
    __wbg_node_84ea875411254db1: (a) => pushObject(heapObject(a).node),
    __wbg_require_b4edbdcf3e2a1ef0: (...a) => guard(() => pushObject(module), a),
    __wbg_call_d578befcc3145dee: (...a) => guard((fn, self, arg) => {
      const target = heapObject(fn);
      pushObject(target.call(heapObject(self), heapObject(arg)));
    }, a),
    __wbg_new_with_length_9cedd08484b73942: (a) => pushObject(new Uint8Array(a >>> 0)),
    __wbg_length_0c32cb8543c8e4c8: (a) => heapObject(a).length,
    __wbg_prototypesetcall_3e05eb9545565046: (a, e, t) => {
      Uint8Array.prototype.set.call(heap().subarray(a >>> 0, (a >>> 0) + e), heapObject(t));
    },
    __wbg_subarray_0f98d3fb634508ad: (a, e, t) => pushObject(heapObject(a).subarray(e >>> 0, t >>> 0)),
    __wbg_static_accessor_GLOBAL_THIS_a1248013d790bf5f: () => pushObject(globalThis),
    __wbg_static_accessor_SELF_24f78b6d23f286ea: () => globalThis.self === undefined ? 0 : pushObject(globalThis.self),
    __wbg_static_accessor_GLOBAL_f2e0f995a21329ff: () => pushObject(globalThis),
    __wbg_static_accessor_WINDOW_59fd959c540fe405: () => globalThis.window === undefined ? 0 : pushObject(globalThis.window),
    __wbg___wbindgen_throw_81fc77679af83bc6: (p, l) => {
      throw new Error(readString(p, l));
    },
    __wbg_Error_2e59b1b37a9a34c3: (p, l) => pushObject(new Error(readString(p, l))),
    __wbg___wbindgen_is_object_40c5a80572e8f9d3: (id) => {
      const v = heapObject(id);
      return typeof v === "object" && v !== null ? 1 : 0;
    },
    __wbg___wbindgen_is_string_b29b5c5a8065ba1a: (id) => typeof heapObject(id) === "string" ? 1 : 0,
    __wbg___wbindgen_is_function_49868bde5eb1e745: (id) => typeof heapObject(id) === "function" ? 1 : 0,
    __wbg___wbindgen_is_undefined_c0cca72b82b86f4d: (id) => heapObject(id) === undefined ? 1 : 0
  };
  for (const item of globalThis.WebAssembly.Module.imports(module)) {
    if (item.module !== "./qoder_auth_wasm_bg.js" || !imports[item.name])
      throw new Error("千问办公签名组件 ABI 已变化，请更新插件；未发出模型请求");
  }
  const required = ["generate_runtime_auth_fields", "qodercontext_new", "qodercontext_prepareInferRequest", "requestresult_headers", "requestresult_url", "requestresult_body", "__wbg_requestresult_free", "__wbg_qodercontext_free", "__wbindgen_export4"];
  const names = new Set(globalThis.WebAssembly.Module.exports(module).map((x) => x.name));
  if (required.some((name) => !names.has(name)))
    throw new Error("千问办公签名组件缺少必要导出，请更新插件");
  const instance = await WebAssembly.instantiate(module, { ["./qoder_auth_wasm_bg.js"]: imports });
  exports = instance.exports;
  return {
    exports,
    heap,
    view,
    readString,
    writeString,
    lastLength: () => lastLength,
    heapObject,
    pushObject,
    takeObject,
    callPointer
  };
}
export async function prepareQwenworkInfer(options) {
  const g = await getGlue(options.wasmPath);
  const user = { uid: options.uid, aid: "", name: options.name, email: options.email, yx_uid: "", access_token: options.accessToken, security_oauth_token: options.accessToken, refresh_token: "", organization_id: options.organizationId || "", organization_name: "", organization_tags: [], user_type: options.organizationId ? "enterprise" : "personal", data_policy_agreed: options.dataPolicyAgreed === true };
  const material = JSON.parse(callString(g, "generate_runtime_auth_fields", JSON.stringify(user)));
  if (typeof material.encrypt_user_info !== "string" || typeof material.key !== "string")
    throw new Error("签名组件返回的身份材料不完整");
  const userInfoJson = JSON.stringify({ ...user, ...material });
  const metadata = {
    client_type: "6",
    business_product: "qoder_work",
    business_type: "agent",
    scene: "qwork"
  };
  const context = g.callPointer((stack) => {
    const machine = g.writeString(options.machineId || "ofm-qwenwork");
    const machineLen = g.lastLength();
    const ver = g.writeString(options.cosyVersion || FALLBACK_VERSION);
    const verLen = g.lastLength();
    const info = g.writeString(userInfoJson);
    const infoLen = g.lastLength();
    const meta = g.writeString(JSON.stringify(metadata));
    const metaLen = g.lastLength();
    g.exports.qodercontext_new(stack, machine, machineLen, ver, verLen, info, infoLen, meta, metaLen);
  });
  let result = 0;
  try {
    const source = options.source ?? "system";
    result = g.callPointer((stack) => {
      const host = g.writeString(options.endpoint);
      const hostLen = g.lastLength();
      const body = g.writeString(options.body);
      const bodyLen = g.lastLength();
      const key = g.writeString(options.modelKey);
      const keyLen = g.lastLength();
      const src = g.writeString(source);
      const srcLen = g.lastLength();
      g.exports.qodercontext_prepareInferRequest(stack, context, host, hostLen, body, bodyLen, key, keyLen, src, srcLen);
    });
    const headerMap = g.takeObject(g.exports.requestresult_headers(result));
    const headers = {};
    if (headerMap instanceof Map) {
      for (const [k, v] of headerMap)
        headers[String(k)] = String(v);
    }
    const readResultString = (invoke) => {
      let out = "";
      let ptr = 0, len = 0;
      const stack = g.exports.__wbindgen_add_to_stack_pointer(-16);
      try {
        invoke(stack, result);
        const v = g.view();
        ptr = v.getInt32(stack + 0, true);
        len = v.getInt32(stack + 4, true);
        out = ptr ? g.readString(ptr, len) : "";
      } finally {
        g.exports.__wbindgen_add_to_stack_pointer(16);
        if (ptr)
          g.exports.__wbindgen_export4(ptr, len, 1);
      }
      return out;
    };
    return {
      url: readResultString((stack, ptr) => g.exports.requestresult_url(stack, ptr)),
      headers,
      body: readResultString((stack, ptr) => g.exports.requestresult_body(stack, ptr))
    };
  } finally {
    try {
      if (result)
        g.exports.__wbg_requestresult_free(result, 0);
      g.exports.__wbg_qodercontext_free(context, 0);
    } catch {}
  }
}
function callString(g, name, text) {
  const stack = g.exports.__wbindgen_add_to_stack_pointer(-16);
  let ptr = 0, len = 0;
  try {
    const input = g.writeString(text);
    const inputLen = g.lastLength();
    g.exports[name](stack, input, inputLen);
    const v = g.view();
    ptr = v.getInt32(stack, true);
    len = v.getInt32(stack + 4, true);
    if (v.getInt32(stack + 12, true)) {
      ptr = 0;
      len = 0;
      throw g.takeObject(v.getInt32(stack + 8, true));
    }
    return g.readString(ptr, len);
  } finally {
    g.exports.__wbindgen_add_to_stack_pointer(16);
    if (ptr)
      g.exports.__wbindgen_export4(ptr, len, 1);
  }
}
