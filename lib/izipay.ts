import crypto from "node:crypto";

/**
 * Client REST maison pour l'API IzichangePay.
 *
 * Le SDK officiel `@izipay/node-sdk` documenté N'EXISTE PAS encore sur npm (404 vérifié).
 * Ce client imite volontairement sa surface (`paymentIntents`, `invoices`, `products`,
 * `validateWebhook`) pour servir de SEAM d'intégration unique.
 *
 * TODO(node-sdk): le jour où `@izipay/node-sdk` est publié, remplacer l'implémentation
 * interne de `request()` par le SDK sans toucher aux route handlers.
 */

const DEFAULT_BASE_URL = "https://api.sandbox-pay.izichange.com";

// ----------------------------- Erreurs typées -----------------------------

export class IziPayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IziPayError";
  }
}

export class IziPayApiError extends IziPayError {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "IziPayApiError";
  }
}

export type WebhookRejectReason =
  | "missing_signature"
  | "malformed_signature"
  | "invalid_signature"
  | "missing_timestamp"
  | "expired_timestamp"
  | "invalid_body";

export class IziPayWebhookError extends IziPayError {
  constructor(
    public reason: WebhookRejectReason,
    message?: string,
  ) {
    super(message ?? reason);
    this.name = "IziPayWebhookError";
  }
}

// ----------------------------- Types ressources -----------------------------

export interface CreatePaymentIntentParams {
  requestedCurrencyType: "fiat" | "crypto";
  currencyRequested: string;
  amountRequested: string;
  acceptedCoins: string[];
  merchantReference?: string;
  returnUrl?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface PaymentIntent {
  id: string;
  status: string;
  /** URL du checkout hébergé (champ réel de l'API). */
  paymentLink: string;
  /** Alias historique : la doc du SDK nomme ce champ `paymentUrl`. */
  paymentUrl: string;
  expiresAt?: string;
  merchantReference?: string | null;
  amountRequested?: string;
  currencyRequested?: string;
  totalAmountReceived?: string;
  amountNetMerchant?: string;
  [key: string]: unknown;
}

export interface CreateInvoiceParams {
  amount: string | number;
  currency: string;
  clientEmail: string;
  customerName?: string;
  dueDate?: string;
  description?: string;
  idempotencyKey?: string;
}

export interface Invoice {
  id: string;
  status: string;
  paymentLink: string;
  customerEmail?: string;
  customerName?: string;
  amount?: string;
  currency?: string;
  paymentIntentId?: string | null;
  expiresAt?: string | null;
  emailDelivery?: unknown;
  [key: string]: unknown;
}

export interface CreateProductParams {
  name: string;
  amount: string | number;
  currency: string;
  permanentLinkSlug?: string;
  description?: string;
  imageUrl?: string;
  idempotencyKey?: string;
}

export interface Product {
  id: string;
  name: string;
  status?: string;
  isActive: boolean;
  paymentLink: string;
  permanentLinkSlug?: string;
  amount?: string;
  currency?: string;
  [key: string]: unknown;
}

export interface MerchantAsset {
  assetCode: string;
  isActive: boolean;
  coin?: string;
  network?: string;
  coinCode?: string;
  assetCategory?: string;
  [key: string]: unknown;
}

export interface WebhookEvent {
  /** Type de l'événement (mappé depuis le champ `event` de l'enveloppe). */
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface ListQuery {
  cursor?: string;
  take?: number;
  status?: string;
  merchantReference?: string;
  [key: string]: string | number | undefined;
}

// ----------------------------- Client -----------------------------

export interface IziPayConfig {
  apiKey?: string;
  baseUrl?: string;
  maxRetries?: number;
  timeoutMs?: number;
}

interface RequestOptions {
  method?: string;
  path: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  idempotencyKey?: string;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function normalizePaymentIntent(raw: Record<string, unknown>): PaymentIntent {
  const paymentLink = (raw.paymentLink ?? raw.paymentUrl ?? "") as string;
  return { ...(raw as object), paymentLink, paymentUrl: paymentLink } as PaymentIntent;
}

export class IziPayClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(config: IziPayConfig = {}) {
    const key = config.apiKey ?? process.env.IZIPAY_API_KEY ?? "";
    if (!key.startsWith("sk_")) {
      throw new IziPayError(
        "Clé API IzichangePay manquante ou invalide : définissez IZIPAY_API_KEY (sk_test_… ou sk_live_…).",
      );
    }
    this.apiKey = key;
    this.baseUrl = (
      config.baseUrl ??
      process.env.IZIPAY_API_BASE_URL ??
      DEFAULT_BASE_URL
    ).replace(/\/$/, "");
    this.maxRetries = config.maxRetries ?? 3;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  get environment(): "test" | "live" | "unknown" {
    if (this.apiKey.startsWith("sk_test_")) return "test";
    if (this.apiKey.startsWith("sk_live_")) return "live";
    return "unknown";
  }

