import { createHmac } from "crypto";

export interface SafePayConfig {
  merchantId: string;
  apiKey: string;
  secretKey: string;
  returnUrl: string;
  sandbox?: boolean;
}

export interface SafePayPaymentRequest {
  amount: number;
  orderRef: string;
  description: string;
  customerEmail?: string;
  customerName?: string;
  metadata?: Record<string, string>;
}

export interface SafePayPaymentResponse {
  success: boolean;
  redirectUrl?: string;
  token?: string;
  error?: string;
}

function getApiUrl(sandbox: boolean): string {
  return sandbox
    ? "https://sandbox.api.safepay.pk/v1/orders"
    : "https://api.safepay.pk/v1/orders";
}

function generateSignature(data: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(data).digest("hex");
}

export async function createSafePayOrder(
  config: SafePayConfig,
  request: SafePayPaymentRequest
): Promise<SafePayPaymentResponse> {
  try {
    const body: Record<string, unknown> = {
      amount: request.amount,
      currency: "PKR",
      order_ref: request.orderRef,
      description: request.description,
      customer: {
        email: request.customerEmail || "",
        name: request.customerName || "",
      },
      return_url: config.returnUrl,
      cancel_url: config.returnUrl.replace("success", "cancel"),
      merchant: {
        id: config.merchantId,
        api_key: config.apiKey,
      },
    };

    if (request.metadata) {
      body.metadata = request.metadata;
    }

    const payload = JSON.stringify(body);
    const signature = generateSignature(payload, config.secretKey);

    const response = await fetch(getApiUrl(config.sandbox ?? true), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SafePay-Signature": signature,
      },
      body: payload,
    });

    const data = await response.json();

    if (response.ok && data.data?.token) {
      return {
        success: true,
        redirectUrl: `${
          config.sandbox ? "https://sandbox.safepay.pk" : "https://safepay.pk"
        }/checkout/${data.data.token}`,
        token: data.data.token,
      };
    }

    return {
      success: false,
      error: data.message || data.error || "SafePay order creation failed",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "SafePay communication failed",
    };
  }
}

export function verifySafePayNotification(
  payload: Record<string, unknown>,
  secretKey: string
): boolean {
  const receivedSignature = (payload.signature as string) || "";
  delete (payload as any).signature;
  const expected = generateSignature(JSON.stringify(payload), secretKey);
  return receivedSignature === expected;
}
