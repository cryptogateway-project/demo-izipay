/**
 * Seam d'intégration IzichangePay — wrapper sur `izichangepay-sdk` avec :
 *   1. Lecture automatique de IZIPAY_API_KEY / IZIPAY_API_BASE_URL depuis l'env
 *   2. Normalisation `paymentLink` ↔ `paymentUrl` (l'API renvoie `paymentLink`,
 *      le SDK type le champ `paymentUrl` sans transformation runtime)
 *   3. `merchantAssets.listActiveCodes()` — raccourci absent du SDK
 */
import {
  IziPayClient as SdkClient,
  IziPayError as _IziPayError,
  type IziPayClientOptions,
  type PaymentIntent as SdkPaymentIntent,
  type MerchantAsset,
} from "izichangepay-sdk";

export {
  IziPayError,
  IziPayApiError,
  IziPayWebhookError,
  validateWebhook,
} from "izichangepay-sdk";
export type {
  WebhookEvent,
  MerchantAsset,
  PaymentIntentCreateParams,
} from "izichangepay-sdk";

// L'API envoie `paymentLink` ; le SDK le type `paymentUrl` sans alias runtime.
export interface PaymentIntent extends SdkPaymentIntent {
  paymentLink: string;
}

function normalizeIntent(raw: SdkPaymentIntent): PaymentIntent {
  const r = raw as unknown as { paymentLink?: string; paymentUrl?: string };
  const url = r.paymentLink ?? r.paymentUrl ?? "";
  return { ...raw, paymentUrl: url, paymentLink: url };
}

export class IziPayClient {
  private readonly sdk: SdkClient;

  readonly paymentIntents: {
    create: (p: Parameters<SdkClient["paymentIntents"]["create"]>[0]) => Promise<PaymentIntent>;
    retrieve: (id: string) => Promise<PaymentIntent>;
    list: SdkClient["paymentIntents"]["list"];
  };

  readonly merchantAssets: {
    list: SdkClient["merchantAssets"]["list"];
    listActiveCodes: () => Promise<string[]>;
  };

  readonly invoices: SdkClient["invoices"];
  readonly products: SdkClient["products"];

  constructor(options: Partial<IziPayClientOptions> = {}) {
    const apiKey = options.apiKey ?? process.env.IZIPAY_API_KEY ?? "";
    if (!apiKey.startsWith("sk_")) {
      throw new _IziPayError(
        "Clé API IzichangePay manquante ou invalide : définissez IZIPAY_API_KEY (sk_test_… ou sk_live_…).",
      );
    }

    this.sdk = new SdkClient({
      ...options,
      apiKey,
      baseUrl: options.baseUrl ?? process.env.IZIPAY_API_BASE_URL,
    } as IziPayClientOptions);

    const s = this.sdk;
    this.paymentIntents = {
      create: (p) => s.paymentIntents.create(p).then(normalizeIntent),
      retrieve: (id) => s.paymentIntents.retrieve(id).then(normalizeIntent),
      list: s.paymentIntents.list.bind(s.paymentIntents),
    };
    this.merchantAssets = {
      list: s.merchantAssets.list.bind(s.merchantAssets),
      listActiveCodes: async () => {
        const assets = await s.merchantAssets.list();
        return (Array.isArray(assets) ? assets : ([] as MerchantAsset[]))
          .filter((a) => a.isActive)
          .map((a) => a.assetCode);
      },
    };
    this.invoices = s.invoices;
    this.products = s.products;
  }

  static readonly validateWebhook = SdkClient.validateWebhook;
}