  private async backoff(attempt: number, overrideMs?: number): Promise<void> {
    const base = Math.min(250 * 2 ** (attempt - 1), 4000); // 250→500→1000→2000→4000ms
    const jitter = base * (Math.random() * 0.4 - 0.2); // ±20%
    const ms = overrideMs ?? Math.max(0, base + jitter);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async request<T>(opts: RequestOptions): Promise<T> {
    const url = new URL(this.baseUrl + opts.path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

    let attempt = 0;
    // total tentatives = maxRetries + 1
    for (;;) {
      attempt++;
      let res: Response;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          res = await fetch(url, {
            method: opts.method ?? "GET",
            headers,
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        // Erreur réseau / timeout : on retente comme un 5xx.
        if (attempt <= this.maxRetries) {
          await this.backoff(attempt);
          continue;
        }
        throw new IziPayError(
          `Erreur réseau vers IzichangePay : ${(err as Error).message}`,
        );
      }

      // 429 / 5xx → retry (les 4xx≠429 ne se résolvent pas en réessayant).
      if ((res.status === 429 || res.status >= 500) && attempt <= this.maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await this.backoff(
          attempt,
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
        );
        continue;
      }

      const text = await res.text();
      const json = text ? safeJson(text) : undefined;

      if (!res.ok) {
        const errObj = (json ?? {}) as { message?: string; code?: string };
        throw new IziPayApiError(
          res.status,
          errObj.message ?? `Erreur HTTP ${res.status}`,
          errObj.code,
          json ?? text,
        );
      }
      return json as T;
    }
  }

  readonly paymentIntents = {
    create: (params: CreatePaymentIntentParams): Promise<PaymentIntent> => {
      const { idempotencyKey, ...body } = params;
      return this.request<Record<string, unknown>>({
        method: "POST",
        path: "/v1/payment-intents",
        body,
        idempotencyKey,
      }).then(normalizePaymentIntent);
    },
    retrieve: (id: string): Promise<PaymentIntent> =>
      this.request<Record<string, unknown>>({
        path: `/v1/payment-intents/${encodeURIComponent(id)}`,
      }).then(normalizePaymentIntent),
    list: (query?: ListQuery): Promise<unknown> =>
      this.request({ path: "/v1/payment-intents", query }),
  };

  readonly merchantAssets = {
    /** Actifs crypto activés (ou non) sur le compte marchand. */
    list: (): Promise<MerchantAsset[]> =>
      this.request<MerchantAsset[]>({ path: "/v1/merchant-assets" }),
    /** Liste des assetCodes actuellement actifs. */
    listActiveCodes: async (): Promise<string[]> => {
      const assets = await this.request<MerchantAsset[]>({ path: "/v1/merchant-assets" });
      return (Array.isArray(assets) ? assets : [])
        .filter((a) => a.isActive)
        .map((a) => a.assetCode);
    },
  };

  readonly invoices = {
    create: (params: CreateInvoiceParams): Promise<Invoice> => {
      const { idempotencyKey, ...body } = params;
      return this.request<Invoice>({
        method: "POST",
        path: "/v1/invoices",
        body,
        idempotencyKey,
      });
    },
    list: (query?: ListQuery): Promise<unknown> =>
      this.request({ path: "/v1/invoices", query }),
    send: (id: string): Promise<unknown> =>
      this.request({ method: "POST", path: `/v1/invoices/${encodeURIComponent(id)}/send` }),
  };

  readonly products = {
    create: (params: CreateProductParams): Promise<Product> => {
      const { idempotencyKey, ...body } = params;
      return this.request<Product>({
        method: "POST",
        path: "/v1/products",
        body,
        idempotencyKey,
      });
    },
    list: (query?: ListQuery): Promise<unknown> =>
      this.request({ path: "/v1/products", query }),
    update: (
      id: string,
      patch: Partial<{ isActive: boolean; name: string; amount: string | number }>,
    ): Promise<Product> =>
      this.request<Product>({
        method: "PATCH",
        path: `/v1/products/${encodeURIComponent(id)}`,
        body: patch,
      }),
  };

  /**
   * Vérifie la signature HMAC-SHA256 d'un webhook IzichangePay en temps constant
   * et applique l'anti-replay (timestamp dans le body signé).
   *
   * @param rawBody  Le corps BRUT (string/Buffer), surtout pas du JSON re-stringifié.
   */
  static validateWebhook(
    rawBody: string | Buffer,
    signatureHeader: string | null | undefined,
    secret: string,
    opts: { toleranceSeconds?: number } = {},
  ): WebhookEvent {
    const tolerance = opts.toleranceSeconds ?? 300;

    if (!secret) {
      throw new IziPayWebhookError("invalid_body", "Secret webhook (whsec_…) non configuré.");
    }
    if (!signatureHeader) throw new IziPayWebhookError("missing_signature");
    if (!signatureHeader.startsWith("sha256=")) {
      throw new IziPayWebhookError("malformed_signature");
    }

    const provided = signatureHeader.slice("sha256=".length).trim();
    const raw = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");

    const providedBuf = Buffer.from(provided, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      throw new IziPayWebhookError("invalid_signature");
    }

    let payload: { event?: string; timestamp?: unknown; data?: unknown };
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new IziPayWebhookError("invalid_body");
    }

    const ts = payload.timestamp;
    if (typeof ts !== "number") throw new IziPayWebhookError("missing_timestamp");

    const age = Math.floor(Date.now() / 1000) - ts;
    if (age > tolerance) {
      throw new IziPayWebhookError("expired_timestamp", `Tentative de replay (age=${age}s).`);
    }
    if (age < -60) {
      throw new IziPayWebhookError("expired_timestamp", "Timestamp trop loin dans le futur.");
    }

    return {
      type: String(payload.event ?? ""),
      timestamp: ts,
      data: (payload.data ?? {}) as Record<string, unknown>,
    };
  }
}
